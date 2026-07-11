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

do $$
declare t text;
begin
  foreach t in array array[
    'categories','products','suppliers','customers',
    'stock_levels','stock_movements','sales','sale_items',
    'payments','quotes','quote_items','expenses',
    'promotions','notifications','subscriptions','shop_settings'
  ] loop
    execute format('drop policy if exists %I_tenant_all on public.%I', t, t);
    execute format($f$
      create policy %I_tenant_all on public.%I
      for all to authenticated
      using (public.has_shop_access(shop_id))
      with check (public.has_shop_access(shop_id))
    $f$, t, t);
  end loop;
end $$;

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

-- =============== FIN ===============
-- Rappel: RLS activé sur les 19 tables. Aucune policy USING (true).
