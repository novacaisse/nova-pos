# Architecture ZegOS

## Vue d'ensemble

**ZegOS** est la plateforme. **ZegCaisse** (point de vente, ex-NovaCaisse) en est aujourd'hui la seule application réelle. D'autres applications (ZegHotel, ZegERP…) sont prévues sur le même socle mais n'existent pas encore — elles apparaissent uniquement comme options "à venir" dans l'écran de choix d'application.

Un compte utilisateur peut, à terme, être abonné à plusieurs applications ZegOS simultanément. L'architecture ci-dessous distingue ce qui appartient au **socle ZegOS** (partagé, indépendant de toute application) de ce qui appartient **spécifiquement à ZegCaisse**.

## Primitives du socle (ZegOS-core)

| Table | Rôle |
|---|---|
| `auth.users` / `public.profiles` | Le compte utilisateur — un identifiant, un mot de passe (ou Google), un profil. Indépendant de toute organisation ou application. |
| `public.organizations` | Un espace de travail (« boutique » dans le vocabulaire ZegCaisse). Porte `plan`, `trial_ends_at`, `active_apps`. |
| `public.organization_members` | Appartenance many-to-many utilisateur ↔ organisation, avec un rôle (`owner`, `manager`, `cashier`, `stock`, `accountant` — rôles actuellement définis par ZegCaisse, voir plus bas). |
| `public.subscriptions` / `public.subscription_payments` | Abonnement et paiements, par organisation. |
| `organizations.active_apps` | jsonb, ex. `["pos"]` — applications ZegOS actives sur cette organisation. Purement informatif pour l'instant : aucune route ni policy ne s'y appuie encore pour restreindre quoi que ce soit. |

Un même compte peut appartenir à plusieurs organisations (`organization_members` est many-to-many depuis l'origine). Deux façons de faire du multi-application avec ce seul modèle, sans table supplémentaire :
- **Une organisation, plusieurs applications** : `active_apps = ["pos", "hotel"]` — un même établissement utilise ZegCaisse et un futur ZegHotel.
- **Plusieurs organisations, une application chacune** : deux organisations séparées, chacune avec un seul élément dans `active_apps` — deux activités distinctes du même compte.

## Ce qui appartient à ZegCaisse (module)

Tout le reste du schéma est aujourd'hui spécifique à ZegCaisse : `products`, `sales`, `stock_levels`, `customers`, `quotes`, `expenses`, `purchase_orders`, `organization_settings` (réglages boutique), etc. — toutes ces tables référencent `organization_id` mais n'ont de sens que dans le contexte du point de vente.

Les rôles (`app_role` : owner/manager/cashier/stock/accountant) sont eux aussi pensés pour ZegCaisse — une future application pourrait avoir besoin d'un ensemble de rôles différent, à réévaluer le jour où une 2ᵉ application réelle existera.

## Parcours d'inscription et provisionnement

```
Compte (auth.signUp / Google)  →  /app détecte 0 organisation
        │                              │
        │                              ▼
        │                    Écran de choix d'application
        │                    (ZegCaisse actif, autres "à venir")
        │                              │
        │                              ▼
        │                  Formulaire spécifique à l'application
        │                  (pour ZegCaisse : boutique, gérant…)
        │                              │
        └──────────────────────────────▼
                          provision_organization(p_app, ...)
                  crée organizations + organization_members (owner)
                  + subscriptions + organization_settings, atomique
```

`provision_organization()` (migration 020d) est la seule fonction de création d'organisation, qu'il s'agisse de la 1ʳᵉ organisation d'un compte tout juste créé ou d'une organisation supplémentaire pour un compte existant (« + Ajouter une boutique » en Paramètres). Elle remplace les anciennes `complete_signup()` et `create_additional_shop()`, dont la distinction n'avait de sens que lorsque création de compte et création de boutique étaient combinées dans une seule étape.

## Historique des renommages (pourquoi certains noms divergent encore)

Le projet a démarré sous le nom **NovaCaisse**, avec un schéma `shops`/`shop_id`/`shop_members`/`shop_settings`. La migration vers ZegOS s'est faite en deux temps distincts, à ne pas confondre :

1. **Rebranding texte** (Chantier 1) : "NovaCaisse" → "ZegCaisse" dans l'UI de l'espace connecté uniquement. Les pages publiques (`/`, `/tarifs`, `/inscription`, `/souscription`), le dépôt GitHub (`nova-pos`) et l'URL Netlify (`novacaisse.netlify.app`) gardent volontairement l'ancien nom.
2. **Renommage de schéma** (migrations 020a-020d) : `shops` → `organizations`, `shop_id` → `organization_id`, etc. Fait par `ALTER TABLE/FUNCTION ... RENAME`, qui préserve l'OID des objets — les ~111 policies RLS et les triggers ont suivi le renommage automatiquement, **sans être eux-mêmes renommés**.

Conséquence directe : certains identifiants contiennent encore littéralement "shop" et c'est **intentionnel**, pas un oubli :
- Noms de policies : `shops_select`, `shop_members_insert`, `shop_settings_write`, etc.
- Noms d'index : `idx_shop_members_user`, `idx_categories_shop`, etc.
- Clé JSON `plans.limits.shops` (nombre max de boutiques par formule) — c'est une **donnée**, pas un identifiant de schéma.
- Bucket de storage `shop-logos` — des URLs publiques existantes contiennent ce segment ; le renommer casserait tous les logos déjà uploadés.
- Clé localStorage `novacaisse.currentShopId`, et `novacaisse-auth` (clé de session Supabase Auth — la renommer déconnecterait tous les utilisateurs actifs).

Un futur renommage cosmétique de ces policies/index (pour éliminer toute trace de "shop") reste possible mais a été jugé non prioritaire — à ne faire, si jamais, qu'en connaissance de cause et séparément de toute logique fonctionnelle.

Ne pas confondre `active_apps` (applications ZegOS — ZegCaisse, futur ZegHotel…) avec `plans.limits.modules` (Bloc 27 — écrans internes de ZegCaisse inclus ou non par une formule, ex. Rapports, Nova IA). Deux axes différents, deux mots différents choisis précisément pour cette raison.

## Ce qui n'est pas encore fait

- Rôles (`app_role`) toujours pensés pour un seul type d'application (ZegCaisse) — à revoir si une 2ᵉ application réelle voit le jour.
- Aucune restriction de routes/UI basée sur `active_apps` — inutile tant qu'une seule application existe réellement.
- Connexion Google (OAuth) : configuration Supabase/Google Cloud Console en attente côté produit, bouton pas encore ajouté au front.
- Renommage du texte UI "boutique" → "organisation" (validé, pas encore exécuté).
