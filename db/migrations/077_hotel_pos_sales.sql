-- Migration 077 — POS ZegHotel (paiement immédiat, sans note de séjour) :
-- post_hotel_pos_charge() (migration 033) ne couvre que la facturation sur
-- une note ouverte (client déjà en séjour) — aucune voie pour un
-- passant/client de passage qui paie tout de suite (bar/restaurant/piscine
-- côté hôtel). hotel_pos_sales journalise ces ventes, indépendante de
-- `sales` (ZegCaisse) — tables préfixées par app, jamais de collision
-- (voir CLAUDE.md, convention de nommage). create_hotel_pos_sale() est le
-- pendant immédiat de post_hotel_pos_charge() : même garde-fou
-- anti-survente via stock_movements/apply_stock_movement().
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create table if not exists public.hotel_pos_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'cash',
  paid numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_pos_sales_org on public.hotel_pos_sales(organization_id);
alter table public.hotel_pos_sales enable row level security;

-- Même permission que le POS interne existant (post_hotel_pos_charge) —
-- un seul module 'hotel_pos_interne' couvre les deux voies (facturé sur
-- note vs payé tout de suite), pas une distinction pertinente pour qui a
-- le droit de vendre.
create policy hotel_pos_sales_select on public.hotel_pos_sales for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_pos_interne', 'view'));
create policy hotel_pos_sales_insert on public.hotel_pos_sales for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_pos_interne', 'create'));

create or replace function public.create_hotel_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_payment_method public.payment_method,
  p_paid numeric
) returns public.hotel_pos_sales
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_unit_price numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_reference text;
  v_sale public.hotel_pos_sales;
begin
  if not public.has_module_permission(p_organization_id, 'hotel_pos_interne', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Aucun article à vendre.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;
  v_total := greatest(0, v_subtotal - coalesce(p_discount, 0));

  v_reference := 'HP-' || to_char(now(), 'YYMMDD') || '-' || substr(md5(random()::text), 1, 4);

  insert into public.hotel_pos_sales (organization_id, reference, items, subtotal, discount, total, payment_method, paid, created_by)
  values (p_organization_id, v_reference, p_items, v_subtotal, coalesce(p_discount, 0), v_total, p_payment_method, coalesce(p_paid, v_total), auth.uid())
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_product_id is not null then
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, reference, created_by)
      values (p_organization_id, v_product_id, 'sale', v_quantity, 'POS ZegHotel', v_reference, auth.uid());
    end if;
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.create_hotel_pos_sale(uuid, jsonb, numeric, public.payment_method, numeric) from public;
grant execute on function public.create_hotel_pos_sale(uuid, jsonb, numeric, public.payment_method, numeric) to authenticated;
