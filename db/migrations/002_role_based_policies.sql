-- =====================================================================
-- NovaCaisse — Migration 002 : permissions RLS différenciées par rôle
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Contexte : les policies actuelles (db/schema.sql) isolent correctement
-- par shop_id via has_shop_access(), mais accordent à TOUT membre d'une
-- boutique (quel que soit son rôle) les 4 droits CRUD sur 16 tables
-- métier. Cette migration introduit une matrice de permissions par rôle
-- (app_role : owner/manager/cashier/stock/accountant) — voir la matrice
-- complète dans db/AUDIT-SECURITE.md.
--
-- Portée : uniquement les policies RLS. Aucun changement de schéma, de
-- données, de grants PostgREST ou de triggers.
-- =====================================================================

-- =============== HELPER : vérifie l'appartenance à un ensemble de rôles ===============
-- Complète has_role_in_shop() (qui ne teste qu'un seul rôle) pour éviter de
-- répéter de longues chaînes de OR dans chaque policy.
create or replace function public.has_any_role_in_shop(_shop_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shop_members
    where shop_id = _shop_id and user_id = auth.uid() and role = any(_roles)
  );
$$;

-- =====================================================================
-- 1. categories — lecture pour tous, écriture réservée à owner/manager/stock
-- =====================================================================
drop policy if exists categories_tenant_all on public.categories;
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));

-- =====================================================================
-- 2. products — lecture pour tous, écriture réservée à owner/manager/stock
-- =====================================================================
drop policy if exists products_tenant_all on public.products;
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));

-- =====================================================================
-- 3. suppliers — lecture owner/manager/stock/accountant, écriture owner/manager
--    (jamais cashier, jamais stock en écriture : la relation fournisseur
--    est une décision de gestion, pas une opération d'entrepôt)
-- =====================================================================
drop policy if exists suppliers_tenant_all on public.suppliers;
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock','accountant']::public.app_role[]));
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 4. customers — lecture owner/manager/cashier/accountant (pas stock),
--    création/mise à jour owner/manager/cashier (encaissement), suppression
--    réservée à owner/manager
-- =====================================================================
drop policy if exists customers_tenant_all on public.customers;
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 5. stock_levels — lecture pour tous ; AUCUNE écriture directe pour
--    personne, y compris owner/manager. Cette table n'est mutée que par le
--    trigger apply_stock_movement() (security definer, contourne RLS).
--    Toute correction de stock doit passer par un stock_movements de type
--    'adjustment' pour préserver la traçabilité — sinon on retombe
--    exactement dans le problème signalé par l'audit (écriture de stock
--    sans laisser de trace).
-- =====================================================================
drop policy if exists stock_levels_tenant_all on public.stock_levels;
drop policy if exists stock_levels_select on public.stock_levels;
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (public.has_shop_access(shop_id));
-- Volontairement : aucune policy insert/update/delete → refusé par défaut
-- pour tous les rôles, y compris owner/manager.

-- =====================================================================
-- 6. stock_movements — lecture pour tous ; écriture (insert) large pour
--    owner/manager/stock, restreinte pour cashier aux mouvements liés à
--    une vente (type 'sale'/'return', ceux générés par la caisse) ; AUCUNE
--    update/delete pour personne (ledger immuable — le trigger ne
--    recalcule stock_levels qu'à l'insertion, modifier/supprimer une ligne
--    après coup désynchroniserait le stock sans laisser de trace de la
--    correction). Une correction doit toujours être un nouveau mouvement.
-- =====================================================================
drop policy if exists stock_movements_tenant_all on public.stock_movements;
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists stock_movements_insert_full on public.stock_movements;
create policy stock_movements_insert_full on public.stock_movements for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists stock_movements_insert_cashier on public.stock_movements;
create policy stock_movements_insert_cashier on public.stock_movements for insert to authenticated
  with check (
    public.has_role_in_shop(shop_id, 'cashier')
    and type in ('sale','return')
  );
-- Volontairement : aucune policy update/delete → refusé par défaut pour tous.

-- =====================================================================
-- 7. sales — lecture owner/manager/cashier/accountant (pas stock),
--    création owner/manager/cashier (encaissement), modification/
--    suppression réservées à owner/manager
-- =====================================================================
drop policy if exists sales_tenant_all on public.sales;
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 8. sale_items — même matrice que sales (toujours liées à une vente)
-- =====================================================================
drop policy if exists sale_items_tenant_all on public.sale_items;
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists sale_items_insert on public.sale_items;
create policy sale_items_insert on public.sale_items for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists sale_items_update on public.sale_items;
create policy sale_items_update on public.sale_items for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists sale_items_delete on public.sale_items;
create policy sale_items_delete on public.sale_items for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 9. payments — même logique que sales
-- =====================================================================
drop policy if exists payments_tenant_all on public.payments;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 10. quotes — lecture owner/manager/cashier/accountant, création
--     owner/manager/cashier (devis établi au comptoir), modification/
--     suppression réservées à owner/manager
-- =====================================================================
drop policy if exists quotes_tenant_all on public.quotes;
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 11. quote_items — même matrice que quotes
-- =====================================================================
drop policy if exists quote_items_tenant_all on public.quote_items;
drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists quote_items_insert on public.quote_items;
create policy quote_items_insert on public.quote_items for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier']::public.app_role[]));
drop policy if exists quote_items_update on public.quote_items;
create policy quote_items_update on public.quote_items for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists quote_items_delete on public.quote_items;
create policy quote_items_delete on public.quote_items for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 12. expenses — réservées à owner/manager/accountant (gestion complète),
--     jamais cashier ni stock
-- =====================================================================
drop policy if exists expenses_tenant_all on public.expenses;
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));

-- =====================================================================
-- 13. promotions — lecture owner/manager/cashier/accountant (le cashier
--     doit voir les promos actives pour les appliquer en caisse),
--     écriture réservée à owner/manager
-- =====================================================================
drop policy if exists promotions_tenant_all on public.promotions;
drop policy if exists promotions_select on public.promotions;
create policy promotions_select on public.promotions for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','cashier','accountant']::public.app_role[]));
drop policy if exists promotions_write on public.promotions;
create policy promotions_write on public.promotions for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists promotions_update on public.promotions;
create policy promotions_update on public.promotions for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists promotions_delete on public.promotions;
create policy promotions_delete on public.promotions for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 14. notifications — hors périmètre de la demande (pas de donnée
--     financière/stock/vente sensible) : inchangé, accès complet à tout
--     membre de la boutique sur ses propres notifications.
-- =====================================================================
-- (aucune modification : la policy notifications_tenant_all existante reste en place)

-- =====================================================================
-- 15. subscriptions — données de facturation : lecture owner/manager/
--     accountant, écriture réservée à owner/manager
-- =====================================================================
drop policy if exists subscriptions_tenant_all on public.subscriptions;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =====================================================================
-- 16. shop_settings — lecture pour tous (ticket de caisse, taxes affichées
--     partout), écriture réservée à owner/manager
-- =====================================================================
drop policy if exists shop_settings_tenant_all on public.shop_settings;
drop policy if exists shop_settings_select on public.shop_settings;
create policy shop_settings_select on public.shop_settings for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists shop_settings_write on public.shop_settings;
create policy shop_settings_write on public.shop_settings for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists shop_settings_update on public.shop_settings;
create policy shop_settings_update on public.shop_settings for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists shop_settings_delete on public.shop_settings;
create policy shop_settings_delete on public.shop_settings for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =============== FIN ===============
-- Rappel : à ce jour, tous les utilisateurs existants ont le rôle 'owner'
-- sur leur boutique (aucun flux d'invitation réel n'est encore connecté —
-- l'écran Équipe est encore mocké), donc cette migration ne change le
-- comportement d'aucun compte existant : owner garde des droits complets
-- partout. Elle ne prendra effet visiblement que lorsque des membres
-- cashier/stock/accountant seront réellement invités.
