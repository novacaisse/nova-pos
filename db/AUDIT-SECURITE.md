# Audit de sécurité — NovaCaisse

Date : 2026-07-11
Portée : schéma Supabase (`db/schema.sql`), couche de données (`src/lib/data/hooks.ts`),
auth/contexte boutique (`src/lib/auth/*`), et résidus front-end pré-Supabase.

## ⚠️ Limite importante de cet audit

Cette session n'a **aucun accès aux identifiants de l'instance Supabase externe**
d'Emmanuel (pas de service role key, pas de chaîne de connexion Postgres, aucun
connecteur MCP Supabase disponible). Seule la clé publique (`sb_publishable_...`)
est présente dans le repo, ce qui est normal côté client mais insuffisant pour
interroger `pg_policies` ou l'état réellement appliqué en base.

**Tout ce qui suit est donc une revue statique du SQL versionné dans le repo**
(`db/schema.sql`), pas une vérification de l'état live. Si ce script a bien été
exécuté tel quel dans le SQL Editor de votre projet Supabase (comme indiqué),
les policies ci-dessous s'appliquent réellement — mais je ne peux pas le
confirmer moi-même sans accès. Pour une vérification live, deux options :
donner accès à un connecteur Supabase/Postgres à cette session, ou exécuter
vous-même `select * from pg_policies where schemaname='public';` et me
partager le résultat.

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

### Constat : aucune granularité par rôle au-delà de `shops`/`shop_members`

L'enum `app_role` (owner/manager/cashier/stock/accountant) existe et est
consulté par `has_role_in_shop()`, mais **cette fonction n'est utilisée que
pour les policies sur `shops` et `shop_members`**. Sur les 16 autres tables
(ventes, paiements, stock, dépenses, etc.), n'importe quel membre de la
boutique — y compris un simple `cashier` — a les 4 droits CRUD complets :
il peut aujourd'hui, via l'API Supabase directe (pas seulement l'UI),
supprimer une vente déjà encaissée, modifier un `payments` a posteriori, ou
écrire directement dans `stock_levels` en court-circuitant le trigger
`apply_stock_movement` (donc sans laisser de trace dans `stock_movements`).

Ce n'est pas une fuite inter-boutique (l'isolation `shop_id` tient), mais
c'est un manque de séparation des droits en interne — qui correspond
exactement au module « Équipe (permissions) » encore mocké et à connecter.
**Recommandation** : quand vous connecterez Équipe, étendre les policies des
tables sensibles (`sales`, `sale_items`, `payments`, `stock_levels`,
`expenses`) avec des `has_role_in_shop()` différenciés par opération (ex :
seul owner/manager peut `delete` une vente ou écrire sur `stock_levels`
directement).

### Autres points à surveiller (non bloquants)

- Les `grant ... to authenticated` couvrent `stock_levels` en écriture directe
  pour tout membre — voir ci-dessus, cette table ne devrait probablement être
  mutée que par le trigger, pas en direct par le client.
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

## 4. Prochaines étapes suggérées

1. Confirmer l'état live des policies (voir section 1) — soit en me donnant
   un accès Supabase/Postgres, soit en partageant le résultat de
   `select * from pg_policies where schemaname='public' order by tablename;`.
2. Décider si/quand ajouter la granularité par rôle (`app_role`) sur les
   tables métier, en particulier `stock_levels` en écriture directe.
3. Décider si le blocage de fin d'essai doit aussi être renforcé côté RLS.
4. Prioriser la connexion de l'écran Paramètres (boutique + logo Supabase
   Storage + ticket), qui reste le résidu le plus visible pour l'utilisateur.
