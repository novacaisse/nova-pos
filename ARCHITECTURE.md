# Architecture ZegOS

## Vue d'ensemble

**ZegOS** est la plateforme. **ZegCaisse** (point de vente, ex-NovaCaisse) en est le premier module réel, et **ZegHotel** (gestion hôtelière / PMS) le second (migrations 020f-020j). Même dépôt, même application, même instance Supabase — ZegHotel réutilise intégralement le socle partagé ci-dessous et n'a nécessité aucune nouvelle fonction de sécurité. D'autres applications (ZegERP…) restent prévues mais n'existent pas encore — elles apparaissent comme options "à venir" dans l'écran de choix d'application.

Un compte utilisateur peut, à terme, être abonné à plusieurs applications ZegOS simultanément. L'architecture ci-dessous distingue ce qui appartient au **socle ZegOS** (partagé, indépendant de toute application) de ce qui appartient **spécifiquement à ZegCaisse**.

## Primitives du socle (ZegOS-core)

| Table | Rôle |
|---|---|
| `auth.users` / `public.profiles` | Le compte utilisateur — un identifiant, un mot de passe (ou Google), un profil. Indépendant de toute organisation ou application. |
| `public.organizations` | Un espace de travail (« boutique » dans le vocabulaire ZegCaisse). Porte `plan`, `trial_ends_at`, `active_apps`. |
| `public.organization_members` | Appartenance many-to-many utilisateur ↔ organisation, avec un rôle (`app_role` : `owner`, `manager`, `accountant` partagés entre modules ; `cashier`, `stock` spécifiques ZegCaisse ; `front_desk`, `housekeeping` spécifiques ZegHotel — voir plus bas). |
| `public.subscriptions` / `public.subscription_payments` | Abonnement et paiements, par organisation. |
| `organizations.active_apps` | jsonb, ex. `["pos"]` ou `["pos","hotel"]` — applications ZegOS actives sur cette organisation. Gate désormais la navigation et les routes côté frontend (`AppSidebar`, `BottomNav`, `app.equipe.tsx`, l'onglet Tarification de Paramètres) ; **aucune policy RLS ne s'y appuie** — la RLS reste scopée par `organization_id` + rôle uniquement, `active_apps` est un filtre d'affichage, pas une barrière de sécurité. |

Un même compte peut appartenir à plusieurs organisations (`organization_members` est many-to-many depuis l'origine). Deux façons de faire du multi-application avec ce seul modèle, sans table supplémentaire :
- **Une organisation, plusieurs applications** : `active_apps = ["pos", "hotel"]` — un même établissement utilise ZegCaisse et un futur ZegHotel.
- **Plusieurs organisations, une application chacune** : deux organisations séparées, chacune avec un seul élément dans `active_apps` — deux activités distinctes du même compte.

## Ce qui appartient à ZegCaisse (module)

Le schéma historique est spécifique à ZegCaisse : `products`, `sales`, `stock_levels`, `customers`, `quotes`, `expenses`, `purchase_orders`, `organization_settings` (réglages boutique), etc. — toutes ces tables référencent `organization_id` mais n'ont de sens que dans le contexte du point de vente.

Routes : `/app/caisse`, `/app/ventes`, `/app/produits`, `/app/stock`, `/app/clients`, `/app/fournisseurs`, `/app/devis`, `/app/depenses`, `/app/rapports`.

## Ce qui appartient à ZegHotel (module)

15 tables, toutes préfixées **`hotel_`** (migrations 020f-020j) — préfixe obligatoire : une table `payments` nue serait entrée en collision avec `public.payments` (paiements de vente ZegCaisse) :

| Table | Rôle |
|---|---|
| `hotel_room_types`, `hotel_rooms` | Types de chambres (capacité, prix de base) et inventaire physique (numéro, étage, statut ménage). |
| `hotel_rate_plans`, `hotel_seasonal_rates`, `hotel_rate_restrictions` | Tarification : plans (PDJ inclus, remboursable…), grilles saisonnières, restrictions (séjour min, stop-vente). |
| `hotel_corporate_accounts` | Comptes entreprise/groupe avec remise négociée. |
| `hotel_settings` | Réglages par organisation (PK `organization_id`) : taxe de séjour, devise secondaire. |
| `hotel_channels` | Structure seule (hors scope V1) — pas de synchronisation Booking.com/Expedia/iCal réelle. |
| `hotel_guests` | Clients de l'hôtel — **distincts** de `customers` (ZegCaisse). |
| `hotel_reservations`, `hotel_reservation_rooms` | Réservation (séjour, statut) et attribution chambre par chambre. `hotel_reservation_rooms` dénormalise `check_in`/`check_out`/`status` depuis la réservation parente (synchronisé par trigger) pour porter une contrainte `EXCLUDE USING gist` anti-chevauchement **au niveau base**, pas seulement côté client. |
| `hotel_folios`, `hotel_folio_charges`, `hotel_payments` | Note de séjour, lignes de charge (chambre/extra/pénalité/taxe/remise), paiements — nommée `hotel_payments` pour la même raison de collision que ci-dessus. |
| `hotel_housekeeping_tasks`, `hotel_maintenance_tickets` | Tâches de ménage du jour et incidents de maintenance par chambre. |

Rôles ZegHotel (`app_role` étendu) : `front_desk` (Réceptionniste — réservations, clients, folios) et `housekeeping` (Gouvernante — **scopée aux seules chambres et tâches de ménage/maintenance**, aucun accès RLS aux réservations, clients ou données financières). `owner`/`manager`/`accountant` sont partagés avec ZegCaisse et ont un accès équivalent des deux côtés.

Routes : `/app/hotel` (tableau de bord), `/app/hotel/reservations` (planning + folio + facture PDF), `/app/hotel/rooms`, `/app/hotel/housekeeping`, `/app/hotel/rapports` (occupation/ADR/RevPAR/pickup + audit de nuit) ; onglet "Tarification Hôtel" dans `/app/parametres`. Toutes sous forme de fichiers plats (`app.hotel.tsx` + `app.hotel.index.tsx` + `app.hotel.<page>.tsx`), même convention que `app.produits.tsx` — jamais de layout imbriqué au-delà de ce que le routing par fichiers impose déjà.

Hors scope V1 (assumé) : intégrations channel manager réelles, moteur de yield/IA, POS interne lié au folio, multi-hôtel par organisation.

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

Ne pas confondre `active_apps` (applications ZegOS — ZegCaisse, ZegHotel…) avec `plans.limits.modules` (Bloc 27 — écrans internes de ZegCaisse inclus ou non par une formule, ex. Rapports, Nova IA). Deux axes différents, deux mots différents choisis précisément pour cette raison. `plans.limits.modules` ne s'applique pas à ZegHotel.

## Ce qui n'est pas encore fait

- ZegHotel V1 : pas d'intégrations channel manager réelles (Booking.com/Expedia/iCal — `hotel_channels` est structure seule), pas de moteur de yield/IA, pas de POS interne lié au folio, pas de multi-hôtel par organisation.
- Connexion Google (OAuth) : configuration Supabase/Google Cloud Console en attente côté produit, bouton pas encore ajouté au front.
- Renommage du texte UI "boutique" → "organisation" (validé, pas encore exécuté).
