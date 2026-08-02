# ZegERP — Architecture

Document séparé de `ARCHITECTURE.md` (à la différence de ZegHotel/ZegResto, documentés en section dans le fichier principal) — décision explicite pour ce module vu son volume (13 sous-modules, plusieurs dizaines de tables à terme). `ARCHITECTURE.md` reste la référence pour le socle ZegOS partagé (comptes, organisations, rôles core, abonnements) : ce document ne le duplique pas, il documente uniquement ce qui est spécifique à ZegERP. Voir aussi `CLAUDE.md` pour les conventions de travail transverses (règles de migration, pièges Postgres, etc.), inchangées pour ce module.

**État d'avancement à la date de ce document : les 10 sous-modules ont un schéma migré** (Stock/Produits, Achats & Fournisseurs, Ventes & CRM, POS ERP, Finance, Comptabilité, RH, Gestion documentaire, Rapports & BI, Administration). Aucune route frontend `/app/erp/*` n'existe encore — ce document couvre uniquement le socle base de données (migrations 047 à 060, toutes présentées pour relecture, aucune exécutée automatiquement).

## Principe d'isolation (non négociable, validé)

ZegERP ne réutilise **aucune** table métier de ZegCaisse — `products`, `customers`, `suppliers`, `purchase_orders`, `expenses`, `quotes`, `sales`, etc. restent propres à ZegCaisse, même si ZegERP a des tables au rôle conceptuellement proche (`erp_products`, `erp_customers`, `erp_purchase_orders`...). Un compte qui active ZegCaisse **et** ZegERP a donc deux catalogues produits, deux fichiers clients, deux carnets fournisseurs entièrement distincts — c'est un choix produit assumé (cibles différentes : commerce/boutique pour ZegCaisse, PME structurée pour ZegERP), pas un oubli de factorisation.

Toutes les tables ZegERP sont préfixées **`erp_`**, exactement comme `hotel_` et `resto_` avant elles — même raison de collision (un `erp_invoices` nu entrerait en collision avec un futur usage générique, et le principe déjà établi est "un préfixe par module, sans exception").

Le socle partagé (`organizations`, `organization_members`, `accounts`/`account_subscriptions`, `profiles`/`auth.users`, `subscriptions`/`plans`, Edge Functions paiement/admin, `organization_settings`) reste commun — ZegERP s'y raccroche via `organization_id` exactement comme ZegHotel/ZegResto. La table `notifications` du socle reste partagée, **pas** de `erp_notifications` dédiée (même principe que le reste de ZegOS : une seule table de notifications, filtrée par `organization_id` + type).

## Enregistrement du module (Phase 0 — migration 047)

`organizations.app_module` passe de `'pos' | 'hotel' | 'resto'` à `'pos' | 'hotel' | 'resto' | 'erp'` — même mécanique que l'ajout de `'resto'` par la migration 036 (trois endroits à mettre à jour : `organizations.app_module`, `account_subscriptions.app_module`, `plans.app_module`, tous des `check` en texte, pas un enum Postgres, donc pas de piège `ALTER TYPE`).

**Correction d'une hypothèse du brief d'origine** : le prompt de départ mentionnait `organizations.active_modules` (plusieurs modules actifs par organisation). Ce n'est **pas** le modèle actuel de ZegOS — `active_apps` (jsonb) existe encore historiquement mais `app_module` (texte, unique, figé à la création) est la source de vérité réelle depuis la restructuration compte/établissements (voir `ARCHITECTURE.md`, section "Primitives du socle"). Une organisation a **une seule** application ; un compte multi-module a **plusieurs organisations**, une par application, regroupées par `account_id`. ZegERP suit ce modèle existant à l'identique — pas de nouvelle mécanique inventée pour ce module.

`provision_organization()` n'a besoin d'aucune modification de code : `p_app` est un simple `text` (aucun `check` inline dans la fonction elle-même), donc `p_app = 'erp'` fonctionne dès que la contrainte `organizations_app_module_check` l'autorise. Le parcours d'inscription (écran de choix d'application) devra afficher ZegERP comme option — travail frontend hors scope de cette session (aucune route `/app/erp/*` n'existe encore).

## Rôles ZegERP — validés

Les rôles core (`owner`, `manager`, `accountant`) sont **partagés** entre modules par construction (`app_role` est un seul enum pour tout ZegOS) — ZegERP les réutilise tels quels, avec la même sémantique que côté ZegCaisse/ZegHotel/ZegResto (owner = tous droits, manager = équivalent owner en opérationnel, accountant = lecture large + écriture sur son périmètre financier).

Deux rôles ZegCaisse existants sont **réutilisés par nom** plutôt que dupliqués sous un autre nom, parce que sémantiquement identiques à leur équivalent ZegERP :
- **`stock`** (existe déjà) → couvre le module Stock/Produits en entier, plus la réception de marchandises côté Achats (réceptionner est un geste d'entrepôt, pas d'achat).
- **`cashier`** (existe déjà) → couvre le module POS ERP (`erp_cash_sessions`, `erp_pos_sales`...), à l'identique de son rôle côté caisse ZegCaisse.

Réutiliser ces noms est sûr : `app_role` est un enum partagé mais la RLS reste filtrée par `organization_id`, et une organisation n'a qu'un seul `app_module` — un `stock` dans une organisation ZegERP n'a aucune portée sur une organisation ZegCaisse (lignes différentes, tables différentes). Ce n'est pas une entorse au principe d'isolation (qui porte sur les **données**, pas sur le vocabulaire des rôles) : c'est le même choix déjà fait pour `owner`/`manager`/`accountant`.

**Trois rôles nouveaux validés** (noms confirmés), aucun n'existe encore dans l'enum (pas encore migrés — voir plus bas pourquoi) :

| Rôle validé | Couvre | Écriture | Lecture |
|---|---|---|---|
| `buyer` (Acheteur) | Achats & Fournisseurs (module 2) | `erp_suppliers`, `erp_purchase_requests`, `erp_purchase_orders`, `erp_supplier_invoices`, `erp_supplier_returns` | + niveaux de stock (module 1) pour décider des réappros |
| `salesperson` (Commercial) | Ventes & CRM (module 3) | `erp_customers`, `erp_prospects`, `erp_quotes`, `erp_sales_orders`, `erp_delivery_notes`, `erp_invoices` (création), `erp_crm_activities` | + niveaux de stock (module 1) pour vérifier la disponibilité |
| `hr_manager` (RH) | RH (module 7) | `erp_departments`, `erp_positions`, `erp_employees`, `erp_attendance`, `erp_leave_requests`, `erp_employee_documents` | rien hors de son périmètre — aucun accès Finance/Comptabilité/Ventes/Achats |

**`buyer` et `salesperson` sont strictement cloisonnés** (validé) : un commercial n'a aucun accès en lecture aux coûts d'achat/fournisseurs (`erp_purchase_orders`, `erp_supplier_invoices`...) et inversement un acheteur n'a aucun accès aux données de vente/CRM. Pas de chevauchement de lecture pour le calcul de marge — si ce besoin apparaît, il passera par un rapport dédié (module 9), pas par un élargissement RLS de l'un des deux rôles.

Modules sans rôle dédié :
- **POS ERP** (module 4) → `cashier` (réutilisé).
- **Finance** (module 5, trésorerie) et **Comptabilité** (module 6) → `owner`/`manager`/`accountant` uniquement — **validé : aucun rôle "trésorier" séparé**, périmètre `accountant` suffisant.
- **Gestion documentaire** (module 8) → pas de rôle dédié ; l'accès à un document suit les droits déjà accordés sur l'entité à laquelle il est rattaché (`erp_document_attachments`, polymorphe sur contrat/employé/client/fournisseur...) — un `salesperson` voit les documents liés à ses clients, un `hr_manager` ceux liés aux employés, etc. Détail RLS à finaliser au moment de coder ce module (dépend de tout le reste).
- **Rapports & BI** (module 9) → lecture large `owner`/`manager`/`accountant` sur les vues agrégées (`erp_v_*`) ; chaque rôle métier garde par ailleurs l'accès aux données brutes de son propre périmètre (pas un accès BI élargi). `erp_custom_reports` scopé par utilisateur (`created_by = auth.uid()`), pas seulement par organisation — un rapport sauvegardé reste privé à son auteur, comme demandé.
- **Administration ERP** (module 10) → `owner`/`manager` uniquement, même principe que `organization_members`/`shop_settings` côté socle (gestion d'équipe et de rôles toujours réservée aux deux rôles d'administration).

**Pourquoi les 3 rôles validés n'ont pas été ajoutés d'un coup à l'enum** : `ALTER TYPE ... ADD VALUE` est irréversible (Postgres ne permet pas de retirer une valeur d'enum) et doit s'exécuter seule, dans sa propre transaction, avant toute policy qui la référence (piège documenté dans `CLAUDE.md`). Ils ont été migrés (une ligne par rôle, migration dédiée, sur le modèle de `035_resto_roles.sql`) au moment de démarrer le module qui en avait réellement besoin — jamais en avance de phase. Les 3 sont désormais faits : `buyer` (migration 049, module 2), `salesperson` (migration 051, module 3), `hr_manager` (migration 056, module 7).

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

### 2. Achats & Fournisseurs — livré (migrations 049+050)

| Table | Rôle |
|---|---|
| `erp_suppliers` | Fiche fournisseur. Select : owner/manager/accountant/buyer/stock. Écriture : owner/manager/buyer. |
| `erp_purchase_requests` + `erp_purchase_request_lines` | Demande interne, étape optionnelle avant commande (`request_id` nullable sur `erp_purchase_orders`). Statuts `draft` → `submitted` → `approved`/`rejected`. Créée par owner/manager/buyer/**stock** (un magasinier peut signaler un besoin de réappro) ; l'approbation (`submitted` → `approved`/`rejected`) est réservée à owner/manager, même si l'auteur a le rôle buyer/stock — pas d'auto-approbation. |
| `erp_purchase_orders` + `erp_purchase_order_lines` | Commande fournisseur. Statuts `draft` → `confirmed` → `partially_received`/`received` (ou `cancelled`). `received_quantity` (ligne) jamais modifiée directement — incrémentée exclusivement par `confirm_erp_goods_receipt()`. **Masquage de colonne** : `erp_purchase_order_lines` porte `unit_cost` (donnée sensible) ; le rôle `stock` n'a **aucune** policy SELECT dessus — il consulte quantités commandées/reçues via `erp_purchase_order_lines_for_receiving()` (RPC `security definer`, ne retourne jamais `unit_cost`), pattern `hotel_guest_contact()` imposé par `CLAUDE.md`. |
| `erp_goods_receipts` + `erp_goods_receipt_lines` | Réception physique — rôle **stock** exclusivement (`buyer` n'y a aucun accès direct), cohérent avec "réceptionner est un geste d'entrepôt, pas d'achat". `confirm_erp_goods_receipt()` (RPC) crée les mouvements `purchase_receipt` (coût repris de la ligne de commande, jamais saisi par `stock`), incrémente `received_quantity`, recalcule le statut de la commande. Réception partielle supportée nativement. |
| `erp_supplier_invoices` | Facture fournisseur / suivi paiement (`unpaid`/`partially_paid`/`paid`/`disputed`). Écriture élargie à `accountant` (périmètre financier), pas seulement `buyer`. Aucun mouvement de stock associé, pas de RPC nécessaire. |
| `erp_supplier_returns` + `erp_supplier_return_lines` | Retour marchandise au fournisseur. Porté par **buyer** en V1 (pas `stock`) — simplification assumée, à revisiter si un geste physique distinct par le magasinier se confirme nécessaire. `confirm_erp_supplier_return()` (RPC) crée les mouvements `supplier_return` (sortie, bloquée si stock insuffisant). |

`erp_stock_movement_type` étendu (migration 049, valeurs ajoutées seules avant tout usage) : `purchase_receipt` (+) et `supplier_return` (−, garde anti-survente incluse) — `apply_erp_stock_movement()` mis à jour en conséquence (`CREATE OR REPLACE`, signature inchangée, sûr). Rôle `buyer` ajouté à `app_role` par la même migration.

Volontairement **hors scope V1** : conversion automatique demande → commande (copie des lignes), variance de coût à la réception (prix facturé vs prix commandé), réception contre plusieurs commandes en une seule fois.

### 3. Ventes & CRM — livré (migrations 051+052)

| Table | Rôle |
|---|---|
| `erp_customers` | Fiche client. Select : owner/manager/accountant/salesperson. Écriture : owner/manager/salesperson. |
| `erp_sales_pipeline_stages` | Configuration du pipeline (étapes, `is_won`/`is_lost`) — écriture réservée owner/manager (paramétrage), lecture élargie à salesperson. |
| `erp_prospects` | Fiche prospect, `stage_id` vers le pipeline, `converted_customer_id` renseigné manuellement quand un prospect devient client (pas de RPC de conversion automatique en V1). |
| `erp_quotes` + `erp_quote_lines` | Devis client. Statuts `draft` → `sent` → `accepted`/`refused`/`expired` (terminaux, pas de réouverture — on recrée un devis). `converted` existe comme statut mais aucune conversion automatique en commande n'est câblée en V1 (création manuelle d'une `erp_sales_orders` avec `quote_id` renseigné). |
| `erp_sales_orders` + `erp_sales_order_lines` | Commande client. Statuts `draft` → `confirmed` → `partially_delivered`/`delivered` (ou `cancelled`). `delivered_quantity` (ligne) jamais modifiée directement — incrémentée exclusivement par `confirm_erp_delivery()`. |
| `erp_delivery_notes` + `erp_delivery_note_lines` | Bon de livraison. **Portée `salesperson`** (pas `stock`) — asymétrie assumée vis-à-vis du module 2 : la table de rôles validée liste explicitement `erp_delivery_notes` sous `salesperson`, contrairement à `erp_goods_receipts` qui excluait `buyer`. `confirm_erp_delivery()` (RPC) crée les mouvements `sale` (coût repris de `erp_products.cost`, snapshot COGS approximatif V1), incrémente `delivered_quantity`, recalcule le statut de la commande. Livraison partielle supportée nativement. |
| `erp_invoices` + `erp_invoice_lines` | Facture client. Statuts `draft`/`sent`/`partially_paid`/`paid`/`overdue`/`cancelled`. Écriture élargie à `accountant` (suivi paiement), pas seulement `salesperson` — comme `erp_supplier_invoices` côté achats. |
| `erp_credit_notes` | Avoir client — montant unique, pas de lignes détaillées (simplification V1 assumée). |
| `erp_customer_payments` | Encaissement. `method` typé `erp_payment_method` — **nouvel enum dédié**, pas de réutilisation de `public.payment_method` (ZegCaisse) : même principe de découplage que `erp_stock_movement_type` vis-à-vis de `stock_movement_type`. |
| `erp_customer_returns` + `erp_customer_return_lines` | Retour client. **Portée `stock`** (pas `salesperson`) — symétrique de `erp_goods_receipts` : `erp_customer_returns` n'apparaît pas dans le périmètre `salesperson` validé, traité comme une réception physique. `confirm_erp_customer_return()` (RPC) crée les mouvements `customer_return` (entrée). |
| `erp_crm_activities` | Polymorphe (`entity_type` `customer`/`prospect` + `entity_id`, pas de FK stricte des deux côtés — même pattern prévu pour `erp_document_attachments`, module 8). Visibilité équipe complète (pas privée par auteur, à la différence de `erp_custom_reports`, module 9). |

`erp_stock_movement_type` étendu (migration 051, valeurs ajoutées seules avant tout usage) : `sale` (−, garde anti-survente incluse) et `customer_return` (+). `apply_erp_stock_movement()` mis à jour en conséquence (3ᵉ `CREATE OR REPLACE`, signature toujours inchangée). Rôle `salesperson` ajouté à `app_role` par la même migration, **strictement cloisonné de `buyer`** (validé — aucune policy de ce fichier ne référence les deux rôles ensemble).

Volontairement **hors scope V1** : conversion automatique devis → commande, calcul de marge croisé achats/ventes (passera par un rapport dédié module 9, pas par un élargissement RLS), relances de facture automatisées.

### 4. POS ERP — livré (migration 053)

| Table | Rôle |
|---|---|
| `erp_cash_sessions` | Session de caisse (`warehouse_id` : la vente comptoir décrémente ce dépôt). Fermeture (`closing_amount`) par simple UPDATE — aucun mouvement de stock associé à la fermeture, pas de RPC nécessaire. |
| `erp_pos_sales` + `erp_pos_sale_lines` | Vente comptoir, `customer_id` optionnel (module 3). `complete_erp_pos_sale()` (RPC) crée les mouvements **`sale`** (réutilisé tel quel du module 3 — une vente comptoir décrémente le stock exactement comme une livraison, seul le canal diffère), recalcule `total_amount`/`tax_amount` côté serveur (jamais fait confiance à une valeur envoyée par le client), bloque si la session de caisse n'est plus ouverte. |
| `erp_pos_returns` + `erp_pos_return_lines` | Retour comptoir. `confirm_erp_pos_return()` (RPC) crée les mouvements **`customer_return`** (réutilisé du module 3), incrémente `returned_quantity` sur la ligne de vente d'origine (bloque le sur-retour). |

**Aucun rôle ni type de mouvement nouveau** : `cashier` (existant, réutilisé) et `sale`/`customer_return` (ajoutés migration 051, module 3) suffisent — seule migration de ce module, pas de préliminaire d'enum. Isolé du POS ZegCaisse (`sales`/`payments`) même si conceptuellement proche.

### 5. Finance — livré (migration 054)

| Table | Rôle |
|---|---|
| `erp_cash_accounts` | Compte caisse/banque (`type` : `cash`/`bank`, pas une table par type). Écriture normale owner/manager/accountant. |
| `erp_cash_account_balances` | Solde — jamais d'écriture directe (comme `erp_stock_levels`, module 1), maintenu exclusivement par `apply_erp_cash_transaction()` (trigger). Table séparée de `erp_cash_accounts` précisément pour ça : impossible de "glisser" une modification de solde dans une policy UPDATE normale du compte. |
| `erp_fund_transfers` | Virement entre deux comptes internes. `confirm_erp_fund_transfer()` (RPC) crée la paire `transfer_out`/`transfer_in`. |
| `erp_cash_transactions` | Ledger immuable (aucune update/delete). `source_type`/`source_id` : lien libre non contraint (polymorphe) vers l'origine d'une transaction manuelle — les modules Achats/Ventes ne génèrent **pas** encore de transaction automatiquement en V1 (l'intégration Achats/Ventes/RH → Finance reste manuelle pour l'instant, à réévaluer plus tard). Pas de garde anti-négatif sur le solde (à la différence du stock) : un compte peut légitimement passer en négatif (découvert bancaire, caisse en attente de dépôt). |

**Aucun rôle nouveau** (validé : owner/manager/accountant uniquement, pas de rôle trésorier séparé). `erp_cash_transaction_type` est un type entièrement nouveau créé dans la même migration que son premier usage — pas une extension d'un enum existant, donc aucune contrainte de transaction séparée (contrairement aux rôles/types ajoutés aux modules 2 et 3).

### 6. Comptabilité — livré (migration 055)

| Table | Rôle |
|---|---|
| `erp_chart_of_accounts` | Plan comptable SYSCOHADA — `code` porte la numérotation SYSCOHADA elle-même, `type` (`asset`/`liability`/`equity`/`revenue`/`expense`) est une classification simplifiée pour les rapports, pas une redite du code. |
| `erp_accounting_journals` | Journaux (codes libres — VE/AC/BQ/CA/OD usuels SYSCOHADA, pas une liste figée). |
| `erp_accounting_periods` | Clôtures. **Contrainte de clôture posée au niveau RLS** (pas trigger) : les policies INSERT et UPDATE (tant que `draft`) de `erp_journal_entries` vérifient par sous-requête qu'aucune période `closed` ne couvre `entry_date` — une période clôturée bloque toute nouvelle écriture ou modification dessus, comme demandé. L'absence de période pour une date ne bloque rien. |
| `erp_journal_entries` + `erp_journal_entry_lines` | Grand livre en partie double. Une ligne est soit un débit soit un crédit (`check (debit = 0 or credit = 0)`). `post_erp_journal_entry()` (RPC) **vérifie l'équilibre débit = crédit** (rejette toute écriture déséquilibrée) et la non-clôture de la période avant de passer l'écriture `posted` — immuable ensuite (aucune policy update ne s'applique hors `draft`). |
| `erp_bank_reconciliations` + `erp_bank_reconciliation_lines` | Rapprochement bancaire, pointe des `erp_cash_transactions` (module 5) contre un relevé. `complete_erp_bank_reconciliation()` (RPC) recalcule `reconciled_balance` à partir des lignes pointées (somme signée) ; l'écart avec `statement_balance` n'est pas bloquant, laissé à l'affichage frontend. |

**Aucun rôle nouveau** (owner/manager/accountant, même périmètre que Finance). Saisie manuelle en V1 : aucune écriture n'est générée automatiquement depuis Achats/Ventes/Finance (même limite assumée que le module 5, pour les mêmes raisons).

### 7. RH — livré (migrations 056+057)

| Table | Rôle |
|---|---|
| `erp_departments`, `erp_positions` | Référentiel RH de base. |
| `erp_employees` | Fiche employé. `user_id` optionnel (nullable) : un employé n'a pas forcément de compte ZegOS (ex. personnel de terrain sans accès app). |
| `erp_attendance` | Pointage, `unique(employee_id, date)`. |
| `erp_leave_requests` | Demande de congé. **Pas de split créateur/approbateur** (contrairement à `erp_purchase_requests`, module 2) : `hr_manager` porte une autorité managériale complète et validée sur son périmètre, une seule policy `write` suffit. |
| `erp_employee_documents` | `file_url` en texte simple en V1 (comme `erp_products.image_url`, module 1) — **pas encore raccroché** au bucket Storage `erp-documents` prévu module 8 (non livré) : pas de dépendance dure sur un module qui n'existe pas encore. |

**Périmètre strictement resserré owner/manager/hr_manager** sur toutes les tables (select et write) — ni `accountant`, ni aucun autre rôle métier : données potentiellement sensibles (identité, congés, documents personnels), le principe est de ne pas élargir "pour être pratique". Cohérent avec le validé "`hr_manager`... rien hors de son périmètre — aucun accès Finance/Comptabilité/Ventes/Achats", appliqué ici symétriquement (les autres rôles n'ont pas non plus accès aux données RH).

### 8. Gestion documentaire — livré (migration 058)

| Table | Rôle |
|---|---|
| `erp_contracts` | owner/manager/accountant — un contrat n'est pas rattaché de façon polymorphe (il **est** un des types d'entité pour `erp_document_attachments`, pas une cible parmi d'autres). Liens optionnels vers `erp_suppliers`/`erp_customers`/`erp_employees` selon `contract_type`. |
| `erp_documents` | Métadonnées seulement (`file_path` = chemin dans le bucket, jamais le fichier dupliqué en base — même principe que `product-images`/`resto-menu-photos`). |
| `erp_document_attachments` | Polymorphe (`entity_type` `supplier`/`customer`/`employee`/`contract` + `entity_id`, pas de FK stricte). **C'est la table qui porte la RLS entité-scopée** promise dans la version précédente de ce document : un document attaché à un fournisseur suit les droits `buyer`, à un client `salesperson`, à un employé `hr_manager`, à un contrat `accountant`. `owner`/`manager` voient et gèrent toujours tout, quel que soit l'attachement. Un document **sans** attachement n'est visible que par `owner`/`manager`. |

**Bucket Storage `erp-documents` — premier bucket PRIVÉ de ce dépôt** (`public: false`), à la différence de tous les buckets existants (`product-images`, `resto-menu-photos`, `avatars`...) qui sont publics en lecture : justifié par la sensibilité du contenu (pièces d'identité employé, contrats). Le niveau storage reste volontairement grossier (accès ouvert à toute l'organisation via `has_organization_access()`) ; la nuance fine par entité vit dans les tables ci-dessus, exactement comme `product-images` laisse la nuance métier à la table `products` et se contente d'un filtrage large côté storage. Convention de chemin : `{organization_id}/{document_id}/{nom_fichier}`.

Dépend de tous les modules qui ont des entités "documentables" (2, 3, 7 — livrés).

### 9. Rapports & BI — livré (migration 059)

| Vue / Table | Contenu |
|---|---|
| `erp_v_stock_valuation` | Valorisation du stock par produit/dépôt (`quantity * cost`). |
| `erp_v_purchase_orders_summary` | Commandes fournisseur agrégées (montant commandé vs reçu, par ligne sommée). |
| `erp_v_sales_summary` | **Unifie** commandes client (module 3) et ventes comptoir (module 4) via `union all`, colonne `channel` (`sales_order`/`pos`) pour distinguer l'origine. |
| `erp_v_cash_position` | Position de trésorerie par compte (module 5). |
| `erp_custom_reports` | Seule vraie table du module — configuration de rapport sauvegardée, scopée par `organization_id` **et** `created_by = auth.uid()` — privée à son auteur, jamais partagée automatiquement entre collègues. Pas de restriction par rôle métier au-delà de l'appartenance à l'organisation. |

**Aucune RLS dédiée sur les 4 vues** : ce sont des vues Postgres standard (ni `security definer` ni `security_barrier`), elles s'exécutent avec les droits de l'appelant et héritent donc automatiquement de la RLS des tables sous-jacentes — un `salesperson` qui interroge `erp_v_sales_summary` ne voit que ce que la RLS de `erp_sales_orders`/`erp_pos_sales` lui permettrait déjà de voir directement, sans fuite de périmètre et sans policy à écrire sur la vue elle-même. Dépend des modules 1, 2, 3, 4, 5 (livrés) pour ses données sources.

### 10. Administration ERP — livré (migration 060)

Pas de nouvelle table dédiée aux rôles/permissions — `organization_members.role` (l'enum `app_role` partagé) reste la seule source de vérité, exactement comme pour ZegCaisse/ZegHotel/ZegResto.

Seule addition, volontairement minimale (pas de champ ajouté "au cas où") : `erp_settings`, une ligne par organisation, portant uniquement des réglages déjà nécessaires aux modules précédemment livrés :

| Champ | Sert à |
|---|---|
| `default_warehouse_id` | Pré-sélection du dépôt dans les écrans POS ERP (module 4) / réceptions (module 2). |
| `invoice_prefix` / `quote_prefix` | Numérotation des factures et devis (module 3). |
| `fiscal_year_start_month` | Référence pour la génération des périodes comptables (module 6). |

Écriture réservée owner/manager (même principe que `organization_members`/`shop_settings`) ; lecture élargie à `accountant` (a besoin de la numérotation et du mois de clôture fiscal). Pas de ligne créée automatiquement à la provision de l'organisation — le frontend fait un upsert au premier enregistrement depuis `/app/erp/parametres`, comme les écrans de paramètres existants.

Tableau de bord et Notifications : aucune table dédiée par conception (dashboard = agrégation des tables des modules 1 à 9, notifications = table `notifications` du socle partagée), comme précisé dans le prompt d'origine.

## Récapitulatif — les 10 modules

Les 10 sous-modules ont désormais un schéma migré (migrations 047 à 060) : Stock/Produits, Achats & Fournisseurs, Ventes & CRM, POS ERP, Finance, Comptabilité, RH, Gestion documentaire, Rapports & BI, Administration. Les 3 rôles validés (`buyer`, `salesperson`, `hr_manager`) sont tous ajoutés à l'enum. Isolation totale vis-à-vis de ZegCaisse maintenue sur l'ensemble (aucune table `erp_*` ne référence une table métier ZegCaisse). `db/schema.sql` reflète l'état final de chaque migration dans le même commit qu'elle.

## Frontend `/app/erp/*` — en cours (chantier séparé, construit au fil des phases)

Même méthode que ZegHotel/ZegResto en leur temps : un socle transverse d'abord (rôles frontend, onboarding, navigation, catalogue de modules bridables par formule), puis les écrans module par module, dans le même ordre de dépendance que le schéma ci-dessus.

**Socle livré** :
- `src/lib/roles.ts` — `AppRole`/`ROLE_LABEL` incluent désormais `buyer`/`salesperson`/`hr_manager`.
- `src/components/app/OnboardingFlow.tsx` — ZegERP est un 4ᵉ choix pleinement actif (`ErpSetupForm`, même structure que les 3 autres).
- `src/components/app/AppSidebar.tsx` / `BottomNav.tsx` / `AppSwitcher.tsx` — contexte `/app/erp/*` reconnu au même titre que pos/hotel/resto (isolation totale : jamais deux menus d'applications affichés en même temps).
- `src/lib/data/adminHooks.ts` — `ERP_MODULES` (catalogue des modules bridables par formule, construit au fil des phases comme `RESTO_MODULES` en son temps), `getModulesForApp()` étendu.
- `src/routes/admin.formules.tsx` — ZegERP est un 4ᵉ onglet de gestion de formules.
- Tous les littéraux `"pos" | "hotel" | "resto"` du frontend étendus à `"erp"` (`OrganizationProvider`, `accountHooks`, `adminHooks`).

**Frontend Phase 1 — Stock/Produits livré** (`src/lib/data/erpHooks.ts`, `src/routes/app.erp.tsx`, `app.erp.index.tsx`, `app.erp.produits.tsx`, `app.erp.stock.tsx`, `app.erp.equipe.tsx`) : catégories/marques/unités/dépôts/produits (CRUD), niveaux de stock (lecture), transferts inter-dépôts (brouillon → `send_erp_stock_transfer()` → `receive_erp_stock_transfer()`, jamais d'écriture directe de `status`), inventaires physiques (brouillon → comptage → `validate_erp_inventory()`), ledger des mouvements (lecture), tableau de bord avec KPI réels (produits actifs, dépôts actifs, stock bas, transferts en transit, inventaires en cours). Pas d'upload de photo produit en V1 (`image_url` texte simple, pas de bucket dédié — même limite assumée que le schéma DB, migration 048).

**Frontend Phase 2 — Achats & Fournisseurs livré** (`src/lib/data/erpPurchasesHooks.ts`, `src/routes/app.erp.achats.tsx`) : fournisseurs, demandes d'achat (brouillon → soumission → revue owner/manager), commandes fournisseur (brouillon → confirmation → RPC `confirm_erp_goods_receipt()` côté réception → statut recalculé automatiquement), réceptions (rôle `stock` exclusivement — le formulaire de sélection de ligne à réceptionner passe par `erp_purchase_order_lines_for_receiving()`, jamais par une lecture directe de `erp_purchase_order_lines` qui exposerait `unit_cost` à `stock`), factures fournisseur, retours (`confirm_erp_supplier_return()`). Cloisonnement des droits reflété côté UI (`canManageBuyer` vs `canManageStock`) en plus de la RLS qui reste la seule barrière réelle — `/app/erp/achats` masqué dans la nav pour `salesperson`/`hr_manager`/`cashier` (aucun accès RLS à ce module).

**Frontend Phase 3a — Ventes & CRM (cycle central) livré** (`src/lib/data/erpSalesHooks.ts`, `src/routes/app.erp.ventes.tsx`) : clients, devis (brouillon → envoi → accepté/refusé), commandes client (brouillon → confirmation → livraison), livraisons (portée par `salesperson`, **pas** `stock` — asymétrie assumée vs Achats, `confirm_erp_delivery()`), factures, retours client (portée par `stock`, **pas** `salesperson` — symétrique de Achats, `confirm_erp_customer_return()`). **Reste en Phase 3b** (non construit) : pipeline prospects (`erp_prospects`/`erp_sales_pipeline_stages`), avoirs (`erp_credit_notes`), encaissements (`erp_customer_payments`), activités CRM (`erp_crm_activities`) — périphériques au cycle commande→livraison→facture, différées pour avancer plus vite sur le reste des modules.

**Frontend Phase 4 — POS ERP livré** (`src/lib/data/erpPosHooks.ts`, `src/routes/app.erp.pos.tsx`) : sessions de caisse (ouverture/fermeture), ventes comptoir (brouillon → `complete_erp_pos_sale()`, totaux recalculés côté serveur), retours (`confirm_erp_pos_return()`). Aucun rôle ni type de mouvement nouveau — réutilise `cashier` et `sale`/`customer_return` du module 3.

**Frontend Phase 5 — Finance livré** (`src/lib/data/erpFinanceHooks.ts`, `src/routes/app.erp.finance.tsx`) : comptes caisse/banque (solde en lecture seule, jointure sur `erp_cash_account_balances`, jamais écrit directement côté client), transactions manuelles (`in`/`out`), virements internes (brouillon → `confirm_erp_fund_transfer()`). Aucun rôle nouveau — owner/manager/accountant uniquement, validé (pas de trésorier séparé).

**Frontend Phase 6 — Comptabilité livré** (`src/lib/data/erpAccountingHooks.ts`, `src/routes/app.erp.comptabilite.tsx`) : plan comptable, journaux, périodes (clôture/réouverture), écritures en partie double (le total débit/crédit est recalculé et affiché côté client pour le confort de saisie, mais **jamais fait confiance** — `post_erp_journal_entry()` revérifie l'équilibre et la non-clôture de la période côté serveur avant de comptabiliser), rapprochements bancaires (pointage de transactions → `complete_erp_bank_reconciliation()`).

**Frontend Phase 7 — RH livré** (`src/lib/data/erpHrHooks.ts`, `src/routes/app.erp.rh.tsx`) : départements/postes, employés (fiche + documents en note simple, pas encore d'upload réel — voir module 8), pointage, congés (pas de split créateur/approbateur côté UI, cohérent avec le schéma). Périmètre strictement resserré owner/manager/hr_manager sur toute la nav (ni `accountant`, ni aucun autre rôle métier) — données personnelles sensibles.

**Frontend Phase 8 — Gestion documentaire livré** (`src/lib/data/erpDocumentsHooks.ts`, `src/routes/app.erp.documents.tsx`) : contrats (owner/manager/accountant), documents (upload vers le bucket **privé** `erp-documents` — premier bucket privé du dépôt, jamais de `getPublicUrl()` : `ImageUploadField.tsx` en est vérifié incompatible, remplacé par un flux `useUploadErpDocument()`/`useErpDocumentSignedUrl()` écrit de zéro pour ce module), attachements polymorphes vers fournisseur/client/employé/contrat (`erp_document_attachments`). RLS **entité-scopée** (migration 058), pas une simple liste de rôles à plat : la visibilité d'un document suit les droits déjà accordés sur l'entité à laquelle il est rattaché (fournisseur → `buyer`/`accountant`, client → `salesperson`/`accountant`, employé → `hr_manager`, contrat → `accountant`, owner/manager toujours tout) — `HIDDEN_FOR["/app/erp/documents"]` ne masque donc que `stock`/`cashier`, qui n'ont RLS-wise aucun périmètre d'entité. Le lien "Voir" génère une URL signée à la demande (1h), jamais stockée. Le module RH (Phase 7) garde volontairement ses documents employé en note simple : les brancher sur ce mécanisme d'attachement réel serait un ajout naturel mais n'a pas été demandé, donc pas fait.

**Frontend Phase 9 — Rapports & BI livré** (`src/lib/data/erpReportsHooks.ts`, `src/routes/app.erp.rapports.tsx`) : quatre onglets lisant chacun une vue SQL agrégée (`erp_v_stock_valuation`, `erp_v_purchase_orders_summary`, `erp_v_sales_summary`, `erp_v_cash_position`) — aucune RLS propre à écrire côté hooks, une vue Postgres standard hérite automatiquement de la RLS des tables sous-jacentes qu'elle interroge, donc chaque rôle y voit exactement ce que sa RLS habituelle lui laisse déjà voir (stock → onglet Stock, buyer → Achats, salesperson/cashier → Ventes, owner/manager/accountant → tout). Cinquième onglet "Mes rapports" (`erp_custom_reports`) : favoris strictement privés à leur auteur (`organization_id` ET `created_by = auth.uid()`), un simple raccourci nommé pointant vers un des 4 domaines, jamais partagé entre collègues même dans la même organisation. `hr_manager` masqué de la nav (`/app/erp/rapports`) : aucune des 4 vues ne couvre un domaine RH, les 4 onglets lui seraient vides.

**Reste à construire, dans l'ordre de dépendance du schéma** : Ventes & CRM Phase 3b, Administration (`erp_settings`) — chaque module rejoint `ERP_MODULES`/`NAV.erp` au moment où son écran existe réellement, jamais en avance (même discipline que la navigation ZegResto en son temps : pas de lien vers une page qui n'existe pas).

## Conventions transverses (héritées de ZegHotel/ZegResto, appliquées sans dérogation)

- **RLS obligatoire et stricte sur chaque table `erp_*`**, filtrée par `organization_id` via `has_organization_access()`/`has_any_role_in_organization()` — jamais de policy `using (true)`.
- **Colonnes sensibles jamais exposées via une policy trop large** : si un rôle ne doit modifier qu'une partie des colonnes d'une ligne, passer par une RPC `security definer` étroite plutôt qu'élargir une policy `UPDATE` (cf. pattern `hotel_guest_contact()`/`mark_resto_order_item_statut()`, documenté dans `CLAUDE.md`).
- **Migrations jamais exécutées automatiquement** — chaque fichier `db/migrations/0NN_erp_*.sql` est présenté pour relecture, exécuté manuellement par Anselme dans le SQL Editor Supabase.
- **`db/schema.sql`** mis à jour dans le même commit que chaque migration, reflète l'état final (pas l'historique).
- **Un commit par phase**, poussé au fur et à mesure — jamais un commit géant en fin de chantier.
- **Routes sous `/app/erp/*` uniquement** — aucune page publique nouvelle, aucune modification des routes `/`, `/tarifs`, `/inscription`, `/souscription`.
- **`npx tsc --noEmit`** vérifié à chaque étape frontend (aucun impact ce round : uniquement migrations SQL + documentation, pas encore de code frontend `/app/erp/*`).
