# Architecture ZegOS

## Vue d'ensemble

**ZegOS** est la plateforme. **ZegCaisse** (point de vente, ex-NovaCaisse) en est le premier module réel, **ZegHotel** (gestion hôtelière / PMS) le second (migrations 020f-020j), et **ZegResto** (gestion de restaurant) le troisième (migrations 035-041). Même dépôt, même application, même instance Supabase — chaque module réutilise intégralement le socle partagé ci-dessous et n'a nécessité aucune nouvelle fonction de sécurité générique. D'autres applications (ZegERP…) restent prévues mais n'existent pas encore — elles apparaissent comme options "à venir" dans l'écran de choix d'application.

Un compte utilisateur peut être abonné à plusieurs applications ZegOS simultanément — pas en cochant plusieurs cases sur une même organisation (voir la note sur `app_module` juste en dessous, qui a changé cette réalité depuis la restructuration compte/établissements), mais en créant une organisation distincte par application, toutes rattachées au même compte (`account_id`). L'architecture ci-dessous distingue ce qui appartient au **socle ZegOS** (partagé, indépendant de toute application) de ce qui appartient **spécifiquement à chaque module**.

## Primitives du socle (ZegOS-core)

| Table | Rôle |
|---|---|
| `auth.users` / `public.profiles` | Le compte utilisateur — un identifiant, un mot de passe (ou Google), un profil. Indépendant de toute organisation ou application. |
| `public.organizations` | Un espace de travail (« boutique » dans le vocabulaire ZegCaisse). Porte `plan`, `trial_ends_at`, `active_apps`. |
| `public.organization_members` | Appartenance many-to-many utilisateur ↔ organisation, avec un rôle (`app_role` : `owner`, `manager`, `accountant` partagés entre modules ; `cashier`, `stock` spécifiques ZegCaisse ; `front_desk`, `housekeeping` spécifiques ZegHotel ; `server`, `cook` spécifiques ZegResto — voir plus bas). |
| `public.subscriptions` / `public.subscription_payments` | Abonnement et paiements, par organisation (legacy, pré-restructuration compte — voir `public.accounts`/`public.account_subscriptions` ci-dessous, source de vérité actuelle). |
| `public.accounts` / `public.account_subscriptions` | Restructuration compte/établissements (migration 021) : un `account` regroupe toutes les organisations d'un même propriétaire ; `account_subscriptions` porte un abonnement **par (compte, application)** — c'est ce qui borne réellement le nombre d'établissements et de membres, pas `organizations.plan`. |
| `organizations.app_module` | `'pos'` \| `'hotel'` \| `'resto'` — application **unique** de cette organisation, figée à la création, jamais modifiable ensuite (migration 021, étendue à `'resto'` par la migration 036). C'est cette colonne, pas `active_apps`, qui détermine réellement de quelle application relève une organisation. |
| `organizations.active_apps` | jsonb, ex. `["pos"]` — historiquement pensé pour porter plusieurs applications sur une même organisation ; depuis `app_module`, `provision_organization()` n'y écrit jamais qu'un seul élément (`jsonb_build_array(p_app)`). Gate encore la navigation et les routes côté frontend (`AppSidebar`, `BottomNav`, `AppSwitcher`, `app.tsx`) par cohérence historique, mais dans les faits `pathname.startsWith(...)` (contexte déduit de l'URL) fait le travail réel de bascule d'affichage. **Aucune policy RLS ne s'y appuie** dans tous les cas — la RLS reste scopée par `organization_id` + rôle uniquement. |

Un même compte peut appartenir à plusieurs organisations (`organization_members` est many-to-many depuis l'origine). Le multi-application se fait aujourd'hui exclusivement par **plusieurs organisations, une application chacune** : `account_id` regroupe les établissements (ex. une boutique ZegCaisse + un restaurant ZegResto du même propriétaire), chaque organisation ayant un `app_module` unique et immuable. L'ancien modèle "une organisation, plusieurs `active_apps`" documenté ici par le passé ne reflète plus le comportement réel de `provision_organization()`.

## ZegCaisse, ZegHôtel et ZegResto : applications 100% autonomes, aucune page commune

Au-delà du socle ci-dessus (comptes, organisation, abonnement, rôles), **rien n'est partagé dans la navigation** entre les trois applications — chacune a sa propre page Équipe et sa propre page Paramètres, jamais un écran unique avec des onglets pour l'une et l'autre :
- ZegCaisse : `/app/equipe`, `/app/parametres` (tabs Organisation/Devise/Taxes/Ticket/Transfert de stock/Applications).
- ZegHotel : `/app/hotel/equipe`, `/app/hotel/parametres` (tabs Établissement/Tarification/Applications).
- ZegResto : `/app/resto/equipe`, `/app/resto/parametres` (tabs Restaurant/Zones).

Les trois pages Équipe partagent le même composant `TeamPage` (paramétré par la liste de rôles proposée) et les pages Paramètres partagent `OrgIdentityTab`/`AddOrganizationDialog` — **réutilisation de composants, jamais de route ou d'écran commun** : `organizations`/`organization_members`/`organization_settings` restent des tables uniques par organisation (impossible de les dupliquer par application), donc la séparation se fait au niveau de l'écran, pas de la donnée.

`AppSidebar`/`BottomNav` n'affichent jamais deux menus empilés : le contexte courant se déduit de l'URL (`/app/hotel/*`, `/app/resto/*` ou le reste) et `AppSwitcher` bascule entre applications quand le compte en a plusieurs actives (voir `app.tsx` pour la redirection automatique `/app` → `/app/hotel` ou `/app/resto` selon `app_module`/rôle — `front_desk`/`housekeeping` pour ZegHotel, `server`/`cook` pour ZegResto). `GlobalSearch`/`HotelGlobalSearch`/`RestoGlobalSearch` suivent la même logique : jamais de résultats d'une autre application dans le contexte courant.

Le schéma ZegCaisse reste `products`, `sales`, `stock_levels`, `customers`, `quotes`, `expenses`, `purchase_orders`, etc. — toutes ces tables référencent `organization_id` mais n'ont de sens que dans le contexte du point de vente. ZegHotel et ZegResto réutilisent volontairement `products`/`stock_levels`/`stock_movements` pour leurs propres besoins de stock (POS interne ZegHotel, ingrédients de recette ZegResto — voir plus bas) plutôt que de dupliquer un catalogue produit par module.

Routes ZegCaisse : `/app/caisse`, `/app/ventes`, `/app/produits`, `/app/stock`, `/app/clients`, `/app/fournisseurs`, `/app/devis`, `/app/depenses`, `/app/rapports`, `/app/equipe`, `/app/parametres`.

## Ce qui appartient à ZegHotel (module)

17 tables, toutes préfixées **`hotel_`** (migrations 020f-020j, étendues 028-034) — préfixe obligatoire : une table `payments` nue serait entrée en collision avec `public.payments` (paiements de vente ZegCaisse) :

| Table | Rôle |
|---|---|
| `hotel_room_types`, `hotel_rooms` | Types de chambres (capacité, prix de base) et inventaire physique (numéro, étage, statut ménage). |
| `hotel_rate_plans`, `hotel_seasonal_rates`, `hotel_rate_restrictions` | Tarification : plans (PDJ inclus, remboursable…, `billing_unit` nuitée/horaire depuis la migration 028), grilles saisonnières, restrictions (séjour min, stop-vente). |
| `hotel_corporate_accounts` | Comptes entreprise/groupe avec remise négociée et facturation différée (migration 031). |
| `hotel_settings` | Réglages par organisation (PK `organization_id`) : taxe de séjour, devise secondaire. |
| `hotel_channels` | Gestion manuelle des canaux de distribution (nom, notes, tarif spécifique — migration 034) ; pas de synchronisation Booking.com/Expedia/iCal réelle (hors scope V1, structure seulement). |
| `hotel_guests` | Clients de l'hôtel — **distincts** de `customers` (ZegCaisse). Données d'identité (CNI/passeport/date de naissance) restreintes en RLS à `owner`/`manager`/`front_desk` ; lecture masquée (nom/contact seulement) exposée aux autres rôles via `hotel_guest_contact()` (fonction `security definer`, migration 028). |
| `hotel_reservations`, `hotel_reservation_rooms` | Réservation (séjour nuitée **ou** horaire, statut) et attribution chambre par chambre. `hotel_reservation_rooms` dénormalise `check_in`/`check_out`/`status`/`billing_unit` depuis la réservation parente (synchronisé par trigger) pour porter deux contraintes `EXCLUDE USING gist` anti-chevauchement **au niveau base** — une sur `daterange` (nuitée), une sur `tstzrange` (horaire, migration 028). |
| `hotel_folios`, `hotel_folio_charges`, `hotel_payments` | Note de séjour, lignes de charge (chambre/extra/pénalité/taxe/remise), paiements — nommée `hotel_payments` pour la même raison de collision que ci-dessus. |
| `hotel_housekeeping_tasks`, `hotel_maintenance_tickets` | Tâches de ménage du jour et incidents de maintenance par chambre (module Maintenance détaché en écran propre depuis la migration 030). |

Rôles ZegHotel (`app_role` étendu) : `front_desk` (Réceptionniste — réservations, clients, folios) et `housekeeping` (Gouvernante — **scopée aux seules chambres et tâches de ménage/maintenance**, aucun accès RLS aux réservations, clients ou données financières). `owner`/`manager`/`accountant` sont partagés avec ZegCaisse et ont un accès équivalent des deux côtés.

Routes : `/app/hotel` (tableau de bord), `/app/hotel/reservations` (planning + folio + facture PDF), `/app/hotel/rooms`, `/app/hotel/housekeeping`, `/app/hotel/maintenance`, `/app/hotel/clients`, `/app/hotel/corporate`, `/app/hotel/pos-interne` (restaurant/bar/room service facturé directement sur le folio, migration 033), `/app/hotel/canaux`, `/app/hotel/rapports` (occupation/ADR/RevPAR/pickup + audit de nuit), `/app/hotel/equipe`, `/app/hotel/parametres` (Établissement/Tarification/Applications). Toutes sous forme de fichiers plats (`app.hotel.tsx` + `app.hotel.index.tsx` + `app.hotel.<page>.tsx`), même convention que `app.produits.tsx` — jamais de layout imbriqué au-delà de ce que le routing par fichiers impose déjà.

Hors scope V1 (assumé) : intégrations channel manager réelles (Booking.com/Expedia/iCal), moteur de yield/IA, multi-hôtel par organisation.

## Ce qui appartient à ZegResto (module)

21 tables, toutes préfixées **`resto_`** (V1 : migrations 035-041 ; V2 : migrations 042-046) — même raison de collision que `hotel_` (une table `orders` nue entrerait en collision avec un futur usage générique du mot) :

| Table | Rôle |
|---|---|
| `resto_zones`, `resto_tables` | Zones de salle et tables (numéro, capacité, statut `libre`/`occupee`/`reservee`/`nettoyage`, position `x`/`y` pour le plan de salle interactif). |
| `resto_menu_categories`, `resto_menu_items` | Catégories et articles du menu (prix, description, temps de préparation, disponibilité, `photo_url` — upload réel depuis V2, voir plus bas). `station` existe sur `resto_menu_items` mais n'est **toujours pas exploité** — préparé pour un futur routage KDS multi-poste (grill/froid/pâtisserie…), pas de `resto_kitchen_stations`. |
| `resto_modifiers`, `resto_modifier_options`, `resto_menu_item_modifiers` | Modificateurs assignables à un article (ex. "Cuisson", "Suppléments") avec impact prix par option, et leur table de liaison. |
| `resto_orders`, `resto_order_courses` (V2, migration 043), `resto_order_items` | Commande (table ou emporter/livraison, statut) ; `resto_order_courses` découpe une commande en étapes d'envoi cuisine (Entrée/Plat/Dessert, ou une étape par défaut sans nom) — chaque ligne (`resto_order_items`, modificateurs choisis en JSON figé à l'ajout, prix unitaire figé) rejoint une étape via `course_id`. |
| `resto_kitchen_tickets` | Un ticket cuisine **par étape** depuis V2 (par commande entière en V1) — `en_attente` → `en_preparation` → `pret`. Mis à jour en **temps réel** (voir plus bas). |
| `resto_reservations` | Réservations client (staff **et** publiques, `source` distingue les deux) — voir la page publique plus bas. Vue consolidée multi-restaurant côté staff en V2 (voir plus bas), page publique inchangée (une page par établissement). |
| `resto_recipes`, `resto_recipe_ingredients` | Recette optionnelle par article ; `ingredient_ref` référence **directement `public.products(id)`** — les ingrédients sont des produits ZegCaisse ordinaires, stock suivi par `stock_levels`/`stock_movements` déjà existants (même réutilisation que `hotel_pos-interne`). Pas de conversion d'unité automatique (limite assumée). |
| `resto_bills`, `resto_bill_splits`, `resto_bill_split_items`, `resto_bill_payments` | Note d'une commande, partage (`aucun`/`egal`/`detaille`), affectation ligne↔convive en mode détaillé, paiements (mobile money/espèces/carte). V2 (migration 045) : `resto_bills` porte aussi `loyalty_account_id`/`loyalty_discount`/`loyalty_points_earned`/`loyalty_points_redeemed` — remise fidélité limitée au mode de partage "aucun" (pas de règle définie pour répartir une remise entre convives). |
| `resto_settings` (V2, migration 044, complétée 045/046) | Une ligne par organisation (créée à la volée, comme `hotel_settings`) : intervalle d'auto-actualisation et seuil d'urgence du KDS, son (choix/volume) partagé entre alerte "nouveau ticket" et "nouvelle réservation", taux de conversion fidélité, fond de caisse (configuration uniquement). Aucune de ces valeurs n'est codée en dur côté frontend. |
| `resto_loyalty_accounts`, `resto_loyalty_transactions` (V2, migration 045) | Programme de fidélité — voir plus bas. |

Rôles ZegResto (`app_role` étendu, migration 035) : `server` (Serveur — plan de salle, prise de commande, addition ; **aucun accès** menu/paramètres/rapports financiers/cuisine) et `cook` (Cuisinier — **KDS uniquement**, `/app/resto/cuisine`, aucun autre écran). `owner`/`manager`/`accountant` sont partagés avec ZegCaisse/ZegHotel ; `accountant` a un accès en lecture large (financier/reporting) mais jamais les mêmes droits d'écriture qu'`owner`/`manager`. Audit de la navigation (V2) : `AppSidebar`/`BottomNav` déjà cohérents avec la RLS réelle table par table pour ces cinq rôles — aucun écart trouvé, aucune modification nécessaire (voir le résumé du chantier V2 dans l'historique de session pour le détail).

**Programme de fidélité (V2, migration 045) — spécifique à ZegResto, PAS une primitive de plateforme partagée :** `resto_loyalty_accounts` a une identité **indépendante**, clé = numéro de téléphone, sans FK vers `public.customers` (ZegCaisse) — décision produit explicite pour préserver l'isolation entre applications (même principe que `hotel_guests`). Un client fréquentant à la fois une boutique ZegCaisse et un restaurant ZegResto du même compte a donc deux profils fidélité distincts ; unifier les deux nécessiterait une nouvelle primitive de plateforme, non demandée. Points accrués sur le montant net payé (`add_resto_bill_payment()`, une fois la note intégralement réglée), échangeables contre une remise à la facturation (`apply_resto_bill_loyalty()`, ré-appelable — rembourse l'échange précédent avant d'appliquer le nouveau). Taux 100% configurables (`resto_settings.loyalty_*`), programme désactivé par défaut.

**Envoi en cuisine par étapes (V2, migration 043) :** un article ajouté à une commande (`add_resto_order_item()`) n'est plus envoyé en cuisine automatiquement (comportement V1) — il rejoint une étape (`resto_order_courses`, étape par défaut créée implicitement si aucune n'est précisée) ; c'est l'appel explicite `send_resto_course()` (déclenché par le serveur depuis `/app/resto/commandes`) qui crée/relance le ticket cuisine de cette étape. Le marquage individuel d'une ligne ("prêt" côté cuisine, "servie" côté salle) passe par `mark_resto_order_item_statut()` — RPC étroite plutôt qu'une policy UPDATE large sur `resto_order_items`, pour ne pas exposer au cuisinier des colonnes sensibles (`prix_unitaire`, `quantite`) au passage.

**Vue consolidée réservations multi-restaurant (V2) :** un propriétaire de plusieurs établissements ZegResto sous le même `account_id` peut, dans `/app/resto/reservations`, basculer entre "Cet établissement" et "Tous mes restaurants" — aucune policy RLS nouvelle, `provision_organization()` ajoute déjà l'utilisateur comme membre `owner` de chaque établissement qu'il crée, donc `organizations`/`resto_reservations` filtrent naturellement par appartenance réelle. La page publique `/resto/reserver/$slug` reste inchangée (une page par établissement, non demandé de la faire évoluer).

**Photos du menu (V2, migration 042) :** bucket Storage `resto-menu-photos` (public en lecture, écriture owner/manager, policies scopées par `organization_id` via `storage.foldername(name)` — même pattern que `product-images`), remplace le champ texte V1. `src/components/app/ImageUploadField.tsx` est volontairement générique (pas de dépendance à `resto_*`) pour être réutilisable tel quel ailleurs dans ZegOS, mais n'a qu'un seul appelant (Menu ZegResto) à ce stade.

**Temps réel (Supabase Realtime) :** `resto_orders`, `resto_order_items` et `resto_kitchen_tickets` rejoignent la publication `supabase_realtime` (migration 038, `REPLICA IDENTITY FULL`) — première utilisation réelle de Supabase Realtime dans ce projet. `/app/resto/commandes` et `/app/resto/cuisine` s'abonnent via `postgres_changes` filtré par `organization_id`, avec un filet `refetchInterval` **configurable** (V2, `resto_settings.kds_auto_refresh_seconds`) si la connexion websocket tombe. Alerte sonore configurable (choix/volume, V2) sur nouveau ticket cuisine et nouvelle réservation en ligne, générée en Web Audio API (`src/lib/kdsSound.ts`, pas de fichier audio embarqué). **`hotel_housekeeping_tasks` (ZegHotel), malgré un besoin similaire de statut à jour, reste en polling/invalidation TanStack Query classique — non converti.**

**RPC clés (toutes `security definer` sauf mention contraire, pattern de bridage RLS déjà établi pour ZegHotel) :**
- `add_resto_order_item()` : ajoute une ligne de commande à une étape (`p_course_id`, V2), décrémente le stock des ingrédients de la recette si elle existe (réutilise le trigger `apply_stock_movement()` et son garde-fou anti-survente) — `server` n'a aucun droit d'écriture direct sur `resto_order_items`. Ne synchronise plus le ticket cuisine directement depuis V2 (voir `send_resto_course()`).
- `send_resto_course()` (V2) : envoi explicite d'une étape en cuisine — crée/relance son ticket.
- `mark_resto_order_item_statut()` (V2) : marquage ligne par ligne (`pret`/`servie`), étroit par colonne comme par rôle.
- `create_resto_bill()` (`security invoker`, s'appuie sur les policies existantes) : calcule le total depuis les lignes non annulées, répartit en N parts égales si `split_mode = 'egal'`.
- `set_resto_bill_split_items()` : mode détaillé — remplace intégralement l'affectation ligne↔convive et recalcule les montants en une transaction (`resto_bill_split_items` n'a aucune policy d'écriture directe).
- `apply_resto_bill_loyalty()` (V2) : rattache/crée un compte fidélité à une note ouverte, échange optionnellement des points contre une remise.
- `add_resto_bill_payment()` : accumulation atomique sous verrou de ligne (même pattern que `add_sale_payment`) — dès que la somme des paiements couvre (total − remise fidélité), la note passe `payee`, la commande `fermee`, la table redevient `libre`, et l'accrual fidélité se déclenche si un compte est rattaché.
- `resto_public_organization_info()` / `resto_public_create_reservation()` : voir la page publique ci-dessous.

**Page publique (exception de scope validée) :** `/resto/reserver/$slug` est la **seule page publique de tout ZegOS** en dehors de `/`, `/tarifs`, `/inscription`, `/connexion`, `/souscription` — un formulaire de réservation client par restaurant (résolu par son `slug` d'organisation), volontairement autonome (pas de `PublicHeader`/`PublicFooter`, marketing ZegCaisse hors sujet ici). Il n'écrit **jamais** directement dans `resto_reservations` (aucune policy `insert to anon`) : il passe par `resto_public_create_reservation()`, seule porte d'écriture anonyme de tout ZegResto, qui valide (nom requis, couverts > 0, date dans le futur) et insère avec `statut = 'pending'`, `source = 'public'` — à confirmer par le staff dans `/app/resto/reservations`. Aucune limite de débit/anti-spam (assumé). Cette exception est **spécifique à ZegResto** et ne doit pas être étendue à ZegCaisse/ZegHotel sans validation explicite.

Routes : `/app/resto` (tableau de bord — CA/couverts/tables occupées/réservations en attente), `/app/resto/salle` (plan de salle interactif, glisser-déposer), `/app/resto/commandes` (V2 : poste de travail complet — grille visuelle du menu avec photos/recherche/catégories, bascule rapide entre commandes actives, gestion des étapes d'envoi cuisine, facturation avec section fidélité), `/app/resto/cuisine` (KDS temps réel, V2 : auto-refresh configurable, surlignage d'urgence, marquage par ligne, alerte sonore), `/app/resto/menu` (catégories/articles/modificateurs/recettes, photos), `/app/resto/reservations` (V2 : vue consolidée multi-restaurant), `/app/resto/rapports` (V2 : par serveur, par catégorie, rotation des tables, heures de pointe, consommation d'ingrédients vs stock, comparaison période précédente, export PDF — en plus de CA/ticket moyen/temps de service/plats les plus vendus, V1), `/app/resto/equipe`, `/app/resto/parametres` (Restaurant/Zones, V2 : Ticket & Caisse/Cuisine (KDS)/Sons & Notifications/Fidélité). Même convention de fichiers plats que ZegHotel (`app.resto.tsx` + `app.resto.index.tsx` + `app.resto.<page>.tsx`).

Hors scope (assumé) : intégrations livraison tierce (Uber Eats, etc.), réservation multi-restaurant depuis une même **page publique** (le formulaire client reste un par établissement — seule la vue **staff** est consolidée, V2), programme de fidélité comme primitive de plateforme partagée avec ZegCaisse (V2 le limite explicitement à ZegResto), routage KDS multi-poste (`resto_menu_items.station` toujours posé mais inexploité), conversion d'unité automatique dans les recettes, notifications automatisées dédiées ZegResto sur le modèle de `notify_hotel_reservation_created` (l'alerte sonore V2 est un mécanisme différent, côté client, pas un `notify_resto_*` en base), suivi de session de caisse complet avec journal d'écarts (fond de caisse V2 = configuration uniquement).

## Parcours d'inscription et provisionnement

```
Compte (auth.signUp / Google)  →  /app détecte 0 organisation
        │                              │
        │                              ▼
        │                    Écran de choix d'application
        │            (ZegCaisse/ZegHotel/ZegResto actifs, ZegERP "à venir")
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

- ZegHotel V1 : pas d'intégrations channel manager réelles (Booking.com/Expedia/iCal — `hotel_channels` reste une gestion manuelle sans synchronisation), pas de moteur de yield/IA, pas de multi-hôtel par organisation.
- ZegResto (après V2) : pas d'intégrations livraison tierce, pas de réservation multi-restaurant depuis la **page publique** (formulaire toujours un par établissement — seule la vue staff est consolidée), pas de programme de fidélité partagé avec ZegCaisse (volontairement limité à ZegResto), pas de routage KDS multi-poste, pas de conversion d'unité automatique dans les recettes, pas de notifications automatisées `notify_resto_*` en base (l'alerte sonore V2 est un mécanisme client différent), pas de suivi de session de caisse complet avec journal d'écarts (fond de caisse V2 = configuration uniquement).
- Connexion Google (OAuth) : configuration Supabase/Google Cloud Console en attente côté produit, bouton pas encore ajouté au front.
- Renommage du texte UI "boutique" → "organisation" (validé, pas encore exécuté).
