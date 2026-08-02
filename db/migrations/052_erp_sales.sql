-- Migration 052 — ZegERP, module 3/10 : Ventes & CRM. Présentée pour
-- relecture — NE PAS exécuter automatiquement. À exécuter après 051 (rôle
-- salesperson + types de mouvement sale/customer_return).
--
-- Cloisonnement (validé, ARCHITECTURE_ERP.md) : `salesperson` n'a AUCUN
-- accès aux tables Achats (erp_suppliers/erp_purchase_orders/
-- erp_supplier_invoices/erp_supplier_returns...) et `buyer` n'a AUCUN accès
-- aux tables ci-dessous — aucune policy ne référence les deux rôles
-- ensemble dans ce fichier.
--
-- Asymétrie assumée vis-à-vis du module 2 : `erp_delivery_notes` est
-- explicitement dans le périmètre `salesperson` (table de rôles validée),
-- contrairement à `erp_goods_receipts` qui excluait `buyer` — la livraison
-- n'est donc PAS un geste réservé à `stock` ici (`stock` n'a d'ailleurs
-- aucun accès aux tables de ce module, la disponibilité produit lui suffit
-- via erp_stock_levels, déjà lisible par tous — module 1). À l'inverse,
-- `erp_customer_returns` n'apparaît PAS dans le périmètre `salesperson`
-- validé : traité ici comme `erp_goods_receipts` (réservé à `stock`,
-- réception physique d'un retour).

-- =============== erp_customers ===============
create table if not exists public.erp_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_customers_org on public.erp_customers(organization_id);
alter table public.erp_customers enable row level security;

create policy erp_customers_select on public.erp_customers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_customers_write on public.erp_customers for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));

-- =============== erp_sales_pipeline_stages (configuration du pipeline
-- prospects — administrée par owner/manager, lue par le commercial) ===============
create table if not exists public.erp_sales_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_sales_pipeline_stages_org on public.erp_sales_pipeline_stages(organization_id);
alter table public.erp_sales_pipeline_stages enable row level security;

create policy erp_sales_pipeline_stages_select on public.erp_sales_pipeline_stages for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_sales_pipeline_stages_write on public.erp_sales_pipeline_stages for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== erp_prospects (converted_customer_id renseigné quand un
-- prospect devient client — pas de RPC de conversion en V1, création
-- manuelle de la fiche erp_customers puis mise à jour du lien, comme la
-- non-conversion automatique demande→commande du module 2) ===============
create table if not exists public.erp_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage_id uuid references public.erp_sales_pipeline_stages(id) on delete set null,
  converted_customer_id uuid references public.erp_customers(id) on delete set null,
  name text not null,
  contact_name text,
  phone text,
  email text,
  estimated_value numeric(14,2),
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_prospects_org on public.erp_prospects(organization_id);
create index if not exists idx_erp_prospects_stage on public.erp_prospects(stage_id);
alter table public.erp_prospects enable row level security;

create policy erp_prospects_select on public.erp_prospects for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_prospects_write on public.erp_prospects for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));

-- =============== erp_quotes + erp_quote_lines ===============
create table if not exists public.erp_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'refused', 'expired', 'converted')),
  valid_until date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_erp_quotes_org on public.erp_quotes(organization_id);
create index if not exists idx_erp_quotes_customer on public.erp_quotes(customer_id);
alter table public.erp_quotes enable row level security;

create policy erp_quotes_select on public.erp_quotes for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_quotes_insert on public.erp_quotes for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
-- Édition libre tant que 'draft' (y compris l'envoi). 'accepted'/'refused'/
-- 'expired'/'converted' sont des statuts terminaux en V1 (pas de retour en
-- arrière) — un nouveau devis se crée plutôt qu'une réouverture.
create policy erp_quotes_update_draft on public.erp_quotes for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (status in ('draft', 'sent') and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
create policy erp_quotes_resolve on public.erp_quotes for update to authenticated
  using (status = 'sent' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (status in ('accepted', 'refused', 'expired') and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
create policy erp_quotes_delete on public.erp_quotes for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));

create table if not exists public.erp_quote_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.erp_quotes(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0
);
create index if not exists idx_erp_quote_lines_org on public.erp_quote_lines(organization_id);
create index if not exists idx_erp_quote_lines_quote on public.erp_quote_lines(quote_id);
alter table public.erp_quote_lines enable row level security;

create policy erp_quote_lines_select on public.erp_quote_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_quote_lines_write on public.erp_quote_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  );

-- =============== erp_sales_orders + erp_sales_order_lines ===============
create table if not exists public.erp_sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  quote_id uuid references public.erp_quotes(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_delivered', 'delivered', 'cancelled')),
  expected_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_sales_orders_org on public.erp_sales_orders(organization_id);
create index if not exists idx_erp_sales_orders_customer on public.erp_sales_orders(customer_id);
alter table public.erp_sales_orders enable row level security;

create policy erp_sales_orders_select on public.erp_sales_orders for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_sales_orders_insert on public.erp_sales_orders for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
create policy erp_sales_orders_update_draft on public.erp_sales_orders for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (status in ('draft', 'confirmed') and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
-- Annulation possible tant que la livraison n'est pas terminée. Les
-- transitions vers partially_delivered/delivered passent exclusivement par
-- confirm_erp_delivery() plus bas.
create policy erp_sales_orders_cancel on public.erp_sales_orders for update to authenticated
  using (status in ('confirmed', 'partially_delivered') and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (status = 'cancelled' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
create policy erp_sales_orders_delete on public.erp_sales_orders for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));

-- delivered_quantity jamais modifiée directement : incrémentée
-- exclusivement par confirm_erp_delivery() (security definer, bypass RLS).
create table if not exists public.erp_sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.erp_sales_orders(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  delivered_quantity numeric(14,3) not null default 0,
  check (delivered_quantity >= 0 and delivered_quantity <= quantity)
);
create index if not exists idx_erp_sales_order_lines_org on public.erp_sales_order_lines(organization_id);
create index if not exists idx_erp_sales_order_lines_order on public.erp_sales_order_lines(sales_order_id);
alter table public.erp_sales_order_lines enable row level security;

create policy erp_sales_order_lines_select on public.erp_sales_order_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_sales_order_lines_write on public.erp_sales_order_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  );

-- =============== erp_delivery_notes + erp_delivery_note_lines (portée
-- `salesperson`, pas `stock` — voir en-tête de fichier) ===============
create table if not exists public.erp_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.erp_sales_orders(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_delivery_notes_org on public.erp_delivery_notes(organization_id);
create index if not exists idx_erp_delivery_notes_order on public.erp_delivery_notes(sales_order_id);
alter table public.erp_delivery_notes enable row level security;

create policy erp_delivery_notes_select on public.erp_delivery_notes for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_delivery_notes_insert on public.erp_delivery_notes for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
-- Comme les commandes fournisseur : la confirmation (qui crée les
-- mouvements de stock) passe exclusivement par confirm_erp_delivery(),
-- jamais par une écriture directe de `status`.
create policy erp_delivery_notes_update on public.erp_delivery_notes for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
create policy erp_delivery_notes_delete on public.erp_delivery_notes for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));

create table if not exists public.erp_delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_note_id uuid not null references public.erp_delivery_notes(id) on delete cascade,
  sales_order_line_id uuid not null references public.erp_sales_order_lines(id) on delete restrict,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_delivery_note_lines_org on public.erp_delivery_note_lines(organization_id);
create index if not exists idx_erp_delivery_note_lines_note on public.erp_delivery_note_lines(delivery_note_id);
alter table public.erp_delivery_note_lines enable row level security;

create policy erp_delivery_note_lines_select on public.erp_delivery_note_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_delivery_note_lines_write on public.erp_delivery_note_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[])
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  );

-- apply_erp_stock_movement() (définie migration 048, étendue migration
-- 050) mise à jour ici : signature identique — CREATE OR REPLACE sûr.
-- Ajoute 'sale' (sortie, comme 'out'/'supplier_return') et 'customer_return'
-- (entrée, comme 'in'/'purchase_receipt').
create or replace function public.apply_erp_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'transfer_in' then new.quantity
    when 'purchase_receipt' then new.quantity
    when 'customer_return' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'transfer_out' then -new.quantity
    when 'supplier_return' then -new.quantity
    when 'sale' then -new.quantity
    else 0
  end;

  insert into public.erp_stock_levels (organization_id, product_id, warehouse_id, quantity)
  values (new.organization_id, new.product_id, new.warehouse_id, delta)
  on conflict (organization_id, product_id, warehouse_id)
  do update set quantity = public.erp_stock_levels.quantity + delta, updated_at = now()
  returning quantity into v_new_qty;

  if new.type in ('out', 'transfer_out', 'supplier_return', 'sale') and v_new_qty < 0 then
    raise exception 'Stock insuffisant pour ce produit dans ce dépôt (quantité disponible dépassée).';
  end if;

  return new;
end;
$$;

-- confirm_erp_delivery() : pour chaque ligne, crée un mouvement 'sale'
-- (coût repris de erp_products.cost — snapshot au moment de la livraison,
-- pour une valorisation COGS approximative en V1), incrémente
-- delivered_quantity (bloque la sur-livraison), recalcule le statut de la
-- commande, passe la livraison "confirmed". Livraison partielle supportée
-- nativement (plusieurs erp_delivery_notes par commande).
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
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','salesperson']::public.app_role[]) then
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
revoke all on function public.confirm_erp_delivery(uuid, uuid) from public;
grant execute on function public.confirm_erp_delivery(uuid, uuid) to authenticated;

-- =============== erp_invoices + erp_invoice_lines ("création" par
-- salesperson selon la table de rôles validée ; V1 ne restreint pas cela
-- au niveau RLS au-delà de la portée normale du rôle — comme
-- erp_supplier_invoices, écriture élargie à accountant pour le suivi de
-- paiement, pas de distinction technique entre "créer" et "modifier" ici) ===============
create table if not exists public.erp_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  sales_order_id uuid references public.erp_sales_orders(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  issue_date date not null default current_date,
  due_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_invoices_org on public.erp_invoices(organization_id);
create index if not exists idx_erp_invoices_customer on public.erp_invoices(customer_id);
alter table public.erp_invoices enable row level security;

create policy erp_invoices_select on public.erp_invoices for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_invoices_write on public.erp_invoices for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));

create table if not exists public.erp_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.erp_invoices(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0
);
create index if not exists idx_erp_invoice_lines_org on public.erp_invoice_lines(organization_id);
create index if not exists idx_erp_invoice_lines_invoice on public.erp_invoice_lines(invoice_id);
alter table public.erp_invoice_lines enable row level security;

create policy erp_invoice_lines_select on public.erp_invoice_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_invoice_lines_write on public.erp_invoice_lines for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));

-- =============== erp_credit_notes (avoir client — montant unique, pas de
-- lignes détaillées en V1, simplification assumée comme pour
-- erp_stock_transfers/erp_inventories qui n'ont pas de valorisation
-- avancée) ===============
create table if not exists public.erp_credit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  invoice_id uuid references public.erp_invoices(id) on delete set null,
  reference text,
  amount numeric(14,2) not null check (amount >= 0),
  reason text,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_credit_notes_org on public.erp_credit_notes(organization_id);
alter table public.erp_credit_notes enable row level security;

create policy erp_credit_notes_select on public.erp_credit_notes for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_credit_notes_write on public.erp_credit_notes for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));

-- =============== erp_customer_payments (encaissement — nouvel enum dédié
-- erp_payment_method plutôt que réutiliser public.payment_method existant :
-- même principe de découplage que erp_stock_movement_type vis-à-vis de
-- stock_movement_type, une évolution du POS ZegCaisse ne doit jamais
-- impacter ZegERP et inversement) ===============
do $$ begin
  create type public.erp_payment_method as enum ('cash', 'mobile_money', 'card', 'bank_transfer', 'credit', 'mixed');
exception when duplicate_object then null;
end $$;

create table if not exists public.erp_customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  invoice_id uuid references public.erp_invoices(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  method public.erp_payment_method not null default 'cash',
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_customer_payments_org on public.erp_customer_payments(organization_id);
create index if not exists idx_erp_customer_payments_customer on public.erp_customer_payments(customer_id);
alter table public.erp_customer_payments enable row level security;

create policy erp_customer_payments_select on public.erp_customer_payments for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_customer_payments_write on public.erp_customer_payments for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));

-- =============== erp_customer_returns + erp_customer_return_lines (retour
-- client — portée `stock`, PAS `salesperson`, voir en-tête de fichier :
-- symétrique de erp_goods_receipts, la marchandise revient physiquement en
-- entrepôt) ===============
create table if not exists public.erp_customer_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.erp_customers(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  sales_order_id uuid references public.erp_sales_orders(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_customer_returns_org on public.erp_customer_returns(organization_id);
alter table public.erp_customer_returns enable row level security;

create policy erp_customer_returns_select on public.erp_customer_returns for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_customer_returns_insert on public.erp_customer_returns for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
create policy erp_customer_returns_update on public.erp_customer_returns for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
create policy erp_customer_returns_delete on public.erp_customer_returns for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

create table if not exists public.erp_customer_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.erp_customer_returns(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2)
);
create index if not exists idx_erp_customer_return_lines_org on public.erp_customer_return_lines(organization_id);
create index if not exists idx_erp_customer_return_lines_return on public.erp_customer_return_lines(return_id);
alter table public.erp_customer_return_lines enable row level security;

create policy erp_customer_return_lines_select on public.erp_customer_return_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_customer_return_lines_write on public.erp_customer_return_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_customer_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_customer_returns r where r.id = return_id and r.status = 'draft')
  );

-- confirm_erp_customer_return() : crée un mouvement 'customer_return' par
-- ligne (entrée de stock) et passe le retour "confirmed".
create or replace function public.confirm_erp_customer_return(
  p_organization_id uuid,
  p_return_id uuid
) returns public.erp_customer_returns
language plpgsql security definer set search_path = public as $$
declare
  v_return public.erp_customer_returns;
  v_line record;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','stock']::public.app_role[]) then
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
revoke all on function public.confirm_erp_customer_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_customer_return(uuid, uuid) to authenticated;

-- =============== erp_crm_activities (polymorphe customer/prospect,
-- entity_type + entity_id, pas de FK stricte des deux côtés — même pattern
-- que erp_document_attachments prévu module 8. Visibilité équipe complète,
-- pas privée par auteur, à la différence de erp_custom_reports module 9) ===============
create table if not exists public.erp_crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'prospect')),
  entity_id uuid not null,
  activity_type text not null check (activity_type in ('call', 'email', 'meeting', 'note', 'task')),
  content text,
  due_date timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_crm_activities_org on public.erp_crm_activities(organization_id);
create index if not exists idx_erp_crm_activities_entity on public.erp_crm_activities(entity_type, entity_id);
alter table public.erp_crm_activities enable row level security;

create policy erp_crm_activities_select on public.erp_crm_activities for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','salesperson']::public.app_role[]));
create policy erp_crm_activities_write on public.erp_crm_activities for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','salesperson']::public.app_role[]));
