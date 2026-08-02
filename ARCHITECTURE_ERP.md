# ZegERP — Architecture

Document séparé de `ARCHITECTURE.md` (à la différence de ZegHotel/ZegResto, documentés en section dans le fichier principal) — décision explicite pour ce module vu son volume (13 sous-modules, plusieurs dizaines de tables à terme). `ARCHITECTURE.md` reste la référence pour le socle ZegOS partagé (comptes, organisations, rôles core, abonnements) : ce document ne le duplique pas, il documente uniquement ce qui est spécifique à ZegERP. Voir aussi `CLAUDE.md` pour les conventions de travail transverses (règles de migration, pièges Postgres, etc.), inchangées pour ce module.

**État d'avancement à la date de ce document : Phase 0 (socle module) + Phase 1 (Stock/Produits) seulement.** Les sections 2 à 10 ci-dessous décrivent le schéma **prévu**, pas encore migré — elles servent de plan de dépendance et seront mises à jour au fur et à mesure de chaque phase livrée.

## Principe d'isolation (non négociable, validé)

ZegERP ne réutilise **aucune** table métier de ZegCaisse — `products`, `customers`, `suppliers`, `purchase_orders`, `expenses`, `quotes`, `sales`, etc. restent propres à ZegCaisse, même si ZegERP a des tables au rôle conceptuellement proche (`erp_products`, `erp_customers`, `erp_purchase_orders`...). Un compte qui active ZegCaisse **et** ZegERP a donc deux catalogues produits, deux fichiers clients, deux carnets fournisseurs entièrement distincts — c'est un choix produit assumé (cibles différentes : commerce/boutique pour ZegCaisse, PME structurée pour ZegERP), pas un oubli de factorisation.

Toutes les tables ZegERP sont préfixées **`erp_`**, exactement comme `hotel_` et `resto_` avant elles — même raison de collision (un `erp_invoices` nu entrerait en collision avec un futur usage générique, et le principe déjà établi est "un préfixe par module, sans exception").

Le socle partagé (`organizations`, `organization_members`, `accounts`/`account_subscriptions`, `profiles`/`auth.users`, `subscriptions`/`plans`, Edge Functions paiement/admin, `organization_settings`) reste commun — ZegERP s'y raccroche via `organization_id` exactement comme ZegHotel/ZegResto. La table `notifications` du socle reste partagée, **pas** de `erp_notifications` dédiée (même principe que le reste de ZegOS : une seule table de notifications, filtrée par `organization_id` + type).

## Enregistrement du module (Phase 0 — migration 047)

`organizations.app_module` passe de `'pos' | 'hotel' | 'resto'` à `'pos' | 'hotel' | 'resto' | 'erp'` — même mécanique que l'ajout de `'resto'` par la migration 036 (trois endroits à mettre à jour : `organizations.app_module`, `account_subscriptions.app_module`, `plans.app_module`, tous des `check` en texte, pas un enum Postgres, donc pas de piège `ALTER TYPE`).

**Correction d'une hypothèse du brief d'origine** : le prompt de départ mentionnait `organizations.active_modules` (plusieurs modules actifs par organisation). Ce n'est **pas** le modèle actuel de ZegOS — `active_apps` (jsonb) existe encore historiquement mais `app_module` (texte, unique, figé à la création) est la source de vérité réelle depuis la restructuration compte/établissements (voir `ARCHITECTURE.md`, section "Primitives du socle"). Une organisation a **une seule** application ; un compte multi-module a **plusieurs organisations**, une par application, regroupées par `account_id`. ZegERP suit ce modèle existant à l'identique — pas de nouvelle mécanique inventée pour ce module.

`provision_organization()` n'a besoin d'aucune modification de code : `p_app` est un simple `text` (aucun `check` inline dans la fonction elle-même), donc `p_app = 'erp'` fonctionne dès que la contrainte `organizations_app_module_check` l'autorise. Le parcours d'inscription (écran de choix d'application) devra afficher ZegERP comme option — travail frontend hors scope de cette session (aucune route `/app/erp/*` n'existe encore).

## Rôles ZegERP — proposition (validation requise avant la suite)

Les rôles core (`owner`, `manager`, `accountant`) sont **partagés** entre modules par construction (`app_role` est un seul enum pour tout ZegOS) — ZegERP les réutilise tels quels, avec la même sémantique que côté ZegCaisse/ZegHotel/ZegResto (owner = tous droits, manager = équivalent owner en opérationnel, accountant = lecture large + écriture sur son périmètre financier).

Deux rôles ZegCaisse existants sont **réutilisés par nom** plutôt que dupliqués sous un autre nom, parce que sémantiquement identiques à leur équivalent ZegERP :
- **`stock`** (existe déjà) → couvre le module Stock/Produits en entier, plus la réception de marchandises côté Achats (réceptionner est un geste d'entrepôt, pas d'achat).
- **`cashier`** (existe déjà) → couvre le module POS ERP (`erp_cash_sessions`, `erp_pos_sales`...), à l'identique de son rôle côté caisse ZegCaisse.

Réutiliser ces noms est sûr : `app_role` est un enum partagé mais la RLS reste filtrée par `organization_id`, et une organisation n'a qu'un seul `app_module` — un `stock` dans une organisation ZegERP n'a aucune portée sur une organisation ZegCaisse (lignes différentes, tables différentes). Ce n'est pas une entorse au principe d'isolation (qui porte sur les **données**, pas sur le vocabulaire des rôles) : c'est le même choix déjà fait pour `owner`/`manager`/`accountant`.

**Trois rôles nouveaux proposés**, aucun n'existe encore dans l'enum (pas encore migrés — voir plus bas pourquoi) :

| Rôle proposé | Couvre | Écriture | Lecture |
|---|---|---|---|
| `buyer` (Acheteur) | Achats & Fournisseurs (module 2) | `erp_suppliers`, `erp_purchase_requests`, `erp_purchase_orders`, `erp_supplier_invoices`, `erp_supplier_returns` | + niveaux de stock (module 1) pour décider des réappros |
| `salesperson` (Commercial) | Ventes & CRM (module 3) | `erp_customers`, `erp_prospects`, `erp_quotes`, `erp_sales_orders`, `erp_delivery_notes`, `erp_invoices` (création), `erp_crm_activities` | + niveaux de stock (module 1) pour vérifier la disponibilité |
| `hr_manager` (RH) | RH (module 7) | `erp_departments`, `erp_positions`, `erp_employees`, `erp_attendance`, `erp_leave_requests`, `erp_employee_documents` | rien hors de son périmètre — aucun accès Finance/Comptabilité/Ventes/Achats |

Modules sans rôle dédié :
- **POS ERP** (module 4) → `cashier` (réutilisé).
- **Finance** (module 5, trésorerie) et **Comptabilité** (module 6) → `owner`/`manager`/`accountant` uniquement, aucun rôle "trésorier" séparé proposé (périmètre déjà couvert par `accountant`, pas de besoin identifié de le fragmenter davantage — à confirmer si un vrai besoin métier existe).
- **Gestion documentaire** (module 8) → pas de rôle dédié ; l'accès à un document suit les droits déjà accordés sur l'entité à laquelle il est rattaché (`erp_document_attachments`, polymorphe sur contrat/employé/client/fournisseur...) — un `salesperson` voit les documents liés à ses clients, un `hr_manager` ceux liés aux employés, etc. Détail RLS à finaliser au moment de coder ce module (dépend de tout le reste).
- **Rapports & BI** (module 9) → lecture large `owner`/`manager`/`accountant` sur les vues agrégées (`erp_v_*`) ; chaque rôle métier garde par ailleurs l'accès aux données brutes de son propre périmètre (pas un accès BI élargi). `erp_custom_reports` scopé par utilisateur (`created_by = auth.uid()`), pas seulement par organisation — un rapport sauvegardé reste privé à son auteur, comme demandé.
- **Administration ERP** (module 10) → `owner`/`manager` uniquement, même principe que `organization_members`/`shop_settings` côté socle (gestion d'équipe et de rôles toujours réservée aux deux rôles d'administration).

**Pourquoi les 3 nouveaux rôles ne sont pas encore ajoutés à l'enum dans cette session** : `ALTER TYPE ... ADD VALUE` est irréversible (Postgres ne permet pas de retirer une valeur d'enum) et doit s'exécuter seule, dans sa propre transaction, avant toute policy qui la référence (piège documenté dans `CLAUDE.md`). Le prompt d'origine demande explicitement de valider la liste de rôles avant de coder la moindre RLS — les ajouter maintenant, avant validation, contredirait cette consigne. Ils seront migrés (une ligne par rôle, migration dédiée, sur le modèle de `035_resto_roles.sql`) au moment de démarrer le module qui en a réellement besoin (`buyer` avec le module 2, `salesperson` avec le module 3, `hr_manager` avec le module 7) — jamais en avance de phase.

**Points à valider explicitement avant de poursuivre vers le module 2 (Achats)** :
1. Le nom des 3 rôles (`buyer`/`salesperson`/`hr_manager`) convient-il, ou préférez-vous un autre vocabulaire ?
2. `buyer` et `salesperson` doivent-ils rester strictement cloisonnés (un commercial ne voit aucune donnée achats, et inversement), ou faut-il un chevauchement de lecture (ex. un commercial qui verrait aussi les coûts d'achat pour calculer sa marge) ?
3. Confirmez-vous qu'aucun rôle "trésorier" séparé n'est nécessaire pour Finance/Comptabilité (périmètre `accountant` suffisant) ?

## Schéma par sous-module

### 1. Stock / Produits — livré (migration 048)

| Table | Rôle |
|---|---|
| `erp_product_categories` | Catégories, hiérarchie simple (`parent_id` nullable, un seul niveau de parenté suffit en V1). |
| `erp_brands` | Marques. |
| `erp_units` | Unités de mesure (ex. "Kilogramme" / `kg`), propres à l'organisation (pas de table de référence globale — chaque PME a son propre vocabulaire d'unités). |
| `erp_warehouses` | Dépôts/entrepôts — multi-dépôts natif dès la V1 (contrairement à ZegCaisse qui n'a qu'un niveau de stock par organisation). `is_default` : un seul dépôt par défaut par organisation (index unique partiel). |
| `erp_products` | Fiche produit (SKU, code-barres, prix, coût, catégorie, marque, unité, seuil d'alerte stock bas). `unique(organization_id, sku)`. |
| `erp_stock_levels` | Niveau de stock **par dépôt** (`product_id`, `warehouse_id`, `quantity`) — `unique(organization_id, product_id, warehouse_id)`, à la différence de `stock_levels` (ZegCaisse) qui n'a pas de notion de dépôt. |
| `erp_stock_movements` | Journal des mouvements (`erp_stock_movement_type` : `in`/`out`/`adjustment`/`transfer_out`/`transfer_in`), immuable (aucune update/delete — ledger, même principe que `stock_movements` ZegCaisse). Un trigger (`apply_erp_stock_movement()`) maintient `erp_stock_levels` à jour et bloque tout mouvement qui ferait passer un stock sous zéro. |
| `erp_stock_transfers` + `erp_stock_transfer_lines` | Transfert inter-dépôts. Statuts `brouillon` → `en_transit` → `receptionne` (ou `annule`), pilotés par deux RPC (`send_erp_stock_transfer()`, `receive_erp_stock_transfer()`) qui créent les mouvements `transfer_out`/`transfer_in` de façon atomique — jamais d'écriture directe de ces deux types de mouvement en dehors des RPC. |
| `erp_inventories` + `erp_inventory_lines` | Inventaire physique par dépôt. Statuts `en_cours` → `valide` (ou `annule`). `validate_erp_inventory()` (RPC) compare quantité comptée vs théorique ligne par ligne et crée les mouvements `adjustment` nécessaires pour réconcilier le stock, en une seule transaction. |

Alertes de stock bas : seuil sur `erp_products.low_stock_threshold`, comparé au niveau agrégé (tous dépôts) côté frontend/rapports — pas de table dédiée, même choix que ZegCaisse.

Volontairement **hors scope V1** (non demandé, à ajouter si besoin confirmé) : conversion d'unité automatique (ex. carton ↔ unité), valorisation de stock par méthode (FIFO/CMP) autre que coût moyen implicite, code-barres multiples par produit, upload de photo produit (texte `image_url` pour l'instant, comme ZegCaisse V1 — un vrai composant d'upload type `ImageUploadField.tsx`, déjà générique et réutilisable, viendra quand l'écran Produits sera construit).

### 2. Achats & Fournisseurs — schéma prévu, non migré

`erp_suppliers`, `erp_purchase_requests`, `erp_purchase_orders` + `erp_purchase_order_lines`, `erp_goods_receipts` + `erp_goods_receipt_lines` (la réception crée des `erp_stock_movements` de type à ajouter à l'enum, ex. `purchase_receipt`, plutôt que de réutiliser `in` — traçabilité de l'origine du mouvement), `erp_supplier_invoices`, `erp_supplier_returns`. Dépend du module 1 (les lignes de commande/réception référencent `erp_products`).

### 3. Ventes & CRM — schéma prévu, non migré

`erp_customers`, `erp_prospects` + `erp_sales_pipeline_stages`, `erp_quotes` + `erp_quote_lines`, `erp_sales_orders` + `erp_sales_order_lines`, `erp_delivery_notes`, `erp_invoices` + `erp_invoice_lines`, `erp_credit_notes`, `erp_customer_payments`, `erp_customer_returns`, `erp_crm_activities` (polymorphe customer/prospect, `entity_type` + `entity_id`, pas de FK stricte des deux côtés — même pattern que `erp_document_attachments` plus bas). Dépend du module 1 (lignes produits) ; une commande livrée doit générer une sortie de stock (`erp_stock_movements`, type à définir, ex. `sale` — nouvelle valeur d'enum à ce moment-là).

### 4. POS ERP — schéma prévu, non migré

`erp_cash_sessions`, `erp_pos_sales` + `erp_pos_sale_lines`, `erp_pos_returns`. Isolé du POS ZegCaisse (`sales`/`payments`) même si conceptuellement proche — même principe d'isolation totale que le reste du module. Dépend du module 1 (produits/stock) et probablement du module 3 (client optionnel sur une vente comptoir).

### 5. Finance — schéma prévu, non migré

`erp_cash_accounts` (caisse/banque — un "type" de compte, pas une distinction table par table), `erp_cash_transactions`, `erp_fund_transfers` (entre comptes). Alimenté par les encaissements/décaissements des modules Achats/Ventes/RH une fois ceux-ci en place.

### 6. Comptabilité — schéma prévu, non migré

`erp_chart_of_accounts` (plan comptable SYSCOHADA, cohérent avec le format déjà utilisé pour les autres exports PDF ZegOS), `erp_accounting_journals`, `erp_journal_entries` + `erp_journal_entry_lines` (grand livre), `erp_bank_reconciliations`, `erp_accounting_periods` (clôtures — une période clôturée doit bloquer toute nouvelle écriture dessus, contrainte à poser au niveau RLS/trigger le moment venu). Dépend de Finance + Ventes + Achats (les écritures comptables reflètent les flux de ces modules).

### 7. RH — schéma prévu, non migré

`erp_departments`, `erp_positions`, `erp_employees`, `erp_attendance`, `erp_leave_requests`, `erp_employee_documents`. Indépendant des autres modules métier (peut être construit dès que le socle rôles ERP existe), mais dépend du module 8 pour le stockage réel des documents joints.

### 8. Gestion documentaire — schéma prévu, non migré

`erp_contracts`, `erp_documents` (+ bucket Storage dédié `erp-documents`, RLS scopée par `organization_id` via `storage.foldername(name)` — même pattern que `resto-menu-photos`/`product-images` — jamais le fichier dupliqué en base, seule l'URL/le chemin y vit), `erp_document_attachments` (polymorphe : `entity_type` + `entity_id`, lie un document à un contrat/employé/client/fournisseur...). Dépend de tous les modules qui ont des entités "documentables".

### 9. Rapports & BI — schéma prévu, non migré

Pas de nouvelles tables de données — vues SQL agrégées (`erp_v_*`, une par domaine : ventes, achats, stock, finance...) qui héritent de la RLS des tables sous-jacentes (une vue Postgres standard n'a pas sa propre RLS ; elle applique celle des tables qu'elle interroge — donc aucune fuite de périmètre par rôle même sans policy dédiée sur la vue elle-même). `erp_custom_reports` (configuration de rapport sauvegardée) est la seule vraie table, scopée par `organization_id` **et** `created_by = auth.uid()` — privée à son auteur, jamais partagée automatiquement entre collègues. Dépend de tout le reste (agrège les données de tous les modules livrés).

### 10. Administration ERP — schéma prévu, non migré

Pas de nouvelle table dédiée aux rôles/permissions — `organization_members.role` (l'enum `app_role` partagé) reste la seule source de vérité, exactement comme pour ZegCaisse/ZegHotel/ZegResto. "Administration ERP" au sens de ce module correspond à un écran `/app/erp/parametres` (paramètres du module, à définir) plutôt qu'à un schéma de données propre.

Tableau de bord et Notifications : aucune table dédiée par conception (dashboard = agrégation des tables ci-dessus, notifications = table `notifications` du socle partagée), comme précisé dans le prompt d'origine.

## Conventions transverses (héritées de ZegHotel/ZegResto, appliquées sans dérogation)

- **RLS obligatoire et stricte sur chaque table `erp_*`**, filtrée par `organization_id` via `has_organization_access()`/`has_any_role_in_organization()` — jamais de policy `using (true)`.
- **Colonnes sensibles jamais exposées via une policy trop large** : si un rôle ne doit modifier qu'une partie des colonnes d'une ligne, passer par une RPC `security definer` étroite plutôt qu'élargir une policy `UPDATE` (cf. pattern `hotel_guest_contact()`/`mark_resto_order_item_statut()`, documenté dans `CLAUDE.md`).
- **Migrations jamais exécutées automatiquement** — chaque fichier `db/migrations/0NN_erp_*.sql` est présenté pour relecture, exécuté manuellement par Anselme dans le SQL Editor Supabase.
- **`db/schema.sql`** mis à jour dans le même commit que chaque migration, reflète l'état final (pas l'historique).
- **Un commit par phase**, poussé au fur et à mesure — jamais un commit géant en fin de chantier.
- **Routes sous `/app/erp/*` uniquement** — aucune page publique nouvelle, aucune modification des routes `/`, `/tarifs`, `/inscription`, `/souscription`.
- **`npx tsc --noEmit`** vérifié à chaque étape frontend (aucun impact ce round : uniquement migrations SQL + documentation, pas encore de code frontend `/app/erp/*`).
