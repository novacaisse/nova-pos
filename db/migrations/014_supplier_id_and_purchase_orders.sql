-- Bloc 12 (Fournisseurs / Rapports) : lie les produits à leur fournisseur
-- et remplace les bons de commande de démonstration (db/mock/suppliers.ts)
-- par un vrai système purchase_orders / purchase_order_items.

alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists idx_products_supplier on public.products(supplier_id);

do $$ begin
  create type public.purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');
exception when duplicate_object then null; end $$;

-- draft : encore modifiable librement. sent : commande transmise au
-- fournisseur, verrouillée (annulable mais plus éditable ligne par ligne
-- dans cette version). received : marque la commande reçue en une fois —
-- crée les mouvements de stock 'in' pour chaque ligne liée à un produit et
-- met à jour products.cost au dernier coût facturé (pas de réception
-- partielle ligne par ligne dans cette version, pour rester simple).
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  reference text not null,
  status public.purchase_order_status not null default 'draft',
  expected_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, reference)
);
create index if not exists idx_po_shop on public.purchase_orders(shop_id);
create index if not exists idx_po_supplier on public.purchase_orders(supplier_id);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0
);
create index if not exists idx_poi_po on public.purchase_order_items(purchase_order_id);

grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- purchase_orders — même matrice que products (owner/manager/stock
-- écrivent, accountant lit pour le suivi des coûts).
drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock','accountant']::public.app_role[]));
drop policy if exists purchase_orders_insert on public.purchase_orders;
create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists purchase_orders_update on public.purchase_orders;
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists purchase_orders_delete on public.purchase_orders;
create policy purchase_orders_delete on public.purchase_orders for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

drop policy if exists purchase_order_items_select on public.purchase_order_items;
create policy purchase_order_items_select on public.purchase_order_items for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock','accountant']::public.app_role[]));
drop policy if exists purchase_order_items_insert on public.purchase_order_items;
create policy purchase_order_items_insert on public.purchase_order_items for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists purchase_order_items_update on public.purchase_order_items;
create policy purchase_order_items_update on public.purchase_order_items for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
drop policy if exists purchase_order_items_delete on public.purchase_order_items;
create policy purchase_order_items_delete on public.purchase_order_items for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','stock']::public.app_role[]));
