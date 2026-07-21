-- =====================================================================
-- NovaCaisse — Schéma initial multi-tenant
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase externe.
-- Règle absolue: RLS ON partout, filtrage par shop_id via has_shop_access().
-- =====================================================================

create extension if not exists "pgcrypto";

-- =============== ENUMS ===============
do $$ begin create type public.app_role as enum ('owner','manager','cashier','stock','accountant');
exception when duplicate_object then null; end $$;
do $$ begin create type public.sale_status as enum ('draft','completed','refunded','partially_refunded','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('cash','mobile_money','card','credit','mixed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.stock_movement_type as enum ('in','out','adjustment','transfer','sale','return');
exception when duplicate_object then null; end $$;
do $$ begin create type public.quote_status as enum ('draft','sent','accepted','refused','converted','expired');
exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum ('trialing','active','past_due','canceled','expired');
exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_payment_status as enum ('pending','paid','failed','refunded');
exception when duplicate_object then null; end $$;

-- =============== TABLES ===============
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'XOF',
  country text not null default 'CI',
  logo_url text,
  plan text not null default 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'cashier',
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index if not exists idx_shop_members_user on public.shop_members(user_id);
create index if not exists idx_shop_members_shop on public.shop_members(shop_id);

-- =============== FONCTIONS SECURITY DEFINER ===============
create or replace function public.has_shop_access(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members
    where shop_id = _shop_id and user_id = auth.uid());
$$;

create or replace function public.current_user_shops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.shop_members where user_id = auth.uid();
$$;

create or replace function public.has_role_in_shop(_shop_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members
    where shop_id = _shop_id and user_id = auth.uid() and role = _role);
$$;

create or replace function public.has_any_role_in_shop(_shop_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members
    where shop_id = _shop_id and user_id = auth.uid() and role = any(_roles));
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null, color text,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_shop on public.categories(shop_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text, barcode text, name text not null, description text,
  price numeric(14,2) not null default 0, cost numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, unit text default 'pcs',
  image_url text, is_active boolean not null default true,
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now(),
  unique (shop_id, sku)
);
create index if not exists idx_products_shop on public.products(shop_id);
create index if not exists idx_products_barcode on public.products(shop_id, barcode);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null, contact text, email text, phone text, address text, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppliers_shop on public.suppliers(shop_id);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null, email text, phone text, address text,
  loyalty_points integer not null default 0,
  credit_balance numeric(14,2) not null default 0, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_shop on public.customers(shop_id);

create table if not exists public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (shop_id, product_id)
);
create index if not exists idx_stock_shop on public.stock_levels(shop_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type public.stock_movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2), reason text, reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stockmov_shop on public.stock_movements(shop_id);
create index if not exists idx_stockmov_product on public.stock_movements(product_id);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  status public.sale_status not null default 'completed',
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0, change_due numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'cash',
  notes text, created_at timestamptz not null default now(),
  unique (shop_id, reference)
);
create index if not exists idx_sales_shop on public.sales(shop_id);
create index if not exists idx_sales_created on public.sales(shop_id, created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null, discount numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, total numeric(14,2) not null
);
create index if not exists idx_saleitems_sale on public.sale_items(sale_id);
create index if not exists idx_saleitems_shop on public.sale_items(shop_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method public.payment_method not null, amount numeric(14,2) not null,
  reference text, created_at timestamptz not null default now()
);
create index if not exists idx_payments_shop on public.payments(shop_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.quote_status not null default 'draft',
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  valid_until date,
  converted_sale_id uuid references public.sales(id) on delete set null,
  notes text, created_at timestamptz not null default now(),
  unique (shop_id, reference)
);
create index if not exists idx_quotes_shop on public.quotes(shop_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null, discount numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, total numeric(14,2) not null
);
create index if not exists idx_quoteitems_shop on public.quote_items(shop_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category text, label text not null, amount numeric(14,2) not null,
  paid_at date not null default current_date,
  method public.payment_method, notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_shop on public.expenses(shop_id);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null, kind text not null,
  value numeric(14,2) not null default 0,
  product_id uuid references public.products(id) on delete cascade,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_promos_shop on public.promotions(shop_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null, body text, kind text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_notif_shop on public.notifications(shop_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan text not null,
  status public.subscription_status not null default 'trialing',
  amount numeric(14,2) not null default 0, currency text not null default 'XOF',
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  provider text default 'moneyfusion', provider_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_subs_shop on public.subscriptions(shop_id);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'XOF',
  method public.payment_method not null default 'mobile_money',
  status public.subscription_payment_status not null default 'pending',
  provider text default 'moneyfusion', provider_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sub_payments_shop on public.subscription_payments(shop_id);
create index if not exists idx_sub_payments_subscription on public.subscription_payments(subscription_id);

create table if not exists public.shop_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  receipt_header text, receipt_footer text, receipt_logo_url text,
  tax_included boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =============== GRANTS (obligatoires pour la Data API PostgREST) ===============
grant select, insert, update, delete on public.shops           to authenticated;
grant select, insert, update, delete on public.profiles        to authenticated;
grant select, insert, update, delete on public.shop_members    to authenticated;
grant select, insert, update, delete on public.categories      to authenticated;
grant select, insert, update, delete on public.products        to authenticated;
grant select, insert, update, delete on public.suppliers       to authenticated;
grant select, insert, update, delete on public.customers       to authenticated;
grant select, insert, update, delete on public.stock_levels    to authenticated;
grant select, insert, update, delete on public.stock_movements to authenticated;
grant select, insert, update, delete on public.sales           to authenticated;
grant select, insert, update, delete on public.sale_items      to authenticated;
grant select, insert, update, delete on public.payments        to authenticated;
grant select, insert, update, delete on public.quotes          to authenticated;
grant select, insert, update, delete on public.quote_items     to authenticated;
grant select, insert, update, delete on public.expenses        to authenticated;
grant select, insert, update, delete on public.promotions      to authenticated;
grant select, insert, update, delete on public.notifications   to authenticated;
grant select, insert, update, delete on public.subscriptions   to authenticated;
grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.shop_settings   to authenticated;
grant all on all tables in schema public to service_role;

-- =============== RLS ===============
alter table public.shops           enable row level security;
alter table public.profiles        enable row level security;
alter table public.shop_members    enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.suppliers       enable row level security;
alter table public.customers       enable row level security;
alter table public.stock_levels    enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.payments        enable row level security;
alter table public.quotes          enable row level security;
alter table public.quote_items     enable row level security;
alter table public.expenses        enable row level security;
alter table public.promotions      enable row level security;
alter table public.notifications   enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.shop_settings   enable row level security;

drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select to authenticated
  using (public.has_shop_access(id));
drop policy if exists shops_insert on public.shops;
create policy shops_insert on public.shops for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update to authenticated
  using (public.has_role_in_shop(id, 'owner'))
  with check (public.has_role_in_shop(id, 'owner'));
drop policy if exists shops_delete on public.shops;
create policy shops_delete on public.shops for delete to authenticated
  using (public.has_role_in_shop(id, 'owner'));

drop policy if exists profiles_all on public.profiles;
create policy profiles_all on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists shop_members_select on public.shop_members;
create policy shop_members_select on public.shop_members for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists shop_members_insert on public.shop_members;
create policy shop_members_insert on public.shop_members for insert to authenticated
  with check (
    exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid())
  );
drop policy if exists shop_members_update on public.shop_members;
create policy shop_members_update on public.shop_members for update to authenticated
  using (public.has_role_in_shop(shop_id, 'owner'))
  with check (public.has_role_in_shop(shop_id, 'owner'));
drop policy if exists shop_members_delete on public.shop_members;
create policy shop_members_delete on public.shop_members for delete to authenticated
  using (public.has_role_in_shop(shop_id, 'owner'));

-- notifications : pas de donnée financière/stock/vente sensible — accès
-- complet à tout membre de la boutique sur ses propres notifications.
drop policy if exists notifications_tenant_all on public.notifications;
create policy notifications_tenant_all on public.notifications
  for all to authenticated
  using (public.has_shop_access(shop_id))
  with check (public.has_shop_access(shop_id));

-- Les 15 autres tables métier ont des policies différenciées par rôle
-- (app_role) plutôt qu'un accès CRUD uniforme à tout membre de la
-- boutique. Voir db/AUDIT-SECURITE.md pour la matrice de permissions
-- complète et sa justification métier.

-- 1. categories — lecture pour tous, écriture réservée à owner/manager/stock
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

-- 2. products — lecture pour tous, écriture réservée à owner/manager/stock
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

-- 3. suppliers — lecture owner/manager/stock/accountant, écriture owner/manager
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

-- 4. customers — lecture owner/manager/cashier/accountant, écriture (create/update)
--    owner/manager/cashier, suppression réservée à owner/manager
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

-- 5. stock_levels — lecture pour tous ; AUCUNE écriture directe pour personne
--    (y compris owner/manager) : mutée uniquement par le trigger
--    apply_stock_movement() (security definer, contourne RLS). Toute
--    correction doit passer par un stock_movements de type 'adjustment'.
drop policy if exists stock_levels_select on public.stock_levels;
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (public.has_shop_access(shop_id));

-- 6. stock_movements — lecture pour tous ; insert large pour owner/manager/
--    stock, restreint pour cashier aux mouvements 'sale'/'return' (générés
--    par la caisse) ; aucune update/delete pour personne (ledger immuable).
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

-- 7. sales — lecture owner/manager/cashier/accountant, création
--    owner/manager/cashier, modification/suppression owner/manager
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

-- 8. sale_items — même matrice que sales
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

-- 9. payments — même logique que sales
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

-- 10. quotes — lecture owner/manager/cashier/accountant, création
--     owner/manager/cashier, modification/suppression owner/manager
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

-- 11. quote_items — même matrice que quotes
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

-- 12. expenses — réservées à owner/manager/accountant, jamais cashier ni stock
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

-- 13. promotions — lecture owner/manager/cashier/accountant, écriture owner/manager
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

-- 15. subscriptions — données de facturation : lecture owner/manager/
--     accountant, écriture réservée à owner/manager
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

-- 15bis. subscription_payments — même matrice que subscriptions
drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists subscription_payments_write on public.subscription_payments;
create policy subscription_payments_write on public.subscription_payments for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscription_payments_update on public.subscription_payments;
create policy subscription_payments_update on public.subscription_payments for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscription_payments_delete on public.subscription_payments;
create policy subscription_payments_delete on public.subscription_payments for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- 16. shop_settings — lecture pour tous, écriture réservée à owner/manager
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

-- =============== TRIGGERS ===============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'return' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'sale' then -new.quantity
    when 'transfer' then -new.quantity
    else 0
  end;
  insert into public.stock_levels (shop_id, product_id, quantity)
  values (new.shop_id, new.product_id, delta)
  on conflict (shop_id, product_id)
  do update set quantity = public.stock_levels.quantity + delta, updated_at = now();
  return new;
end $$;

drop trigger if exists trg_stock_mov on public.stock_movements;
create trigger trg_stock_mov
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- =============== STORAGE ===============
-- Bucket pour le logo boutique : public en lecture (affiché sur tickets et
-- reçus), écriture restreinte à owner/manager de la boutique propriétaire
-- du chemin. Convention de chemin obligatoire côté client : {shop_id}/<fichier>.
insert into storage.buckets (id, name, public)
values ('shop-logos', 'shop-logos', true)
on conflict (id) do nothing;

drop policy if exists shop_logos_select on storage.objects;
create policy shop_logos_select on storage.objects for select
  using (bucket_id = 'shop-logos');
drop policy if exists shop_logos_insert on storage.objects;
create policy shop_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_update on storage.objects;
create policy shop_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  )
  with check (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_delete on storage.objects;
create policy shop_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );

-- =============== FIN ===============
-- Rappel: RLS activé sur les 20 tables (19 + subscription_payments).
-- Aucune policy USING (true).
-- Permissions différenciées par app_role sur 15 des 16 tables métier
-- (notifications reste ouverte à tout membre ; stock_levels est en lecture
-- seule pour tous — voir db/AUDIT-SECURITE.md pour la matrice complète).
