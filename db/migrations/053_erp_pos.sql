-- Migration 053 — ZegERP, module 4/10 : POS ERP. Présentée pour relecture
-- — NE PAS exécuter automatiquement. À exécuter après 052.
--
-- Aucune migration d'enum préalable nécessaire : le rôle `cashier` existe
-- déjà (réutilisé, même sémantique que côté caisse ZegCaisse — voir
-- ARCHITECTURE_ERP.md, "Rôles ZegERP"), et les mouvements de stock générés
-- réutilisent 'sale'/'customer_return' (déjà ajoutés migration 051, module
-- 3) — une vente comptoir décrémente le stock exactement comme une
-- livraison, seul le canal diffère.
--
-- Isolation : ces tables sont 100% indépendantes des tables POS ZegCaisse
-- (sales/payments) même si conceptuellement proches — même principe que le
-- reste de ZegERP.

-- =============== erp_cash_sessions ===============
create table if not exists public.erp_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_amount numeric(14,2) not null default 0,
  closing_amount numeric(14,2),
  notes text,
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz
);
create index if not exists idx_erp_cash_sessions_org on public.erp_cash_sessions(organization_id);
alter table public.erp_cash_sessions enable row level security;

create policy erp_cash_sessions_select on public.erp_cash_sessions for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','cashier']::public.app_role[]));
create policy erp_cash_sessions_insert on public.erp_cash_sessions for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
-- Fermeture (renseigner closing_amount/closed_by/closed_at) : pas de
-- mouvement de stock associé à la fermeture elle-même, une simple policy
-- update suffit (contrairement aux confirmations goods_receipt/delivery/
-- pos_sale qui passent par RPC).
create policy erp_cash_sessions_update on public.erp_cash_sessions for update to authenticated
  using (status = 'open' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));

-- =============== erp_pos_sales + erp_pos_sale_lines ===============
create table if not exists public.erp_pos_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_session_id uuid not null references public.erp_cash_sessions(id) on delete restrict,
  customer_id uuid references public.erp_customers(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  payment_method public.erp_payment_method not null default 'cash',
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_erp_pos_sales_org on public.erp_pos_sales(organization_id);
create index if not exists idx_erp_pos_sales_session on public.erp_pos_sales(cash_session_id);
alter table public.erp_pos_sales enable row level security;

create policy erp_pos_sales_select on public.erp_pos_sales for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','cashier']::public.app_role[]));
create policy erp_pos_sales_insert on public.erp_pos_sales for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
-- Comme les commandes/livraisons : la finalisation (qui crée les
-- mouvements de stock) passe exclusivement par complete_erp_pos_sale(),
-- jamais par une écriture directe de `status`. Une vente 'draft' reste
-- éditable/annulable librement (aucun impact stock tant que non complétée).
create policy erp_pos_sales_update_draft on public.erp_pos_sales for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]))
  with check (status in ('draft', 'cancelled') and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy erp_pos_sales_delete on public.erp_pos_sales for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));

-- returned_quantity jamais modifiée directement : incrémentée
-- exclusivement par confirm_erp_pos_return() (security definer) — même
-- pattern que received_quantity/delivered_quantity (modules 2/3).
create table if not exists public.erp_pos_sale_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.erp_pos_sales(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  returned_quantity numeric(14,3) not null default 0,
  check (returned_quantity >= 0 and returned_quantity <= quantity)
);
create index if not exists idx_erp_pos_sale_lines_org on public.erp_pos_sale_lines(organization_id);
create index if not exists idx_erp_pos_sale_lines_sale on public.erp_pos_sale_lines(sale_id);
alter table public.erp_pos_sale_lines enable row level security;

create policy erp_pos_sale_lines_select on public.erp_pos_sale_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','cashier']::public.app_role[]));
create policy erp_pos_sale_lines_write on public.erp_pos_sale_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[])
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[])
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  );

-- complete_erp_pos_sale() : crée un mouvement 'sale' par ligne (warehouse
-- repris de la session de caisse, coût repris de erp_products.cost — même
-- snapshot COGS approximatif V1 que confirm_erp_delivery()), recalcule
-- total_amount à partir des lignes (jamais fait confiance à une valeur
-- envoyée par le client), passe la vente "completed". Bloque si la session
-- de caisse n'est plus ouverte.
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
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','cashier']::public.app_role[]) then
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
revoke all on function public.complete_erp_pos_sale(uuid, uuid) from public;
grant execute on function public.complete_erp_pos_sale(uuid, uuid) to authenticated;

-- =============== erp_pos_returns + erp_pos_return_lines ===============
create table if not exists public.erp_pos_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.erp_pos_sales(id) on delete restrict,
  cash_session_id uuid not null references public.erp_cash_sessions(id) on delete restrict,
  reason text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_pos_returns_org on public.erp_pos_returns(organization_id);
create index if not exists idx_erp_pos_returns_sale on public.erp_pos_returns(sale_id);
alter table public.erp_pos_returns enable row level security;

create policy erp_pos_returns_select on public.erp_pos_returns for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','cashier']::public.app_role[]));
create policy erp_pos_returns_insert on public.erp_pos_returns for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy erp_pos_returns_update on public.erp_pos_returns for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy erp_pos_returns_delete on public.erp_pos_returns for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));

create table if not exists public.erp_pos_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.erp_pos_returns(id) on delete cascade,
  sale_line_id uuid not null references public.erp_pos_sale_lines(id) on delete restrict,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_pos_return_lines_org on public.erp_pos_return_lines(organization_id);
create index if not exists idx_erp_pos_return_lines_return on public.erp_pos_return_lines(return_id);
alter table public.erp_pos_return_lines enable row level security;

create policy erp_pos_return_lines_select on public.erp_pos_return_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','cashier']::public.app_role[]));
create policy erp_pos_return_lines_write on public.erp_pos_return_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[])
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[])
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  );

-- confirm_erp_pos_return() : crée un mouvement 'customer_return' par ligne
-- (entrée de stock, warehouse repris de la session de caisse du retour),
-- incrémente returned_quantity sur la ligne de vente (bloque le
-- sur-retour), passe le retour "confirmed".
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
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','cashier']::public.app_role[]) then
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
revoke all on function public.confirm_erp_pos_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_pos_return(uuid, uuid) to authenticated;
