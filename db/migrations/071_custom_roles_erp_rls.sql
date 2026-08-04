-- Migration 071 — Rôles personnalisés, Phase D-3 (ZegERP) : bascule des
-- policies RLS erp_* vers has_module_permission(), même principe que
-- 064/067/069. Chaque carve-out métier existant (conditions de statut,
-- masquage de colonnes/tables sensibles, suppressions restreintes) est
-- préservé verbatim. Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 070.
--
-- Règle générale : les conditions de statut existantes (`status = 'draft'`,
-- période comptable non clôturée, etc.) restent codées en dur À CÔTÉ de
-- has_module_permission(), inchangées — ce ne sont pas des règles de
-- permission mais des règles de cycle de vie métier. Partout où une policy
-- _delete est plus stricte que sa policy _update correspondante (transferts,
-- inventaires, virements internes, périodes comptables, rapprochements
-- bancaires), la suppression reste codée en dur owner/manager.

-- =============== Module 1 : erp_produits (categories/brands/units/products) ===============
drop policy if exists erp_product_categories_write on public.erp_product_categories;
create policy erp_product_categories_write on public.erp_product_categories for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

drop policy if exists erp_brands_write on public.erp_brands;
create policy erp_brands_write on public.erp_brands for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

drop policy if exists erp_units_write on public.erp_units;
create policy erp_units_write on public.erp_units for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

drop policy if exists erp_products_write on public.erp_products;
create policy erp_products_write on public.erp_products for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

-- =============== Module 1 : erp_stock (warehouses/stock_levels[select-only]/transfers/inventories/movements) ===============
drop policy if exists erp_warehouses_write on public.erp_warehouses;
create policy erp_warehouses_write on public.erp_warehouses for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_stock', 'manage'));

drop policy if exists erp_stock_transfers_select on public.erp_stock_transfers;
create policy erp_stock_transfers_select on public.erp_stock_transfers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
drop policy if exists erp_stock_transfers_insert on public.erp_stock_transfers;
create policy erp_stock_transfers_insert on public.erp_stock_transfers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_stock', 'create'));
drop policy if exists erp_stock_transfers_update on public.erp_stock_transfers;
create policy erp_stock_transfers_update on public.erp_stock_transfers for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_stock', 'manage'));
-- Carve-out préservé : suppression reste owner/manager, jamais délégable.
drop policy if exists erp_stock_transfers_delete on public.erp_stock_transfers;
create policy erp_stock_transfers_delete on public.erp_stock_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_stock_transfer_lines_select on public.erp_stock_transfer_lines;
create policy erp_stock_transfer_lines_select on public.erp_stock_transfer_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
drop policy if exists erp_stock_transfer_lines_write on public.erp_stock_transfer_lines;
create policy erp_stock_transfer_lines_write on public.erp_stock_transfer_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  );

drop policy if exists erp_inventories_select on public.erp_inventories;
create policy erp_inventories_select on public.erp_inventories for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
drop policy if exists erp_inventories_insert on public.erp_inventories;
create policy erp_inventories_insert on public.erp_inventories for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_stock', 'create'));
drop policy if exists erp_inventories_update on public.erp_inventories;
create policy erp_inventories_update on public.erp_inventories for update to authenticated
  using (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_stock', 'manage'));
drop policy if exists erp_inventories_delete on public.erp_inventories;
create policy erp_inventories_delete on public.erp_inventories for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_inventory_lines_select on public.erp_inventory_lines;
create policy erp_inventory_lines_select on public.erp_inventory_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
drop policy if exists erp_inventory_lines_write on public.erp_inventory_lines;
create policy erp_inventory_lines_write on public.erp_inventory_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  );

drop policy if exists erp_stock_movements_select on public.erp_stock_movements;
create policy erp_stock_movements_select on public.erp_stock_movements for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
drop policy if exists erp_stock_movements_insert on public.erp_stock_movements;
create policy erp_stock_movements_insert on public.erp_stock_movements for insert to authenticated
  with check (
    type in ('in', 'out', 'adjustment')
    and public.has_module_permission(organization_id, 'erp_stock', 'create')
  );

create or replace function public.send_erp_stock_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_stock_transfers;
  v_line record;
  v_line_count integer;
begin
  if not public.has_module_permission(p_organization_id, 'erp_stock', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_stock_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'draft' then raise exception 'Ce transfert a déjà été envoyé.'; end if;

  select count(*) into v_line_count from public.erp_stock_transfer_lines where transfer_id = p_transfer_id;
  if v_line_count = 0 then raise exception 'Aucune ligne à envoyer pour ce transfert.'; end if;

  for v_line in select * from public.erp_stock_transfer_lines where transfer_id = p_transfer_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reference, transfer_id, created_by)
    values (p_organization_id, v_line.product_id, v_transfer.from_warehouse_id, 'transfer_out', v_line.quantity, v_transfer.reference, p_transfer_id, auth.uid());
  end loop;

  update public.erp_stock_transfers set status = 'in_transit', sent_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;

create or replace function public.receive_erp_stock_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_stock_transfers;
  v_line record;
begin
  if not public.has_module_permission(p_organization_id, 'erp_stock', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_stock_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'Ce transfert n''est pas en transit.'; end if;

  for v_line in select * from public.erp_stock_transfer_lines where transfer_id = p_transfer_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reference, transfer_id, created_by)
    values (p_organization_id, v_line.product_id, v_transfer.to_warehouse_id, 'transfer_in', v_line.quantity, v_transfer.reference, p_transfer_id, auth.uid());
  end loop;

  update public.erp_stock_transfers set status = 'received', received_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;

create or replace function public.validate_erp_inventory(
  p_organization_id uuid,
  p_inventory_id uuid
) returns public.erp_inventories
language plpgsql security definer set search_path = public as $$
declare
  v_inventory public.erp_inventories;
  v_line record;
  v_gap numeric(14,3);
begin
  if not public.has_module_permission(p_organization_id, 'erp_stock', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_inventory from public.erp_inventories
    where id = p_inventory_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Inventaire introuvable.'; end if;
  if v_inventory.status <> 'in_progress' then raise exception 'Cet inventaire a déjà été validé.'; end if;

  for v_line in
    select * from public.erp_inventory_lines
    where inventory_id = p_inventory_id and counted_quantity is not null
  loop
    v_gap := v_line.counted_quantity - v_line.theoretical_quantity;
    if v_gap <> 0 then
      insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reason, inventory_id, created_by)
      values (p_organization_id, v_line.product_id, v_inventory.warehouse_id, 'adjustment', v_gap, 'Régularisation inventaire', p_inventory_id, auth.uid());
    end if;
  end loop;

  update public.erp_inventories set status = 'validated', validated_at = now()
    where id = p_inventory_id returning * into v_inventory;

  return v_inventory;
end;
$$;

-- =============== Module 2 : erp_achats (suppliers/purchase_orders+lines/supplier_returns+lines) ===============
-- Carve-out préservé : stock garde une lecture des fiches fournisseur et
-- des commandes (pas des lignes, ni des retours) même sans permission
-- 'view' sur ce module — erp_purchase_order_lines masque volontairement
-- unit_cost à stock (cf. erp_purchase_order_lines_for_receiving()
-- ci-dessous), donc PAS de carve-out sur cette table ni sur les retours.
drop policy if exists erp_suppliers_select on public.erp_suppliers;
create policy erp_suppliers_select on public.erp_suppliers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view') or public.has_role_in_organization(organization_id, 'stock'));
drop policy if exists erp_suppliers_write on public.erp_suppliers;
create policy erp_suppliers_write on public.erp_suppliers for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_achats', 'manage'));

drop policy if exists erp_purchase_orders_select on public.erp_purchase_orders;
create policy erp_purchase_orders_select on public.erp_purchase_orders for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view') or public.has_role_in_organization(organization_id, 'stock'));
drop policy if exists erp_purchase_orders_insert on public.erp_purchase_orders;
create policy erp_purchase_orders_insert on public.erp_purchase_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_achats', 'create'));
drop policy if exists erp_purchase_orders_update_draft on public.erp_purchase_orders;
create policy erp_purchase_orders_update_draft on public.erp_purchase_orders for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status in ('draft', 'confirmed') and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
drop policy if exists erp_purchase_orders_cancel on public.erp_purchase_orders;
create policy erp_purchase_orders_cancel on public.erp_purchase_orders for update to authenticated
  using (status in ('confirmed', 'partially_received') and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status = 'cancelled' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
drop policy if exists erp_purchase_orders_delete on public.erp_purchase_orders;
create policy erp_purchase_orders_delete on public.erp_purchase_orders for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));

-- `stock` reste volontairement absent (unit_cost sensible) : select branché
-- strictement sur erp_achats, sans le carve-out stock des deux policies
-- ci-dessus.
drop policy if exists erp_purchase_order_lines_select on public.erp_purchase_order_lines;
create policy erp_purchase_order_lines_select on public.erp_purchase_order_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
drop policy if exists erp_purchase_order_lines_write on public.erp_purchase_order_lines;
create policy erp_purchase_order_lines_write on public.erp_purchase_order_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

-- Masquage de colonne pour stock : accès via erp_achats OU erp_receptions
-- (les deux rôles qui ont besoin de consulter quantités commandées/reçues),
-- jamais unit_cost.
create or replace function public.erp_purchase_order_lines_for_receiving(
  p_organization_id uuid,
  p_purchase_order_id uuid
) returns table (id uuid, product_id uuid, quantity numeric, received_quantity numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.has_module_permission(p_organization_id, 'erp_achats', 'view')
    or public.has_module_permission(p_organization_id, 'erp_receptions', 'view')
  ) then
    raise exception 'Accès refusé.';
  end if;

  return query
    select l.id, l.product_id, l.quantity, l.received_quantity
    from public.erp_purchase_order_lines l
    join public.erp_purchase_orders o on o.id = l.purchase_order_id
    where l.purchase_order_id = p_purchase_order_id and o.organization_id = p_organization_id;
end;
$$;

drop policy if exists erp_supplier_returns_select on public.erp_supplier_returns;
create policy erp_supplier_returns_select on public.erp_supplier_returns for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
drop policy if exists erp_supplier_returns_insert on public.erp_supplier_returns;
create policy erp_supplier_returns_insert on public.erp_supplier_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_achats', 'create'));
drop policy if exists erp_supplier_returns_update on public.erp_supplier_returns;
create policy erp_supplier_returns_update on public.erp_supplier_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
drop policy if exists erp_supplier_returns_delete on public.erp_supplier_returns;
create policy erp_supplier_returns_delete on public.erp_supplier_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));

drop policy if exists erp_supplier_return_lines_select on public.erp_supplier_return_lines;
create policy erp_supplier_return_lines_select on public.erp_supplier_return_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
drop policy if exists erp_supplier_return_lines_write on public.erp_supplier_return_lines;
create policy erp_supplier_return_lines_write on public.erp_supplier_return_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  );

create or replace function public.confirm_erp_supplier_return(
  p_organization_id uuid,
  p_return_id uuid
) returns public.erp_supplier_returns
language plpgsql security definer set search_path = public as $$
declare
  v_return public.erp_supplier_returns;
  v_line record;
begin
  if not public.has_module_permission(p_organization_id, 'erp_achats', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_return from public.erp_supplier_returns
    where id = p_return_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Retour fournisseur introuvable.'; end if;
  if v_return.status <> 'draft' then raise exception 'Ce retour a déjà été confirmé.'; end if;

  if not exists (select 1 from public.erp_supplier_return_lines where return_id = p_return_id) then
    raise exception 'Aucune ligne à retourner pour ce retour fournisseur.';
  end if;

  for v_line in select * from public.erp_supplier_return_lines where return_id = p_return_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_return.warehouse_id, 'supplier_return', v_line.quantity, v_line.unit_cost, v_return.reference, auth.uid());
  end loop;

  update public.erp_supplier_returns set status = 'confirmed', confirmed_at = now()
    where id = p_return_id returning * into v_return;

  return v_return;
end;
$$;

-- =============== Module 2 : erp_factures_fournisseurs (supplier_invoices) ===============
drop policy if exists erp_supplier_invoices_select on public.erp_supplier_invoices;
create policy erp_supplier_invoices_select on public.erp_supplier_invoices for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'view'));
drop policy if exists erp_supplier_invoices_write on public.erp_supplier_invoices;
create policy erp_supplier_invoices_write on public.erp_supplier_invoices for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'manage'));

-- =============== Module 2 : erp_receptions (goods_receipts+lines) ===============
drop policy if exists erp_goods_receipts_select on public.erp_goods_receipts;
create policy erp_goods_receipts_select on public.erp_goods_receipts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_receptions', 'view'));
drop policy if exists erp_goods_receipts_insert on public.erp_goods_receipts;
create policy erp_goods_receipts_insert on public.erp_goods_receipts for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_receptions', 'create'));
drop policy if exists erp_goods_receipts_update on public.erp_goods_receipts;
create policy erp_goods_receipts_update on public.erp_goods_receipts for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'));
drop policy if exists erp_goods_receipts_delete on public.erp_goods_receipts;
create policy erp_goods_receipts_delete on public.erp_goods_receipts for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'));

drop policy if exists erp_goods_receipt_lines_select on public.erp_goods_receipt_lines;
create policy erp_goods_receipt_lines_select on public.erp_goods_receipt_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_receptions', 'view'));
drop policy if exists erp_goods_receipt_lines_write on public.erp_goods_receipt_lines;
create policy erp_goods_receipt_lines_write on public.erp_goods_receipt_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_receptions', 'manage')
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_receptions', 'manage')
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  );

create or replace function public.confirm_erp_goods_receipt(
  p_organization_id uuid,
  p_receipt_id uuid
) returns public.erp_goods_receipts
language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.erp_goods_receipts;
  v_line record;
  v_po_line public.erp_purchase_order_lines;
  v_new_received numeric(14,3);
  v_total_lines integer;
  v_fully_received_lines integer;
  v_any_received_lines integer;
  v_po_status text;
begin
  if not public.has_module_permission(p_organization_id, 'erp_receptions', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_receipt from public.erp_goods_receipts
    where id = p_receipt_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if v_receipt.status <> 'draft' then raise exception 'Cette réception a déjà été confirmée.'; end if;

  if not exists (select 1 from public.erp_goods_receipt_lines where receipt_id = p_receipt_id) then
    raise exception 'Aucune ligne à réceptionner pour cette réception.';
  end if;

  for v_line in select * from public.erp_goods_receipt_lines where receipt_id = p_receipt_id loop
    select * into v_po_line from public.erp_purchase_order_lines where id = v_line.purchase_order_line_id for update;

    v_new_received := v_po_line.received_quantity + v_line.quantity;
    if v_new_received > v_po_line.quantity then
      raise exception 'Quantité reçue dépasse la quantité commandée pour ce produit.';
    end if;

    update public.erp_purchase_order_lines set received_quantity = v_new_received where id = v_po_line.id;

    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_receipt.warehouse_id, 'purchase_receipt', v_line.quantity, v_po_line.unit_cost, v_receipt.reference, auth.uid());
  end loop;

  select count(*), count(*) filter (where received_quantity >= quantity), count(*) filter (where received_quantity > 0)
    into v_total_lines, v_fully_received_lines, v_any_received_lines
    from public.erp_purchase_order_lines where purchase_order_id = v_receipt.purchase_order_id;

  v_po_status := case
    when v_fully_received_lines = v_total_lines then 'received'
    when v_any_received_lines > 0 then 'partially_received'
    else 'confirmed'
  end;
  update public.erp_purchase_orders set status = v_po_status where id = v_receipt.purchase_order_id;

  update public.erp_goods_receipts set status = 'confirmed', confirmed_at = now()
    where id = p_receipt_id returning * into v_receipt;

  return v_receipt;
end;
$$;

-- =============== erp_purchase_requests+lines : table partagée buyer/stock ===============
-- Ni purement "erp_achats" ni purement "erp_receptions" : owner/manager/
-- accountant/buyer/stock en lecture (union exacte des deux modules),
-- owner/manager/buyer/stock en création/auto-édition (accountant exclu,
-- volontairement, comme dans la policy d'origine). L'approbation
-- (submitted → approved/rejected) reste codée en dur owner/manager —
-- jamais d'auto-approbation, même pour un rôle personnalisé avec 'manage'
-- sur erp_achats/erp_receptions.
drop policy if exists erp_purchase_requests_select on public.erp_purchase_requests;
create policy erp_purchase_requests_select on public.erp_purchase_requests for select to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'view')
    or public.has_module_permission(organization_id, 'erp_receptions', 'view')
  );
drop policy if exists erp_purchase_requests_insert on public.erp_purchase_requests;
create policy erp_purchase_requests_insert on public.erp_purchase_requests for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'create')
    or public.has_module_permission(organization_id, 'erp_receptions', 'create')
  );
drop policy if exists erp_purchase_requests_update_draft on public.erp_purchase_requests;
create policy erp_purchase_requests_update_draft on public.erp_purchase_requests for update to authenticated
  using (
    status = 'draft'
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  )
  with check (
    status in ('draft', 'submitted')
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  );
drop policy if exists erp_purchase_requests_review on public.erp_purchase_requests;
create policy erp_purchase_requests_review on public.erp_purchase_requests for update to authenticated
  using (status = 'submitted' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (status in ('approved', 'rejected') and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists erp_purchase_requests_delete on public.erp_purchase_requests;
create policy erp_purchase_requests_delete on public.erp_purchase_requests for delete to authenticated
  using (
    status = 'draft'
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  );

drop policy if exists erp_purchase_request_lines_select on public.erp_purchase_request_lines;
create policy erp_purchase_request_lines_select on public.erp_purchase_request_lines for select to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'view')
    or public.has_module_permission(organization_id, 'erp_receptions', 'view')
  );
drop policy if exists erp_purchase_request_lines_write on public.erp_purchase_request_lines;
create policy erp_purchase_request_lines_write on public.erp_purchase_request_lines for all to authenticated
  using (
    (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  )
  with check (
    (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  );

-- =============== Module 3 : erp_ventes (customers/pipeline/prospects/quotes+lines/sales_orders+lines/delivery_notes+lines/crm_activities) ===============
drop policy if exists erp_customers_select on public.erp_customers;
create policy erp_customers_select on public.erp_customers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_customers_write on public.erp_customers;
create policy erp_customers_write on public.erp_customers for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

-- Carve-out préservé : paramétrage du pipeline (étapes) reste owner/manager
-- même pour salesperson, qui n'a que la lecture (déjà couverte par
-- erp_ventes.view ci-dessus).
drop policy if exists erp_sales_pipeline_stages_select on public.erp_sales_pipeline_stages;
create policy erp_sales_pipeline_stages_select on public.erp_sales_pipeline_stages for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_sales_pipeline_stages_write on public.erp_sales_pipeline_stages;
create policy erp_sales_pipeline_stages_write on public.erp_sales_pipeline_stages for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_prospects_select on public.erp_prospects;
create policy erp_prospects_select on public.erp_prospects for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_prospects_write on public.erp_prospects;
create policy erp_prospects_write on public.erp_prospects for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

drop policy if exists erp_quotes_select on public.erp_quotes;
create policy erp_quotes_select on public.erp_quotes for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_quotes_insert on public.erp_quotes;
create policy erp_quotes_insert on public.erp_quotes for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
drop policy if exists erp_quotes_update_draft on public.erp_quotes;
create policy erp_quotes_update_draft on public.erp_quotes for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('draft', 'sent') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
drop policy if exists erp_quotes_resolve on public.erp_quotes;
create policy erp_quotes_resolve on public.erp_quotes for update to authenticated
  using (status = 'sent' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('accepted', 'refused', 'expired') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
drop policy if exists erp_quotes_delete on public.erp_quotes;
create policy erp_quotes_delete on public.erp_quotes for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

drop policy if exists erp_quote_lines_select on public.erp_quote_lines;
create policy erp_quote_lines_select on public.erp_quote_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_quote_lines_write on public.erp_quote_lines;
create policy erp_quote_lines_write on public.erp_quote_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  );

drop policy if exists erp_sales_orders_select on public.erp_sales_orders;
create policy erp_sales_orders_select on public.erp_sales_orders for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_sales_orders_insert on public.erp_sales_orders;
create policy erp_sales_orders_insert on public.erp_sales_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
drop policy if exists erp_sales_orders_update_draft on public.erp_sales_orders;
create policy erp_sales_orders_update_draft on public.erp_sales_orders for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('draft', 'confirmed') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
drop policy if exists erp_sales_orders_cancel on public.erp_sales_orders;
create policy erp_sales_orders_cancel on public.erp_sales_orders for update to authenticated
  using (status in ('confirmed', 'partially_delivered') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status = 'cancelled' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
drop policy if exists erp_sales_orders_delete on public.erp_sales_orders;
create policy erp_sales_orders_delete on public.erp_sales_orders for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

drop policy if exists erp_sales_order_lines_select on public.erp_sales_order_lines;
create policy erp_sales_order_lines_select on public.erp_sales_order_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_sales_order_lines_write on public.erp_sales_order_lines;
create policy erp_sales_order_lines_write on public.erp_sales_order_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  );

drop policy if exists erp_delivery_notes_select on public.erp_delivery_notes;
create policy erp_delivery_notes_select on public.erp_delivery_notes for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_delivery_notes_insert on public.erp_delivery_notes;
create policy erp_delivery_notes_insert on public.erp_delivery_notes for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
drop policy if exists erp_delivery_notes_update on public.erp_delivery_notes;
create policy erp_delivery_notes_update on public.erp_delivery_notes for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
drop policy if exists erp_delivery_notes_delete on public.erp_delivery_notes;
create policy erp_delivery_notes_delete on public.erp_delivery_notes for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

drop policy if exists erp_delivery_note_lines_select on public.erp_delivery_note_lines;
create policy erp_delivery_note_lines_select on public.erp_delivery_note_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_delivery_note_lines_write on public.erp_delivery_note_lines;
create policy erp_delivery_note_lines_write on public.erp_delivery_note_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  );

create or replace function public.confirm_erp_delivery(
  p_organization_id uuid,
  p_delivery_note_id uuid
) returns public.erp_delivery_notes
language plpgsql security definer set search_path = public as $$
declare
  v_delivery public.erp_delivery_notes;
  v_line record;
  v_so_line public.erp_sales_order_lines;
  v_product_cost numeric(14,2);
  v_new_delivered numeric(14,3);
  v_total_lines integer;
  v_fully_delivered_lines integer;
  v_any_delivered_lines integer;
  v_so_status text;
begin
  if not public.has_module_permission(p_organization_id, 'erp_ventes', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_delivery from public.erp_delivery_notes
    where id = p_delivery_note_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Livraison introuvable.'; end if;
  if v_delivery.status <> 'draft' then raise exception 'Cette livraison a déjà été confirmée.'; end if;

  if not exists (select 1 from public.erp_delivery_note_lines where delivery_note_id = p_delivery_note_id) then
    raise exception 'Aucune ligne à livrer pour cette livraison.';
  end if;

  for v_line in select * from public.erp_delivery_note_lines where delivery_note_id = p_delivery_note_id loop
    select * into v_so_line from public.erp_sales_order_lines where id = v_line.sales_order_line_id for update;

    v_new_delivered := v_so_line.delivered_quantity + v_line.quantity;
    if v_new_delivered > v_so_line.quantity then
      raise exception 'Quantité livrée dépasse la quantité commandée pour ce produit.';
    end if;

    update public.erp_sales_order_lines set delivered_quantity = v_new_delivered where id = v_so_line.id;

    select cost into v_product_cost from public.erp_products where id = v_line.product_id;
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_delivery.warehouse_id, 'sale', v_line.quantity, v_product_cost, v_delivery.reference, auth.uid());
  end loop;

  select count(*), count(*) filter (where delivered_quantity >= quantity), count(*) filter (where delivered_quantity > 0)
    into v_total_lines, v_fully_delivered_lines, v_any_delivered_lines
    from public.erp_sales_order_lines where sales_order_id = v_delivery.sales_order_id;

  v_so_status := case
    when v_fully_delivered_lines = v_total_lines then 'delivered'
    when v_any_delivered_lines > 0 then 'partially_delivered'
    else 'confirmed'
  end;
  update public.erp_sales_orders set status = v_so_status where id = v_delivery.sales_order_id;

  update public.erp_delivery_notes set status = 'confirmed', confirmed_at = now()
    where id = p_delivery_note_id returning * into v_delivery;

  return v_delivery;
end;
$$;

drop policy if exists erp_crm_activities_select on public.erp_crm_activities;
create policy erp_crm_activities_select on public.erp_crm_activities for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
drop policy if exists erp_crm_activities_write on public.erp_crm_activities;
create policy erp_crm_activities_write on public.erp_crm_activities for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

-- =============== Module 3 : erp_facturation_ventes (invoices+lines/credit_notes/customer_payments) ===============
drop policy if exists erp_invoices_select on public.erp_invoices;
create policy erp_invoices_select on public.erp_invoices for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
drop policy if exists erp_invoices_write on public.erp_invoices;
create policy erp_invoices_write on public.erp_invoices for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

drop policy if exists erp_invoice_lines_select on public.erp_invoice_lines;
create policy erp_invoice_lines_select on public.erp_invoice_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
drop policy if exists erp_invoice_lines_write on public.erp_invoice_lines;
create policy erp_invoice_lines_write on public.erp_invoice_lines for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

drop policy if exists erp_credit_notes_select on public.erp_credit_notes;
create policy erp_credit_notes_select on public.erp_credit_notes for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
drop policy if exists erp_credit_notes_write on public.erp_credit_notes;
create policy erp_credit_notes_write on public.erp_credit_notes for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

drop policy if exists erp_customer_payments_select on public.erp_customer_payments;
create policy erp_customer_payments_select on public.erp_customer_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
drop policy if exists erp_customer_payments_write on public.erp_customer_payments;
create policy erp_customer_payments_write on public.erp_customer_payments for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

-- =============== Module 3 : erp_retours_clients (customer_returns+lines) ===============
drop policy if exists erp_customer_returns_select on public.erp_customer_returns;
create policy erp_customer_returns_select on public.erp_customer_returns for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_retours_clients', 'view'));
drop policy if exists erp_customer_returns_insert on public.erp_customer_returns;
create policy erp_customer_returns_insert on public.erp_customer_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_retours_clients', 'create'));
drop policy if exists erp_customer_returns_update on public.erp_customer_returns;
create policy erp_customer_returns_update on public.erp_customer_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'));
drop policy if exists erp_customer_returns_delete on public.erp_customer_returns;
create policy erp_customer_returns_delete on public.erp_customer_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'));

drop policy if exists erp_customer_return_lines_select on public.erp_customer_return_lines;
create policy erp_customer_return_lines_select on public.erp_customer_return_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_retours_clients', 'view'));
drop policy if exists erp_customer_return_lines_write on public.erp_customer_return_lines;
create policy erp_customer_return_lines_write on public.erp_customer_return_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_retours_clients', 'manage')
    and exists (select 1 from public.erp_customer_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_retours_clients', 'manage')
    and exists (select 1 from public.erp_customer_returns r where r.id = return_id and r.status = 'draft')
  );

create or replace function public.confirm_erp_customer_return(
  p_organization_id uuid,
  p_return_id uuid
) returns public.erp_customer_returns
language plpgsql security definer set search_path = public as $$
declare
  v_return public.erp_customer_returns;
  v_line record;
begin
  if not public.has_module_permission(p_organization_id, 'erp_retours_clients', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_return from public.erp_customer_returns
    where id = p_return_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Retour client introuvable.'; end if;
  if v_return.status <> 'draft' then raise exception 'Ce retour a déjà été confirmé.'; end if;

  if not exists (select 1 from public.erp_customer_return_lines where return_id = p_return_id) then
    raise exception 'Aucune ligne à retourner pour ce retour client.';
  end if;

  for v_line in select * from public.erp_customer_return_lines where return_id = p_return_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_return.warehouse_id, 'customer_return', v_line.quantity, v_line.unit_cost, v_return.reference, auth.uid());
  end loop;

  update public.erp_customer_returns set status = 'confirmed', confirmed_at = now()
    where id = p_return_id returning * into v_return;

  return v_return;
end;
$$;

-- =============== Module 4 : erp_pos (cash_sessions/pos_sales+lines/pos_returns+lines) ===============
drop policy if exists erp_cash_sessions_select on public.erp_cash_sessions;
create policy erp_cash_sessions_select on public.erp_cash_sessions for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
drop policy if exists erp_cash_sessions_insert on public.erp_cash_sessions;
create policy erp_cash_sessions_insert on public.erp_cash_sessions for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
drop policy if exists erp_cash_sessions_update on public.erp_cash_sessions;
create policy erp_cash_sessions_update on public.erp_cash_sessions for update to authenticated
  using (status = 'open' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_pos', 'manage'));

drop policy if exists erp_pos_sales_select on public.erp_pos_sales;
create policy erp_pos_sales_select on public.erp_pos_sales for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
drop policy if exists erp_pos_sales_insert on public.erp_pos_sales;
create policy erp_pos_sales_insert on public.erp_pos_sales for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
drop policy if exists erp_pos_sales_update_draft on public.erp_pos_sales;
create policy erp_pos_sales_update_draft on public.erp_pos_sales for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (status in ('draft', 'cancelled') and public.has_module_permission(organization_id, 'erp_pos', 'manage'));
drop policy if exists erp_pos_sales_delete on public.erp_pos_sales;
create policy erp_pos_sales_delete on public.erp_pos_sales for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));

drop policy if exists erp_pos_sale_lines_select on public.erp_pos_sale_lines;
create policy erp_pos_sale_lines_select on public.erp_pos_sale_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
drop policy if exists erp_pos_sale_lines_write on public.erp_pos_sale_lines;
create policy erp_pos_sale_lines_write on public.erp_pos_sale_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  );

create or replace function public.complete_erp_pos_sale(
  p_organization_id uuid,
  p_sale_id uuid
) returns public.erp_pos_sales
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.erp_pos_sales;
  v_session public.erp_cash_sessions;
  v_line record;
  v_product_cost numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
begin
  if not public.has_module_permission(p_organization_id, 'erp_pos', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_sale from public.erp_pos_sales
    where id = p_sale_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Vente introuvable.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Cette vente a déjà été finalisée ou annulée.'; end if;

  select * into v_session from public.erp_cash_sessions where id = v_sale.cash_session_id for update;
  if v_session.status <> 'open' then raise exception 'La session de caisse de cette vente n''est plus ouverte.'; end if;

  if not exists (select 1 from public.erp_pos_sale_lines where sale_id = p_sale_id) then
    raise exception 'Aucune ligne pour cette vente.';
  end if;

  for v_line in select * from public.erp_pos_sale_lines where sale_id = p_sale_id loop
    v_subtotal := v_subtotal + (v_line.quantity * v_line.unit_price) - v_line.discount_amount;
    v_tax := v_tax + (v_line.quantity * v_line.unit_price - v_line.discount_amount) * (v_line.tax_rate / 100);

    select cost into v_product_cost from public.erp_products where id = v_line.product_id;
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_session.warehouse_id, 'sale', v_line.quantity, v_product_cost, v_sale.reference, auth.uid());
  end loop;

  update public.erp_pos_sales
    set status = 'completed', completed_at = now(), tax_amount = v_tax, total_amount = v_subtotal + v_tax
    where id = p_sale_id returning * into v_sale;

  return v_sale;
end;
$$;

drop policy if exists erp_pos_returns_select on public.erp_pos_returns;
create policy erp_pos_returns_select on public.erp_pos_returns for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
drop policy if exists erp_pos_returns_insert on public.erp_pos_returns;
create policy erp_pos_returns_insert on public.erp_pos_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
drop policy if exists erp_pos_returns_update on public.erp_pos_returns;
create policy erp_pos_returns_update on public.erp_pos_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));
drop policy if exists erp_pos_returns_delete on public.erp_pos_returns;
create policy erp_pos_returns_delete on public.erp_pos_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));

drop policy if exists erp_pos_return_lines_select on public.erp_pos_return_lines;
create policy erp_pos_return_lines_select on public.erp_pos_return_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
drop policy if exists erp_pos_return_lines_write on public.erp_pos_return_lines;
create policy erp_pos_return_lines_write on public.erp_pos_return_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  );

create or replace function public.confirm_erp_pos_return(
  p_organization_id uuid,
  p_return_id uuid
) returns public.erp_pos_returns
language plpgsql security definer set search_path = public as $$
declare
  v_return public.erp_pos_returns;
  v_session public.erp_cash_sessions;
  v_line record;
  v_sale_line public.erp_pos_sale_lines;
  v_new_returned numeric(14,3);
begin
  if not public.has_module_permission(p_organization_id, 'erp_pos', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_return from public.erp_pos_returns
    where id = p_return_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Retour introuvable.'; end if;
  if v_return.status <> 'draft' then raise exception 'Ce retour a déjà été confirmé.'; end if;

  select * into v_session from public.erp_cash_sessions where id = v_return.cash_session_id;

  if not exists (select 1 from public.erp_pos_return_lines where return_id = p_return_id) then
    raise exception 'Aucune ligne à retourner pour ce retour.';
  end if;

  for v_line in select * from public.erp_pos_return_lines where return_id = p_return_id loop
    select * into v_sale_line from public.erp_pos_sale_lines where id = v_line.sale_line_id for update;

    v_new_returned := v_sale_line.returned_quantity + v_line.quantity;
    if v_new_returned > v_sale_line.quantity then
      raise exception 'Quantité retournée dépasse la quantité vendue pour ce produit.';
    end if;

    update public.erp_pos_sale_lines set returned_quantity = v_new_returned where id = v_sale_line.id;

    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reference, created_by)
    values (p_organization_id, v_line.product_id, v_session.warehouse_id, 'customer_return', v_line.quantity, v_return.reason, auth.uid());
  end loop;

  update public.erp_pos_returns set status = 'confirmed', confirmed_at = now()
    where id = p_return_id returning * into v_return;

  return v_return;
end;
$$;

-- =============== Module 5 : erp_finance (cash_accounts/balances[select-only]/fund_transfers/cash_transactions) ===============
drop policy if exists erp_cash_accounts_select on public.erp_cash_accounts;
create policy erp_cash_accounts_select on public.erp_cash_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
drop policy if exists erp_cash_accounts_write on public.erp_cash_accounts;
create policy erp_cash_accounts_write on public.erp_cash_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_finance', 'manage'));

drop policy if exists erp_cash_account_balances_select on public.erp_cash_account_balances;
create policy erp_cash_account_balances_select on public.erp_cash_account_balances for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));

drop policy if exists erp_fund_transfers_select on public.erp_fund_transfers;
create policy erp_fund_transfers_select on public.erp_fund_transfers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
drop policy if exists erp_fund_transfers_insert on public.erp_fund_transfers;
create policy erp_fund_transfers_insert on public.erp_fund_transfers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_finance', 'create'));
drop policy if exists erp_fund_transfers_update on public.erp_fund_transfers;
create policy erp_fund_transfers_update on public.erp_fund_transfers for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_finance', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_finance', 'manage'));
-- Carve-out préservé : suppression reste owner/manager (accountant peut
-- créer/modifier un virement en brouillon, jamais le supprimer).
drop policy if exists erp_fund_transfers_delete on public.erp_fund_transfers;
create policy erp_fund_transfers_delete on public.erp_fund_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_cash_transactions_select on public.erp_cash_transactions;
create policy erp_cash_transactions_select on public.erp_cash_transactions for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
drop policy if exists erp_cash_transactions_insert on public.erp_cash_transactions;
create policy erp_cash_transactions_insert on public.erp_cash_transactions for insert to authenticated
  with check (
    type in ('in', 'out')
    and public.has_module_permission(organization_id, 'erp_finance', 'create')
  );

create or replace function public.confirm_erp_fund_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_fund_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_fund_transfers;
begin
  if not public.has_module_permission(p_organization_id, 'erp_finance', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_fund_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'draft' then raise exception 'Ce transfert a déjà été confirmé.'; end if;

  insert into public.erp_cash_transactions (organization_id, cash_account_id, type, amount, reference, transfer_id, created_by)
  values (p_organization_id, v_transfer.from_account_id, 'transfer_out', v_transfer.amount, v_transfer.reference, p_transfer_id, auth.uid());
  insert into public.erp_cash_transactions (organization_id, cash_account_id, type, amount, reference, transfer_id, created_by)
  values (p_organization_id, v_transfer.to_account_id, 'transfer_in', v_transfer.amount, v_transfer.reference, p_transfer_id, auth.uid());

  update public.erp_fund_transfers set status = 'confirmed', confirmed_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;

-- =============== Module 6 : erp_comptabilite (chart_of_accounts/journals/periods/journal_entries+lines/bank_reconciliations+lines) ===============
drop policy if exists erp_chart_of_accounts_select on public.erp_chart_of_accounts;
create policy erp_chart_of_accounts_select on public.erp_chart_of_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_chart_of_accounts_write on public.erp_chart_of_accounts;
create policy erp_chart_of_accounts_write on public.erp_chart_of_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

drop policy if exists erp_accounting_journals_select on public.erp_accounting_journals;
create policy erp_accounting_journals_select on public.erp_accounting_journals for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_accounting_journals_write on public.erp_accounting_journals;
create policy erp_accounting_journals_write on public.erp_accounting_journals for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

drop policy if exists erp_accounting_periods_select on public.erp_accounting_periods;
create policy erp_accounting_periods_select on public.erp_accounting_periods for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_accounting_periods_insert on public.erp_accounting_periods;
create policy erp_accounting_periods_insert on public.erp_accounting_periods for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'create'));
drop policy if exists erp_accounting_periods_update on public.erp_accounting_periods;
create policy erp_accounting_periods_update on public.erp_accounting_periods for update to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));
-- Carve-out préservé : clôture/suppression d'une période reste owner/manager.
drop policy if exists erp_accounting_periods_delete on public.erp_accounting_periods;
create policy erp_accounting_periods_delete on public.erp_accounting_periods for delete to authenticated
  using (status = 'open' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_journal_entries_select on public.erp_journal_entries;
create policy erp_journal_entries_select on public.erp_journal_entries for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_journal_entries_insert on public.erp_journal_entries;
create policy erp_journal_entries_insert on public.erp_journal_entries for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'create')
    and not exists (
      select 1 from public.erp_accounting_periods p
      where p.organization_id = erp_journal_entries.organization_id
        and p.status = 'closed'
        and erp_journal_entries.entry_date between p.start_date and p.end_date
    )
  );
drop policy if exists erp_journal_entries_update_draft on public.erp_journal_entries;
create policy erp_journal_entries_update_draft on public.erp_journal_entries for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (
    status = 'draft'
    and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and not exists (
      select 1 from public.erp_accounting_periods p
      where p.organization_id = erp_journal_entries.organization_id
        and p.status = 'closed'
        and erp_journal_entries.entry_date between p.start_date and p.end_date
    )
  );
drop policy if exists erp_journal_entries_delete on public.erp_journal_entries;
create policy erp_journal_entries_delete on public.erp_journal_entries for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

drop policy if exists erp_journal_entry_lines_select on public.erp_journal_entry_lines;
create policy erp_journal_entry_lines_select on public.erp_journal_entry_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_journal_entry_lines_write on public.erp_journal_entry_lines;
create policy erp_journal_entry_lines_write on public.erp_journal_entry_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  );

create or replace function public.post_erp_journal_entry(
  p_organization_id uuid,
  p_entry_id uuid
) returns public.erp_journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.erp_journal_entries;
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin
  if not public.has_module_permission(p_organization_id, 'erp_comptabilite', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_entry from public.erp_journal_entries
    where id = p_entry_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Écriture introuvable.'; end if;
  if v_entry.status <> 'draft' then raise exception 'Cette écriture a déjà été comptabilisée.'; end if;

  if exists (
    select 1 from public.erp_accounting_periods p
    where p.organization_id = p_organization_id and p.status = 'closed'
      and v_entry.entry_date between p.start_date and p.end_date
  ) then
    raise exception 'La période comptable de cette écriture est clôturée.';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_total_debit, v_total_credit
    from public.erp_journal_entry_lines where entry_id = p_entry_id;

  if v_total_debit = 0 and v_total_credit = 0 then
    raise exception 'Aucune ligne pour cette écriture.';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'Écriture déséquilibrée : débit (%) différent du crédit (%).', v_total_debit, v_total_credit;
  end if;

  update public.erp_journal_entries set status = 'posted', posted_at = now()
    where id = p_entry_id returning * into v_entry;

  return v_entry;
end;
$$;

drop policy if exists erp_bank_reconciliations_select on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_select on public.erp_bank_reconciliations for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_bank_reconciliations_insert on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_insert on public.erp_bank_reconciliations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'create'));
drop policy if exists erp_bank_reconciliations_update on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_update on public.erp_bank_reconciliations for update to authenticated
  using (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));
-- Carve-out préservé : suppression reste owner/manager.
drop policy if exists erp_bank_reconciliations_delete on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_delete on public.erp_bank_reconciliations for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists erp_bank_reconciliation_lines_select on public.erp_bank_reconciliation_lines;
create policy erp_bank_reconciliation_lines_select on public.erp_bank_reconciliation_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
drop policy if exists erp_bank_reconciliation_lines_write on public.erp_bank_reconciliation_lines;
create policy erp_bank_reconciliation_lines_write on public.erp_bank_reconciliation_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_bank_reconciliations r where r.id = reconciliation_id and r.status = 'in_progress')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_bank_reconciliations r where r.id = reconciliation_id and r.status = 'in_progress')
    and exists (
      select 1 from public.erp_bank_reconciliations r
      join public.erp_cash_transactions t on t.id = cash_transaction_id
      where r.id = reconciliation_id and t.cash_account_id = r.cash_account_id
    )
  );

create or replace function public.complete_erp_bank_reconciliation(
  p_organization_id uuid,
  p_reconciliation_id uuid
) returns public.erp_bank_reconciliations
language plpgsql security definer set search_path = public as $$
declare
  v_reconciliation public.erp_bank_reconciliations;
  v_balance numeric(14,2);
begin
  if not public.has_module_permission(p_organization_id, 'erp_comptabilite', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_reconciliation from public.erp_bank_reconciliations
    where id = p_reconciliation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Rapprochement introuvable.'; end if;
  if v_reconciliation.status <> 'in_progress' then raise exception 'Ce rapprochement a déjà été clôturé.'; end if;

  select coalesce(sum(case when t.type in ('in', 'transfer_in') then t.amount else -t.amount end), 0)
    into v_balance
    from public.erp_bank_reconciliation_lines l
    join public.erp_cash_transactions t on t.id = l.cash_transaction_id
    where l.reconciliation_id = p_reconciliation_id;

  update public.erp_bank_reconciliations
    set status = 'completed', completed_at = now(), reconciled_balance = v_balance
    where id = p_reconciliation_id returning * into v_reconciliation;

  return v_reconciliation;
end;
$$;

-- =============== Module 7 : erp_rh (departments/positions/employees/attendance/leave_requests/employee_documents) ===============
drop policy if exists erp_departments_select on public.erp_departments;
create policy erp_departments_select on public.erp_departments for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_departments_write on public.erp_departments;
create policy erp_departments_write on public.erp_departments for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

drop policy if exists erp_positions_select on public.erp_positions;
create policy erp_positions_select on public.erp_positions for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_positions_write on public.erp_positions;
create policy erp_positions_write on public.erp_positions for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

drop policy if exists erp_employees_select on public.erp_employees;
create policy erp_employees_select on public.erp_employees for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_employees_write on public.erp_employees;
create policy erp_employees_write on public.erp_employees for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

drop policy if exists erp_attendance_select on public.erp_attendance;
create policy erp_attendance_select on public.erp_attendance for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_attendance_write on public.erp_attendance;
create policy erp_attendance_write on public.erp_attendance for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

drop policy if exists erp_leave_requests_select on public.erp_leave_requests;
create policy erp_leave_requests_select on public.erp_leave_requests for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_leave_requests_write on public.erp_leave_requests;
create policy erp_leave_requests_write on public.erp_leave_requests for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

drop policy if exists erp_employee_documents_select on public.erp_employee_documents;
create policy erp_employee_documents_select on public.erp_employee_documents for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
drop policy if exists erp_employee_documents_write on public.erp_employee_documents;
create policy erp_employee_documents_write on public.erp_employee_documents for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

-- =============== Module 8 : erp_documents (contracts/documents/document_attachments) ===============
-- RLS entité-scopée (migration 058, inchangée dans son principe) : un
-- document/attachement suit les droits du module correspondant à son
-- entity_type — erp_achats (fournisseur), erp_ventes (client), erp_rh
-- (employé), erp_documents (contrat — domaine propre owner/manager/
-- accountant, comme erp_contracts). owner/manager voient/gèrent toujours
-- tout via has_module_permission (déjà true pour eux sur tous les modules).
drop policy if exists erp_contracts_select on public.erp_contracts;
create policy erp_contracts_select on public.erp_contracts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_documents', 'view'));
drop policy if exists erp_contracts_write on public.erp_contracts;
create policy erp_contracts_write on public.erp_contracts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_documents', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_documents', 'manage'));

drop policy if exists erp_document_attachments_select on public.erp_document_attachments;
create policy erp_document_attachments_select on public.erp_document_attachments for select to authenticated
  using (
    (entity_type = 'supplier' and public.has_module_permission(organization_id, 'erp_achats', 'view'))
    or (entity_type = 'customer' and public.has_module_permission(organization_id, 'erp_ventes', 'view'))
    or (entity_type = 'employee' and public.has_module_permission(organization_id, 'erp_rh', 'view'))
    or (entity_type = 'contract' and public.has_module_permission(organization_id, 'erp_documents', 'view'))
  );
drop policy if exists erp_document_attachments_write on public.erp_document_attachments;
create policy erp_document_attachments_write on public.erp_document_attachments for all to authenticated
  using (
    (entity_type = 'supplier' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
    or (entity_type = 'customer' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
    or (entity_type = 'employee' and public.has_module_permission(organization_id, 'erp_rh', 'manage'))
    or (entity_type = 'contract' and public.has_module_permission(organization_id, 'erp_documents', 'manage'))
  )
  with check (
    (entity_type = 'supplier' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
    or (entity_type = 'customer' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
    or (entity_type = 'employee' and public.has_module_permission(organization_id, 'erp_rh', 'manage'))
    or (entity_type = 'contract' and public.has_module_permission(organization_id, 'erp_documents', 'manage'))
  );

drop policy if exists erp_documents_select on public.erp_documents;
create policy erp_documents_select on public.erp_documents for select to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_documents', 'view')
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_module_permission(erp_documents.organization_id, 'erp_achats', 'view'))
          or (a.entity_type = 'customer' and public.has_module_permission(erp_documents.organization_id, 'erp_ventes', 'view'))
          or (a.entity_type = 'employee' and public.has_module_permission(erp_documents.organization_id, 'erp_rh', 'view'))
        )
    )
  );
-- Insertion : union des 4 domaines "create" (equivaut exactement à
-- owner/manager/accountant/buyer/salesperson/hr_manager d'origine).
drop policy if exists erp_documents_insert on public.erp_documents;
create policy erp_documents_insert on public.erp_documents for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'erp_documents', 'create')
    or public.has_module_permission(organization_id, 'erp_achats', 'create')
    or public.has_module_permission(organization_id, 'erp_ventes', 'create')
    or public.has_module_permission(organization_id, 'erp_rh', 'create')
  );
drop policy if exists erp_documents_update on public.erp_documents;
create policy erp_documents_update on public.erp_documents for update to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_documents', 'view')
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_module_permission(erp_documents.organization_id, 'erp_achats', 'view'))
          or (a.entity_type = 'customer' and public.has_module_permission(erp_documents.organization_id, 'erp_ventes', 'view'))
          or (a.entity_type = 'employee' and public.has_module_permission(erp_documents.organization_id, 'erp_rh', 'view'))
        )
    )
  )
  with check (
    public.has_module_permission(organization_id, 'erp_documents', 'create')
    or public.has_module_permission(organization_id, 'erp_achats', 'create')
    or public.has_module_permission(organization_id, 'erp_ventes', 'create')
    or public.has_module_permission(organization_id, 'erp_rh', 'create')
  );
drop policy if exists erp_documents_delete on public.erp_documents;
create policy erp_documents_delete on public.erp_documents for delete to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_documents', 'view')
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_module_permission(erp_documents.organization_id, 'erp_achats', 'view'))
          or (a.entity_type = 'customer' and public.has_module_permission(erp_documents.organization_id, 'erp_ventes', 'view'))
          or (a.entity_type = 'employee' and public.has_module_permission(erp_documents.organization_id, 'erp_rh', 'view'))
        )
    )
  );

-- Storage bucket erp-documents : select reste ouvert à tout membre
-- (niveau grossier assumé, cf. migration 058) — inchangé. insert/update/
-- delete reprennent la même union des 4 domaines "create".
drop policy if exists erp_documents_bucket_insert on storage.objects;
create policy erp_documents_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-documents'
    and (
      public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_documents', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_achats', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_ventes', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_rh', 'create')
    )
  );
drop policy if exists erp_documents_bucket_update on storage.objects;
create policy erp_documents_bucket_update on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-documents'
    and (
      public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_documents', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_achats', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_ventes', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_rh', 'create')
    )
  )
  with check (
    bucket_id = 'erp-documents'
    and (
      public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_documents', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_achats', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_ventes', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_rh', 'create')
    )
  );
drop policy if exists erp_documents_bucket_delete on storage.objects;
create policy erp_documents_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-documents'
    and (
      public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_documents', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_achats', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_ventes', 'create')
      or public.has_module_permission(((storage.foldername(name))[1])::uuid, 'erp_rh', 'create')
    )
  );

-- =============== Module 9 : erp_rapports ===============
-- erp_custom_reports n'est PAS touchée : sa policy d'origine ne porte
-- déjà aucune restriction de rôle au-delà de l'appartenance à
-- l'organisation ET de la propriété (created_by = auth.uid()) — rien à
-- migrer, un rapport reste strictement privé à son auteur. Le module
-- 'erp_rapports' n'existe que pour le garde-fou de nav (voir
-- AppSidebar.tsx) ; aucune policy ne le référence.

-- =============== Module 10 : erp_parametres (erp_settings) ===============
drop policy if exists erp_settings_select on public.erp_settings;
create policy erp_settings_select on public.erp_settings for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_parametres', 'view'));
drop policy if exists erp_settings_write on public.erp_settings;
create policy erp_settings_write on public.erp_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_parametres', 'manage'));
