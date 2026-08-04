-- Migration 064 — Rôles personnalisés, Phase C : branche les policies RLS
-- ZegCaisse sur has_module_permission() (migration 063), module par
-- module. Présentée pour relecture — NE PAS exécuter automatiquement. À
-- exécuter après 063.
--
-- Principe : chaque policy ne change que la partie "quel rôle a le
-- droit" (l'appel has_any_role_in_organization(...)) — toute logique
-- métier additionnelle (cashier limité à ses ventes 'draft', type de
-- mouvement de stock restreint, stock sans accès aux fournisseurs mais
-- avec accès aux commandes fournisseur) reste un carve-out explicite à
-- côté de has_module_permission(), jamais absorbée dans le système
-- générique — deux subtilités méritent une note :
--   - stock a accès en écriture à purchase_orders/purchase_order_items
--     mais PAS à suppliers (aujourd'hui : suppliers_write n'inclut jamais
--     'stock', purchase_orders_insert/update si). Les deux tables
--     partagent pourtant le même module 'fournisseurs' (un rôle
--     personnalisé avec fournisseurs.create/manage contrôle les deux).
--     Pour ne rien casser pour le rôle stock existant, son accès aux
--     commandes fournisseur reste un carve-out `or has_role_in_organization(
--     organization_id, 'stock')` à côté du nouveau système, plutôt que
--     fondu dans default_role_permissions (qui devrait alors dire "stock
--     a fournisseurs.create" — faux pour suppliers lui-même).
--   - cashier ne peut insérer un stock_movements que de type sale/return :
--     conditionné sur ventes.create (créer une vente déclenche le
--     mouvement), pas sur un module 'stock' dédié.
--
-- Zéro changement de comportement pour tout compte existant : chaque
-- default_role_permissions (migration 063) a été construit en lisant
-- exactement les policies remplacées ici.

-- 1. categories
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for insert to authenticated
  with check (public.has_module_permission(organization_id, 'produits', 'create'));
drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update to authenticated
  using (public.has_module_permission(organization_id, 'produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'produits', 'manage'));
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using (public.has_module_permission(organization_id, 'produits', 'manage'));

-- 2. products
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.has_module_permission(organization_id, 'produits', 'create'));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.has_module_permission(organization_id, 'produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'produits', 'manage'));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (public.has_module_permission(organization_id, 'produits', 'manage'));

-- 3. suppliers (module 'fournisseurs' — jamais de carve-out stock ici,
--    stock n'a jamais eu accès en écriture à suppliers lui-même).
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'view'));
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'fournisseurs', 'create'));
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'manage'))
  with check (public.has_module_permission(organization_id, 'fournisseurs', 'manage'));
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'manage'));

-- 3bis. purchase_orders / purchase_order_items — carve-out stock préservé
-- (voir en-tête de fichier) : insert/update seulement, jamais delete.
drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'view'));
drop policy if exists purchase_orders_insert on public.purchase_orders;
create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'fournisseurs', 'create')
    or public.has_role_in_organization(organization_id, 'stock')
  );
drop policy if exists purchase_orders_update on public.purchase_orders;
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using (
    public.has_module_permission(organization_id, 'fournisseurs', 'manage')
    or public.has_role_in_organization(organization_id, 'stock')
  )
  with check (
    public.has_module_permission(organization_id, 'fournisseurs', 'manage')
    or public.has_role_in_organization(organization_id, 'stock')
  );
drop policy if exists purchase_orders_delete on public.purchase_orders;
create policy purchase_orders_delete on public.purchase_orders for delete to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'manage'));

drop policy if exists purchase_order_items_select on public.purchase_order_items;
create policy purchase_order_items_select on public.purchase_order_items for select to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'view'));
drop policy if exists purchase_order_items_insert on public.purchase_order_items;
create policy purchase_order_items_insert on public.purchase_order_items for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'fournisseurs', 'create')
    or public.has_role_in_organization(organization_id, 'stock')
  );
drop policy if exists purchase_order_items_update on public.purchase_order_items;
create policy purchase_order_items_update on public.purchase_order_items for update to authenticated
  using (
    public.has_module_permission(organization_id, 'fournisseurs', 'manage')
    or public.has_role_in_organization(organization_id, 'stock')
  )
  with check (
    public.has_module_permission(organization_id, 'fournisseurs', 'manage')
    or public.has_role_in_organization(organization_id, 'stock')
  );
drop policy if exists purchase_order_items_delete on public.purchase_order_items;
create policy purchase_order_items_delete on public.purchase_order_items for delete to authenticated
  using (public.has_module_permission(organization_id, 'fournisseurs', 'manage'));

-- 4. customers (module 'clients') — update partage le rôle-set de
--    l'insert (cashier peut modifier une fiche client, ex. màj fidélité à
--    l'encaissement), seul delete passe au niveau 'manage'.
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.has_module_permission(organization_id, 'clients', 'view'));
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'clients', 'create'));
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (public.has_module_permission(organization_id, 'clients', 'create'))
  with check (public.has_module_permission(organization_id, 'clients', 'create'));
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_module_permission(organization_id, 'clients', 'manage'));

-- 6. stock_movements — insert "full" conditionné par le module 'stock',
--    insert "cashier" conditionné par 'ventes' (créer une vente déclenche
--    le mouvement, ce n'est pas une permission de gestion de stock).
drop policy if exists stock_movements_insert_full on public.stock_movements;
create policy stock_movements_insert_full on public.stock_movements for insert to authenticated
  with check (public.has_module_permission(organization_id, 'stock', 'create'));
drop policy if exists stock_movements_insert_cashier on public.stock_movements;
create policy stock_movements_insert_cashier on public.stock_movements for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'ventes', 'create')
    and type in ('sale','return')
  );

-- 7/8/9. sales / sale_items / payments (module 'ventes') — le carve-out
-- cashier sur ses propres ventes 'draft' (delete) est préservé tel quel.
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'view'));
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
  with check (public.has_module_permission(organization_id, 'ventes', 'create'));
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'ventes', 'manage'));
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (
    public.has_module_permission(organization_id, 'ventes', 'manage')
    or (status = 'draft' and cashier_id = auth.uid() and public.has_role_in_organization(organization_id, 'cashier'))
  );

drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'view'));
drop policy if exists sale_items_insert on public.sale_items;
create policy sale_items_insert on public.sale_items for insert to authenticated
  with check (public.has_module_permission(organization_id, 'ventes', 'create'));
drop policy if exists sale_items_update on public.sale_items;
create policy sale_items_update on public.sale_items for update to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'ventes', 'manage'));
drop policy if exists sale_items_delete on public.sale_items;
create policy sale_items_delete on public.sale_items for delete to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'manage'));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'view'));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'ventes', 'create'));
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'ventes', 'manage'));
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_module_permission(organization_id, 'ventes', 'manage'));

-- 10/11. quotes / quote_items (module 'devis')
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'view'));
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (public.has_module_permission(organization_id, 'devis', 'create'));
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'manage'))
  with check (public.has_module_permission(organization_id, 'devis', 'manage'));
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes for delete to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'manage'));

drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items for select to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'view'));
drop policy if exists quote_items_insert on public.quote_items;
create policy quote_items_insert on public.quote_items for insert to authenticated
  with check (public.has_module_permission(organization_id, 'devis', 'create'));
drop policy if exists quote_items_update on public.quote_items;
create policy quote_items_update on public.quote_items for update to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'manage'))
  with check (public.has_module_permission(organization_id, 'devis', 'manage'));
drop policy if exists quote_items_delete on public.quote_items;
create policy quote_items_delete on public.quote_items for delete to authenticated
  using (public.has_module_permission(organization_id, 'devis', 'manage'));

-- 12. expenses (module 'depenses')
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (public.has_module_permission(organization_id, 'depenses', 'view'));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_module_permission(organization_id, 'depenses', 'create'));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.has_module_permission(organization_id, 'depenses', 'manage'))
  with check (public.has_module_permission(organization_id, 'depenses', 'manage'));
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.has_module_permission(organization_id, 'depenses', 'manage'));

-- 15. subscriptions / subscription_payments (module 'abonnement' — la
--     policy admin cross-boutiques reste inchangée, non touchée ici).
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'view'));
drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for insert to authenticated
  with check (public.has_module_permission(organization_id, 'abonnement', 'create'));
drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'manage'))
  with check (public.has_module_permission(organization_id, 'abonnement', 'manage'));
drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'manage'));

drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'view'));
drop policy if exists subscription_payments_write on public.subscription_payments;
create policy subscription_payments_write on public.subscription_payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'abonnement', 'create'));
drop policy if exists subscription_payments_update on public.subscription_payments;
create policy subscription_payments_update on public.subscription_payments for update to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'manage'))
  with check (public.has_module_permission(organization_id, 'abonnement', 'manage'));
drop policy if exists subscription_payments_delete on public.subscription_payments;
create policy subscription_payments_delete on public.subscription_payments for delete to authenticated
  using (public.has_module_permission(organization_id, 'abonnement', 'manage'));

-- 16. organization_settings (module 'parametres' — select reste ouvert à
--     tout membre via open_view, non touché ici, seule l'écriture change).
drop policy if exists shop_settings_write on public.organization_settings;
create policy shop_settings_write on public.organization_settings for insert to authenticated
  with check (public.has_module_permission(organization_id, 'parametres', 'create'));
drop policy if exists shop_settings_update on public.organization_settings;
create policy shop_settings_update on public.organization_settings for update to authenticated
  using (public.has_module_permission(organization_id, 'parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'parametres', 'manage'));
drop policy if exists shop_settings_delete on public.organization_settings;
create policy shop_settings_delete on public.organization_settings for delete to authenticated
  using (public.has_module_permission(organization_id, 'parametres', 'manage'));

-- reservations (migration 062, module 'reservations') — écrite dans la
-- même branche, jamais encore exécutée : migrée directement ici plutôt
-- que de faire porter le poids à 062 elle-même après coup.
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'view'));
drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'reservations', 'create'));
drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'reservations', 'manage'));
drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'manage'));
