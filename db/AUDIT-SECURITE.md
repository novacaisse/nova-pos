# Audit de sécurité — NovaCaisse

Date : 2026-07-11 (mise à jour : permissions par rôle, puis connexion des écrans restants)
Portée : schéma Supabase (`db/schema.sql`), couche de données (`src/lib/data/hooks.ts`),
auth/contexte boutique (`src/lib/auth/*`), et résidus front-end pré-Supabase.

## ✅ Vérification live — confirmée par l'utilisateur (2026-07-21)

Une variable d'environnement `AUDIT_DB_URL` (rôle `audit_readonly`, lecture
seule, aucun droit sur les tables métier) a été configurée pour donner à
cette session un accès Postgres en lecture. Elle n'était cependant pas
visible dans les sessions suivantes (`env | grep -i audit` vide à chaque
tentative) — probablement injectée après le démarrage du conteneur. Faute
d'accès effectif de mon côté, **l'utilisateur a exécuté lui-même**
`select * from pg_policies where schemaname='public' order by tablename,
cmd;` dans le SQL Editor Supabase et a confirmé : permissions par rôle
actives sur les 16 tables, `stock_levels`/`stock_movements` immuables comme
prévu, isolation multi-tenant intacte. La migration 002 est donc bien
appliquée en base. Je n'ai toujours pas d'accès direct à l'instance live —
les migrations suivantes (003 et au-delà) suivent le même protocole :
je fournis le SQL, vous l'exécutez et confirmez.

## 1. RLS — analyse du SQL versionné

Bonne nouvelle : la structure est saine.
- RLS activé sur les 19 tables (`alter table ... enable row level security`).
- Aucune policy `using (true)` — tout passe par `has_shop_access()` /
  `has_role_in_shop()`, toutes deux `security definer` avec `search_path = public`
  fixé (protège contre le détournement de search_path).
- `profiles` limité à `id = auth.uid()` — un utilisateur ne peut lire/écrire que
  son propre profil.
- `shops` : select via `has_shop_access`, insert restreint à `owner_id = auth.uid()`,
  update/delete restreints au rôle `owner`.
- `shop_members` : insert restreint au propriétaire de la boutique (`shops.owner_id`),
  update/delete restreints au rôle `owner`.
- Les 16 tables « métier » (produits, ventes, stock, etc.) suivent toutes le même
  pattern `tenant_all` : `using/with check (has_shop_access(shop_id))`.

### Constat (état du repo avant migration 002) : aucune granularité par rôle
au-delà de `shops`/`shop_members`

L'enum `app_role` (owner/manager/cashier/stock/accountant) existe et était
consultée par `has_role_in_shop()`, mais **cette fonction n'était utilisée
que pour les policies sur `shops` et `shop_members`**. Sur les 16 autres
tables (ventes, paiements, stock, dépenses, etc.), n'importe quel membre de
la boutique — y compris un simple `cashier` — avait les 4 droits CRUD
complets : il pouvait, via l'API Supabase directe (pas seulement l'UI),
supprimer une vente déjà encaissée, modifier un `payments` a posteriori, ou
écrire directement dans `stock_levels` en court-circuitant le trigger
`apply_stock_movement` (donc sans laisser de trace dans `stock_movements`).

Ce n'était pas une fuite inter-boutique (l'isolation `shop_id` tenait), mais
un manque de séparation des droits en interne, correspondant au module
« Équipe (permissions) » encore mocké. **Corrigé — voir section 4.**

### Autres points à surveiller (non bloquants)

- Espace Super Admin (`/admin/*`) : encore 100% mocké côté front, aucune table
  ni policy dédiée dans le schéma. Quand vous le connecterez, ne pas le faire
  reposer sur `has_shop_access` (modèle mono-tenant) — prévoir soit une table
  `platform_admins` + policies dédiées, soit des Edge Functions avec service
  role pour les opérations cross-boutiques, en gardant RLS intact pour le
  reste.

## 2. Résidus localStorage — trouvés et corrigés

C'est le point de vigilance explicitement signalé dans les instructions
projet, et il était bien réel :

### 🔴 Corrigé — contournement de la fin d'essai gratuit

`src/routes/app.tsx` bloquait l'accès après expiration de l'essai en lisant
`getTrialInfo()` depuis **`localStorage`** (`src/lib/trial.ts`,
clé `nc_trial_started_at`), alors que la vraie donnée (`shops.trial_ends_at`,
`shops.plan`) est en base depuis l'inscription. Un utilisateur pouvait donc
vider son `localStorage` (ou changer de navigateur/appareil) pour continuer
à utiliser l'app gratuitement indéfiniment, la valeur en base n'étant jamais
consultée pour le blocage.

**Corrigé** : `src/lib/trial.ts` recalcule maintenant `onTrial` / `expired` /
`daysLeft` à partir de `currentShop.plan` + `currentShop.trial_ends_at`
(via `useShop()`), plus aucune lecture localStorage. `TrialBanner.tsx` et le
guard de `app.tsx` consomment ce nouveau helper. `inscription.tsx` n'appelle
plus `startTrial()` (devenu inutile).

Cette correction reste une garde **côté client** (redirection UI) — elle
améliore le contournement trivial via localStorage mais n'est pas une
barrière serveur. Si vous voulez une garantie stricte, il faudrait aussi
faire expirer côté RLS (ex : les policies `tenant_all` vérifient en plus
`shops.plan <> 'trial' or shops.trial_ends_at > now()`), ce que je n'ai pas
touché ici pour éviter de modifier des policies déjà en prod sans pouvoir
tester contre l'instance live — à valider avec vous avant de le faire.

### 🟡 Signalé, non corrigé — logo boutique pas dans Supabase Storage

Le logo boutique n'utilise pas Supabase Storage :
- À l'inscription (`inscription.tsx`), le logo est lu en `FileReader.readAsDataURL`
  et stocké **tel quel (base64)** dans `shops.logo_url` (colonne `text`). Ça reste
  dans Supabase (donc pas de violation de la règle « Supabase uniquement »), mais
  ça gonfle la table `shops` avec des blobs base64 au lieu d'une URL de Storage,
  et ce n'est pas ce que `logo_url` est censé contenir dans le reste du code.
- L'écran **Paramètres** (`app.parametres.tsx`) est entièrement mocké
  (`@/lib/mock/session`, `@/lib/mock/catalog`) et lit/écrit le logo et les infos
  boutique dans `localStorage` (`nc_shop_logo`, `nc_shop_name`, etc.), sans
  toucher Supabase du tout.

Je n'ai pas touché ce flux : le reconnecter proprement veut dire créer un bucket
Supabase Storage, un hook d'upload, et re-brancher tout l'écran Paramètres —
un travail à part entière (déjà identifié dans votre liste des écrans à
connecter), pas une correction ponctuelle. J'ai laissé les écritures
localStorage de `inscription.tsx` en place pour ne pas casser l'aperçu du
mock Paramètres avant que cet écran soit reconnecté.

### Vérifié sain

- `ShopProvider` stocke `novacaisse.currentShopId` en localStorage : c'est une
  préférence UI (quelle boutique est sélectionnée), pas une donnée métier —
  rien à corriger.
- Aucune trace d'un autre backend (Firebase, base alternative, service_role
  key exposée côté client, etc.) dans `src/`.

## 3. Récapitulatif des fichiers modifiés

- `src/lib/trial.ts` — recalcul de l'essai à partir de `shops.plan` /
  `shops.trial_ends_at` au lieu de `localStorage`.
- `src/components/app/TrialBanner.tsx` — consomme `useShop()` + le nouveau
  `getTrialInfo(shop)`.
- `src/routes/app.tsx` — guard de blocage post-essai basé sur la boutique
  courante (Supabase) au lieu du flag local.
- `src/routes/inscription.tsx` — suppression de l'appel `startTrial()`
  (devenu obsolète).

## 4. Permissions RLS différenciées par rôle (migration 002)

**Fichier de migration** : `db/migrations/002_role_based_policies.sql` —
**à relire et exécuter vous-même dans le SQL Editor Supabase** avant toute
application (je n'ai de toute façon pas les moyens de l'exécuter moi-même
sans l'accès demandé en section « Limite importante »). `db/schema.sql` a
aussi été mis à jour pour rester la référence canonique d'une installation
fraîche — les deux fichiers doivent produire le même résultat final.

Idempotent : chaque policy est `drop ... if exists` puis recréée, donc
ré-exécutable sans erreur. Aucun changement de schéma, de données, de grants
ou de triggers — uniquement des policies RLS, plus une fonction utilitaire
`has_any_role_in_shop(_shop_id, _roles[])` qui complète `has_role_in_shop()`
pour tester l'appartenance à plusieurs rôles à la fois (évite de répéter de
longues chaînes de `OR` dans chaque policy).

### Matrice de permissions

Légende : **S**elect · **I**nsert · **U**pdate · **D**elete · `—` = refusé.
O=owner, M=manager, C=cashier, St=stock, A=accountant.

| Table | O | M | C | St | A |
|---|---|---|---|---|---|
| `categories` | SIUD | SIUD | S | SIUD | S |
| `products` | SIUD | SIUD | S | SIUD | S |
| `suppliers` | SIUD | SIUD | — | S | S |
| `customers` | SIUD | SIUD | SIU | — | S |
| `stock_levels` | S | S | S | S | S |
| `stock_movements` | SI | SI | S + I*(sale/return) | SI | S |
| `sales` | SIUD | SIUD | SI | — | S |
| `sale_items` | SIUD | SIUD | SI | — | S |
| `payments` | SIUD | SIUD | SI | — | S |
| `quotes` | SIUD | SIUD | SI | — | S |
| `quote_items` | SIUD | SIUD | SI | — | S |
| `expenses` | SIUD | SIUD | — | — | SIUD |
| `promotions` | SIUD | SIUD | S | — | S |
| `notifications` | SIUD | SIUD | SIUD | SIUD | SIUD |
| `subscriptions` | SIUD | SIUD | — | — | S |
| `shop_settings` | SIUD | SIUD | S | S | S |

\* le `cashier` ne peut insérer un `stock_movements` que si `type in
('sale','return')` — les mouvements générés automatiquement par la caisse
lors d'un encaissement (`useCreateSale` dans `hooks.ts`). Les mouvements
manuels (`in`/`out`/`adjustment`/`transfer`) restent réservés à
owner/manager/stock.

### Décisions notables (à valider avec vous)

- **`stock_levels` : plus aucune écriture directe, même pour owner/manager.**
  Cette table n'est mutée que par le trigger `apply_stock_movement()`
  (`security definer`, contourne RLS). Une correction de stock doit toujours
  passer par un nouveau `stock_movements` de type `adjustment` — sinon on
  retombe exactement dans le problème initial (écriture de stock sans trace
  d'audit). C'est une restriction plus stricte que « droits complets
  owner/manager partout » demandé, appliquée uniquement ici parce que c'est
  une question d'intégrité des données, pas seulement de permission — dites-
  moi si vous préférez rouvrir l'écriture directe pour owner/manager malgré
  tout.
- **`stock_movements` : aucune `update`/`delete`, même pour owner/manager**
  (ledger immuable). Le trigger ne recalcule `stock_levels` qu'à
  l'insertion : modifier ou supprimer une ligne après coup désynchroniserait
  le stock sans laisser de trace de la correction. Même remarque que
  ci-dessus — à valider si vous voulez une échappatoire pour owner.
- **`notifications` reste inchangée** (accès complet à tout rôle sur ses
  propres notifications) — hors périmètre de la demande, pas de donnée
  sensible.
- **`customers`** : le `cashier` peut créer/modifier (encaissement avec
  fidélité) mais pas supprimer. `stock` n'y a aucun accès (pas mentionné
  dans votre description, pas nécessaire à la gestion de stock).
- **`quotes`/`quote_items`** : non couverts explicitement par votre
  description initiale — traités par analogie avec `sales` (le cashier peut
  créer un devis au comptoir, seul owner/manager peut le modifier/supprimer,
  `accountant` en lecture pour ses rapports, `stock` sans accès).
- **`shop_settings`** : lecture ouverte à tous (le ticket de caisse et les
  taxes doivent s'afficher partout, y compris pour un cashier), écriture
  réservée à owner/manager.

### Impact sur les comptes existants

Aujourd'hui, tous les comptes réels ont le rôle `owner` sur leur boutique —
l'écran Équipe étant encore mocké, aucun flux d'invitation réel ne crée de
`cashier`/`stock`/`accountant` en base. Cette migration ne change donc le
comportement d'aucun utilisateur existant tant que personne n'est invité
avec un rôle restreint.

### Limite à connaître : pas encore de garde-fou côté UI

Cette migration sécurise l'API/la base. Les écrans front (Produits, Stock,
Ventes, Dépenses…) n'ont eux-mêmes aucune logique conditionnelle par rôle
pour l'instant (pas de masquage de bouton « Supprimer » pour un cashier,
par ex.) : ce n'est pas un trou de sécurité (RLS refusera la requête), mais
un cashier verra un bouton qui échouera silencieusement ou avec une erreur
Supabase brute. À traiter quand l'écran Équipe sera connecté et que les UI
commenceront réellement à distinguer les rôles.

## 5. Migration 003 — subscription_payments + bucket logo (à exécuter)

**Fichier** : `db/migrations/003_subscription_payments_and_logo_storage.sql`
— à relire et exécuter dans le SQL Editor Supabase, comme la 002. `db/schema.sql`
est mis à jour en parallèle pour rester la référence d'une installation fraîche.

Trois ajouts :

1. **`public.subscription_payments`** — une ligne par paiement d'abonnement
   (absente du schéma initial, nécessaire pour l'écran Abonnement). Colonnes :
   `shop_id`, `subscription_id`, `amount`, `currency`, `method`
   (`payment_method` existant), `status` (nouvel enum `pending/paid/failed/refunded`),
   `provider`/`provider_ref` (référence MoneyFusion), `paid_at`, `created_at`.
   RLS alignée sur `subscriptions` : select owner/manager/accountant, écriture
   owner/manager uniquement.
2. **Bucket Storage `shop-logos`** — public en lecture (le logo n'est pas une
   donnée sensible et doit s'afficher sur les tickets/reçus), écriture
   restreinte à owner/manager de la boutique propriétaire du chemin
   (convention obligatoire : `{shop_id}/logo`). Policies sur `storage.objects`
   utilisant `has_any_role_in_shop()` comme le reste du schéma.
3. **`shops_update` étendue à manager** (validé avec vous) — la policy du
   schéma initial n'autorisait que `owner`. `shops_delete` reste
   volontairement owner-only (suppression de boutique = action bien plus
   destructrice, non demandée ici).

## 6. Écran Paramètres — connecté

- `shops.name` / `shops.logo_url` : lus/écrits directement (colonnes réelles).
- Coordonnées boutique (téléphone, email, adresse, RCCM/IFU, réseaux sociaux) :
  stockées dans `shop_settings.data` (jsonb) — pas de nouvelle colonne, décision
  validée avec vous.
- Ticket de caisse : `shop_settings.receipt_footer` pour le pied de page,
  reste (message de remerciement, cases à cocher d'affichage) dans `shop_settings.data.ticket`.
- Logo : upload réel vers le bucket `shop-logos` (migration 003), remplace le
  stockage base64/localStorage précédemment signalé — **résidu de l'audit
  initial maintenant refermé**, y compris côté inscription (`inscription.tsx`
  uploadait le logo en base64 dans `shops.logo_url` ; il utilise maintenant le
  même bucket).
- Onglets Devise / Taxes / Transfert de stock : **laissés en mock**, hors
  périmètre demandé et sans table dédiée (`taxes`) en base.
- `shops_update` étendue à owner **et manager** (migration 003, section 3) —
  point signalé lors de la connexion de l'écran, corrigé sur votre confirmation.

## 7. Migration 004 — invitation Équipe (à exécuter)

**Fichier** : `db/migrations/004_find_user_by_email.sql`. Deux ajouts, tous
deux nécessaires au fonctionnement de l'écran Équipe (connecté dans ce même
lot de travail) :

1. **`find_user_id_by_email(_email text) returns uuid`** — permet au owner
   d'ajouter un membre existant à sa boutique sans API admin (pas de service
   role key disponible). Ne renvoie que l'UUID, rien d'autre de `auth.users`.
   Limite acceptée : n'importe quel compte authentifié peut vérifier si un
   email donné est enregistré sur la plateforme (énumération d'emails) —
   exécution réservée aux rôles authentifiés (pas `anon`) pour limiter
   l'exposition, sans protection supplémentaire au-delà de ça dans ce scope.
2. **`profiles_select_shopmates`** — correction trouvée en implémentant
   l'écran : `profiles_all` (schéma initial) restreint déjà SELECT à
   `id = auth.uid()`, donc un owner listant son équipe ne voyait ni nom ni
   téléphone de ses coéquipiers (RLS filtrait silencieusement, sans erreur).
   Nouvelle policy SELECT (OR avec l'existante) limitée à la lecture, pour
   les personnes partageant au moins une boutique. `profiles_all` reste
   inchangée et continue de restreindre insert/update/delete à soi-même.

## 8. Écran Équipe — connecté (avec écarts assumés vs le mock)

Flux d'invitation réel : la personne invitée crée son compte via la
nouvelle route publique `/rejoindre` (aucune boutique créée, contrairement à
`/inscription`), puis le owner l'ajoute à son équipe par email + rôle depuis
Équipe. Invitation et changement de rôle restent **owner-only**
(`shop_members_insert`/`_update`, schéma initial, non étendues — confirmé
avec vous, contrairement à `shops_update`).

Écarts par rapport au mock, tous validés avec vous :
- **Statut actif/inactif** → pas de colonne dédiée sur `shop_members` :
  remplacé par un vrai retrait (`delete`), qui coupe l'accès immédiatement.
- **Dernière connexion** → non accessible côté client (vit dans
  `auth.users`) : remplacé par « Membre depuis » (`shop_members.created_at`).
- **Journal d'activité** → retiré, pas de table d'audit dans le schéma ;
  tâche séparée si besoin plus tard.
- **Onglet Permissions** → transformé en tableau **lecture seule**
  (`src/lib/permissionsMatrix.ts`, dupliqué manuellement depuis la matrice
  RLS réelle de la section 4 — pas de table de permissions configurable en
  base, donc rien à rendre éditable sans mentir sur ce que l'UI ferait).

## 9. Écran Rapports — connecté (trouvé mocké en cours de route)

`app.rapports.tsx` n'était dans aucune des deux listes du briefing initial
(oubli probable). CA, ticket moyen, marge, meilleurs produits/clients,
ventes par jour et heures de pointe sont désormais calculés à partir de
`useSales`/`useProducts` réels ; export CSV/PDF reconnecté aux données
réellement affichées. Deux limites assumées :
- **Marge** approximative : basée sur `products.cost` *actuel*, pas le coût
  au moment de la vente (non stocké dans le schéma) — une modification de
  coût aujourd'hui recalcule rétroactivement la marge d'anciennes ventes.
- **Rapport « Fournisseurs »** impossible à calculer : `products` n'a aucune
  colonne `supplier_id`. Affiché en « Bientôt disponible » plutôt que
  d'inventer des chiffres — nécessiterait une migration de schéma.

L'assistant IA « Nova » reste mock, hors périmètre (nécessiterait une vraie
intégration API Claude, sans rapport avec Supabase).

`useSales` accepte désormais soit une limite (rétrocompatible), soit
`{ limit, from, to }` pour filtrer par date côté requête.

## 10. Garde-fous UI par rôle — appliqués

Basé sur la matrice de la section 4. La RLS reste la seule barrière de
sécurité réelle ; ceci est de l'ergonomie (éviter un bouton qui échoue ou
un écran vide), pas une couche de protection supplémentaire.

- **Barre latérale** (`AppSidebar.tsx`) : masque Point de vente/Ventes/
  Devis/Clients pour `stock`, Fournisseurs pour `cashier`, Dépenses pour
  `cashier`/`stock` (aucun accès `select` sur la table correspondante).
- **Clients** : bouton Supprimer masqué pour `cashier` (SIU, pas D).
- **Fournisseurs, Promotions, Produits** : création/modification/
  suppression masquées pour les rôles n'ayant que `S` (voir matrice).
  `stock` garde les droits d'écriture sur Produits (IUD réel).
- **Stock** : formulaire « Nouveau mouvement » et édition du seuil d'alerte
  masqués pour `cashier`/`accountant`.
- **Paramètres** : champs et boutons Enregistrer (Boutique + Ticket)
  désactivés/masqués pour tout rôle autre que owner/manager.
- **Dépenses, Ventes, Équipe** : rien à ajouter (Dépenses n'est visible que
  par des rôles ayant déjà tous les droits ; Ventes est déjà en lecture
  seule ; Équipe gérait déjà ça depuis la tâche #3).

## 11. Prochaines étapes suggérées

1. Décider si `stock_levels`/`stock_movements` doivent rester strictement
   immuables pour owner/manager aussi, ou prévoir une échappatoire.
2. Décider si le blocage de fin d'essai doit aussi être renforcé côté RLS.
3. Lier `products`/`suppliers` (colonne `supplier_id`) si le rapport
   Fournisseurs devient prioritaire.
4. Intégration réelle de l'assistant IA « Nova » (API Claude) — tâche
   séparée, hors périmètre Supabase.
5. `app.fournisseurs.tsx` importe encore `PURCHASE_ORDERS` depuis les mocks
   (onglet « Bons de commande ») — les fiches fournisseurs elles-mêmes sont
   connectées, mais pas les bons de commande. Hors périmètre des 6 tâches
   initiales (signalé par l'utilisateur, pas de table dédiée à ce jour).

## 12. Migration 007 + Edge Functions MoneyFusion (à exécuter/déployer)

**Fichier** : `db/migrations/007_subscription_payments_metadata.sql` — ajoute
`subscription_payments.metadata` (jsonb) : la documentation MoneyFusion ne
confirme pas que `personal_Info` est bien renvoyé tel quel dans les
événements webhook, donc `create-subscription-payment` stocke lui-même
`{plan_id, period}` ici plutôt que de dépendre de ce comportement non
vérifié côté MoneyFusion.

**Edge Functions** (`supabase/functions/`, à déployer via le Dashboard —
« Via Editor », aucun accès CLI disponible dans cette session) :
- `create-subscription-payment` : vérifie server-side que l'appelant est
  owner/manager de la boutique (ne fait jamais confiance à `shop_id` envoyé
  par le client), crée la ligne `subscription_payments` (pending), appelle
  MoneyFusion via le proxy à IP fixe (VPS + Squid, remplace QuotaGuard —
  raison : coût), renvoie l'URL d'encaissement.
- `moneyfusion-webhook` : endpoint public. **Aucun mécanisme de signature
  documenté par MoneyFusion** pour vérifier l'authenticité d'un appel — le
  webhook ne sert donc que de déclencheur, jamais de source de vérité ; la
  fonction reappelle elle-même l'endpoint de vérification MoneyFusion
  (`GET paiementNotif/{token}`, via le même proxy) et ne marque un paiement
  "payé" que sur la base de cette vérification authoritative. Met aussi à
  jour `shops.plan` en plus de `subscriptions.status`/`current_period_end`
  (au-delà de la demande initiale) : sans ça, le garde-fou d'essai expiré
  (`app.tsx`, basé sur `shops.plan`/`trial_ends_at`) pourrait continuer à
  bloquer un client qui vient de payer.
- Point non vérifiable dans cette session : l'appel `fetch` proxié via
  `Deno.createHttpClient({ proxy: ... })` n'a pas pu être testé en direct
  (aucun accès de déploiement ici) — à valider une fois déployé.

Secrets Edge Function nécessaires (jamais commités, transmis uniquement via
le Dashboard Supabase) : `PAYMENT_PROXY_URL`, `MONEYFUSION_API_URL`, `APP_URL`.

## 13. Espace Super Admin, pages publiques et MoneyFusion — écrans connectés

Suite logique de la section 12 : les migrations 005/006/007/008 sont
exécutées, les Edge Functions `create-subscription-payment` et
`moneyfusion-webhook` sont déployées et vérifiées par l'utilisateur. Cette
section couvre le branchement de tous les écrans côté front.

**Accès Super Admin** — mécanisme : table `super_admins` séparée (pas un
rôle `shop_members`), fonction `is_super_admin()` security definer.
`admin.tsx` avait **zéro garde-fou d'accès** avant cette tâche (n'importe
quel compte connecté pouvait ouvrir `/admin`) — corrigé en priorité,
traité comme faille critique : redirige vers `/connexion` (non connecté)
ou `/app` (connecté mais pas super admin).

**Écrans Super Admin connectés** (`src/routes/admin.*.tsx`,
`src/lib/data/adminHooks.ts`) :
- Dashboard : KPIs réels (boutiques par statut, MRR approx., churn),
  répartition par formule, 30 derniers jours d'inscriptions, 12 derniers
  mois de revenu (paiements `paid` uniquement).
- Boutiques : liste réelle, recherche/filtre, suspension (`shops.plan`),
  prolongation d'essai, suppression (confirmation par saisie du nom exact),
  impersonation via `admin-impersonate`.
- Abonnements/Facturation : lecture cross-tenant de `subscription_payments`
  et `subscriptions` ; remboursement/renvoi de facture désactivés
  ("Bientôt disponible") — aucune API de remboursement demandée/disponible.
- Paramètres : mini-CMS `plans` complet (création/édition/suppression de
  formules, prix mensuel/annuel, fonctionnalités, actif/recommandé) — seule
  source de vérité pour les prix, consommée par `/tarifs`, la landing,
  `/app/abonnement` et `/souscription`. Onglet « Contenu landing » laissé
  statique/désactivé (hors périmètre, pas de table dédiée).
- Support : liste de tous les tickets (`support_tickets`/`support_messages`,
  RLS `is_super_admin() OR has_shop_access`), changement de statut réservé
  au Super Admin (imposé par la RLS, pas seulement par l'UI), fil de
  discussion avec réponse admin.

**Impersonation** (`supabase/functions/admin-impersonate/`) : vérifie
`is_super_admin()` server-side, génère un magic link via le service role
(`auth.admin.generateLink`), journalise dans `admin_impersonations` — **pas
de notification au owner**, choix explicite de l'utilisateur pour un usage
support discret. Limite acceptée : revenir à sa session admin après
impersonation nécessite de se déconnecter/reconnecter (pas de multi-session
dans ce navigateur).

**Périmètre RLS Super Admin** : strictement `shops`, `subscriptions`,
`subscription_payments`, `profiles`, `plans`, plus les tables dédiées
(`admin_impersonations`, `support_tickets`, `support_messages`) — jamais
étendu aux données métier des boutiques (ventes, stock, clients…).

**Pages publiques** — `/tarifs`, la landing (`index.tsx`) et
`/app/abonnement` lisent désormais toutes `usePlans()` (même source que le
CMS), au lieu du mock `PLANS` figé sur 3 formules. Conséquences assumées :
- Suppression du tableau comparatif détaillé (`FEATURE_MATRIX`) sur
  `/tarifs` : il supposait exactement 3 formules fixes, incompatible avec
  des formules créées/supprimées dynamiquement.
- Suppression de l'option de période "lifetime" (seuls mensuel/annuel
  existent dans le modèle de données réel).
- Correction de la mention "essai 14 jours" → "3 jours" (durée réelle,
  `inscription.tsx`).

**Parcours de paiement réel** (`/souscription`, `/souscription/confirmation`) :
- `/souscription` : formule + périodicité + téléphone/nom, appelle
  `create-subscription-payment`, redirige le navigateur vers l'URL
  MoneyFusion renvoyée. Accessible depuis `/app` (redirection automatique
  à expiration d'essai, déjà en place) et depuis `/app/abonnement`
  ("Passer à X", jusqu'ici désactivé).
- `/souscription/confirmation` (nouvelle route, cible du `return_url`) :
  récupère le paiement par `payment_id` (RLS shop-scopée : pas de
  vérification d'accès applicative supplémentaire nécessaire), poll toutes
  les 3s tant que le statut est `pending` (le webhook peut arriver après le
  retour du navigateur).

**Support côté boutique** (`/app/support`, nouvelle route + entrée dans
`UserMenu.tsx`) : création de ticket, fil de discussion, réponse — pas de
changement de statut possible (réservé au Super Admin par la RLS).

**Suppression** : `src/lib/mock/tenants.ts` supprimé (dernier
consommateur — l'ancien `admin.support.tsx` mocké — remplacé).

**Non vérifié dans cette session** (aucun accès réseau sortant vers
Supabase/MoneyFusion) : le comportement réel du proxy Squid en production,
la réception effective des webhooks MoneyFusion, et le rendu visuel des
nouveaux écrans dans un navigateur. Vérifiés uniquement par compilation
(`bun build --external '*'` par fichier) et par la génération réussie de
`routeTree.gen.ts` via `bun run build` (échoue ensuite en phase SSR sur la
résolution de `framer-motion`, limitation connue du bac à sable, sans
rapport avec ce changement).

## 14. Migration 010 — suppression complète du module Promotions

Retiré à la demande explicite de l'utilisateur (fonctionnalité non
souhaitée). Suppression irréversible, migration présentée pour relecture
avant exécution.

- **Code supprimé** : `src/routes/app.promotions.tsx`, `src/lib/mock/promotions.ts`
  (dernier consommateur de son propre contenu, `LOYALTY_TIERS`, disparaît
  avec la route) ; section `PROMOTIONS` de `src/lib/data/hooks.ts`
  (`usePromotions`/`useUpsertPromotion`/`useDeletePromotion`, type `Promotion`) ;
  entrée `permissionsMatrix.ts` ; entrées de navigation dans `AppSidebar.tsx`
  et `BottomNav.tsx` ; mention marketing "Promotions & fidélité" dans la
  landing (`index.tsx`).
- **DB** : `db/schema.sql` mis à jour (table `promotions`, son index, ses
  grants, son `enable row level security` et ses 4 policies tous retirés).
  `db/migrations/010_drop_promotions.sql` contient le `drop table` réel —
  aucune autre table ne référence `promotions` par FK (seul
  `promotions.product_id` pointait vers `products`, dans l'autre sens),
  donc aucun impact ailleurs.
- Les anciennes policies de `promotions` dans
  `db/migrations/002_role_based_policies.sql` sont laissées telles quelles :
  les fichiers de migration passés ne sont jamais réécrits rétroactivement,
  seul `db/schema.sql` (référence canonique de l'état courant) est mis à jour.

## 15. Blocs 11-15 — Ventes, Fournisseurs, Paramètres, Équipe (migrations 013-016)

Cinq blocs codés d'affilée (voir l'historique de commits), migrations
présentées pour relecture avant exécution, non exécutées à la rédaction
de cette section.

- **Migration 013** : corrige un vrai bug RLS du Bloc 8 — `sales_delete`
  n'autorisait que owner/manager, alors que `useDeleteHoldTicket()` (reprise/
  suppression d'un ticket en attente à la Caisse) fait un `delete` sur
  `sales`. Un cashier ne pouvait donc jamais reprendre son propre ticket.
  Corrigé en ajoutant une clause `or (status = 'draft' and cashier_id =
  auth.uid() and has_role_in_shop(shop_id, 'cashier'))` — les ventes
  finalisées restent strictement owner/manager.
- **Migration 014** : `products.supplier_id` (FK nullable) + tables
  `purchase_orders`/`purchase_order_items` avec RLS (même matrice que
  `products` : owner/manager/stock écrivent, accountant lit). La réception
  d'un bon de commande écrit dans `stock_movements` (type `in`) via le
  client authentifié (pas de nouvelle fonction `security definer`) — les
  policies existantes suffisent, RLS inchangée ailleurs.
- **Migration 015** : nouvelle fonction `security definer`
  `create_additional_shop()`, mirroir de `complete_signup()` pour un owner
  qui possède déjà une boutique — fait respecter `plans.limits.shops`
  côté serveur (jamais uniquement côté UI), même parade au problème de
  poule-et-l'œuf que `is_shop_owner()` résolvait déjà pour `complete_signup()`.
- **Migration 016** : `profiles.address` + `grant execute ... to
  service_role` sur `find_user_id_by_email` (nécessaire pour la nouvelle
  Edge Function ci-dessous, qui appelle cette fonction avec le client
  service role plutôt que le client utilisateur).
- **Nouvelle Edge Function `create-team-member`** (même schéma de
  vérification que `admin-impersonate`/`create-subscription-payment`) :
  JWT vérifié côté serveur, rôle `owner` de `shop_id` revérifié via le
  client utilisateur (jamais fait confiance au `shop_id` envoyé par le
  client), `plans.limits.users` vérifié côté serveur avant toute écriture,
  écriture (création de compte + `shop_members`) uniquement via le client
  service role. Remplace `/rejoindre` (supprimé, route orpheline sans lien
  entrant) et `useInviteMember`.
- **Bascules de permissions ciblées (Bloc 15)** : stockées dans
  `shop_settings.data.permissions` (jsonb, aucune migration), avec valeurs
  par défaut qui préservent le comportement actuel. Ce sont des
  préférences UI/requête, pas une nouvelle frontière de sécurité — la RLS
  par rôle (table par table, déjà en place) reste inchangée et reste la
  seule vraie barrière. Décision confirmée en amont de ce bloc : pas de
  refonte de la RLS ici.
