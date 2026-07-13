# Audit de sécurité — NovaCaisse

Date : 2026-07-11 (mise à jour : correction des permissions par rôle)
Portée : schéma Supabase (`db/schema.sql`), couche de données (`src/lib/data/hooks.ts`),
auth/contexte boutique (`src/lib/auth/*`), et résidus front-end pré-Supabase.

## ⚠️ Limite importante de cet audit — toujours d'actualité

Vous avez demandé de vérifier l'état live des policies via un accès Supabase
configuré, mais **à ce jour cet accès n'est toujours pas présent dans cette
session** : aucune variable d'environnement (`SUPABASE_*`, `DATABASE_URL`,
`service_role`, etc.) n'est définie, et `ListConnectors` ne renseigne aucun
connecteur Supabase/Postgres disponible. Le message précédent contenait un
paragraphe entre crochets non complété (« décris ici comment tu lui donnes
l'accès ») — je n'ai donc reçu aucun moyen concret de me connecter.

Je n'ai **pas exécuté** `select * from pg_policies where schemaname='public';`
contre l'instance live, et je ne veux pas fabriquer un résultat. Ce qui suit
reste une revue statique du SQL versionné dans le repo (`db/schema.sql`),
comme lors du premier audit. Pour que je fasse la vérification live demandée,
il faut l'un de ces deux moyens :
1. **Connecteur** : si votre organisation claude.ai dispose d'un connecteur
   Supabase/Postgres, l'activer pour cette session (menu connecteurs).
2. **Accès direct en lecture seule** : créer un rôle Postgres en lecture
   seule sur `pg_policies`/`information_schema` dans votre projet Supabase
   (Database → Roles) et me fournir sa chaîne de connexion comme variable
   d'environnement de session — évitez de partager la `service_role key`
   elle-même, elle n'est pas nécessaire pour cette vérification.

En attendant, l'option la plus rapide reste d'exécuter vous-même dans le SQL
Editor : `select * from pg_policies where schemaname='public' order by
tablename, cmd;` et de me coller le résultat — je compare immédiatement avec
`db/schema.sql`.

**Important** : la faille de permissions par rôle (section 4) a été corrigée
dans le repo sans attendre cet accès, car elle ne nécessitait pas de lire
l'état live — seulement d'écrire une migration à appliquer. Mais tant que
vous n'avez pas exécuté `db/migrations/002_role_based_policies.sql` (ou
confirmé que `db/schema.sql` correspond déjà à l'état réel), **l'état live
de votre base ne reflète probablement pas encore cette correction**.

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

## 5. Prochaines étapes suggérées

1. Relire `db/migrations/002_role_based_policies.sql` et l'exécuter dans le
   SQL Editor Supabase.
2. Me donner un accès Supabase/Postgres en lecture (connecteur, ou rôle
   read-only + variable d'environnement) pour que je confirme l'état live —
   ou exécuter vous-même `select * from pg_policies where
   schemaname='public' order by tablename, cmd;` et me partager le résultat.
3. Décider si `stock_levels`/`stock_movements` doivent rester strictement
   immuables pour owner/manager aussi, ou prévoir une échappatoire.
4. Ajouter les garde-fous UI par rôle une fois l'écran Équipe connecté
   (masquer les actions que RLS refuserait de toute façon).
5. Décider si le blocage de fin d'essai doit aussi être renforcé côté RLS.
6. Prioriser la connexion de l'écran Paramètres (boutique + logo Supabase
   Storage + ticket), qui reste le résidu le plus visible pour l'utilisateur.
