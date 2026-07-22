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
do $$ begin create type public.support_ticket_status as enum ('open','in_progress','resolved','closed');
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
  suspended boolean not null default false,
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

-- Utilisé uniquement par shop_members_insert ci-dessous : encapsule la
-- lecture de shops dans une fonction security definer (comme has_shop_access
-- encapsule shop_members) pour éviter une dépendance circulaire — sans ça,
-- le check RLS sur shop_members_insert lirait shops via un subquery soumis
-- à shops_select (has_shop_access), qui exige lui-même un shop_members
-- déjà existant : le tout premier insert shop_members d'un nouveau
-- propriétaire serait alors systématiquement rejeté (bug corrigé migration 009).
create or replace function public.is_shop_owner(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops where id = _shop_id and owner_id = auth.uid());
$$;

-- Recherche d'utilisateur par email pour le flux d'invitation Équipe — ne
-- renvoie que l'UUID, rien d'autre de auth.users. Voir
-- db/migrations/004_find_user_by_email.sql pour le détail et les limites.
create or replace function public.find_user_id_by_email(_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$$;
revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to authenticated;

-- Accès Super Admin — indépendant de shop_members (pas lié à une
-- boutique). Aucun grant à "authenticated" sur cette table : gérée
-- uniquement via le SQL Editor, jamais depuis l'app.
create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.super_admins enable row level security;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- Lookup email pour l'écran Boutiques (Super Admin) — auth.users n'est
-- jamais exposé au client ; ne renvoie une ligne que si l'appelant est
-- super admin (vérifié dans la fonction, pas seulement via les grants).
create or replace function public.admin_get_user_emails(_user_ids uuid[])
returns table(user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select id, email from auth.users
  where id = any(_user_ids) and public.is_super_admin();
$$;
revoke all on function public.admin_get_user_emails(uuid[]) from public;
grant execute on function public.admin_get_user_emails(uuid[]) to authenticated;

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

-- products.supplier_id (Bloc 12) — ajoutée ici via alter (plutôt qu'inline
-- dans products plus haut) car suppliers n'existe qu'à partir d'ici dans ce
-- script cumulatif.
alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists idx_products_supplier on public.products(supplier_id);

-- Bons de commande (Bloc 12) — draft éditable, sent verrouillée (annulable),
-- received marque la réception en un bloc : crée les mouvements de stock
-- 'in' pour chaque ligne liée à un produit et met à jour products.cost au
-- dernier coût facturé. Pas de réception partielle ligne par ligne.
do $$ begin
  create type public.purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');
exception when duplicate_object then null; end $$;

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
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
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

-- Inscription atomique : remplace une séquence de 4 inserts client séparés
-- (shops, puis shop_members, puis subscriptions, puis shop_settings) par une
-- seule fonction security definer — tout réussit en une transaction, ou rien
-- n'est créé (rollback automatique sur exception). Voir migration 009 pour
-- le contexte complet (bug corrigé : la séquence client pouvait s'arrêter à
-- mi-chemin, laissant une boutique orpheline invisible pour son créateur).
create or replace function public.complete_signup(
  p_shop_name text,
  p_country text,
  p_currency text,
  p_shop_phone text,
  p_address text,
  p_owner_phone text default null
) returns public.shops
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shop public.shops;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  if exists (select 1 from public.shop_members where user_id = v_uid) then
    raise exception 'Ce compte est déjà rattaché à une boutique.';
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_shop_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.shops (name, slug, owner_id, country, currency, plan, trial_ends_at)
      values (trim(p_shop_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends)
      returning * into v_shop;
      exit;
    exception when unique_violation then
      null; -- collision de slug : on retente avec un nouveau suffixe aléatoire
    end;
  end loop;

  insert into public.shop_members (shop_id, user_id, role)
  values (v_shop.id, v_uid, 'owner');

  insert into public.subscriptions (shop_id, plan, status, amount, currency, current_period_end)
  values (v_shop.id, 'trial', 'trialing', 0, coalesce(p_currency, 'XOF'), v_trial_ends);

  insert into public.shop_settings (shop_id, data)
  values (v_shop.id, jsonb_build_object('phone', p_shop_phone, 'address', p_address));

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_shop;
end;
$$;

revoke all on function public.complete_signup(text, text, text, text, text, text) from public;
grant execute on function public.complete_signup(text, text, text, text, text, text) to authenticated;

-- Catalogue de formules, éditable depuis /admin/parametres, lu publiquement
-- par /tarifs (anon). id en text (slug) plutôt qu'uuid : shops.plan /
-- subscriptions.plan restent des colonnes texte libres (pas de FK ajoutée),
-- cohérent avec l'existant plutôt que de tout refaire.
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_month numeric(14,2) not null default 0,
  price_year numeric(14,2) not null default 0,
  currency text not null default 'XOF',
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_recommended boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.plans (id, name, price_month, price_year, features, limits, is_active, is_recommended, sort_order)
values
  ('starter', 'Starter', 9000, 86400,
    '["1 boutique","2 utilisateurs","Caisse + Produits + Stock","Assistance email"]'::jsonb,
    '{"shops":1,"users":2,"products":500}'::jsonb, true, false, 1),
  ('pro', 'Pro', 19000, 182400,
    '["3 boutiques","10 utilisateurs","Tous modules + Rapports avancés","Assistant IA (500 req/mois)","Support prioritaire"]'::jsonb,
    '{"shops":3,"users":10,"products":5000}'::jsonb, true, true, 2),
  ('business', 'Business', 39000, 374400,
    '["Boutiques illimitées","Utilisateurs illimités","IA illimitée + API","Support téléphonique 7j/7","Formation dédiée"]'::jsonb,
    '{"shops":"∞","users":"∞","products":"∞"}'::jsonb, true, false, 3)
on conflict (id) do nothing;

-- Journal d'audit "se connecter en tant que" — écrit uniquement par
-- l'Edge Function admin-impersonate (service role, contourne RLS).
create table if not exists public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_impersonations enable row level security;

-- Support : un ticket appartient à une boutique, créé par n'importe quel
-- membre ; les messages forment un fil append-only (pas d'update/delete,
-- même logique que le ledger stock_movements).
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status public.support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_shop on public.support_tickets(shop_id);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_ticket on public.support_messages(ticket_id);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

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
grant select, insert, update, delete on public.notifications   to authenticated;
grant select, insert, update, delete on public.subscriptions   to authenticated;
grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.shop_settings   to authenticated;
grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant select on public.admin_impersonations to authenticated;
grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
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
alter table public.notifications   enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.shop_settings   enable row level security;
alter table public.plans           enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select to authenticated
  using (public.has_shop_access(id));
drop policy if exists shops_insert on public.shops;
create policy shops_insert on public.shops for insert to authenticated
  with check (owner_id = auth.uid());
-- owner et manager peuvent modifier l'identité de la boutique (écran
-- Paramètres) ; shops_delete reste volontairement owner-only ci-dessous.
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update to authenticated
  using (public.has_any_role_in_shop(id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(id, array['owner','manager']::public.app_role[]));
drop policy if exists shops_delete on public.shops;
create policy shops_delete on public.shops for delete to authenticated
  using (public.has_role_in_shop(id, 'owner'));

-- Super Admin : accès complet à shops (liste, suspendre/prolonger,
-- supprimer), en plus des policies owner/manager ci-dessus.
drop policy if exists shops_select_admin on public.shops;
create policy shops_select_admin on public.shops for select to authenticated
  using (public.is_super_admin());
drop policy if exists shops_update_admin on public.shops;
create policy shops_update_admin on public.shops for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists shops_delete_admin on public.shops;
create policy shops_delete_admin on public.shops for delete to authenticated
  using (public.is_super_admin());

drop policy if exists profiles_all on public.profiles;
create policy profiles_all on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Lecture supplémentaire (OR avec profiles_all) : les coéquipiers d'une
-- même boutique peuvent voir le nom/téléphone les uns des autres (écran
-- Équipe) ; insert/update/delete restent strictement self-only ci-dessus.
drop policy if exists profiles_select_shopmates on public.profiles;
create policy profiles_select_shopmates on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.shop_members me
      join public.shop_members them on them.shop_id = me.shop_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
-- Super Admin : coordonnées du owner visibles depuis la fiche Boutique.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_super_admin());

drop policy if exists shop_members_select on public.shop_members;
create policy shop_members_select on public.shop_members for select to authenticated
  using (public.has_shop_access(shop_id));
drop policy if exists shop_members_insert on public.shop_members;
create policy shop_members_insert on public.shop_members for insert to authenticated
  with check (public.is_shop_owner(shop_id));
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

-- 3bis. purchase_orders / purchase_order_items — même matrice que products
-- (owner/manager/stock écrivent, accountant lit pour le suivi des coûts).
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
-- delete : owner/manager toujours, + un cashier sur SES PROPRES ventes
-- encore 'draft' (nécessaire pour reprendre/jeter un ticket en attente
-- depuis la Caisse — migration 013, corrige un bug du Bloc 8).
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (
    public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[])
    or (status = 'draft' and cashier_id = auth.uid() and public.has_role_in_shop(shop_id, 'cashier'))
  );

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
-- Super Admin : lecture cross-boutiques (Abonnements/Facturation).
drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin on public.subscriptions for select to authenticated
  using (public.is_super_admin());

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
-- Super Admin : lecture cross-boutiques (Abonnements/Facturation).
drop policy if exists subscription_payments_select_admin on public.subscription_payments;
create policy subscription_payments_select_admin on public.subscription_payments for select to authenticated
  using (public.is_super_admin());

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

-- 17. plans — lecture publique des formules actives (anon inclus, /tarifs),
-- gestion complète réservée au Super Admin.
drop policy if exists plans_select_public on public.plans;
create policy plans_select_public on public.plans for select to anon, authenticated
  using (is_active = true);
drop policy if exists plans_select_admin on public.plans;
create policy plans_select_admin on public.plans for select to authenticated
  using (public.is_super_admin());
drop policy if exists plans_insert_admin on public.plans;
create policy plans_insert_admin on public.plans for insert to authenticated
  with check (public.is_super_admin());
drop policy if exists plans_update_admin on public.plans;
create policy plans_update_admin on public.plans for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists plans_delete_admin on public.plans;
create policy plans_delete_admin on public.plans for delete to authenticated
  using (public.is_super_admin());

-- 18. admin_impersonations — journal d'audit, lecture Super Admin
-- uniquement ; écriture réservée à l'Edge Function (service role).
drop policy if exists admin_impersonations_select on public.admin_impersonations;
create policy admin_impersonations_select on public.admin_impersonations for select to authenticated
  using (public.is_super_admin());

-- 19. support_tickets — visible par la boutique concernée ou le Super
-- Admin ; création par tout membre ; statut réservé au Super Admin.
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (public.has_shop_access(shop_id) or public.is_super_admin());
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (public.has_shop_access(shop_id) and created_by = auth.uid());
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists support_tickets_delete_admin on public.support_tickets;
create policy support_tickets_delete_admin on public.support_tickets for delete to authenticated
  using (public.is_super_admin());

-- 20. support_messages — même visibilité que le ticket parent ; écriture
-- par les membres de la boutique du ticket ou le Super Admin ; aucune
-- update/delete (fil de discussion immuable).
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (public.has_shop_access(t.shop_id) or public.is_super_admin())
    )
  );
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (public.has_shop_access(t.shop_id) or public.is_super_admin())
    )
  );

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

-- Notifications réelles (migration 011) — vente importante, stock bas /
-- rupture, nouveau membre. Les événements "temps qui passe" (devis bientôt
-- expiré, essai qui expire) ne sont pas déclenchables par un trigger et
-- sont calculés côté client — voir la migration pour le détail.
create or replace function public.notify_big_sale()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_avg numeric;
  v_count int;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select count(*), avg(total) into v_count, v_avg
  from (
    select total from public.sales
    where shop_id = new.shop_id and status <> 'cancelled' and id <> new.id
    order by created_at desc limit 30
  ) recent;

  if v_count >= 5 and v_avg > 0 and new.total >= 2 * v_avg then
    insert into public.notifications (shop_id, title, body, kind)
    values (
      new.shop_id, 'Vente importante',
      'Une vente de ' || round(new.total)::text || ' FCFA vient d''être enregistrée (réf. ' || new.reference || ').',
      'big_sale'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_big_sale on public.sales;
create trigger trg_notify_big_sale
  after insert on public.sales
  for each row execute function public.notify_big_sale();

create or replace function public.notify_stock_level()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_threshold integer;
begin
  select name, low_stock_threshold into v_name, v_threshold
  from public.products where id = new.product_id;
  if v_name is null then
    return new;
  end if;

  if new.quantity <= 0 and (tg_op = 'INSERT' or old.quantity > 0) then
    insert into public.notifications (shop_id, title, body, kind)
    values (new.shop_id, 'Rupture de stock', v_name || ' est en rupture de stock.', 'stock_out');
  elsif new.quantity <= v_threshold and (tg_op = 'INSERT' or old.quantity > v_threshold) then
    insert into public.notifications (shop_id, title, body, kind)
    values (new.shop_id, 'Stock bas', v_name || ' passe sous le seuil d''alerte (' || new.quantity || ').', 'stock_low');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_stock_level on public.stock_levels;
create trigger trg_notify_stock_level
  after insert or update of quantity on public.stock_levels
  for each row execute function public.notify_stock_level();

create or replace function public.notify_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.role = 'owner' then
    return new;
  end if;

  select full_name into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (shop_id, title, body, kind)
  values (
    new.shop_id, 'Nouveau membre',
    coalesce(v_name, 'Un nouveau membre') || ' a rejoint l''équipe (' || new.role || ').',
    'new_member'
  );
  return new;
end $$;

drop trigger if exists trg_notify_new_member on public.shop_members;
create trigger trg_notify_new_member
  after insert on public.shop_members
  for each row execute function public.notify_new_member();

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

-- Bucket pour les images produit (migration 012) : même principe, public
-- en lecture, écriture restreinte aux rôles pouvant déjà écrire sur
-- `products` (owner/manager/stock). Convention de chemin obligatoire côté
-- client : {shop_id}/{product_id}.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_select on storage.objects;
create policy product_images_select on storage.objects for select
  using (bucket_id = 'product-images');
drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  )
  with check (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );

-- =============== FIN ===============
-- Rappel: RLS activé sur les 25 tables (19 + super_admins, plans,
-- admin_impersonations, support_tickets, support_messages).
-- Aucune policy USING (true) — seule "plans" a une lecture ouverte à
-- "anon" (formules publiques), volontairement et limitée à is_active=true.
-- Permissions différenciées par app_role sur 14 des 15 tables métier
-- (notifications reste ouverte à tout membre ; stock_levels est en lecture
-- seule pour tous — voir db/AUDIT-SECURITE.md pour la matrice complète).
-- Super Admin (is_super_admin()) : accès étendu strictement limité à
-- shops, subscriptions, subscription_payments, profiles, plans,
-- admin_impersonations, support_tickets, support_messages — jamais aux
-- données opérationnelles des boutiques (sales/stock/customers/etc.).
