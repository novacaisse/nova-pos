-- =====================================================================
-- NovaCaisse — Schéma initial multi-tenant
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase externe.
-- Règle absolue: RLS ON partout, filtrage par organization_id via has_organization_access().
-- =====================================================================

create extension if not exists "pgcrypto";

-- =============== ENUMS ===============
-- front_desk/housekeeping (migration 020f, ZegHotel) — owner/manager/accountant
-- sont partagés entre ZegCaisse et ZegHotel, cashier/stock restent spécifiques
-- ZegCaisse. Une instance fraîche crée directement l'enum complet ; une
-- instance existante doit passer par ALTER TYPE ... ADD VALUE (020f), qui ne
-- peut pas être exécuté dans la même transaction qu'un usage de la nouvelle
-- valeur — voir 020f_hotel_roles.sql.
do $$ begin create type public.app_role as enum ('owner','manager','cashier','stock','accountant','front_desk','housekeeping');
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
-- Restructuration compte/établissements (migrations 021/022) : accounts
-- (1 par propriétaire) regroupe les établissements d'un même compte,
-- account_subscriptions (1 par app_module actif) porte l'abonnement réel
-- au niveau du compte + de l'application — organizations.plan/trial_ends_at
-- et la table subscriptions restent en place pour compat (lus par
-- useReadOnlyMode/trial.ts, cf. commentaires plus bas) mais ne sont plus la
-- source de vérité pour le gating de modules ni les limites d'établissements/
-- utilisateurs.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id)
);
create index if not exists idx_accounts_owner on public.accounts(owner_id);

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- Migration 036 (ZegResto) : 'resto' ajouté aux deux valeurs d'origine.
  -- Migration 047 (ZegERP) : 'erp' ajouté.
  app_module text not null check (app_module in ('pos', 'hotel', 'resto', 'erp')),
  -- Pas de FK vers plans(id) : comme subscriptions.plan existant, cette
  -- colonne vaut aussi 'trial' pendant la période d'essai, une valeur qui
  -- n'existe pas comme ligne dans plans (seules les formules payantes
  -- starter/pro/business y sont définies).
  plan_id text not null,
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, app_module)
);
create index if not exists idx_account_subs_account on public.account_subscriptions(account_id);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  currency text not null default 'XOF',
  country text not null default 'CI',
  logo_url text,
  plan text not null default 'trial',
  trial_ends_at timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  -- Applications ZegOS actives ('pos' = ZegCaisse) — informatif seulement
  -- désormais, supersede par app_module ci-dessous (migration 020c ; une
  -- seule application par établissement depuis la restructuration
  -- compte/établissements, jamais les deux à la fois).
  active_apps jsonb not null default '["pos"]'::jsonb,
  -- Application unique de cet établissement — 'pos' ou 'hotel' — jamais
  -- modifiable après création (restructuration compte/établissements).
  -- account_id regroupe les établissements d'un même compte, éventuellement
  -- sur des applications différentes (un compte peut avoir des boutiques
  -- ZegCaisse ET un établissement ZegHotel).
  -- Migration 036 (ZegResto) : 'resto' ajouté aux deux valeurs d'origine.
  -- Migration 047 (ZegERP) : 'erp' ajouté.
  app_module text not null check (app_module in ('pos', 'hotel', 'resto', 'erp'))
);
create index if not exists idx_organizations_account on public.organizations(account_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, avatar_url text, address text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'cashier',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_shop_members_user on public.organization_members(user_id);
create index if not exists idx_shop_members_shop on public.organization_members(organization_id);

-- =============== FONCTIONS SECURITY DEFINER ===============
-- Exclut une organisation suspendue (migration 025) : organizations.suspended
-- n'avait auparavant aucun effet RLS, seulement un blocage côté SPA
-- (app.tsx) — un appel direct à l'API avec une session déjà active
-- continuait à tout lire/écrire normalement. Cette fonction (et
-- has_role_in_organization/has_any_role_in_organization ci-dessous)
-- gouverne la quasi-totalité des policies RLS métier : la patcher ici
-- suffit à propager le blocage partout. Seule exception : shops_select
-- (plus bas) n'utilise PAS cette fonction, pour que la ligne organizations
-- d'un établissement suspendu reste visible à ses propres membres (sinon
-- l'écran "Compte suspendu", qui a besoin de la lire, ne s'afficherait
-- jamais).
create or replace function public.has_organization_access(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = _shop_id and m.user_id = auth.uid() and not o.suspended
  );
$$;

create or replace function public.current_user_organizations()
returns setof uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.has_role_in_organization(_shop_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = _shop_id and m.user_id = auth.uid() and m.role = _role and not o.suspended
  );
$$;

create or replace function public.has_any_role_in_organization(_shop_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = _shop_id and m.user_id = auth.uid() and m.role = any(_roles) and not o.suspended
  );
$$;

-- Utilisé uniquement par shop_members_insert ci-dessous : encapsule la
-- lecture de organizations dans une fonction security definer (comme has_organization_access
-- encapsule organization_members) pour éviter une dépendance circulaire — sans ça,
-- le check RLS sur shop_members_insert lirait organizations via un subquery soumis
-- à shops_select (has_organization_access), qui exige lui-même un organization_members
-- déjà existant : le tout premier insert organization_members d'un nouveau
-- propriétaire serait alors systématiquement rejeté (bug corrigé migration 009).
create or replace function public.is_organization_owner(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = _shop_id and owner_id = auth.uid());
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
-- create-team-member (Bloc 14, service role) rattache un compte existant
-- via cette fonction.
grant execute on function public.find_user_id_by_email(text) to service_role;

-- Accès Super Admin — indépendant de organization_members (pas lié à une
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

create or replace function public.is_account_owner(_account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.accounts where id = _account_id and owner_id = auth.uid());
$$;

-- Lecture par tous les membres d'au moins une organisation du compte —
-- cohérent avec le principe déjà appliqué dans useReadOnlyMode (statut
-- d'abonnement visible par tous, écriture réservée au propriétaire).
create or replace function public.is_account_member(_account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_account_owner(_account_id) or exists (
    select 1 from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where o.account_id = _account_id and m.user_id = auth.uid()
  );
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
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, color text,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_shop on public.categories(organization_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text, barcode text, name text not null, description text,
  price numeric(14,2) not null default 0, cost numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, unit text default 'pcs',
  image_url text, is_active boolean not null default true,
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index if not exists idx_products_shop on public.products(organization_id);
create index if not exists idx_products_barcode on public.products(organization_id, barcode);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, contact text, email text, phone text, address text, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppliers_shop on public.suppliers(organization_id);

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
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  reference text not null,
  status public.purchase_order_status not null default 'draft',
  expected_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists idx_po_shop on public.purchase_orders(organization_id);
create index if not exists idx_po_supplier on public.purchase_orders(supplier_id);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
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
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, email text, phone text, address text,
  loyalty_points integer not null default 0,
  credit_balance numeric(14,2) not null default 0, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_shop on public.customers(organization_id);

create table if not exists public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id)
);
create index if not exists idx_stock_shop on public.stock_levels(organization_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type public.stock_movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2), reason text, reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stockmov_shop on public.stock_movements(organization_id);
create index if not exists idx_stockmov_product on public.stock_movements(product_id);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  status public.sale_status not null default 'completed',
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0, change_due numeric(14,2) not null default 0,
  payment_method public.payment_method not null default 'cash',
  notes text, created_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists idx_sales_shop on public.sales(organization_id);
create index if not exists idx_sales_created on public.sales(organization_id, created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null, discount numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, total numeric(14,2) not null
);
create index if not exists idx_saleitems_sale on public.sale_items(sale_id);
create index if not exists idx_saleitems_shop on public.sale_items(organization_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method public.payment_method not null, amount numeric(14,2) not null,
  reference text, created_at timestamptz not null default now()
);
create index if not exists idx_payments_shop on public.payments(organization_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.quote_status not null default 'draft',
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  valid_until date,
  converted_sale_id uuid references public.sales(id) on delete set null,
  notes text, created_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists idx_quotes_shop on public.quotes(organization_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null, discount numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0, total numeric(14,2) not null
);
create index if not exists idx_quoteitems_shop on public.quote_items(organization_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text, label text not null, amount numeric(14,2) not null,
  paid_at date not null default current_date,
  -- text libre, pas l'enum payment_method des ventes : les moyens de
  -- paiement d'une dépense (virement, chèque...) n'ont rien à voir avec
  -- ceux d'une vente (migration 017).
  method text, notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_shop on public.expenses(organization_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null, body text, kind text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_notif_shop on public.notifications(organization_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan text not null,
  status public.subscription_status not null default 'trialing',
  amount numeric(14,2) not null default 0, currency text not null default 'XOF',
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  provider text default 'moneyfusion', provider_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_subs_shop on public.subscriptions(organization_id);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
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
create index if not exists idx_sub_payments_shop on public.subscription_payments(organization_id);
create index if not exists idx_sub_payments_subscription on public.subscription_payments(subscription_id);

-- Validation manuelle d'un paiement par le Super Admin (migration 020e) —
-- filet de sécurité si la vérification automatique MoneyFusion (Edge
-- Function check-subscription-payment) reste bloquée. Même logique que
-- la branche paid/failed de verifyAndApplyPayment côté Deno
-- (supabase/functions/_shared/moneyfusion.ts) — y compris la mise à jour de
-- account_subscriptions (Phase 6/migration 023 : cette fonction avait le
-- même angle mort qu'avant le correctif Phase 5, jamais synchronisée avec
-- le compte + app_module, seulement organizations/subscriptions).
create or replace function public.admin_set_payment_status(p_payment_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.subscription_payments;
  v_period_days integer;
  v_current_period_end timestamptz;
  v_plan_id text;
  v_organization public.organizations;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;
  if p_status not in ('paid', 'failed') then
    raise exception 'Statut invalide : % (attendu paid ou failed).', p_status;
  end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;

  if p_status = 'failed' then
    update public.subscription_payments set status = 'failed' where id = p_payment_id;
    return;
  end if;

  update public.subscription_payments
  set status = 'paid', paid_at = now()
  where id = p_payment_id;

  v_plan_id := v_payment.metadata ->> 'plan_id';
  v_period_days := case when v_payment.metadata ->> 'period' = 'year' then 365 else 30 end;
  v_current_period_end := now() + (v_period_days || ' days')::interval;

  if v_plan_id is not null then
    update public.subscriptions
    set status = 'active', plan = v_plan_id, current_period_end = v_current_period_end
    where id = v_payment.subscription_id;

    update public.organizations set plan = v_plan_id where id = v_payment.organization_id;

    select * into v_organization from public.organizations where id = v_payment.organization_id;
    if found and v_organization.account_id is not null then
      insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at, current_period_end)
      values (v_organization.account_id, v_organization.app_module, v_plan_id, 'active', null, v_current_period_end)
      on conflict (account_id, app_module) do update
        set plan_id = excluded.plan_id, status = excluded.status,
            trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
            updated_at = now();
    end if;
  end if;
end;
$$;
revoke all on function public.admin_set_payment_status(uuid, text) from public;
grant execute on function public.admin_set_payment_status(uuid, text) to authenticated;

-- Changement de formule forcé par le Super Admin (Boutiques) — security
-- definer plutôt qu'écriture directe depuis le client (migration 023) :
-- les policies RLS de subscriptions n'autorisent qu'owner/manager de LA
-- boutique concernée, jamais is_super_admin(), donc une écriture client
-- échouait/no-opait silencieusement. Écrit aussi account_subscriptions —
-- même angle mort que ci-dessus.
create or replace function public.admin_change_organization_plan(p_organization_id uuid, p_plan text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_organization public.organizations;
  v_price numeric;
  v_currency text;
  v_period_end timestamptz := now() + interval '30 days';
  v_existing_sub_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;

  select * into v_organization from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'Organisation introuvable.';
  end if;

  update public.organizations
  set plan = p_plan, trial_ends_at = case when p_plan = 'trial' then trial_ends_at else null end
  where id = p_organization_id;

  if p_plan <> 'trial' then
    select price_month, currency into v_price, v_currency from public.plans where id = p_plan;

    select id into v_existing_sub_id from public.subscriptions
    where organization_id = p_organization_id order by created_at desc limit 1;

    if v_existing_sub_id is not null then
      update public.subscriptions
      set plan = p_plan, status = 'active', amount = coalesce(v_price, 0), currency = coalesce(v_currency, 'XOF'),
          current_period_end = v_period_end
      where id = v_existing_sub_id;
    else
      insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end, started_at)
      values (p_organization_id, p_plan, 'active', coalesce(v_price, 0), coalesce(v_currency, 'XOF'), v_period_end, now());
    end if;

    if v_organization.account_id is not null then
      insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at, current_period_end)
      values (v_organization.account_id, v_organization.app_module, p_plan, 'active', null, v_period_end)
      on conflict (account_id, app_module) do update
        set plan_id = excluded.plan_id, status = excluded.status,
            trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
            updated_at = now();
    end if;
  end if;
end;
$$;
revoke all on function public.admin_change_organization_plan(uuid, text) from public;
grant execute on function public.admin_change_organization_plan(uuid, text) to authenticated;

-- Prolongation d'essai forcée par le Super Admin (Boutiques) — même
-- raisonnement que ci-dessus (migration 023).
create or replace function public.admin_extend_trial(p_organization_id uuid, p_days integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_organization public.organizations;
  v_base timestamptz;
  v_new timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;

  select * into v_organization from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'Organisation introuvable.';
  end if;

  v_base := case when v_organization.trial_ends_at is not null and v_organization.trial_ends_at > now()
    then v_organization.trial_ends_at else now() end;
  v_new := v_base + (p_days || ' days')::interval;

  update public.organizations set trial_ends_at = v_new, plan = 'trial' where id = p_organization_id;

  if v_organization.account_id is not null then
    insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at)
    values (v_organization.account_id, v_organization.app_module, 'trial', 'trialing', v_new)
    on conflict (account_id, app_module) do update
      set plan_id = 'trial', status = 'trialing', trial_ends_at = excluded.trial_ends_at, updated_at = now();
  end if;
end;
$$;
revoke all on function public.admin_extend_trial(uuid, integer) from public;
grant execute on function public.admin_extend_trial(uuid, integer) to authenticated;

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  receipt_header text, receipt_footer text, receipt_logo_url text,
  tax_included boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Création d'organisation atomique : une seule fonction security definer
-- pour organizations + organization_members + subscriptions +
-- organization_settings — tout réussit en une transaction, ou rien n'est
-- créé (rollback automatique sur exception). Voir migration 009 pour
-- l'historique (bug corrigé : une séquence de 4 inserts client séparés
-- pouvait s'arrêter à mi-chemin, laissant une boutique orpheline).
-- Migration 061 : une organisation supplémentaire hérite désormais du plan
-- payé actif du compte pour cette app_module s'il existe (jamais un essai),
-- ou partage la même échéance d'essai que le compte plutôt que de démarrer
-- un nouveau délai de 3 jours (fermeture d'une faille de prolongation
-- d'essai par création de boutique).
-- provision_organization (migration 020d) remplace complete_signup() et
-- create_additional_shop() : distinction devenue artificielle une fois la
-- création de compte séparée de la création d'organisation (nouveau
-- parcours d'inscription — choix d'application ZegOS puis configuration).
-- p_app est stocké dans organizations.active_apps (colonne ajoutée par
-- 020c) — 'pos' pour ZegCaisse aujourd'hui. Logique préservée pour les
-- deux cas : 1ère organisation du compte (aucune vérification de limite,
-- comme l'ancien complete_signup) vs organisations suivantes (respecte
-- plans.limits.shops — clé JSON encore nommée ainsi, donnée et non
-- schéma, jamais renommée par 020a/020c/020d — comme le faisait déjà
-- l'ancien create_additional_shop).
create or replace function public.provision_organization(
  p_app text,
  p_name text,
  p_country text,
  p_currency text default 'XOF',
  p_phone text default null,
  p_address text default null,
  p_owner_phone text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_est_count integer;
  v_plan_id text;
  v_max_establishments integer;
  v_organization public.organizations;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
  v_acct_sub public.account_subscriptions%rowtype;
  v_org_plan text;
  v_org_trial_ends timestamptz;
  -- Migration 072 : text auto-caste jamais implicitement vers un enum à
  -- l'insertion (contrairement à un littéral de chaîne, résolu par le
  -- contexte) — déclarée directement dans le type cible pour éviter le
  -- même bug ("column status is of type subscription_status...").
  v_sub_status public.subscription_status;
  v_sub_amount numeric;
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  if exists (select 1 from public.organizations where owner_id = v_uid and suspended) then
    raise exception 'Compte suspendu : contactez le support avant de créer un nouvel établissement.';
  end if;

  insert into public.accounts (owner_id, name) values (v_uid, trim(p_name))
  on conflict (owner_id) do nothing
  returning id into v_account_id;
  if v_account_id is null then
    select id into v_account_id from public.accounts where owner_id = v_uid;
  end if;

  select count(*) into v_est_count from public.organizations
  where account_id = v_account_id and app_module = p_app;

  select * into v_acct_sub from public.account_subscriptions
  where account_id = v_account_id and app_module = p_app;

  if v_est_count > 0 and v_acct_sub.plan_id is not null then
    v_plan_id := v_acct_sub.plan_id;
    select max_establishments into v_max_establishments from public.plans where id = v_plan_id;
    if v_max_establishments is not null and v_est_count >= v_max_establishments then
      raise exception 'Limite d''établissements atteinte pour votre formule (% maximum). Passez à une formule supérieure pour en ajouter.', v_max_establishments;
    end if;
  end if;

  if v_acct_sub.account_id is not null and v_acct_sub.status = 'active' then
    -- Abonnement payé déjà actif pour ce couple compte/app : la nouvelle
    -- organisation en hérite directement, jamais un essai.
    v_org_plan := v_acct_sub.plan_id;
    v_org_trial_ends := null;
    v_sub_status := 'active';
    select price_month into v_sub_amount from public.plans where id = v_acct_sub.plan_id;
  elsif v_acct_sub.account_id is not null then
    -- Essai déjà en cours pour ce couple compte/app : la nouvelle
    -- organisation partage la MÊME échéance, jamais un nouveau délai de 3
    -- jours (sinon créer une boutique permettrait de prolonger l'essai
    -- indéfiniment).
    v_org_plan := 'trial';
    v_org_trial_ends := v_acct_sub.trial_ends_at;
    v_sub_status := 'trialing';
    v_sub_amount := 0;
  else
    -- Aucun abonnement pour ce couple compte/app : 1er établissement de
    -- cette app sur ce compte, comportement d'origine (nouvel essai de 3
    -- jours).
    v_org_plan := 'trial';
    v_org_trial_ends := v_trial_ends;
    v_sub_status := 'trialing';
    v_sub_amount := 0;
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at, active_apps, account_id, app_module)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), v_org_plan, v_org_trial_ends, jsonb_build_array(p_app), v_account_id, p_app)
      returning * into v_organization;
      exit;
    exception when unique_violation then
      null; -- collision de slug : on retente avec un nouveau suffixe aléatoire
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, v_uid, 'owner');

  insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end)
  values (v_organization.id, v_org_plan, v_sub_status, coalesce(v_sub_amount, 0), coalesce(p_currency, 'XOF'), coalesce(v_acct_sub.current_period_end, v_org_trial_ends));

  insert into public.organization_settings (organization_id, data)
  values (v_organization.id, jsonb_build_object('phone', p_phone, 'address', p_address));

  insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at)
  values (v_account_id, p_app, 'trial', 'trialing', v_trial_ends)
  on conflict (account_id, app_module) do nothing;

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_organization;
end;
$$;

revoke all on function public.provision_organization(text, text, text, text, text, text, text) from public;
grant execute on function public.provision_organization(text, text, text, text, text, text, text) to authenticated;

-- add_sale_payment (migration 024) : atomique (set paid = paid + p_amount
-- sous le verrou de ligne de l'UPDATE) — remplace un calcul client
-- (sale.paid + amount) qui perdait un paiement sur deux lorsque deux
-- règlements complémentaires arrivaient à quelques instants d'écart sur la
-- même vente à crédit. Security invoker (pas definer) : les policies RLS
-- existantes sur sales/payments s'appliquent normalement.
create or replace function public.add_sale_payment(p_sale_id uuid, p_amount numeric, p_method public.payment_method)
returns public.sales
language plpgsql as $$
declare
  v_organization_id uuid;
  v_sale public.sales;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  select organization_id into v_organization_id from public.sales where id = p_sale_id;
  if v_organization_id is null then
    raise exception 'Vente introuvable.';
  end if;

  insert into public.payments (organization_id, sale_id, method, amount)
  values (v_organization_id, p_sale_id, case when p_method = 'mixed' then 'cash' else p_method end, p_amount);

  update public.sales
  set paid = paid + p_amount,
      change_due = greatest(0, (paid + p_amount) - total)
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.add_sale_payment(uuid, numeric, public.payment_method) from public;
grant execute on function public.add_sale_payment(uuid, numeric, public.payment_method) to authenticated;

-- Catalogue de formules, éditable depuis /admin/parametres, lu publiquement
-- par /tarifs (anon). id en text (slug) plutôt qu'uuid : organizations.plan /
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
  created_at timestamptz not null default now(),
  -- Restructuration compte/établissements (Phase 3, saisies depuis
  -- /admin/formules) : app_module distingue une formule ZegCaisse d'une
  -- formule ZegHotel (deux catalogues distincts, jamais interchangeables) ;
  -- max_establishments/max_users bornent le compte (account_subscriptions)
  -- pour cette app. null = illimité / non assignée, jamais saisi en dur.
  app_module text,
  max_establishments integer,
  max_users integer
);
do $$ begin
  -- Migration 047 (ZegERP) : 'erp' ajouté.
  alter table public.plans add constraint plans_app_module_check check (app_module is null or app_module in ('pos', 'hotel', 'resto', 'erp'));
exception when duplicate_object then null;
end $$;

insert into public.plans (id, name, price_month, price_year, features, limits, is_active, is_recommended, sort_order)
values
  ('starter', 'Starter', 9000, 86400,
    '["1 boutique","2 utilisateurs","Caisse + Produits + Stock","Assistance email"]'::jsonb,
    '{"organizations":1,"users":2,"products":500}'::jsonb, true, false, 1),
  ('pro', 'Pro', 19000, 182400,
    '["3 boutiques","10 utilisateurs","Tous modules + Rapports avancés","Assistant IA (500 req/mois)","Support prioritaire"]'::jsonb,
    '{"organizations":3,"users":10,"products":5000}'::jsonb, true, true, 2),
  ('business', 'Business', 39000, 374400,
    '["Boutiques illimitées","Utilisateurs illimités","IA illimitée + API","Support téléphonique 7j/7","Formation dédiée"]'::jsonb,
    '{"organizations":"∞","users":"∞","products":"∞"}'::jsonb, true, false, 3)
on conflict (id) do nothing;

-- Journal d'audit "se connecter en tant que" — écrit uniquement par
-- l'Edge Function admin-impersonate (service role, contourne RLS).
create table if not exists public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_impersonations enable row level security;

-- Support : un ticket appartient à une boutique, créé par n'importe quel
-- membre ; les messages forment un fil append-only (pas d'update/delete,
-- même logique que le ledger stock_movements).
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status public.support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_shop on public.support_tickets(organization_id);

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

-- Branding global de la plateforme (migration 019) : table singleton (une
-- seule ligne, id fixé à true) — logo/favicon affichés sur les pages
-- publiques/boutique, distinct de organizations.logo_url (propre à chaque boutique).
create table if not exists public.app_settings (
  id boolean primary key default true,
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;
alter table public.app_settings enable row level security;

-- =============== GRANTS (obligatoires pour la Data API PostgREST) ===============
grant select, insert, update, delete on public.accounts               to authenticated;
grant select, insert, update, delete on public.account_subscriptions  to authenticated;
grant select, insert, update, delete on public.organizations           to authenticated;
grant select, insert, update, delete on public.profiles        to authenticated;
grant select, insert, update, delete on public.organization_members    to authenticated;
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
grant select, insert, update, delete on public.organization_settings   to authenticated;
grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant select on public.admin_impersonations to authenticated;
grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;
grant all on all tables in schema public to service_role;

-- =============== RLS ===============
alter table public.accounts                enable row level security;
alter table public.account_subscriptions   enable row level security;
alter table public.organizations           enable row level security;
alter table public.profiles        enable row level security;
alter table public.organization_members    enable row level security;
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
alter table public.organization_settings   enable row level security;
alter table public.plans           enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_account_member(id));
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts for delete to authenticated
  using (owner_id = auth.uid());
-- Super Admin : lecture cross-comptes (même principe que shops_select_admin).
drop policy if exists accounts_select_admin on public.accounts;
create policy accounts_select_admin on public.accounts for select to authenticated
  using (public.is_super_admin());

drop policy if exists account_subscriptions_select on public.account_subscriptions;
create policy account_subscriptions_select on public.account_subscriptions for select to authenticated
  using (public.is_account_member(account_id));
drop policy if exists account_subscriptions_insert on public.account_subscriptions;
create policy account_subscriptions_insert on public.account_subscriptions for insert to authenticated
  with check (public.is_account_owner(account_id));
drop policy if exists account_subscriptions_update on public.account_subscriptions;
create policy account_subscriptions_update on public.account_subscriptions for update to authenticated
  using (public.is_account_owner(account_id)) with check (public.is_account_owner(account_id));
drop policy if exists account_subscriptions_delete on public.account_subscriptions;
create policy account_subscriptions_delete on public.account_subscriptions for delete to authenticated
  using (public.is_account_owner(account_id));
-- Super Admin : lecture cross-comptes (Abonnements/Facturation, Phase 3).
drop policy if exists account_subscriptions_select_admin on public.account_subscriptions;
create policy account_subscriptions_select_admin on public.account_subscriptions for select to authenticated
  using (public.is_super_admin());

-- shops_select : vérification d'appartenance inline, volontairement SANS le
-- filtre "not suspended" présent dans has_organization_access (migration
-- 025) — sinon la ligne organizations d'un établissement suspendu
-- deviendrait invisible à ses propres membres, cassant l'écran "Compte
-- suspendu" (qui a besoin de lire organizations.suspended/name pour
-- s'afficher) au lieu de l'afficher. shops_update/shops_delete restent
-- régies par has_any_role_in_organization/has_role_in_organization
-- ci-dessous, donc bien bloquées pour une organisation suspendue.
drop policy if exists shops_select on public.organizations;
create policy shops_select on public.organizations for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id and m.user_id = auth.uid()
    )
  );
drop policy if exists shops_insert on public.organizations;
create policy shops_insert on public.organizations for insert to authenticated
  with check (owner_id = auth.uid());
-- owner et manager peuvent modifier l'identité de la boutique (écran
-- Paramètres) ; shops_delete reste volontairement owner-only ci-dessous.
drop policy if exists shops_update on public.organizations;
create policy shops_update on public.organizations for update to authenticated
  using (public.has_any_role_in_organization(id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(id, array['owner','manager']::public.app_role[]));
drop policy if exists shops_delete on public.organizations;
create policy shops_delete on public.organizations for delete to authenticated
  using (public.has_role_in_organization(id, 'owner'));

-- Super Admin : accès complet à organizations (liste, suspendre/prolonger,
-- supprimer), en plus des policies owner/manager ci-dessus.
drop policy if exists shops_select_admin on public.organizations;
create policy shops_select_admin on public.organizations for select to authenticated
  using (public.is_super_admin());
drop policy if exists shops_update_admin on public.organizations;
create policy shops_update_admin on public.organizations for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists shops_delete_admin on public.organizations;
create policy shops_delete_admin on public.organizations for delete to authenticated
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
      select 1 from public.organization_members me
      join public.organization_members them on them.organization_id = me.organization_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
-- Super Admin : coordonnées du owner visibles depuis la fiche Boutique.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_super_admin());

drop policy if exists shop_members_select on public.organization_members;
create policy shop_members_select on public.organization_members for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists shop_members_insert on public.organization_members;
create policy shop_members_insert on public.organization_members for insert to authenticated
  with check (public.is_organization_owner(organization_id));
drop policy if exists shop_members_update on public.organization_members;
create policy shop_members_update on public.organization_members for update to authenticated
  using (public.has_role_in_organization(organization_id, 'owner'))
  with check (public.has_role_in_organization(organization_id, 'owner'));
drop policy if exists shop_members_delete on public.organization_members;
create policy shop_members_delete on public.organization_members for delete to authenticated
  using (public.has_role_in_organization(organization_id, 'owner'));

-- notifications : pas de donnée financière/stock/vente sensible — accès
-- complet à tout membre de la boutique sur ses propres notifications.
drop policy if exists notifications_tenant_all on public.notifications;
create policy notifications_tenant_all on public.notifications
  for all to authenticated
  using (public.has_organization_access(organization_id))
  with check (public.has_organization_access(organization_id));

-- =============== Rôles personnalisés (migration 063) — schéma +
-- has_module_permission(). organization_members.role (l'enum app_role)
-- reste la seule source de vérité pour qui est owner/manager (gestion de
-- l'équipe elle-même, ci-dessus, jamais déléguée à un rôle personnalisé —
-- risque d'escalade de privilèges). Les modules métier ci-dessous
-- (produits, ventes, etc.) peuvent en revanche être gouvernés soit par le
-- rôle de base (repli via default_role_permissions, comportement actuel
-- inchangé), soit par un rôle personnalisé créé par le owner
-- (organization_members.custom_role_id). Voir migration 063 pour le détail
-- du modèle view/create/manage. ===============
create table if not exists public.permission_modules (
  key text primary key,
  app_module text not null,
  label text not null,
  open_view boolean not null default false,
  sort_order int not null default 0
);
insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('produits',     'pos', 'Produits',      true,  1),
  ('stock',        'pos', 'Stock',         true,  2),
  ('fournisseurs', 'pos', 'Fournisseurs',  false, 3),
  ('clients',      'pos', 'Clients',       false, 4),
  ('ventes',       'pos', 'Ventes / POS',  false, 5),
  ('devis',        'pos', 'Devis',         false, 6),
  ('reservations', 'pos', 'Réservations',  false, 7),
  ('depenses',     'pos', 'Dépenses',      false, 8),
  ('rapports',     'pos', 'Rapports',      false, 9),
  ('abonnement',   'pos', 'Abonnement',    false, 10),
  ('parametres',   'pos', 'Paramètres',    true,  11),
  -- Modules ZegHotel (migration 066, Phase D-1)
  ('hotel_reservations', 'hotel', 'Réservations',     false, 1),
  ('hotel_folios',       'hotel', 'Notes de séjour',  false, 2),
  ('hotel_payments',     'hotel', 'Paiements séjour', false, 3),
  ('hotel_rooms',        'hotel', 'Chambres',         true,  4),
  ('hotel_housekeeping', 'hotel', 'Housekeeping',     false, 5),
  ('hotel_maintenance',  'hotel', 'Maintenance',      true,  6),
  ('hotel_clients',      'hotel', 'Clients',          false, 7),
  ('hotel_corporate',    'hotel', 'Comptes entreprise', false, 8),
  ('hotel_pos_interne',  'hotel', 'Point de vente interne', false, 9),
  ('hotel_rapports',     'hotel', 'Rapports',         false, 10),
  ('hotel_canaux',       'hotel', 'Canaux de distribution', false, 11),
  ('hotel_parametres',   'hotel', 'Paramètres',       true,  12),
  -- Modules ZegResto (migration 068, Phase D-2)
  ('resto_salle',        'resto', 'Salle',                true,  1),
  ('resto_commandes',    'resto', 'Commandes',            true,  2),
  ('resto_cuisine',      'resto', 'Cuisine (KDS)',        true,  3),
  ('resto_menu',         'resto', 'Menu',                 true,  4),
  ('resto_recettes',     'resto', 'Recettes',             false, 5),
  ('resto_reservations', 'resto', 'Réservations',         false, 6),
  ('resto_facturation',  'resto', 'Facturation',          false, 7),
  ('resto_paiements',    'resto', 'Paiements',            false, 8),
  ('resto_fidelite',     'resto', 'Fidélité',             false, 9),
  ('resto_rapports',     'resto', 'Rapports',             false, 10),
  ('resto_parametres',   'resto', 'Paramètres',           true,  11),
  -- Modules ZegERP (migration 070, Phase D-3)
  ('erp_produits',              'erp', 'Produits',                true,  1),
  ('erp_stock',                 'erp', 'Stock',                   false, 2),
  ('erp_achats',                'erp', 'Achats',                  false, 3),
  ('erp_factures_fournisseurs', 'erp', 'Factures fournisseurs',   false, 4),
  ('erp_receptions',            'erp', 'Réceptions',              false, 5),
  ('erp_ventes',                'erp', 'Ventes & CRM',            false, 6),
  ('erp_facturation_ventes',    'erp', 'Facturation client',      false, 7),
  ('erp_retours_clients',       'erp', 'Retours client',          false, 8),
  ('erp_pos',                   'erp', 'POS ERP',                 false, 9),
  ('erp_finance',                'erp', 'Finance',                 false, 10),
  ('erp_comptabilite',          'erp', 'Comptabilité',            false, 11),
  ('erp_rh',                    'erp', 'RH',                      false, 12),
  ('erp_documents',             'erp', 'Gestion documentaire',    false, 13),
  ('erp_rapports',              'erp', 'Rapports & BI',           false, 14),
  ('erp_parametres',            'erp', 'Paramètres',              false, 15)
on conflict (key) do nothing;

create table if not exists public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index if not exists idx_organization_roles_org on public.organization_roles(organization_id);

create table if not exists public.organization_role_permissions (
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  module_key text not null references public.permission_modules(key),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_manage boolean not null default false,
  primary key (role_id, module_key)
);

alter table public.organization_members add column if not exists custom_role_id uuid references public.organization_roles(id) on delete set null;

alter table public.organization_roles enable row level security;
alter table public.organization_role_permissions enable row level security;

create policy organization_roles_select on public.organization_roles for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy organization_roles_write on public.organization_roles for all to authenticated
  using (public.has_role_in_organization(organization_id, 'owner'))
  with check (public.has_role_in_organization(organization_id, 'owner'));

create policy organization_role_permissions_select on public.organization_role_permissions for select to authenticated
  using (exists (
    select 1 from public.organization_roles r
    where r.id = organization_role_permissions.role_id
      and public.has_any_role_in_organization(r.organization_id, array['owner','manager']::public.app_role[])
  ));
create policy organization_role_permissions_write on public.organization_role_permissions for all to authenticated
  using (exists (
    select 1 from public.organization_roles r
    where r.id = organization_role_permissions.role_id
      and public.has_role_in_organization(r.organization_id, 'owner')
  ))
  with check (exists (
    select 1 from public.organization_roles r
    where r.id = organization_role_permissions.role_id
      and public.has_role_in_organization(r.organization_id, 'owner')
  ));

create table if not exists public.default_role_permissions (
  role public.app_role not null,
  module_key text not null references public.permission_modules(key),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_manage boolean not null default false,
  primary key (role, module_key)
);

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'pos'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cashier', 'clients', true, true, false),
  ('cashier', 'ventes', true, true, false),
  ('cashier', 'devis', true, true, false),
  ('cashier', 'reservations', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('stock', 'produits', true, true, true),
  ('stock', 'fournisseurs', true, true, false),
  ('stock', 'stock', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'fournisseurs', true, false, false),
  ('accountant', 'clients', true, false, false),
  ('accountant', 'ventes', true, false, false),
  ('accountant', 'devis', true, false, false),
  ('accountant', 'reservations', true, false, false),
  ('accountant', 'depenses', true, true, true),
  ('accountant', 'rapports', true, false, false),
  ('accountant', 'abonnement', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('owner', 'rapports', true, true, true),
  ('manager', 'rapports', true, true, true)
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- ZegHotel (migration 066, Phase D-1) — owner/manager : accès complet.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'hotel'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('front_desk', 'hotel_reservations', true, true, true),
  ('front_desk', 'hotel_folios', true, true, true),
  ('front_desk', 'hotel_payments', true, true, false),
  ('front_desk', 'hotel_housekeeping', true, true, true),
  ('front_desk', 'hotel_maintenance', true, true, false),
  ('front_desk', 'hotel_clients', true, true, true),
  ('front_desk', 'hotel_corporate', true, false, false),
  ('front_desk', 'hotel_pos_interne', true, true, false),
  ('front_desk', 'hotel_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('housekeeping', 'hotel_housekeeping', true, false, true),
  ('housekeeping', 'hotel_maintenance', true, true, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'hotel_reservations', true, false, false),
  ('accountant', 'hotel_folios', true, false, false),
  ('accountant', 'hotel_payments', true, false, false),
  ('accountant', 'hotel_corporate', true, false, false),
  ('accountant', 'hotel_maintenance', true, false, false),
  ('accountant', 'hotel_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- ZegResto (migration 068, Phase D-2) — owner/manager : accès complet.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'resto'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'resto_recettes', true, false, false),
  ('accountant', 'resto_reservations', true, false, false),
  ('accountant', 'resto_facturation', true, false, false),
  ('accountant', 'resto_paiements', true, false, false),
  ('accountant', 'resto_fidelite', true, false, false),
  ('accountant', 'resto_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('server', 'resto_commandes', true, true, true),
  ('server', 'resto_reservations', true, true, true),
  ('server', 'resto_facturation', true, true, true),
  ('server', 'resto_paiements', true, true, false),
  ('server', 'resto_fidelite', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cook', 'resto_cuisine', true, false, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- ZegERP (migration 070, Phase D-3) — owner/manager : accès complet.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'erp'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('stock', 'erp_produits', true, true, true),
  ('stock', 'erp_stock', true, true, true),
  ('stock', 'erp_receptions', true, true, true),
  ('stock', 'erp_retours_clients', true, true, true),
  ('stock', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('buyer', 'erp_achats', true, true, true),
  ('buyer', 'erp_factures_fournisseurs', true, true, true),
  ('buyer', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('salesperson', 'erp_ventes', true, true, true),
  ('salesperson', 'erp_facturation_ventes', true, true, true),
  ('salesperson', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('hr_manager', 'erp_rh', true, true, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cashier', 'erp_pos', true, true, true),
  ('cashier', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'erp_stock', true, false, false),
  ('accountant', 'erp_achats', true, false, false),
  ('accountant', 'erp_factures_fournisseurs', true, true, true),
  ('accountant', 'erp_receptions', true, false, false),
  ('accountant', 'erp_ventes', true, false, false),
  ('accountant', 'erp_facturation_ventes', true, true, true),
  ('accountant', 'erp_retours_clients', true, false, false),
  ('accountant', 'erp_pos', true, false, false),
  ('accountant', 'erp_finance', true, true, true),
  ('accountant', 'erp_comptabilite', true, true, true),
  ('accountant', 'erp_documents', true, true, true),
  ('accountant', 'erp_rapports', true, false, false),
  ('accountant', 'erp_parametres', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

create or replace function public.has_module_permission(_org_id uuid, _module_key text, _level text default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_custom_role_id uuid;
  v_legacy_role public.app_role;
  v_open_view boolean;
  v_can boolean;
begin
  if not exists (
    select 1 from public.organizations o where o.id = _org_id and not o.suspended
  ) then
    return false;
  end if;

  select custom_role_id, role into v_custom_role_id, v_legacy_role
  from public.organization_members
  where organization_id = _org_id and user_id = auth.uid();

  if v_legacy_role is null then
    return false;
  end if;

  if _level = 'view' then
    select open_view into v_open_view from public.permission_modules where key = _module_key;
    if coalesce(v_open_view, false) then
      return true;
    end if;
  end if;

  if v_custom_role_id is not null then
    select case _level
      when 'create' then can_create
      when 'manage' then can_manage
      else can_view
    end into v_can
    from public.organization_role_permissions
    where role_id = v_custom_role_id and module_key = _module_key;
    return coalesce(v_can, false);
  end if;

  select case _level
    when 'create' then can_create
    when 'manage' then can_manage
    else can_view
  end into v_can
  from public.default_role_permissions
  where role = v_legacy_role and module_key = _module_key;
  return coalesce(v_can, false);
end;
$$;
revoke all on function public.has_module_permission(uuid, text, text) from public;
grant execute on function public.has_module_permission(uuid, text, text) to authenticated;

-- Raccourci de confort pour l'UI (migration 065) : récupère en un seul
-- appel les permissions de l'utilisateur courant sur tous les modules
-- d'une organisation, plutôt que 33 appels scalaires à
-- has_module_permission(). RLS reste la seule barrière réelle.
create or replace function public.my_module_permissions(p_organization_id uuid)
returns table (module_key text, can_view boolean, can_create boolean, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select m.key,
    public.has_module_permission(p_organization_id, m.key, 'view'),
    public.has_module_permission(p_organization_id, m.key, 'create'),
    public.has_module_permission(p_organization_id, m.key, 'manage')
  from public.permission_modules m
  where m.app_module = (select app_module from public.organizations where id = p_organization_id);
$$;
revoke all on function public.my_module_permissions(uuid) from public;
grant execute on function public.my_module_permissions(uuid) to authenticated;

-- Les 15 autres tables métier ont des policies différenciées par rôle
-- (app_role) plutôt qu'un accès CRUD uniforme à tout membre de la
-- boutique. Voir db/AUDIT-SECURITE.md pour la matrice de permissions
-- complète et sa justification métier.

-- 1. categories — lecture pour tous, écriture réservée à owner/manager/stock
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (public.has_organization_access(organization_id));
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

-- 2. products — lecture pour tous, écriture réservée à owner/manager/stock
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (public.has_organization_access(organization_id));
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

-- 3. suppliers — lecture owner/manager/stock/accountant, écriture owner/manager
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

-- 3bis. purchase_orders / purchase_order_items — même matrice que products
-- (owner/manager/stock écrivent, accountant lit pour le suivi des coûts).
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

-- 4. customers — lecture owner/manager/cashier/accountant, écriture (create/update)
--    owner/manager/cashier, suppression réservée à owner/manager
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

-- 5. stock_levels — lecture pour tous ; AUCUNE écriture directe pour personne
--    (y compris owner/manager) : mutée uniquement par le trigger
--    apply_stock_movement() (security definer, contourne RLS). Toute
--    correction doit passer par un stock_movements de type 'adjustment'.
drop policy if exists stock_levels_select on public.stock_levels;
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (public.has_organization_access(organization_id));

-- 6. stock_movements — lecture pour tous ; insert large pour owner/manager/
--    stock, restreint pour cashier aux mouvements 'sale'/'return' (générés
--    par la caisse) ; aucune update/delete pour personne (ledger immuable).
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists stock_movements_insert_full on public.stock_movements;
create policy stock_movements_insert_full on public.stock_movements for insert to authenticated
  with check (public.has_module_permission(organization_id, 'stock', 'create'));
drop policy if exists stock_movements_insert_cashier on public.stock_movements;
create policy stock_movements_insert_cashier on public.stock_movements for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'ventes', 'create')
    and type in ('sale','return')
  );

-- 7. sales — lecture owner/manager/cashier/accountant, création
--    owner/manager/cashier, modification/suppression owner/manager
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
-- delete : permission 'ventes.manage' toujours, + un cashier sur SES
-- PROPRES ventes encore 'draft' (nécessaire pour reprendre/jeter un
-- ticket en attente depuis la Caisse — migration 013, corrige un bug du
-- Bloc 8 — carve-out préservé tel quel, migration 064).
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (
    public.has_module_permission(organization_id, 'ventes', 'manage')
    or (status = 'draft' and cashier_id = auth.uid() and public.has_role_in_organization(organization_id, 'cashier'))
  );

-- 8. sale_items — même matrice que sales
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

-- 9. payments — même logique que sales
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

-- 10. quotes — lecture owner/manager/cashier/accountant, création
--     owner/manager/cashier, modification/suppression owner/manager
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

-- 11. quote_items — même matrice que quotes
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

-- 12. expenses — réservées à owner/manager/accountant, jamais cashier ni stock
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

-- 15. subscriptions — données de facturation : lecture owner/manager/
--     accountant, écriture réservée à owner/manager
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
-- Super Admin : lecture cross-boutiques (Abonnements/Facturation).
drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin on public.subscriptions for select to authenticated
  using (public.is_super_admin());

-- 15bis. subscription_payments — même matrice que subscriptions
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
-- Super Admin : lecture cross-boutiques (Abonnements/Facturation).
drop policy if exists subscription_payments_select_admin on public.subscription_payments;
create policy subscription_payments_select_admin on public.subscription_payments for select to authenticated
  using (public.is_super_admin());

-- 16. organization_settings — lecture pour tous, écriture réservée à owner/manager
drop policy if exists shop_settings_select on public.organization_settings;
create policy shop_settings_select on public.organization_settings for select to authenticated
  using (public.has_organization_access(organization_id));
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
  using (public.has_organization_access(organization_id) or public.is_super_admin());
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (public.has_organization_access(organization_id) and created_by = auth.uid());
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
      where t.id = ticket_id and (public.has_organization_access(t.organization_id) or public.is_super_admin())
    )
  );
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (public.has_organization_access(t.organization_id) or public.is_super_admin())
    )
  );

-- 21. app_settings — lecture publique (anon inclus : landing, connexion,
-- inscription avant authentification), écriture réservée au Super Admin.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to anon, authenticated
  using (true);
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- =============== TRIGGERS ===============
-- Migration 075 : lit aussi raw_user_meta_data->>'phone' (passé par
-- signUp() comme full_name) — "Téléphone personnel" est collecté à
-- l'inscription, pas dans la configuration d'organisation qui suit.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garde-fou anti-survente (migration 026) : seuls 'sale'/'out'/'transfer'
-- représentent une sortie réelle de stock (marchandise qui quitte le
-- contrôle de la boutique) — bloqués si le niveau résultant serait
-- négatif. 'adjustment' reste volontairement non gardé : correction
-- manuelle explicite (inventaire physique), pas une opération commerciale.
-- Migration 073 : le garde-fou reste total pour 'out'/'transfer', mais
-- devient conditionnel pour 'sale' — organization_settings.data.allow_oversell
-- (Paramètres ZegCaisse) permet de vendre en rupture, stock résultant négatif.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
  v_allow_oversell boolean;
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
  insert into public.stock_levels (organization_id, product_id, quantity)
  values (new.organization_id, new.product_id, delta)
  on conflict (organization_id, product_id)
  do update set quantity = public.stock_levels.quantity + delta, updated_at = now()
  returning quantity into v_new_qty;

  if new.type in ('sale', 'out', 'transfer') and v_new_qty < 0 then
    if new.type = 'sale' then
      select coalesce((data->>'allow_oversell')::boolean, false) into v_allow_oversell
      from public.organization_settings where organization_id = new.organization_id;
    else
      v_allow_oversell := false;
    end if;
    if not v_allow_oversell then
      raise exception 'Stock insuffisant pour ce produit (quantité disponible dépassée).';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_stock_mov on public.stock_movements;
create trigger trg_stock_mov
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- create_sale() (migration 026) : useCreateSale enchaînait 4 écritures
-- client séparées (sales, sale_items, payments, stock_movements) sans
-- transaction — en cas de survente sur un seul produit du panier, la vente
-- restait déjà créée et payée, avec des mouvements de stock pour certaines
-- lignes mais pas toutes. Un appel RPC = une transaction Postgres : si
-- apply_stock_movement() lève (garde-fou ci-dessus), tout est annulé.
-- Security invoker (pas definer), comme add_sale_payment : les policies
-- RLS sales_insert/sale_items_insert/payments_insert/stock_movements_insert_*
-- s'appliquent normalement avec la session de l'appelant.
create or replace function public.create_sale(
  p_organization_id uuid,
  p_reference text,
  p_customer_id uuid,
  p_payment_method public.payment_method,
  p_paid numeric,
  p_items jsonb,
  p_discount numeric default 0,
  p_notes text default null,
  p_status public.sale_status default 'completed'
) returns public.sales
language plpgsql as $$
declare
  v_item jsonb;
  v_item_discount numeric(14,2);
  v_item_total numeric(14,2);
  v_product_id uuid;
  v_subtotal numeric(14,2) := 0;
  v_items_discount numeric(14,2) := 0;
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_change_due numeric(14,2);
  v_sale public.sales;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La vente doit contenir au moins un article.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_items_discount := v_items_discount + coalesce((v_item->>'discount')::numeric, 0);
  end loop;

  v_discount := coalesce(p_discount, 0) + v_items_discount;
  v_total := greatest(0, v_subtotal - v_discount);
  v_change_due := greatest(0, p_paid - v_total);

  insert into public.sales (
    organization_id, reference, customer_id, cashier_id, status,
    subtotal, discount, tax, total, paid, change_due, payment_method, notes
  ) values (
    p_organization_id, p_reference, p_customer_id, auth.uid(), coalesce(p_status, 'completed'),
    v_subtotal, v_discount, 0, v_total, p_paid, v_change_due, p_payment_method, p_notes
  ) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_item_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric - v_item_discount;
    v_product_id := nullif(v_item->>'product_id', '')::uuid;

    insert into public.sale_items (
      organization_id, sale_id, product_id, name, quantity, unit_price, discount, tax_rate, total
    ) values (
      p_organization_id, v_sale.id, v_product_id, v_item->>'name',
      (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
      v_item_discount, coalesce((v_item->>'tax_rate')::numeric, 0), v_item_total
    );

    if v_product_id is not null then
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, reference, created_by)
      values (p_organization_id, v_product_id, 'sale', (v_item->>'quantity')::numeric,
        'Vente ' || p_reference, p_reference, auth.uid());
    end if;
  end loop;

  if p_paid > 0 then
    insert into public.payments (organization_id, sale_id, method, amount)
    values (p_organization_id, v_sale.id, case when p_payment_method = 'mixed' then 'cash' else p_payment_method end, p_paid);
  end if;

  return v_sale;
end;
$$;

revoke all on function public.create_sale(uuid, text, uuid, public.payment_method, numeric, jsonb, numeric, text, public.sale_status) from public;
grant execute on function public.create_sale(uuid, text, uuid, public.payment_method, numeric, jsonb, numeric, text, public.sale_status) to authenticated;

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
    where organization_id = new.organization_id and status <> 'cancelled' and id <> new.id
    order by created_at desc limit 30
  ) recent;

  if v_count >= 5 and v_avg > 0 and new.total >= 2 * v_avg then
    insert into public.notifications (organization_id, title, body, kind)
    values (
      new.organization_id, 'Vente importante',
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
    insert into public.notifications (organization_id, title, body, kind)
    values (new.organization_id, 'Rupture de stock', v_name || ' est en rupture de stock.', 'stock_out');
  elsif new.quantity <= v_threshold and (tg_op = 'INSERT' or old.quantity > v_threshold) then
    insert into public.notifications (organization_id, title, body, kind)
    values (new.organization_id, 'Stock bas', v_name || ' passe sous le seuil d''alerte (' || new.quantity || ').', 'stock_low');
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
  insert into public.notifications (organization_id, title, body, kind)
  values (
    new.organization_id, 'Nouveau membre',
    coalesce(v_name, 'Un nouveau membre') || ' a rejoint l''équipe (' || new.role || ').',
    'new_member'
  );
  return new;
end $$;

drop trigger if exists trg_notify_new_member on public.organization_members;
create trigger trg_notify_new_member
  after insert on public.organization_members
  for each row execute function public.notify_new_member();

-- =============== STORAGE ===============
-- Bucket pour le logo boutique : public en lecture (affiché sur tickets et
-- reçus), écriture restreinte à owner/manager de la boutique propriétaire
-- du chemin. Convention de chemin obligatoire côté client : {organization_id}/<fichier>.
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
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_update on storage.objects;
create policy shop_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  )
  with check (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_delete on storage.objects;
create policy shop_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );

-- Bucket pour les images produit (migration 012) : même principe, public
-- en lecture, écriture restreinte aux rôles pouvant déjà écrire sur
-- `products` (owner/manager/stock). Convention de chemin obligatoire côté
-- client : {organization_id}/{product_id}.
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
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  )
  with check (
    bucket_id = 'product-images'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );

-- Bucket pour la photo de profil (migration 018) : public en lecture,
-- écriture restreinte au propriétaire du profil. Convention de chemin
-- obligatoire côté client : {user_id}/avatar.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- Bucket pour le branding global de la plateforme (migration 019) :
-- public en lecture, écriture réservée aux super-admins. Convention de
-- chemin : "logo" / "favicon" (pas de préfixe, un seul jeu de fichiers).
insert into storage.buckets (id, name, public)
values ('app-branding', 'app-branding', true)
on conflict (id) do nothing;

drop policy if exists app_branding_select on storage.objects;
create policy app_branding_select on storage.objects for select
  using (bucket_id = 'app-branding');
drop policy if exists app_branding_insert on storage.objects;
create policy app_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-branding' and public.is_super_admin());
drop policy if exists app_branding_update on storage.objects;
create policy app_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'app-branding' and public.is_super_admin())
  with check (bucket_id = 'app-branding' and public.is_super_admin());
drop policy if exists app_branding_delete on storage.objects;
create policy app_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-branding' and public.is_super_admin());

-- Bucket pour les photos d'articles du menu ZegResto (migration 042,
-- V2) : public en lecture, écriture restreinte owner/manager (même rôles
-- que l'écriture sur resto_menu_items). Convention de chemin obligatoire
-- côté client : {organization_id}/{menu_item_id}.
insert into storage.buckets (id, name, public)
values ('resto-menu-photos', 'resto-menu-photos', true)
on conflict (id) do nothing;

create policy resto_menu_photos_select on storage.objects for select
  using (bucket_id = 'resto-menu-photos');
create policy resto_menu_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
create policy resto_menu_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  )
  with check (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
create policy resto_menu_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );

-- =============== ZEGHOTEL (migrations 020f-020j) ===============
-- Regroupé ici en un seul bloc par module plutôt qu'éclaté dans les
-- sections ENUMS/TABLES/RLS/TRIGGERS ci-dessus (qui restent, elles,
-- spécifiques à ZegCaisse) : plus simple à auditer et à faire évoluer
-- comme un tout cohérent. Le type app_role ci-dessus a déjà été mis à
-- jour avec front_desk/housekeeping pour qu'une instance fraîche crée
-- l'enum complet directement.

-- Migration 020f — ZegHotel, étape 1/4 : ajoute les rôles hôteliers à
-- l'enum app_role existant (owner/manager/accountant déjà présents et
-- couvrent Owner/Manager/Comptable ; il manque Réceptionniste et
-- Gouvernante).
--
-- IMPORTANT — à exécuter SEULE, dans sa propre exécution, avant les
-- migrations 020g/020h/020i/020j : Postgres interdit d'utiliser une
-- nouvelle valeur d'enum dans la même transaction que celle qui l'a
-- ajoutée (erreur "unsafe use of new value of enum type"). Si le SQL
-- Editor Supabase exécute tout le collage en une seule transaction
-- implicite, coller ce fichier seul, valider, PUIS coller les suivants.

alter type public.app_role add value if not exists 'front_desk';
alter type public.app_role add value if not exists 'housekeeping';

-- Migration 020g — ZegHotel, étape 2/4 : tables de configuration
-- (chambres, tarification, comptes corporate, réglages, canaux).
-- À exécuter après 020f (rôles front_desk/housekeeping déjà commités).
--
-- Convention RLS : chaque policy réutilise has_organization_access() /
-- has_role_in_organization() / has_any_role_in_organization() — mêmes
-- fonctions que ZegCaisse, aucune nouvelle fonction de sécurité créée
-- pour ce module. Owner et manager ont un accès équivalent partout
-- (comme sur ZegCaisse) ; les policies ci-dessous ne les distinguent
-- donc pas sauf mention contraire.

create extension if not exists "btree_gist";

-- =============== room_types ===============
create table if not exists public.hotel_room_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  capacity_adults integer not null default 2,
  capacity_children integer not null default 0,
  amenities jsonb not null default '[]'::jsonb,
  base_price numeric(14,2) not null,
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_room_types_org on public.hotel_room_types(organization_id);
alter table public.hotel_room_types enable row level security;

-- Lecture : tout membre (nécessaire pour la réservation/le calendrier).
-- Écriture (tarifs de base) : owner/manager uniquement — la page
-- Paramètres > Tarification demandée doit rester pilotable par eux seuls,
-- pas par front_desk/housekeeping.
drop policy if exists hotel_room_types_select on public.hotel_room_types;
create policy hotel_room_types_select on public.hotel_room_types for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_room_types_write on public.hotel_room_types;
create policy hotel_room_types_write on public.hotel_room_types for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_rooms', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'manage'));

-- =============== rooms ===============
create table if not exists public.hotel_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_type_id uuid not null references public.hotel_room_types(id) on delete restrict,
  number text not null,
  floor text,
  housekeeping_status text not null default 'clean'
    check (housekeeping_status in ('clean','dirty','inspected','out_of_service')),
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);
create index if not exists idx_hotel_rooms_org on public.hotel_rooms(organization_id);
create index if not exists idx_hotel_rooms_type on public.hotel_rooms(room_type_id);
alter table public.hotel_rooms enable row level security;

-- Lecture : tout membre. Écriture "structurelle" (numéro, type, étage) :
-- owner/manager. Statut housekeeping : la gouvernante doit pouvoir le
-- changer — accès étendu à toute la ligne pour rester simple en RLS
-- (Postgres ne permet pas de restreindre une policy UPDATE à une seule
-- colonne sans trigger dédié) ; l'UI ne lui expose que le changement de
-- statut, mais un accès API direct pourrait théoriquement modifier numéro/
-- étage — simplification V1 assumée, à durcir plus tard si besoin réel.
drop policy if exists hotel_rooms_select on public.hotel_rooms;
create policy hotel_rooms_select on public.hotel_rooms for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_rooms_insert on public.hotel_rooms;
create policy hotel_rooms_insert on public.hotel_rooms for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'create'));
-- Carve-out préservé (migration 067) : housekeeping peut changer le statut
-- d'une chambre même sans permission 'manage' sur le module.
drop policy if exists hotel_rooms_update on public.hotel_rooms;
create policy hotel_rooms_update on public.hotel_rooms for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_rooms', 'manage') or public.has_role_in_organization(organization_id, 'housekeeping'))
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'manage') or public.has_role_in_organization(organization_id, 'housekeeping'));
drop policy if exists hotel_rooms_delete on public.hotel_rooms;
create policy hotel_rooms_delete on public.hotel_rooms for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== rate_plans ===============
create table if not exists public.hotel_rate_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_type_id uuid not null references public.hotel_room_types(id) on delete cascade,
  name text not null,
  includes_breakfast boolean not null default false,
  refundable boolean not null default true,
  price_adjustment_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  -- Nuitée ET horaire coexistent (ZegHotel Phase 1, migration 028) —
  -- hourly_rate requis si billing_unit = 'hour'.
  billing_unit text not null default 'night' check (billing_unit in ('night', 'hour')),
  hourly_rate numeric(14,2),
  constraint hotel_rate_plans_hourly_rate_check check (billing_unit <> 'hour' or hourly_rate is not null)
);
create index if not exists idx_hotel_rate_plans_org on public.hotel_rate_plans(organization_id);
alter table public.hotel_rate_plans enable row level security;
drop policy if exists hotel_rate_plans_select on public.hotel_rate_plans;
create policy hotel_rate_plans_select on public.hotel_rate_plans for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_rate_plans_write on public.hotel_rate_plans;
create policy hotel_rate_plans_write on public.hotel_rate_plans for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));

-- =============== seasonal_rates ===============
create table if not exists public.hotel_seasonal_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_type_id uuid not null references public.hotel_room_types(id) on delete cascade,
  name text,
  start_date date not null,
  end_date date not null,
  price_override numeric(14,2),
  days_of_week integer[],
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_hotel_seasonal_rates_org on public.hotel_seasonal_rates(organization_id);
create index if not exists idx_hotel_seasonal_rates_type on public.hotel_seasonal_rates(room_type_id);
alter table public.hotel_seasonal_rates enable row level security;
drop policy if exists hotel_seasonal_rates_select on public.hotel_seasonal_rates;
create policy hotel_seasonal_rates_select on public.hotel_seasonal_rates for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_seasonal_rates_write on public.hotel_seasonal_rates;
create policy hotel_seasonal_rates_write on public.hotel_seasonal_rates for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));

-- =============== rate_restrictions ===============
create table if not exists public.hotel_rate_restrictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_type_id uuid references public.hotel_room_types(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  min_stay integer,
  stop_sell boolean not null default false,
  closed_to_arrival boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_hotel_rate_restrictions_org on public.hotel_rate_restrictions(organization_id);
alter table public.hotel_rate_restrictions enable row level security;
drop policy if exists hotel_rate_restrictions_select on public.hotel_rate_restrictions;
create policy hotel_rate_restrictions_select on public.hotel_rate_restrictions for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_rate_restrictions_write on public.hotel_rate_restrictions;
create policy hotel_rate_restrictions_write on public.hotel_rate_restrictions for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));

-- =============== corporate_accounts ===============
create table if not exists public.hotel_corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  negotiated_discount_pct numeric(5,2) not null default 0,
  billing_terms text,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_corporate_org on public.hotel_corporate_accounts(organization_id);
alter table public.hotel_corporate_accounts enable row level security;
-- Lecture étendue à accountant/front_desk (besoin de facturer/reconnaître
-- un compte entreprise au moment de la réservation) ; écriture (tarif
-- négocié, conditions de facturation) réservée à owner/manager.
drop policy if exists hotel_corporate_select on public.hotel_corporate_accounts;
create policy hotel_corporate_select on public.hotel_corporate_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_corporate', 'view'));
drop policy if exists hotel_corporate_write on public.hotel_corporate_accounts;
create policy hotel_corporate_write on public.hotel_corporate_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_corporate', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_corporate', 'manage'));

-- =============== hotel_settings ===============
create table if not exists public.hotel_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  secondary_currency text,
  city_tax_enabled boolean not null default false,
  city_tax_amount numeric(14,2) not null default 0,
  default_cancellation_policy text,
  occupancy_pricing_enabled boolean not null default false,
  occupancy_pricing_threshold_pct numeric(5,2) not null default 80,
  occupancy_pricing_adjustment_pct numeric(5,2) not null default 10,
  updated_at timestamptz not null default now()
);
alter table public.hotel_settings enable row level security;
-- Lecture étendue (front_desk/accountant peuvent avoir besoin de
-- connaître la politique d'annulation ou la taxe de séjour active) ;
-- écriture strictement owner/manager (page Paramètres > Tarification).
drop policy if exists hotel_settings_select on public.hotel_settings;
create policy hotel_settings_select on public.hotel_settings for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_settings_write on public.hotel_settings;
create policy hotel_settings_write on public.hotel_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));

-- =============== channels (structure seule, hors scope V1) ===============
-- Aucune logique de synchronisation — juste la table pour ne pas avoir à
-- migrer le schéma quand cette intégration sera vraiment développée.
create table if not exists public.hotel_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  external_id text,
  created_at timestamptz not null default now(),
  -- Migration 034 — ZegHotel Phase 8 : gestion manuelle par canal (nom,
  -- notes, tarif spécifique optionnel), pas de vraie intégration API.
  notes text,
  manual_rate numeric(14,2)
);
create index if not exists idx_hotel_channels_org on public.hotel_channels(organization_id);
alter table public.hotel_channels enable row level security;
drop policy if exists hotel_channels_all on public.hotel_channels;
create policy hotel_channels_all on public.hotel_channels for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_canaux', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_canaux', 'manage'));

-- Migration 020h — ZegHotel, étape 3/4 : clients, réservations et
-- attribution des chambres, avec protection anti-double-réservation au
-- niveau base (contrainte d'exclusion Postgres, pas seulement côté client).
-- À exécuter après 020f et 020g.

-- =============== guests ===============
create table if not exists public.hotel_guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  id_document_type text,
  id_document_number text,
  nationality text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  -- Recommandé par rapport à un âge stocké, qui deviendrait faux avec le
  -- temps (ZegHotel Phase 1, migration 028).
  date_of_birth date
);
create index if not exists idx_hotel_guests_org on public.hotel_guests(organization_id);
alter table public.hotel_guests enable row level security;
-- Housekeeping exclu délibérément (rôle scopé "statuts chambres et
-- tâches de nettoyage uniquement", voir 020g) — aucune donnée client/
-- financière ne doit lui être accessible. accountant retiré ici (migration
-- 028) : les données d'identité (CNI/passeport/adresse/date de naissance)
-- sont désormais restreintes à owner/manager/front_desk — hotel_guest_contact()
-- ci-dessous donne à accountant (et à tout futur usage similaire) une
-- lecture "contact seul" sans jamais exposer les colonnes sensibles, y
-- compris via un appel API direct (masquage fait en SQL, pas côté client).
drop policy if exists hotel_guests_select on public.hotel_guests;
create policy hotel_guests_select on public.hotel_guests for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_clients', 'view'));
drop policy if exists hotel_guests_write on public.hotel_guests;
create policy hotel_guests_write on public.hotel_guests for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_clients', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_clients', 'manage'));

create or replace function public.hotel_guest_contact(_organization_id uuid)
returns table (
  id uuid, organization_id uuid, full_name text, email text, phone text,
  nationality text, notes text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_any_role_in_organization(_organization_id, array['owner', 'manager', 'front_desk', 'accountant']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;
  return query
    select g.id, g.organization_id, g.full_name, g.email, g.phone, g.nationality, g.notes, g.created_at
    from public.hotel_guests g
    where g.organization_id = _organization_id;
end;
$$;

revoke all on function public.hotel_guest_contact(uuid) from public;
grant execute on function public.hotel_guest_contact(uuid) to authenticated;

-- =============== reservations ===============
create table if not exists public.hotel_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guest_id uuid not null references public.hotel_guests(id) on delete restrict,
  corporate_account_id uuid references public.hotel_corporate_accounts(id) on delete set null,
  check_in date not null,
  check_out date not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  rate_plan_id uuid references public.hotel_rate_plans(id) on delete set null,
  channel text not null default 'direct',
  adults integer not null default 1,
  children integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Nuitée ET horaire (ZegHotel Phase 1, migration 028) — check_in/check_out
  -- (date) restent la source de vérité "jour occupé" pour le reste du
  -- système (dashboard, rapports, moteur de tarification) quel que soit
  -- billing_unit ; une réservation horaire les a égaux (même jour).
  -- check_in_at/check_out_at = heures prévues (horaire uniquement, requis
  -- dans ce cas) ; actual_* = heures réelles, posées au check-in/check-out.
  billing_unit text not null default 'night' check (billing_unit in ('night', 'hour')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  actual_check_in_at timestamptz,
  actual_check_out_at timestamptz,
  constraint hotel_reservations_hourly_times_check
    check (billing_unit <> 'hour' or (check_in_at is not null and check_out_at is not null and check_out_at > check_in_at)),
  constraint hotel_reservations_dates_check check (check_out > check_in or billing_unit = 'hour')
);
create index if not exists idx_hotel_reservations_org on public.hotel_reservations(organization_id);
create index if not exists idx_hotel_reservations_guest on public.hotel_reservations(guest_id);
create index if not exists idx_hotel_reservations_dates on public.hotel_reservations(organization_id, check_in, check_out);
alter table public.hotel_reservations enable row level security;
drop policy if exists hotel_reservations_select on public.hotel_reservations;
create policy hotel_reservations_select on public.hotel_reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'view'));
drop policy if exists hotel_reservations_insert on public.hotel_reservations;
create policy hotel_reservations_insert on public.hotel_reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'create'));
drop policy if exists hotel_reservations_update on public.hotel_reservations;
create policy hotel_reservations_update on public.hotel_reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'));
-- Suppression définitive (hors annulation, qui est un changement de
-- statut) réservée à owner/manager — conserve l'historique par défaut ;
-- carve-out préservé (migration 067), jamais délégable à un rôle
-- personnalisé même avec 'manage' accordé sur ce module.
drop policy if exists hotel_reservations_delete on public.hotel_reservations;
create policy hotel_reservations_delete on public.hotel_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== reservation_rooms ===============
-- check_in/check_out/status sont dénormalisés depuis hotel_reservations
-- et synchronisés par trigger (jamais écrits directement par le client) :
-- une contrainte d'exclusion ne peut porter que sur des colonnes de cette
-- même table, impossible de contraindre directement via une jointure.
create table if not exists public.hotel_reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.hotel_reservations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete restrict,
  rate_amount numeric(14,2) not null,
  check_in date not null,
  check_out date not null,
  status text not null,
  created_at timestamptz not null default now(),
  -- Nuitée ET horaire (ZegHotel Phase 1, migration 028) — dénormalisés
  -- depuis la réservation parente (même mécanisme que check_in/check_out/
  -- status ci-dessus). hourly_rate figé au moment de la réservation
  -- (indépendant d'un changement ultérieur de la formule tarifaire) : sert
  -- au calcul de la charge réelle au check-out.
  billing_unit text not null default 'night',
  check_in_at timestamptz,
  check_out_at timestamptz,
  hourly_rate numeric(14,2),
  unique (reservation_id, room_id),
  -- Bloque tout chevauchement de dates sur la même chambre tant que la
  -- réservation est "active" (pending/confirmed/checked_in) — cancelled/
  -- no_show/checked_out libèrent la chambre pour de nouvelles réservations
  -- sur les mêmes dates. greatest(check_out, check_in + 1) plutôt que
  -- check_out seul : pour une réservation horaire, check_in = check_out
  -- (même jour) donnerait un daterange VIDE (aucune collision détectée,
  -- y compris avec une réservation nuitée qui occupe déjà toute la
  -- journée) — comportement nuitée inchangé (check_out déjà > check_in).
  constraint hotel_resv_rooms_excl exclude using gist (
    room_id with =,
    daterange(check_in, greatest(check_out, check_in + 1)) with &&
  ) where (status in ('pending','confirmed','checked_in')),
  -- Chevauchement fin entre réservations horaires sur la même chambre le
  -- même jour (la contrainte ci-dessus couvre déjà toute collision
  -- jour/nuitée) — n'entre en jeu que pour billing_unit = 'hour'.
  constraint hotel_resv_rooms_hourly_excl exclude using gist (
    room_id with =,
    tstzrange(check_in_at, check_out_at) with &&
  ) where (status in ('pending','confirmed','checked_in') and billing_unit = 'hour')
);
create index if not exists idx_hotel_resv_rooms_org on public.hotel_reservation_rooms(organization_id);
create index if not exists idx_hotel_resv_rooms_reservation on public.hotel_reservation_rooms(reservation_id);
create index if not exists idx_hotel_resv_rooms_room on public.hotel_reservation_rooms(room_id);
alter table public.hotel_reservation_rooms enable row level security;
drop policy if exists hotel_resv_rooms_select on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_select on public.hotel_reservation_rooms for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'view'));
drop policy if exists hotel_resv_rooms_write on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_write on public.hotel_reservation_rooms for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'));

-- Remplit automatiquement check_in/check_out/status/billing_unit/
-- check_in_at/check_out_at à l'insertion depuis la réservation parente —
-- le client n'a jamais à les fournir ni à les tenir synchronisés lui-même.
create or replace function public.hotel_sync_reservation_room_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reservation public.hotel_reservations;
begin
  select * into v_reservation from public.hotel_reservations where id = new.reservation_id;
  if not found then
    raise exception 'Réservation introuvable.';
  end if;
  new.check_in := v_reservation.check_in;
  new.check_out := v_reservation.check_out;
  new.status := v_reservation.status;
  new.billing_unit := v_reservation.billing_unit;
  new.check_in_at := v_reservation.check_in_at;
  new.check_out_at := v_reservation.check_out_at;
  return new;
end;
$$;
drop trigger if exists trg_hotel_resv_room_insert on public.hotel_reservation_rooms;
create trigger trg_hotel_resv_room_insert
  before insert on public.hotel_reservation_rooms
  for each row execute function public.hotel_sync_reservation_room_on_insert();

-- Répercute tout changement de dates/statut/billing_unit de la
-- réservation sur les lignes hotel_reservation_rooms existantes (ex.
-- annulation : libère la chambre pour de nouvelles réservations ;
-- changement de dates : les contraintes d'exclusion protègent aussi
-- contre un nouveau chevauchement).
create or replace function public.hotel_sync_reservation_room_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.status is distinct from old.status
     or new.billing_unit is distinct from old.billing_unit
     or new.check_in_at is distinct from old.check_in_at
     or new.check_out_at is distinct from old.check_out_at then
    update public.hotel_reservation_rooms
    set check_in = new.check_in, check_out = new.check_out, status = new.status,
        billing_unit = new.billing_unit, check_in_at = new.check_in_at, check_out_at = new.check_out_at
    where reservation_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hotel_reservations_sync on public.hotel_reservations;
create trigger trg_hotel_reservations_sync
  after update on public.hotel_reservations
  for each row execute function public.hotel_sync_reservation_room_on_update();

-- Communications automatisées (ZegHotel Phase 5, migration 032) — table
-- notifications strictement interne (user_id référence auth.users, un
-- client hôtel n'a pas de compte) : ce qui suit, ce sont des RAPPELS pour
-- le personnel ("confirmation à envoyer", "remerciement à envoyer"), pas
-- un envoi réel de SMS/email au client. Même patron que
-- notify_big_sale/notify_stock_level/notify_new_member plus haut. Le
-- rappel "arrivée demain" (J-1, événement "temps qui passe") est calculé
-- côté client dans useAppNotifications.ts, non déclenchable par trigger.
create or replace function public.notify_hotel_reservation_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guest_name text;
begin
  select full_name into v_guest_name from public.hotel_guests where id = new.guest_id;
  insert into public.notifications (organization_id, title, body, kind)
  values (
    new.organization_id, 'Nouvelle réservation',
    'Confirmation à envoyer à ' || coalesce(v_guest_name, 'un client') || ' — arrivée le ' || to_char(new.check_in, 'DD/MM/YYYY') || '.',
    'hotel_reservation_created'
  );
  return new;
end $$;

drop trigger if exists trg_notify_hotel_reservation_created on public.hotel_reservations;
create trigger trg_notify_hotel_reservation_created
  after insert on public.hotel_reservations
  for each row execute function public.notify_hotel_reservation_created();

create or replace function public.notify_hotel_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guest_name text;
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    select full_name into v_guest_name from public.hotel_guests where id = new.guest_id;
    insert into public.notifications (organization_id, title, body, kind)
    values (
      new.organization_id, 'Séjour terminé',
      'Message de remerciement à envoyer à ' || coalesce(v_guest_name, 'un client') || '.',
      'hotel_stay_thankyou'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_hotel_checkout on public.hotel_reservations;
create trigger trg_notify_hotel_checkout
  after update on public.hotel_reservations
  for each row execute function public.notify_hotel_checkout();

-- Migration 020i — ZegHotel, étape 4/4 (partie facturation) : folios,
-- charges et paiements. À exécuter après 020f/020g/020h.
--
-- Un seul folio par réservation en V1 (pas de folio par chambre pour un
-- séjour multi-chambres) — correspond à "dossier de charges actif d'un
-- séjour" au singulier dans la demande initiale.

create table if not exists public.hotel_folios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.hotel_reservations(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Facturation différée (ZegHotel Phase 4, migration 031) : clôture
  -- différée simple — la réception peut clôturer une note avec un solde
  -- impayé si la réservation est rattachée à un compte entreprise, en la
  -- marquant "à facturer à l'entreprise". corporate_paid_at n'est qu'un
  -- marqueur en attente/réglé pour le relevé, pas une nouvelle source de
  -- vérité financière (folioBalance() reste calculée normalement).
  billed_to_corporate boolean not null default false,
  corporate_paid_at timestamptz,
  unique (reservation_id)
);
create index if not exists idx_hotel_folios_org on public.hotel_folios(organization_id);
alter table public.hotel_folios enable row level security;
drop policy if exists hotel_folios_select on public.hotel_folios;
create policy hotel_folios_select on public.hotel_folios for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'view'));
drop policy if exists hotel_folios_write on public.hotel_folios;
create policy hotel_folios_write on public.hotel_folios for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_folios', 'manage'));

-- =============== 1. Calcul du tarif (seasonal override + rate plan %) ===============
create or replace function public.hotel_compute_room_rate(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_id uuid
) returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_base numeric(14,2);
  v_adjustment_pct numeric(5,2) := 0;
  v_day date;
  v_night_price numeric(14,2);
  v_total numeric(14,2) := 0;
begin
  select base_price into v_base from public.hotel_room_types where id = p_room_type_id;
  if not found then
    raise exception 'Type de chambre introuvable.';
  end if;

  if p_rate_plan_id is not null then
    select price_adjustment_pct into v_adjustment_pct
    from public.hotel_rate_plans where id = p_rate_plan_id;
  end if;

  v_day := p_check_in;
  while v_day < p_check_out loop
    select price_override into v_night_price
    from public.hotel_seasonal_rates
    where room_type_id = p_room_type_id
      and v_day between start_date and end_date
      and (days_of_week is null or extract(dow from v_day)::int = any(days_of_week))
    order by start_date desc
    limit 1;

    v_total := v_total + coalesce(v_night_price, v_base);
    v_day := v_day + 1;
  end loop;

  return round(v_total * (1 + coalesce(v_adjustment_pct, 0) / 100.0), 2);
end;
$$;

revoke all on function public.hotel_compute_room_rate(uuid, date, date, uuid) from public;
grant execute on function public.hotel_compute_room_rate(uuid, date, date, uuid) to authenticated;

-- =============== 2. Restrictions (séjour min / stop-vente / fermé à l'arrivée) ===============
-- greatest(p_check_out, p_check_in + 1) plutôt que p_check_out seul : pour
-- une réservation horaire (ZegHotel Phase 1, migration 028) p_check_in =
-- p_check_out donnerait un daterange VIDE, laissant passer un stop-vente
-- sans jamais bloquer. min_stay (séjour minimum, un concept nuitée) est
-- ignoré pour un séjour de 0 nuit.
create or replace function public.hotel_check_rate_restrictions(
  p_organization_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
) returns void
language plpgsql stable set search_path = public as $$
declare
  v_max_min_stay integer;
  v_range daterange := daterange(p_check_in, greatest(p_check_out, p_check_in + 1));
begin
  if exists (
    select 1 from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and stop_sell
      and daterange(start_date, end_date, '[]') && v_range
  ) then
    raise exception 'Ces dates sont fermées à la vente pour ce type de chambre.';
  end if;

  if exists (
    select 1 from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and closed_to_arrival
      and p_check_in between start_date and end_date
  ) then
    raise exception 'Les arrivées ne sont pas autorisées à cette date pour ce type de chambre.';
  end if;

  if p_check_out > p_check_in then
    select max(min_stay) into v_max_min_stay
    from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and min_stay is not null
      and p_check_in between start_date and end_date;

    if v_max_min_stay is not null and (p_check_out - p_check_in) < v_max_min_stay then
      raise exception 'Séjour minimum de % nuit(s) requis pour ces dates.', v_max_min_stay;
    end if;
  end if;
end;
$$;

revoke all on function public.hotel_check_rate_restrictions(uuid, uuid, date, date) from public;
grant execute on function public.hotel_check_rate_restrictions(uuid, uuid, date, date) to authenticated;

-- =============== 3. create_hotel_reservation() — réservation atomique ===============
-- Même raisonnement que create_sale (migration 026) : une réservation
-- multi-chambres enchaînait plusieurs écritures client séparées
-- (hotel_reservations, hotel_reservation_rooms, hotel_folios) sans
-- transaction. Ici en plus : vérifie les restrictions AVANT toute
-- écriture, et calcule le tarif définitif si le client n'en fournit pas
-- un explicite (rate_amount = null → override manuel non utilisé côté
-- staff, comportement inchangé sinon). Security invoker : les policies
-- RLS hotel_reservations_insert/hotel_resv_rooms_write/hotel_folios_write
-- s'appliquent normalement.
--
-- Nuitée ET horaire (ZegHotel Phase 1, migration 028) : billing_unit et
-- hourly_rate sont dérivés de la formule tarifaire choisie (p_rate_plan_id)
-- — p_check_in_at/p_check_out_at (heures prévues) sont alors requis. Pour
-- une réservation horaire, check_out (date) est forcé à check_in (même
-- jour), et le tarif est estimé (arrondi à l'heure supérieure, 1h minimum)
-- pour affichage seulement : le montant réel est recalculé et posté au
-- check-out à partir de la durée effective (voir useCheckOutReservation
-- côté client).
create or replace function public.create_hotel_reservation(
  p_organization_id uuid,
  p_guest_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms jsonb,
  p_rate_plan_id uuid default null,
  p_corporate_account_id uuid default null,
  p_channel text default 'direct',
  p_adults integer default 1,
  p_children integer default 0,
  p_notes text default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null
) returns public.hotel_reservations
language plpgsql as $$
declare
  v_reservation public.hotel_reservations;
  v_room jsonb;
  v_room_id uuid;
  v_room_type_id uuid;
  v_rate numeric(14,2);
  v_billing_unit text := 'night';
  v_hourly_rate numeric(14,2);
  v_billed_hours numeric;
begin
  if p_rooms is null or jsonb_array_length(p_rooms) = 0 then
    raise exception 'Sélectionnez au moins une chambre.';
  end if;

  if p_rate_plan_id is not null then
    select billing_unit, hourly_rate into v_billing_unit, v_hourly_rate
    from public.hotel_rate_plans where id = p_rate_plan_id;
    v_billing_unit := coalesce(v_billing_unit, 'night');
  end if;

  if v_billing_unit = 'hour' and (p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at) then
    raise exception 'Une réservation horaire nécessite une heure d''arrivée et de départ prévues valides.';
  end if;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms
    where id = v_room_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Chambre introuvable.';
    end if;
    perform public.hotel_check_rate_restrictions(p_organization_id, v_room_type_id, p_check_in, p_check_out);
  end loop;

  insert into public.hotel_reservations (
    organization_id, guest_id, corporate_account_id, check_in, check_out,
    rate_plan_id, channel, adults, children, notes, created_by,
    billing_unit, check_in_at, check_out_at
  ) values (
    p_organization_id, p_guest_id, p_corporate_account_id, p_check_in,
    case when v_billing_unit = 'hour' then p_check_in else p_check_out end,
    p_rate_plan_id, coalesce(p_channel, 'direct'), coalesce(p_adults, 1), coalesce(p_children, 0), p_notes, auth.uid(),
    v_billing_unit, p_check_in_at, p_check_out_at
  ) returning * into v_reservation;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms where id = v_room_id;

    if (v_room ? 'rate_amount') and (v_room->>'rate_amount') is not null then
      v_rate := (v_room->>'rate_amount')::numeric;
    elsif v_billing_unit = 'hour' then
      v_billed_hours := greatest(1, ceil(extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0));
      v_rate := round(v_billed_hours * v_hourly_rate, 2);
    else
      v_rate := public.hotel_compute_room_rate(v_room_type_id, p_check_in, p_check_out, p_rate_plan_id);
    end if;

    insert into public.hotel_reservation_rooms (organization_id, reservation_id, room_id, rate_amount, hourly_rate)
    values (p_organization_id, v_reservation.id, v_room_id, v_rate, case when v_billing_unit = 'hour' then v_hourly_rate else null end);
  end loop;

  insert into public.hotel_folios (organization_id, reservation_id) values (p_organization_id, v_reservation.id);

  return v_reservation;
end;
$$;

revoke all on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) from public;
grant execute on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) to authenticated;

create table if not exists public.hotel_folio_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio_id uuid not null references public.hotel_folios(id) on delete cascade,
  kind text not null check (kind in ('room','extra','penalty','tax','discount')),
  description text not null,
  amount numeric(14,2) not null,
  quantity integer not null default 1,
  charge_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_folio_charges_org on public.hotel_folio_charges(organization_id);
create index if not exists idx_hotel_folio_charges_folio on public.hotel_folio_charges(folio_id);
alter table public.hotel_folio_charges enable row level security;
drop policy if exists hotel_folio_charges_select on public.hotel_folio_charges;
create policy hotel_folio_charges_select on public.hotel_folio_charges for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'view'));
drop policy if exists hotel_folio_charges_write on public.hotel_folio_charges;
create policy hotel_folio_charges_write on public.hotel_folio_charges for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_folios', 'manage'));

-- ZegHotel Phase 2 (migration 029) : module Clients (/app/hotel/clients) —
-- vue CRM des hotel_guests indépendante d'une réservation particulière.
-- Agrège côté serveur (historique/total dépensé/dernière visite) plutôt
-- que de faire remonter tous les folios/charges au client. Security
-- invoker : les policies RLS existantes sur hotel_reservations/
-- hotel_folios/hotel_folio_charges s'appliquent normalement.
create or replace function public.hotel_guest_summary(_organization_id uuid)
returns table (
  guest_id uuid, total_stays bigint, total_spent numeric, last_check_in date
)
language sql stable set search_path = public as $$
  select
    r.guest_id,
    count(distinct r.id) as total_stays,
    coalesce(sum(fc.amount * fc.quantity), 0) as total_spent,
    max(r.check_in) as last_check_in
  from public.hotel_reservations r
  left join public.hotel_folios f on f.reservation_id = r.id
  left join public.hotel_folio_charges fc on fc.folio_id = f.id
  where r.organization_id = _organization_id
    and r.status <> 'cancelled'
  group by r.guest_id;
$$;

revoke all on function public.hotel_guest_summary(uuid) from public;
grant execute on function public.hotel_guest_summary(uuid) to authenticated;

-- ZegHotel Phase 7 (migration 033) — Point de vente interne (restaurant/
-- bar/room service) : facturer un article directement sur le folio d'un
-- client en séjour. Réutilise products/categories/stock_levels/
-- stock_movements (déjà scopé organization_id, inutilisé côté ZegHotel
-- jusqu'ici). products_select/stock_levels_select sont déjà ouverts à
-- tout membre, mais l'écriture de stock_movements est restreinte à
-- owner/manager/stock ou cashier (aucun rôle assignable côté ZegHotel) —
-- cette fonction security definer accorde uniquement la capacité étroite
-- "vendre un produit du catalogue contre une note ouverte", pas un accès
-- large à stock_movements. Le garde-fou anti-survente
-- (apply_stock_movement(), migration 026) s'applique normalement.
-- Autorisation branchée sur has_module_permission() (migration 067, module
-- 'hotel_pos_interne') plutôt qu'une liste de rôles en dur — la seule
-- fonction hôtel qui accordait un accès métier via un check de rôle
-- explicite, migrée pour respecter "permission réellement appliquée".
create or replace function public.post_hotel_pos_charge(
  p_organization_id uuid,
  p_folio_id uuid,
  p_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_folio public.hotel_folios;
begin
  if not public.has_module_permission(p_organization_id, 'hotel_pos_interne', 'create') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_folio from public.hotel_folios where id = p_folio_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Note introuvable.';
  end if;
  if v_folio.status <> 'open' then
    raise exception 'Impossible d''ajouter une charge à une note clôturée.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Aucun article à facturer.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantité invalide.';
    end if;

    insert into public.hotel_folio_charges (organization_id, folio_id, kind, description, amount, quantity)
    values (p_organization_id, p_folio_id, 'extra', v_item->>'name', (v_item->>'unit_price')::numeric, round(v_quantity)::int);

    if v_product_id is not null then
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_product_id, 'sale', v_quantity, 'POS interne ZegHotel', auth.uid());
    end if;
  end loop;
end;
$$;

revoke all on function public.post_hotel_pos_charge(uuid, uuid, jsonb) from public;
grant execute on function public.post_hotel_pos_charge(uuid, uuid, jsonb) to authenticated;

-- =============== hotel_pos_sales (migration 077) ===============
-- Pendant immédiat de post_hotel_pos_charge() ci-dessus : un passant/client
-- de passage qui paie tout de suite (pas de note de séjour) — indépendante
-- de `sales` (ZegCaisse), tables préfixées par app comme le reste du socle.
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

-- Nommée hotel_payments (pas payments) : public.payments existe déjà
-- côté ZegCaisse (paiements de vente) — collision directe évitée.
create table if not exists public.hotel_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio_id uuid not null references public.hotel_folios(id) on delete cascade,
  amount numeric(14,2) not null,
  method text not null check (method in ('cash','mobile_money','card','bank_transfer')),
  kind text not null default 'payment' check (kind in ('deposit','payment','refund')),
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_payments_org on public.hotel_payments(organization_id);
create index if not exists idx_hotel_payments_folio on public.hotel_payments(folio_id);
alter table public.hotel_payments enable row level security;
drop policy if exists hotel_payments_select on public.hotel_payments;
create policy hotel_payments_select on public.hotel_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'view'));
drop policy if exists hotel_payments_insert on public.hotel_payments;
create policy hotel_payments_insert on public.hotel_payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_payments', 'create'));
-- Modifier/supprimer un paiement déjà enregistré est réservé à
-- owner/manager (intégrité financière — un front_desk qui se trompe
-- doit faire corriger par son responsable, pas éditer directement) —
-- default_role_permissions n'accorde 'manage' sur ce module qu'à eux.
drop policy if exists hotel_payments_update on public.hotel_payments;
create policy hotel_payments_update on public.hotel_payments for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_payments', 'manage'));
drop policy if exists hotel_payments_delete on public.hotel_payments;
create policy hotel_payments_delete on public.hotel_payments for delete to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'manage'));

-- Migration 020j — ZegHotel, étape finale : tâches de ménage et
-- incidents de maintenance. À exécuter après 020f/020g/020h/020i.

create table if not exists public.hotel_housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete cascade,
  task_date date not null default current_date,
  kind text not null default 'cleaning' check (kind in ('cleaning','turnover','inspection')),
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_hotel_housekeeping_org on public.hotel_housekeeping_tasks(organization_id);
create index if not exists idx_hotel_housekeeping_room on public.hotel_housekeeping_tasks(room_id);
create index if not exists idx_hotel_housekeeping_date on public.hotel_housekeeping_tasks(organization_id, task_date);
alter table public.hotel_housekeeping_tasks enable row level security;
-- Génération des tâches (owner/manager/front_desk, typiquement depuis un
-- bouton "générer les tâches du jour") ; la gouvernante lit et met à jour
-- le statut de ses tâches, jamais n'en crée ni n'en supprime.
drop policy if exists hotel_housekeeping_select on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_select on public.hotel_housekeeping_tasks for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_housekeeping', 'view'));
drop policy if exists hotel_housekeeping_insert on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_insert on public.hotel_housekeeping_tasks for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_housekeeping', 'create'));
drop policy if exists hotel_housekeeping_update on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_update on public.hotel_housekeeping_tasks for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_housekeeping', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_housekeeping', 'manage'));
-- Carve-out préservé (migration 067) : suppression d'une tâche reste
-- owner/manager, même pour front_desk/housekeeping qui peuvent la
-- créer/modifier.
drop policy if exists hotel_housekeeping_delete on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_delete on public.hotel_housekeeping_tasks for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Statut chambre automatique + génération automatique des tâches de ménage
-- (migration 078) : housekeeping_status et hotel_housekeeping_tasks ne
-- bougeaient jamais tout seuls jusqu'ici (bouton "Générer les tâches du
-- jour" + marquage manuel "propre" par chambre). 'out_of_service' n'est
-- jamais écrasé par ces triggers.
create or replace function public.hotel_room_dirty_on_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_room record;
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    for v_room in
      select room_id from public.hotel_reservation_rooms where reservation_id = new.id
    loop
      update public.hotel_rooms
      set housekeeping_status = 'dirty'
      where id = v_room.room_id and housekeeping_status <> 'out_of_service';

      insert into public.hotel_housekeeping_tasks (organization_id, room_id, task_date, kind)
      select new.organization_id, v_room.room_id, current_date, 'turnover'
      where not exists (
        select 1 from public.hotel_housekeeping_tasks
        where room_id = v_room.room_id and task_date = current_date and status <> 'done'
      );
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_hotel_room_dirty_on_checkout on public.hotel_reservations;
create trigger trg_hotel_room_dirty_on_checkout
  after update on public.hotel_reservations
  for each row execute function public.hotel_room_dirty_on_checkout();

create or replace function public.hotel_room_clean_on_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.kind in ('cleaning', 'turnover') then
    update public.hotel_rooms
    set housekeeping_status = 'clean'
    where id = new.room_id and housekeeping_status <> 'out_of_service';
  end if;
  return new;
end $$;

drop trigger if exists trg_hotel_room_clean_on_task_done on public.hotel_housekeeping_tasks;
create trigger trg_hotel_room_clean_on_task_done
  after update on public.hotel_housekeeping_tasks
  for each row execute function public.hotel_room_clean_on_task_done();

create table if not exists public.hotel_maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_hotel_maintenance_org on public.hotel_maintenance_tickets(organization_id);
create index if not exists idx_hotel_maintenance_room on public.hotel_maintenance_tickets(room_id);
alter table public.hotel_maintenance_tickets enable row level security;
-- Module Maintenance détaché (ZegHotel Phase 3, migration 030) :
-- accessible à TOUT le personnel hôtel pour signaler un incident
-- (accountant ajouté) ; suivi/résolution réservé à owner/manager/
-- housekeeping (souvent la gouvernante qui gère aussi la coordination
-- avec un technicien).
drop policy if exists hotel_maintenance_select on public.hotel_maintenance_tickets;
create policy hotel_maintenance_select on public.hotel_maintenance_tickets for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_maintenance', 'view'));
drop policy if exists hotel_maintenance_insert on public.hotel_maintenance_tickets;
create policy hotel_maintenance_insert on public.hotel_maintenance_tickets for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_maintenance', 'create'));
drop policy if exists hotel_maintenance_update on public.hotel_maintenance_tickets;
create policy hotel_maintenance_update on public.hotel_maintenance_tickets for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_maintenance', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_maintenance', 'manage'));
-- Carve-out préservé (migration 067) : suppression d'un ticket reste
-- owner/manager, même pour housekeeping qui peut le créer/modifier.
drop policy if exists hotel_maintenance_delete on public.hotel_maintenance_tickets;
create policy hotel_maintenance_delete on public.hotel_maintenance_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== ZegResto (migrations 035+) ===============
-- Troisième application ZegOS, même socle que ZegCaisse/ZegHotel
-- (organizations/organization_members/app_role), même pattern (tables
-- préfixées resto_, RLS strict par organization_id + rôle).

-- Migration 035 — ZegResto, étape 1/7 : rôles Serveur et Cuisinier.
-- IMPORTANT — comme 020f (ZegHotel) : à exécuter seule, dans sa propre
-- transaction, avant toute policy qui référence ces valeurs.
alter type public.app_role add value if not exists 'server';
alter type public.app_role add value if not exists 'cook';

-- Migration 037 — ZegResto, étape 3/7 : Salle (zones/tables) + Menu
-- (catégories/articles/modificateurs).

create table if not exists public.resto_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_zones_org on public.resto_zones(organization_id);
alter table public.resto_zones enable row level security;

create policy resto_zones_select on public.resto_zones for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_zones_write on public.resto_zones for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage'));

create table if not exists public.resto_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_id uuid references public.resto_zones(id) on delete set null,
  numero text not null,
  capacite integer not null default 2 check (capacite > 0),
  statut text not null default 'libre' check (statut in ('libre', 'occupee', 'reservee', 'nettoyage')),
  position_x numeric(6,2) not null default 0,
  position_y numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, numero)
);
create index if not exists idx_resto_tables_org on public.resto_tables(organization_id);
create index if not exists idx_resto_tables_zone on public.resto_tables(zone_id);
alter table public.resto_tables enable row level security;

-- Le statut de table change en continu (occupée/libérée/nettoyage) au fil
-- du service — server/cook peuvent le lire (plan de salle, KDS) mais seul
-- server (avec owner/manager) peut l'écrire ; cook n'a pas besoin d'écrire
-- sur les tables (son écran est le KDS, pas le plan de salle).
create policy resto_tables_select on public.resto_tables for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_tables_insert on public.resto_tables for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage'));
-- Carve-out préservé (migration 069) : server peut changer le statut d'une
-- table même sans permission 'manage' sur le module.
create policy resto_tables_update on public.resto_tables for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'manage') or public.has_role_in_organization(organization_id, 'server'))
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage') or public.has_role_in_organization(organization_id, 'server'));
create policy resto_tables_delete on public.resto_tables for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.resto_menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_menu_categories_org on public.resto_menu_categories(organization_id);
alter table public.resto_menu_categories enable row level security;

create policy resto_menu_categories_select on public.resto_menu_categories for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_menu_categories_write on public.resto_menu_categories for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

-- station : préparé pour un futur routage KDS multi-poste (grill/froid/
-- pâtisserie...), non exploité en V1 — le KDS (Phase 2) reste un flux
-- unique par commande, ce champ ne sert à rien tant qu'aucun écran ne le
-- filtre. Gardé nullable, jamais lu côté RLS ni logique métier V1.
create table if not exists public.resto_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.resto_menu_categories(id) on delete set null,
  nom text not null,
  description text,
  prix numeric(14,2) not null check (prix >= 0),
  photo_url text,
  disponible boolean not null default true,
  temps_preparation_min integer,
  station text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_menu_items_org on public.resto_menu_items(organization_id);
create index if not exists idx_resto_menu_items_category on public.resto_menu_items(category_id);
alter table public.resto_menu_items enable row level security;

create policy resto_menu_items_select on public.resto_menu_items for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_menu_items_write on public.resto_menu_items for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

create table if not exists public.resto_modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_modifiers_org on public.resto_modifiers(organization_id);
alter table public.resto_modifiers enable row level security;

create policy resto_modifiers_select on public.resto_modifiers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_modifiers_write on public.resto_modifiers for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

create table if not exists public.resto_modifier_options (
  id uuid primary key default gen_random_uuid(),
  modifier_id uuid not null references public.resto_modifiers(id) on delete cascade,
  nom text not null,
  impact_prix numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_modifier_options_modifier on public.resto_modifier_options(modifier_id);
alter table public.resto_modifier_options enable row level security;

-- resto_modifier_options n'a pas sa propre organization_id (elle appartient
-- à un modifier, qui en a une) — la RLS remonte via un sous-select sur
-- resto_modifiers. Pas de dépendance circulaire : has_any_role_in_organization()
-- ne référence jamais resto_modifier_options ni resto_menu_item_modifiers.
create policy resto_modifier_options_select on public.resto_modifier_options for select to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_any_role_in_organization(m.organization_id, array['owner','manager','accountant','server','cook']::public.app_role[])
  ));
create policy resto_modifier_options_write on public.resto_modifier_options for all to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_module_permission(m.organization_id, 'resto_menu', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_module_permission(m.organization_id, 'resto_menu', 'manage')
  ));

create table if not exists public.resto_menu_item_modifiers (
  menu_item_id uuid not null references public.resto_menu_items(id) on delete cascade,
  modifier_id uuid not null references public.resto_modifiers(id) on delete cascade,
  primary key (menu_item_id, modifier_id)
);
alter table public.resto_menu_item_modifiers enable row level security;

create policy resto_menu_item_modifiers_select on public.resto_menu_item_modifiers for select to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_any_role_in_organization(i.organization_id, array['owner','manager','accountant','server','cook']::public.app_role[])
  ));
create policy resto_menu_item_modifiers_write on public.resto_menu_item_modifiers for all to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_module_permission(i.organization_id, 'resto_menu', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_module_permission(i.organization_id, 'resto_menu', 'manage')
  ));

-- Migration 038 — ZegResto, étape 4/7 : Commandes + KDS (cuisine), flux
-- temps réel (première utilisation de Supabase Realtime dans ce projet).

create table if not exists public.resto_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_id uuid references public.resto_tables(id) on delete set null,
  type text not null default 'salle' check (type in ('salle', 'emporter', 'livraison')),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'envoyee', 'servie', 'fermee', 'annulee')),
  server_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_resto_orders_org on public.resto_orders(organization_id);
create index if not exists idx_resto_orders_table on public.resto_orders(table_id);
alter table public.resto_orders enable row level security;

create policy resto_orders_select on public.resto_orders for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_orders_insert on public.resto_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'create'));
create policy resto_orders_update on public.resto_orders for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
create policy resto_orders_delete on public.resto_orders for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- resto_order_courses (migration 043) : une commande se découpe en étapes
-- d'envoi cuisine (Entrée/Plat/Dessert, ou un simple numéro pour une
-- commande sans étapes explicites — voir add_resto_order_item() plus bas
-- qui crée l'étape par défaut ordre=1 au besoin). Un ticket cuisine
-- (resto_kitchen_tickets) correspond désormais à une étape, plus à une
-- commande entière.
create table if not exists public.resto_order_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  ordre integer not null default 1,
  nom text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoyee', 'en_preparation', 'pret', 'servie')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_order_courses_org on public.resto_order_courses(organization_id);
create index if not exists idx_resto_order_courses_order on public.resto_order_courses(order_id);
alter table public.resto_order_courses enable row level security;

create policy resto_order_courses_select on public.resto_order_courses for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_order_courses_insert on public.resto_order_courses for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'create'));
create policy resto_order_courses_update on public.resto_order_courses for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
create policy resto_order_courses_delete on public.resto_order_courses for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- organization_id ajouté sur order_items/kitchen_tickets (non listées dans
-- la demande initiale, qui ne l'avait explicitement que sur resto_orders) —
-- cohérence avec la règle du projet + évite un sous-select vers resto_orders
-- sur chaque lecture RLS (flux KDS lu en continu). course_id (migration
-- 043) : rattachement à l'étape d'envoi cuisine ; statut_ligne étendu avec
-- 'pret' (marquage ligne par ligne côté KDS, distinct de 'servie' posé par
-- le serveur).
create table if not exists public.resto_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  course_id uuid references public.resto_order_courses(id) on delete set null,
  menu_item_id uuid references public.resto_menu_items(id) on delete set null,
  quantite numeric(10,2) not null check (quantite > 0),
  modifiers_choisis jsonb not null default '[]'::jsonb,
  statut_ligne text not null default 'en_attente' check (statut_ligne in ('en_attente', 'pret', 'servie', 'annulee')),
  prix_unitaire numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_order_items_org on public.resto_order_items(organization_id);
create index if not exists idx_resto_order_items_order on public.resto_order_items(order_id);
create index if not exists idx_resto_order_items_course on public.resto_order_items(course_id);
alter table public.resto_order_items enable row level security;

-- INSERT restreint à owner/manager en direct : server passe par
-- add_resto_order_item() (security definer, plus bas). UPDATE direct
-- laissé à owner/manager/server pour l'édition libre (quantité,
-- modificateurs...) ; le marquage de statut par le cuisinier passe
-- exclusivement par mark_resto_order_item_statut() (migration 043, RPC
-- security definer étroite — cook n'a aucun accès UPDATE direct à cette
-- table, pour ne pas exposer prix_unitaire/quantite/etc. à sa policy).
create policy resto_order_items_select on public.resto_order_items for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_order_items_insert on public.resto_order_items for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy resto_order_items_update on public.resto_order_items for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
create policy resto_order_items_delete on public.resto_order_items for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Un ticket par étape d'envoi cuisine (course_id, migration 043 — avant
-- cela un ticket par commande entière). order_id conservé pour les
-- jointures directes existantes. ready_at posé au passage à 'pret', effacé
-- si remis en attente.
create table if not exists public.resto_kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  course_id uuid references public.resto_order_courses(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'en_preparation', 'pret')),
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index if not exists idx_resto_kitchen_tickets_org on public.resto_kitchen_tickets(organization_id);
create unique index if not exists idx_resto_kitchen_tickets_course_unique on public.resto_kitchen_tickets(course_id) where course_id is not null;
alter table public.resto_kitchen_tickets enable row level security;

create policy resto_kitchen_tickets_select on public.resto_kitchen_tickets for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
create policy resto_kitchen_tickets_insert on public.resto_kitchen_tickets for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
-- update inclut cook : c'est lui qui fait avancer le ticket depuis le KDS.
create policy resto_kitchen_tickets_update on public.resto_kitchen_tickets for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_cuisine', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_cuisine', 'manage'));
create policy resto_kitchen_tickets_delete on public.resto_kitchen_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

alter table public.resto_kitchen_tickets replica identity full;
alter table public.resto_order_items replica identity full;
alter table public.resto_orders replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.resto_kitchen_tickets;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.resto_order_items;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.resto_orders;
exception when duplicate_object then null;
end $$;

-- add_resto_order_item() : RPC security definer — server n'a pas de droit
-- d'écriture direct sur resto_order_items, donc ajouter un article passe
-- forcément par ici (article + décrément de stock des ingrédients de la
-- recette si elle existe, atomique). Prix unitaire figé à l'insertion.
-- Signature étendue par la migration 043 (p_course_id, 6e argument) —
-- create or replace sûr uniquement de 038 vers 040 (même signature) ; le
-- passage à 6 arguments par la 043 a nécessité un drop function préalable
-- de l'ancienne signature 5-arguments (piège documenté dans CLAUDE.md), ici
-- schema.sql ne montre que le create final. Ne touche plus
-- resto_kitchen_tickets directement depuis la 043 — l'envoi en cuisine est
-- un acte explicite (send_resto_course(), plus bas). p_course_id = null :
-- réutilise ou crée l'étape par défaut (ordre=1) de la commande.
create or replace function public.add_resto_order_item(
  p_organization_id uuid,
  p_order_id uuid,
  p_menu_item_id uuid,
  p_quantite numeric,
  p_modifiers jsonb default '[]'::jsonb,
  p_course_id uuid default null
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_order public.resto_orders;
  v_item public.resto_menu_items;
  v_modifier_total numeric(14,2) := 0;
  v_unit_price numeric(14,2);
  v_order_item public.resto_order_items;
  v_course_id uuid;
  v_course public.resto_order_courses;
  v_recipe_id uuid;
  v_ingredient record;
begin
  if not public.has_module_permission(p_organization_id, 'resto_commandes', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'Quantité invalide.';
  end if;

  select * into v_order from public.resto_orders where id = p_order_id and organization_id = p_organization_id;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_order.statut in ('fermee', 'annulee') then
    raise exception 'Impossible d''ajouter un article à une commande fermée ou annulée.';
  end if;

  select * into v_item from public.resto_menu_items where id = p_menu_item_id and organization_id = p_organization_id;
  if not found then raise exception 'Article introuvable.'; end if;
  if not v_item.disponible then raise exception 'Cet article n''est plus disponible.'; end if;

  if p_course_id is not null then
    select * into v_course from public.resto_order_courses where id = p_course_id and order_id = p_order_id;
    if not found then raise exception 'Étape introuvable.'; end if;
    v_course_id := p_course_id;
  else
    select * into v_course from public.resto_order_courses
      where order_id = p_order_id and ordre = 1
      order by created_at limit 1;
    if not found then
      insert into public.resto_order_courses (organization_id, order_id, ordre, statut)
      values (p_organization_id, p_order_id, 1, 'brouillon')
      returning * into v_course;
    end if;
    v_course_id := v_course.id;
  end if;

  select coalesce(sum((opt->>'impact_prix')::numeric), 0) into v_modifier_total
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) opt;
  v_unit_price := v_item.prix + v_modifier_total;

  insert into public.resto_order_items (organization_id, order_id, course_id, menu_item_id, quantite, modifiers_choisis, statut_ligne, prix_unitaire)
  values (p_organization_id, p_order_id, v_course_id, p_menu_item_id, p_quantite, coalesce(p_modifiers, '[]'::jsonb), 'en_attente', v_unit_price)
  returning * into v_order_item;

  -- Décrément de stock optionnel (Phase 4) : seulement si une recette
  -- existe pour cet article. Réutilise apply_stock_movement() (trigger
  -- existant sur stock_movements) pour la mise à jour + le garde-fou
  -- anti-survente — si un ingrédient manque, toute la transaction annule.
  -- Toujours au moment de l'ajout au panier, pas repoussé à l'envoi cuisine.
  select id into v_recipe_id from public.resto_recipes where menu_item_id = p_menu_item_id;
  if v_recipe_id is not null then
    for v_ingredient in
      select ingredient_ref, quantite from public.resto_recipe_ingredients where recipe_id = v_recipe_id
    loop
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_ingredient.ingredient_ref, 'sale', v_ingredient.quantite * p_quantite, 'Recette ZegResto', auth.uid());
    end loop;
  end if;

  -- Si l'étape est déjà envoyée (article ajouté après coup) et que son
  -- ticket était déjà "pret", le repasser en attente.
  if v_course.statut in ('envoyee', 'en_preparation', 'pret') then
    update public.resto_kitchen_tickets set statut = 'en_attente', ready_at = null
      where course_id = v_course_id and statut = 'pret';
    if v_course.statut = 'pret' then
      update public.resto_order_courses set statut = 'en_preparation' where id = v_course_id;
    end if;
  end if;

  return v_order_item;
end;
$$;
revoke all on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb, uuid) from public;
grant execute on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb, uuid) to authenticated;

-- send_resto_course() (migration 043) : déclenchement explicite d'un envoi
-- en cuisine par le serveur — security definer (écrit
-- resto_kitchen_tickets, comme add_resto_order_item()).
create or replace function public.send_resto_course(
  p_organization_id uuid,
  p_course_id uuid
) returns public.resto_order_courses
language plpgsql security definer set search_path = public as $$
declare
  v_course public.resto_order_courses;
  v_item_count integer;
  v_existing_ticket public.resto_kitchen_tickets;
begin
  if not public.has_module_permission(p_organization_id, 'resto_commandes', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_course from public.resto_order_courses where id = p_course_id and organization_id = p_organization_id;
  if not found then raise exception 'Étape introuvable.'; end if;

  select count(*) into v_item_count from public.resto_order_items
    where course_id = p_course_id and statut_ligne <> 'annulee';
  if v_item_count = 0 then
    raise exception 'Aucun article à envoyer pour cette étape.';
  end if;

  select * into v_existing_ticket from public.resto_kitchen_tickets where course_id = p_course_id;
  if not found then
    insert into public.resto_kitchen_tickets (organization_id, order_id, course_id, statut)
    values (p_organization_id, v_course.order_id, p_course_id, 'en_attente');
  elsif v_existing_ticket.statut = 'pret' then
    update public.resto_kitchen_tickets set statut = 'en_attente', ready_at = null where id = v_existing_ticket.id;
  end if;

  update public.resto_order_courses set statut = 'envoyee', sent_at = now() where id = p_course_id
  returning * into v_course;

  update public.resto_orders set statut = 'envoyee' where id = v_course.order_id and statut = 'ouverte';

  return v_course;
end;
$$;
revoke all on function public.send_resto_course(uuid, uuid) from public;
grant execute on function public.send_resto_course(uuid, uuid) to authenticated;

-- mark_resto_order_item_statut() (migration 043) : narrow — le cuisinier
-- n'a aucun accès RLS direct en écriture à resto_order_items (une policy
-- update large l'exposerait à modifier n'importe quelle autre colonne de
-- la ligne, ex. prix_unitaire/quantite — RLS ne restreint que les lignes,
-- jamais les colonnes, cf. pattern hotel_guest_contact()). p_statut =
-- 'pret' pour cook comme pour le personnel de salle ; 'servie' reste
-- réservé à owner/manager/server (le cuisinier ne "sert" jamais un plat).
create or replace function public.mark_resto_order_item_statut(
  p_organization_id uuid,
  p_item_id uuid,
  p_statut text
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_allowed boolean;
  v_item public.resto_order_items;
begin
  if p_statut not in ('pret', 'servie') then
    raise exception 'Statut invalide.';
  end if;
  -- 'pret' : accessible à qui a 'manage' sur resto_cuisine (cook) OU sur
  -- resto_commandes (server) — reproduit l'union owner/manager/server/cook
  -- d'origine (migration 069). 'servie' : seulement resto_commandes.manage
  -- (owner/manager/server) — cook en est exclu, comme avant.
  if p_statut = 'pret' then
    v_allowed := public.has_module_permission(p_organization_id, 'resto_cuisine', 'manage')
      or public.has_module_permission(p_organization_id, 'resto_commandes', 'manage');
  else
    v_allowed := public.has_module_permission(p_organization_id, 'resto_commandes', 'manage');
  end if;
  if not v_allowed then
    raise exception 'Accès refusé.';
  end if;

  update public.resto_order_items set statut_ligne = p_statut
    where id = p_item_id and organization_id = p_organization_id and statut_ligne <> 'annulee'
    returning * into v_item;
  if not found then raise exception 'Article de commande introuvable.'; end if;

  return v_item;
end;
$$;
revoke all on function public.mark_resto_order_item_statut(uuid, uuid, text) from public;
grant execute on function public.mark_resto_order_item_statut(uuid, uuid, text) to authenticated;

-- Migration 039 — ZegResto, étape 5/7 : Réservations (staff + formulaire
-- public /resto/reserver/$slug). Le formulaire public n'écrit jamais
-- directement dans resto_reservations (aucune policy insert to anon) —
-- il passe par resto_public_create_reservation() (security definer),
-- seule porte d'écriture anonyme de tout ZegResto.

create table if not exists public.resto_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_id uuid references public.resto_tables(id) on delete set null,
  nom_client text not null,
  telephone_client text,
  date_heure timestamptz not null,
  nombre_couverts integer not null check (nombre_couverts > 0),
  statut text not null default 'pending' check (statut in ('pending', 'confirmee', 'annulee', 'honoree')),
  source text not null default 'staff' check (source in ('staff', 'public')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_reservations_org on public.resto_reservations(organization_id);
create index if not exists idx_resto_reservations_date on public.resto_reservations(date_heure);
alter table public.resto_reservations enable row level security;

create policy resto_reservations_select on public.resto_reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_reservations', 'view'));
create policy resto_reservations_insert on public.resto_reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_reservations', 'create'));
create policy resto_reservations_update on public.resto_reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_reservations', 'manage'));
create policy resto_reservations_delete on public.resto_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Identité minimale d'un restaurant à partir de son slug public — filtre
-- app_module = 'resto' pour qu'un slug ZegCaisse/ZegHotel ne fuite jamais
-- par cette route.
create or replace function public.resto_public_organization_info(p_slug text)
returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name from public.organizations o
  where o.slug = p_slug and o.app_module = 'resto' and not o.suspended;
$$;
revoke all on function public.resto_public_organization_info(text) from public;
grant execute on function public.resto_public_organization_info(text) to anon, authenticated;

-- Aucune limite de débit/anti-spam en V1 (assumé, documenté dans
-- ARCHITECTURE.md).
create or replace function public.resto_public_create_reservation(
  p_slug text,
  p_nom_client text,
  p_telephone_client text,
  p_date_heure timestamptz,
  p_nombre_couverts integer,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
  v_id uuid;
begin
  select id into v_organization_id from public.organizations
  where slug = p_slug and app_module = 'resto' and not suspended;
  if v_organization_id is null then
    raise exception 'Restaurant introuvable.';
  end if;
  if p_nom_client is null or trim(p_nom_client) = '' then
    raise exception 'Nom requis.';
  end if;
  if p_nombre_couverts is null or p_nombre_couverts <= 0 then
    raise exception 'Nombre de couverts invalide.';
  end if;
  if p_date_heure is null or p_date_heure <= now() then
    raise exception 'La date et l''heure doivent être dans le futur.';
  end if;

  insert into public.resto_reservations
    (organization_id, nom_client, telephone_client, date_heure, nombre_couverts, statut, source, notes)
  values
    (v_organization_id, trim(p_nom_client), nullif(trim(coalesce(p_telephone_client, '')), ''), p_date_heure, p_nombre_couverts, 'pending', 'public', p_notes)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.resto_public_create_reservation(text, text, text, timestamptz, integer, text) from public;
grant execute on function public.resto_public_create_reservation(text, text, text, timestamptz, integer, text) to anon, authenticated;

-- Migration 040 — ZegResto, étape 6/7 : Stock & recettes. Décision produit
-- documentée : resto_recipe_ingredients.ingredient_ref référence
-- directement public.products(id) — les ingrédients SONT des produits
-- ZegCaisse ordinaires, stock suivi par stock_levels/stock_movements
-- déjà existants (même réutilisation que le POS interne ZegHotel, Phase 7).
-- Aucune conversion d'unité automatique en V1 (limite assumée). Le corps de
-- add_resto_order_item() (défini plus haut, migration 038) a été mis à jour
-- en place par cette migration pour décrémenter le stock des ingrédients —
-- voir son commentaire.

create table if not exists public.resto_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  menu_item_id uuid not null references public.resto_menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (menu_item_id)
);
create index if not exists idx_resto_recipes_org on public.resto_recipes(organization_id);
alter table public.resto_recipes enable row level security;

create policy resto_recipes_select on public.resto_recipes for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_recettes', 'view'));
create policy resto_recipes_write on public.resto_recipes for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_recettes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_recettes', 'manage'));

create table if not exists public.resto_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.resto_recipes(id) on delete cascade,
  ingredient_ref uuid not null references public.products(id) on delete restrict,
  quantite numeric(14,3) not null check (quantite > 0),
  unite text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_recipe_ingredients_recipe on public.resto_recipe_ingredients(recipe_id);
alter table public.resto_recipe_ingredients enable row level security;

create policy resto_recipe_ingredients_select on public.resto_recipe_ingredients for select to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'view')
  ));
create policy resto_recipe_ingredients_write on public.resto_recipe_ingredients for all to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'manage')
  ));

-- resto_settings (migration 044) : une ligne par organisation, créée à la
-- volée par le premier upsert depuis /app/resto/parametres (pas de ligne
-- par défaut via provision_organization(), même pattern que
-- hotel_settings). KDS (migration 044) + fidélité (migration 045, colonnes
-- loyalty_*) — d'autres réglages ZegResto viendront s'ajouter par ALTER
-- TABLE ADD COLUMN sans toucher à ce qui existe déjà ici.
create table if not exists public.resto_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  kds_auto_refresh_seconds integer not null default 15 check (kds_auto_refresh_seconds in (10, 15, 30)),
  kds_urgency_minutes integer not null default 10 check (kds_urgency_minutes > 0),
  kds_sound_enabled boolean not null default true,
  kds_sound_choice text not null default 'chime' check (kds_sound_choice in ('chime', 'bell', 'soft')),
  kds_sound_volume numeric(3,2) not null default 0.6 check (kds_sound_volume >= 0 and kds_sound_volume <= 1),
  loyalty_enabled boolean not null default false,
  loyalty_earn_amount_per_point numeric(14,2) not null default 100 check (loyalty_earn_amount_per_point > 0),
  loyalty_redeem_value_per_point numeric(14,4) not null default 1 check (loyalty_redeem_value_per_point >= 0),
  loyalty_min_points_to_redeem integer not null default 1 check (loyalty_min_points_to_redeem >= 0),
  -- Fond de caisse (migration 046) : réglage de configuration uniquement
  -- (montant par défaut + bascule "ouverture obligatoire"), pas un suivi de
  -- session de caisse complet (aucune fonctionnalité de ce type n'existe
  -- ailleurs dans ZegOS, ZegCaisse compris — écart volontaire, non demandé
  -- comme livrable séparé).
  cash_float_default numeric(14,2) not null default 0 check (cash_float_default >= 0),
  cash_float_required boolean not null default false,
  -- Alerte sonore nouvelle réservation (migration 046) : réutilise la même
  -- palette que le KDS (kds_sound_choice/kds_sound_volume) plutôt que
  -- dupliquer choix+volume par type d'alerte.
  reservation_sound_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.resto_settings enable row level security;

-- Lecture étendue (cook a besoin des réglages KDS pour son propre écran,
-- server a besoin du taux de conversion fidélité en salle) ; écriture
-- strictement owner/manager (page Paramètres), même pattern que
-- hotel_settings.
create policy resto_settings_select on public.resto_settings for select to authenticated
  using (public.has_organization_access(organization_id));
create policy resto_settings_write on public.resto_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_parametres', 'manage'));

-- resto_loyalty_accounts (migration 045) : identité indépendante de
-- ZegResto, clé = numéro de téléphone — PAS de FK vers public.customers
-- (ZegCaisse), pour préserver l'isolation entre applications (même
-- principe que hotel_guests). Voir ARCHITECTURE.md : fonctionnalité
-- ZegResto uniquement, pas une primitive de plateforme partagée.
create table if not exists public.resto_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  telephone text not null,
  nom text,
  points_balance integer not null default 0 check (points_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, telephone)
);
create index if not exists idx_resto_loyalty_accounts_org on public.resto_loyalty_accounts(organization_id);
alter table public.resto_loyalty_accounts enable row level security;

create policy resto_loyalty_accounts_select on public.resto_loyalty_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'view'));
-- INSERT limité à points_balance = 0 : tout crédit de points passe
-- exclusivement par les RPC security definer (apply_resto_bill_loyalty(),
-- add_resto_bill_payment()), jamais par une écriture directe.
create policy resto_loyalty_accounts_insert on public.resto_loyalty_accounts for insert to authenticated
  with check (
    points_balance = 0
    and public.has_module_permission(organization_id, 'resto_fidelite', 'create')
  );
-- UPDATE direct réservé à owner/manager (correction nom/téléphone) —
-- server n'a aucun accès UPDATE direct : RLS ne masque que des lignes,
-- jamais des colonnes (cf. hotel_guest_contact()), donc lui laisser un
-- accès UPDATE, même pour "juste le nom", l'exposerait aussi à modifier
-- points_balance directement.
create policy resto_loyalty_accounts_update on public.resto_loyalty_accounts for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'));
create policy resto_loyalty_accounts_delete on public.resto_loyalty_accounts for delete to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'));

-- Migration 041 — ZegResto : Facturation (notes, partage, paiements).
-- Comme pour resto_order_items/resto_kitchen_tickets, organization_id est
-- ajouté sur resto_bill_splits/resto_bill_split_items/resto_bill_payments
-- (non listées dans le schéma de la demande initiale).

-- loyalty_account_id/loyalty_discount/loyalty_points_* (migration 045) :
-- rattachement optionnel à un compte fidélité et remise appliquée,
-- calculés exclusivement par apply_resto_bill_loyalty()/add_resto_bill_payment()
-- (jamais saisis librement) — voir le résumé de fin de chantier pour la
-- réserve de sécurité qu'implique la policy resto_bills_update existante
-- (owner/manager/server, déjà large avant la fidélité — cf. colonne total).
create table if not exists public.resto_bills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  total numeric(14,2) not null default 0,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'payee', 'annulee')),
  split_mode text not null default 'aucun' check (split_mode in ('aucun', 'egal', 'detaille')),
  loyalty_account_id uuid references public.resto_loyalty_accounts(id) on delete set null,
  loyalty_discount numeric(14,2) not null default 0 check (loyalty_discount >= 0),
  loyalty_points_earned integer not null default 0,
  loyalty_points_redeemed integer not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists idx_resto_bills_org on public.resto_bills(organization_id);
alter table public.resto_bills enable row level security;

create policy resto_bills_select on public.resto_bills for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));
create policy resto_bills_insert on public.resto_bills for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'create'));
create policy resto_bills_update on public.resto_bills for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'manage'));
create policy resto_bills_delete on public.resto_bills for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- resto_loyalty_transactions (migration 045) : historique earn/spend —
-- écriture exclusivement via apply_resto_bill_loyalty()/add_resto_bill_payment()
-- (aucune policy insert/update/delete accordée à quiconque directement) :
-- lecture seule pour le staff, même owner/manager.
create table if not exists public.resto_loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.resto_loyalty_accounts(id) on delete cascade,
  bill_id uuid references public.resto_bills(id) on delete set null,
  type text not null check (type in ('earn', 'spend')),
  points integer not null check (points > 0),
  montant numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_loyalty_transactions_org on public.resto_loyalty_transactions(organization_id);
create index if not exists idx_resto_loyalty_transactions_account on public.resto_loyalty_transactions(account_id);
create index if not exists idx_resto_loyalty_transactions_bill on public.resto_loyalty_transactions(bill_id);
alter table public.resto_loyalty_transactions enable row level security;

create policy resto_loyalty_transactions_select on public.resto_loyalty_transactions for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'view'));

-- Un split par "convive" (mode égal : montant réparti par create_resto_bill() ;
-- mode détaillé : montant recalculé depuis resto_bill_split_items par
-- set_resto_bill_split_items() — jamais les deux mécanismes en même temps).
create table if not exists public.resto_bill_splits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_index integer not null,
  montant numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (bill_id, split_index)
);
create index if not exists idx_resto_bill_splits_org on public.resto_bill_splits(organization_id);
create index if not exists idx_resto_bill_splits_bill on public.resto_bill_splits(bill_id);
alter table public.resto_bill_splits enable row level security;

create policy resto_bill_splits_select on public.resto_bill_splits for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));
create policy resto_bill_splits_write on public.resto_bill_splits for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'manage'));

-- Mode détaillé uniquement — peuplée uniquement par set_resto_bill_split_items()
-- (aucune policy insert/update/delete to authenticated : jamais d'écriture
-- directe côté client, la cohérence avec resto_bill_splits.montant doit
-- rester atomique).
create table if not exists public.resto_bill_split_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_index integer not null,
  order_item_id uuid not null references public.resto_order_items(id) on delete cascade,
  unique (bill_id, order_item_id)
);
create index if not exists idx_resto_bill_split_items_org on public.resto_bill_split_items(organization_id);
create index if not exists idx_resto_bill_split_items_bill on public.resto_bill_split_items(bill_id);
alter table public.resto_bill_split_items enable row level security;

create policy resto_bill_split_items_select on public.resto_bill_split_items for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));

create table if not exists public.resto_bill_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_id uuid references public.resto_bill_splits(id) on delete set null,
  methode text not null check (methode in ('mobile_money', 'cash', 'carte')),
  montant numeric(14,2) not null check (montant > 0),
  statut text not null default 'validee' check (statut in ('validee', 'annulee')),
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_bill_payments_org on public.resto_bill_payments(organization_id);
create index if not exists idx_resto_bill_payments_bill on public.resto_bill_payments(bill_id);
alter table public.resto_bill_payments enable row level security;

create policy resto_bill_payments_select on public.resto_bill_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_paiements', 'view'));
-- Pas de policy insert : les paiements ne sont enregistrés que via
-- add_resto_bill_payment() (security definer plus bas).
create policy resto_bill_payments_update on public.resto_bill_payments for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_paiements', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_paiements', 'manage'));

create or replace function public.create_resto_bill(
  p_organization_id uuid,
  p_order_id uuid,
  p_split_mode text default 'aucun',
  p_split_count integer default null
) returns public.resto_bills
language plpgsql security invoker set search_path = public as $$
declare
  v_total numeric(14,2);
  v_bill public.resto_bills;
  v_part numeric(14,2);
  i integer;
begin
  if not public.has_module_permission(p_organization_id, 'resto_facturation', 'create') then
    raise exception 'Accès refusé.';
  end if;
  select coalesce(sum(prix_unitaire * quantite), 0) into v_total
  from public.resto_order_items where order_id = p_order_id and statut_ligne <> 'annulee';

  insert into public.resto_bills (order_id, organization_id, total, split_mode)
  values (p_order_id, p_organization_id, v_total, coalesce(p_split_mode, 'aucun'))
  returning * into v_bill;

  if p_split_mode = 'egal' and p_split_count is not null and p_split_count > 1 then
    v_part := trunc(v_total / p_split_count, 2);
    for i in 1..p_split_count loop
      insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
      values (p_organization_id, v_bill.id, i, case when i = p_split_count then v_total - v_part * (p_split_count - 1) else v_part end);
    end loop;
  end if;

  return v_bill;
end;
$$;
revoke all on function public.create_resto_bill(uuid, uuid, text, integer) from public;
grant execute on function public.create_resto_bill(uuid, uuid, text, integer) to authenticated;

create or replace function public.set_resto_bill_split_items(
  p_bill_id uuid,
  p_assignments jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_assignment jsonb;
  v_split_index integer;
begin
  select * into v_bill from public.resto_bills where id = p_bill_id;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_module_permission(v_bill.organization_id, 'resto_facturation', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  delete from public.resto_bill_split_items where bill_id = p_bill_id;
  delete from public.resto_bill_splits where bill_id = p_bill_id;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    insert into public.resto_bill_split_items (organization_id, bill_id, split_index, order_item_id)
    values (v_bill.organization_id, p_bill_id, (v_assignment->>'split_index')::integer, (v_assignment->>'order_item_id')::uuid);
  end loop;

  for v_split_index in
    select distinct (a->>'split_index')::integer from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) a
  loop
    insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
    select v_bill.organization_id, p_bill_id, v_split_index,
      coalesce(sum(oi.prix_unitaire * oi.quantite), 0)
    from public.resto_bill_split_items bsi
    join public.resto_order_items oi on oi.id = bsi.order_item_id
    where bsi.bill_id = p_bill_id and bsi.split_index = v_split_index;
  end loop;
end;
$$;
revoke all on function public.set_resto_bill_split_items(uuid, jsonb) from public;
grant execute on function public.set_resto_bill_split_items(uuid, jsonb) to authenticated;

-- security definer (contrairement à add_sale_payment) car resto_bill_payments
-- n'a aucune policy insert directe — voir plus haut.
create or replace function public.add_resto_bill_payment(
  p_bill_id uuid,
  p_montant numeric,
  p_methode text,
  p_split_id uuid default null
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_total_paid numeric(14,2);
  v_table_id uuid;
  v_net_total numeric(14,2);
  v_loyalty_enabled boolean;
  v_earn_amount_per_point numeric(14,2);
  v_points_earned integer;
begin
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide.';
  end if;

  select * into v_bill from public.resto_bills where id = p_bill_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_module_permission(v_bill.organization_id, 'resto_paiements', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if v_bill.statut = 'payee' then raise exception 'Cette note est déjà réglée.'; end if;
  if v_bill.statut = 'annulee' then raise exception 'Cette note a été annulée.'; end if;

  insert into public.resto_bill_payments (organization_id, bill_id, split_id, methode, montant, statut)
  values (v_bill.organization_id, p_bill_id, p_split_id, p_methode, p_montant, 'validee');

  select coalesce(sum(montant), 0) into v_total_paid
  from public.resto_bill_payments where bill_id = p_bill_id and statut = 'validee';

  v_net_total := greatest(v_bill.total - v_bill.loyalty_discount, 0);

  if v_total_paid >= v_net_total then
    update public.resto_bills set statut = 'payee' where id = p_bill_id returning * into v_bill;
    update public.resto_orders set statut = 'fermee', closed_at = now() where id = v_bill.order_id
    returning table_id into v_table_id;
    if v_table_id is not null then
      update public.resto_tables set statut = 'libre' where id = v_table_id and statut <> 'libre';
    end if;

    -- Accrual fidélité (migration 045) : sur le montant net réellement
    -- payé, uniquement si un compte est rattaché et le programme activé.
    if v_bill.loyalty_account_id is not null then
      select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_earn_amount_per_point, 100)
        into v_loyalty_enabled, v_earn_amount_per_point
        from (select 1) x left join public.resto_settings rs on rs.organization_id = v_bill.organization_id;
      if v_loyalty_enabled then
        v_points_earned := floor(v_net_total / v_earn_amount_per_point)::integer;
        if v_points_earned > 0 then
          update public.resto_loyalty_accounts set points_balance = points_balance + v_points_earned, updated_at = now()
            where id = v_bill.loyalty_account_id;
          insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
          values (v_bill.organization_id, v_bill.loyalty_account_id, p_bill_id, 'earn', v_points_earned, v_net_total);
          update public.resto_bills set loyalty_points_earned = v_points_earned where id = p_bill_id returning * into v_bill;
        end if;
      end if;
    end if;
  end if;

  return v_bill;
end;
$$;
revoke all on function public.add_resto_bill_payment(uuid, numeric, text, uuid) from public;
grant execute on function public.add_resto_bill_payment(uuid, numeric, text, uuid) to authenticated;

-- apply_resto_bill_loyalty() (migration 045) : rattache (ou crée) un
-- compte fidélité à une note encore ouverte, et échange éventuellement des
-- points contre une remise. Ré-appelable (le serveur change d'avis sur le
-- nombre de points) : rembourse d'abord tout échange précédent sur cette
-- note avant d'appliquer le nouveau. Ne touche jamais resto_bills.total (le
-- brut reste inchangé, seule loyalty_discount varie) — add_resto_bill_payment()
-- compare le montant réglé à (total - loyalty_discount).
create or replace function public.apply_resto_bill_loyalty(
  p_organization_id uuid,
  p_bill_id uuid,
  p_telephone text,
  p_nom text default null,
  p_redeem_points integer default 0
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_account public.resto_loyalty_accounts;
  v_loyalty_enabled boolean;
  v_redeem_value_per_point numeric(14,4);
  v_min_redeem integer;
  v_discount numeric(14,2) := 0;
  v_phone text;
begin
  if not public.has_module_permission(p_organization_id, 'resto_fidelite', 'create') then
    raise exception 'Accès refusé.';
  end if;
  v_phone := nullif(trim(p_telephone), '');
  if v_phone is null then raise exception 'Numéro de téléphone requis.'; end if;
  if p_redeem_points is null or p_redeem_points < 0 then raise exception 'Points invalides.'; end if;

  select * into v_bill from public.resto_bills where id = p_bill_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if v_bill.statut <> 'ouverte' then raise exception 'Cette note ne peut plus être modifiée.'; end if;

  select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_redeem_value_per_point, 1), coalesce(rs.loyalty_min_points_to_redeem, 1)
    into v_loyalty_enabled, v_redeem_value_per_point, v_min_redeem
    from (select 1) x left join public.resto_settings rs on rs.organization_id = p_organization_id;
  if not v_loyalty_enabled then
    raise exception 'Le programme de fidélité n''est pas activé pour cet établissement.';
  end if;

  if v_bill.loyalty_points_redeemed > 0 and v_bill.loyalty_account_id is not null then
    update public.resto_loyalty_accounts set points_balance = points_balance + v_bill.loyalty_points_redeemed, updated_at = now()
      where id = v_bill.loyalty_account_id;
    delete from public.resto_loyalty_transactions where bill_id = p_bill_id and type = 'spend';
  end if;

  select * into v_account from public.resto_loyalty_accounts where organization_id = p_organization_id and telephone = v_phone;
  if not found then
    insert into public.resto_loyalty_accounts (organization_id, telephone, nom, points_balance)
    values (p_organization_id, v_phone, p_nom, 0)
    returning * into v_account;
  elsif p_nom is not null and coalesce(v_account.nom, '') = '' then
    update public.resto_loyalty_accounts set nom = p_nom, updated_at = now() where id = v_account.id returning * into v_account;
  end if;

  if p_redeem_points > 0 then
    if p_redeem_points < v_min_redeem then
      raise exception 'Minimum % points requis pour un échange.', v_min_redeem;
    end if;
    if v_account.points_balance < p_redeem_points then
      raise exception 'Solde de points insuffisant.';
    end if;
    v_discount := round(least(p_redeem_points * v_redeem_value_per_point, v_bill.total), 2);
    update public.resto_loyalty_accounts set points_balance = points_balance - p_redeem_points, updated_at = now() where id = v_account.id;
    insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
    values (p_organization_id, v_account.id, p_bill_id, 'spend', p_redeem_points, v_discount);
  end if;

  update public.resto_bills set loyalty_account_id = v_account.id, loyalty_discount = v_discount, loyalty_points_redeemed = p_redeem_points
    where id = p_bill_id
    returning * into v_bill;

  return v_bill;
end;
$$;
revoke all on function public.apply_resto_bill_loyalty(uuid, uuid, text, text, integer) from public;
grant execute on function public.apply_resto_bill_loyalty(uuid, uuid, text, text, integer) to authenticated;

-- =============== ZegERP (migrations 047+) ===============
-- Voir ARCHITECTURE_ERP.md pour la documentation complète (isolation
-- totale vis-à-vis de ZegCaisse, schéma des 10 sous-modules, rôles).
-- Module 1/10 livré ici : Stock / Produits (migration 048). Module 2/10
-- livré plus bas : Achats & Fournisseurs (migrations 049+050, introduit le
-- rôle buyer). Colonnes en anglais (comme ZegCaisse/ZegHotel — ZegResto est
-- l'exception, pas la référence).

create table if not exists public.erp_product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.erp_product_categories(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_product_categories_org on public.erp_product_categories(organization_id);
alter table public.erp_product_categories enable row level security;

create policy erp_product_categories_select on public.erp_product_categories for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_product_categories_write on public.erp_product_categories for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

create table if not exists public.erp_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_brands_org on public.erp_brands(organization_id);
alter table public.erp_brands enable row level security;

create policy erp_brands_select on public.erp_brands for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_brands_write on public.erp_brands for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

-- Unités de mesure propres à chaque organisation (pas de table de
-- référence globale).
create table if not exists public.erp_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_units_org on public.erp_units(organization_id);
alter table public.erp_units enable row level security;

create policy erp_units_select on public.erp_units for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_units_write on public.erp_units for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

-- Multi-dépôts natif (contrairement à ZegCaisse, un seul niveau de stock
-- par organisation). is_default : un seul dépôt par défaut par
-- organisation, garanti par le trigger ci-dessous (pas un index unique
-- partiel, pour un message d'erreur plus clair côté UI).
create table if not exists public.erp_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  address text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_warehouses_org on public.erp_warehouses(organization_id);
alter table public.erp_warehouses enable row level security;

create policy erp_warehouses_select on public.erp_warehouses for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_warehouses_write on public.erp_warehouses for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_stock', 'manage'));

create or replace function public.enforce_single_default_erp_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_default then
    update public.erp_warehouses set is_default = false
      where organization_id = new.organization_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;
create trigger trg_erp_warehouses_single_default
  before insert or update of is_default on public.erp_warehouses
  for each row when (new.is_default)
  execute function public.enforce_single_default_erp_warehouse();

create table if not exists public.erp_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.erp_product_categories(id) on delete set null,
  brand_id uuid references public.erp_brands(id) on delete set null,
  unit_id uuid references public.erp_units(id) on delete set null,
  sku text, barcode text, name text not null, description text,
  price numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index if not exists idx_erp_products_org on public.erp_products(organization_id);
create index if not exists idx_erp_products_barcode on public.erp_products(organization_id, barcode);
alter table public.erp_products enable row level security;

create policy erp_products_select on public.erp_products for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_products_write on public.erp_products for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_produits', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_produits', 'manage'));

-- Niveau de stock PAR dépôt (contrairement à stock_levels ZegCaisse) —
-- jamais d'écriture directe, maintenue exclusivement par
-- apply_erp_stock_movement() plus bas.
create table if not exists public.erp_stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete cascade,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id, warehouse_id)
);
create index if not exists idx_erp_stock_levels_org on public.erp_stock_levels(organization_id);
create index if not exists idx_erp_stock_levels_product on public.erp_stock_levels(product_id);
alter table public.erp_stock_levels enable row level security;

create policy erp_stock_levels_select on public.erp_stock_levels for select to authenticated
  using (public.has_organization_access(organization_id));

-- Transferts inter-dépôts. Statuts draft → in_transit → received, pilotés
-- exclusivement par send_erp_stock_transfer()/receive_erp_stock_transfer()
-- (plus bas) — jamais d'écriture directe de `status`.
create table if not exists public.erp_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  from_warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  to_warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'in_transit', 'received')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  check (from_warehouse_id <> to_warehouse_id)
);
create index if not exists idx_erp_stock_transfers_org on public.erp_stock_transfers(organization_id);
alter table public.erp_stock_transfers enable row level security;

create policy erp_stock_transfers_select on public.erp_stock_transfers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
create policy erp_stock_transfers_insert on public.erp_stock_transfers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_stock', 'create'));
create policy erp_stock_transfers_update on public.erp_stock_transfers for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_stock', 'manage'));
create policy erp_stock_transfers_delete on public.erp_stock_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.erp_stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null references public.erp_stock_transfers(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_stock_transfer_lines_org on public.erp_stock_transfer_lines(organization_id);
create index if not exists idx_erp_stock_transfer_lines_transfer on public.erp_stock_transfer_lines(transfer_id);
alter table public.erp_stock_transfer_lines enable row level security;

create policy erp_stock_transfer_lines_select on public.erp_stock_transfer_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
create policy erp_stock_transfer_lines_write on public.erp_stock_transfer_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  );

-- Inventaire physique par dépôt. Statuts in_progress → validated, pilotés
-- exclusivement par validate_erp_inventory() (plus bas).
create table if not exists public.erp_inventories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  status text not null default 'in_progress' check (status in ('in_progress', 'validated')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);
create index if not exists idx_erp_inventories_org on public.erp_inventories(organization_id);
alter table public.erp_inventories enable row level security;

create policy erp_inventories_select on public.erp_inventories for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
create policy erp_inventories_insert on public.erp_inventories for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_stock', 'create'));
create policy erp_inventories_update on public.erp_inventories for update to authenticated
  using (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_stock', 'manage'))
  with check (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_stock', 'manage'));
create policy erp_inventories_delete on public.erp_inventories for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.erp_inventory_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_id uuid not null references public.erp_inventories(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  -- Snapshot du stock théorique au moment de l'ajout de la ligne — voir
  -- migration 048 pour la limite assumée (pas recalculé dynamiquement).
  theoretical_quantity numeric(14,3) not null default 0,
  counted_quantity numeric(14,3),
  created_at timestamptz not null default now(),
  unique (inventory_id, product_id)
);
create index if not exists idx_erp_inventory_lines_org on public.erp_inventory_lines(organization_id);
create index if not exists idx_erp_inventory_lines_inventory on public.erp_inventory_lines(inventory_id);
alter table public.erp_inventory_lines enable row level security;

create policy erp_inventory_lines_select on public.erp_inventory_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
create policy erp_inventory_lines_write on public.erp_inventory_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_stock', 'manage')
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  );

do $$ begin
  create type public.erp_stock_movement_type as enum ('in', 'out', 'adjustment', 'transfer_out', 'transfer_in');
exception when duplicate_object then null;
end $$;

-- Ledger immuable (aucune update/delete). quantity porte le signe pour
-- 'adjustment' ; toujours positif pour in/out/transfer_out/transfer_in,
-- dont le sens est déterminé par `type` (voir apply_erp_stock_movement()).
-- 'transfer_out'/'transfer_in' exclus de l'insert direct côté RLS —
-- uniquement créés par send_erp_stock_transfer()/receive_erp_stock_transfer().
create table if not exists public.erp_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  type public.erp_stock_movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2),
  reason text,
  reference text,
  transfer_id uuid references public.erp_stock_transfers(id) on delete set null,
  inventory_id uuid references public.erp_inventories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_stock_movements_org on public.erp_stock_movements(organization_id);
create index if not exists idx_erp_stock_movements_product on public.erp_stock_movements(product_id, warehouse_id);
create index if not exists idx_erp_stock_movements_transfer on public.erp_stock_movements(transfer_id);
create index if not exists idx_erp_stock_movements_inventory on public.erp_stock_movements(inventory_id);
alter table public.erp_stock_movements enable row level security;

create policy erp_stock_movements_select on public.erp_stock_movements for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_stock', 'view'));
create policy erp_stock_movements_insert on public.erp_stock_movements for insert to authenticated
  with check (
    type in ('in', 'out', 'adjustment')
    and public.has_module_permission(organization_id, 'erp_stock', 'create')
  );

-- Mise à jour par la migration 052 (ZegERP module 3, Ventes & CRM) : ajoute
-- 'sale' (sortie) et 'customer_return' (entrée) — version finale ci-dessous
-- (migration 050 avait ajouté purchase_receipt/supplier_return avant).
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
create trigger trg_erp_stock_movements_apply
  after insert on public.erp_stock_movements
  for each row execute function public.apply_erp_stock_movement();

-- send_erp_stock_transfer() : crée les mouvements 'transfer_out'
-- (décrémente le dépôt source, bloqué par le trigger si stock
-- insuffisant) et passe le transfert "in_transit".
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
revoke all on function public.send_erp_stock_transfer(uuid, uuid) from public;
grant execute on function public.send_erp_stock_transfer(uuid, uuid) to authenticated;

-- receive_erp_stock_transfer() : crée les mouvements 'transfer_in'
-- (incrémente le dépôt destination) et passe le transfert "received".
-- Réception intégrale uniquement en V1 (pas de réception partielle).
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
revoke all on function public.receive_erp_stock_transfer(uuid, uuid) from public;
grant execute on function public.receive_erp_stock_transfer(uuid, uuid) to authenticated;

-- validate_erp_inventory() : pour chaque ligne comptée, crée un mouvement
-- 'adjustment' si l'écart est non nul, puis passe l'inventaire "validated".
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
revoke all on function public.validate_erp_inventory(uuid, uuid) from public;
grant execute on function public.validate_erp_inventory(uuid, uuid) to authenticated;

-- =============== ZegERP — Module 2/10 : Achats & Fournisseurs (migrations
-- 049+050). Rôle buyer (papier commercial : fournisseurs/demandes/
-- commandes/factures/retours) vs stock existant, réutilisé (réception
-- physique uniquement) — cloisonnement volontaire, voir migration 050.
-- unit_cost (coût d'achat) masqué au rôle stock : pas de policy select sur
-- erp_purchase_order_lines pour ce rôle, accès uniquement via la fonction
-- erp_purchase_order_lines_for_receiving() (masquage de colonne, pattern
-- hotel_guest_contact() imposé par CLAUDE.md). ===============
alter type public.app_role add value if not exists 'buyer';
alter type public.erp_stock_movement_type add value if not exists 'purchase_receipt';
alter type public.erp_stock_movement_type add value if not exists 'supplier_return';

create table if not exists public.erp_suppliers (
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
create index if not exists idx_erp_suppliers_org on public.erp_suppliers(organization_id);
alter table public.erp_suppliers enable row level security;

create policy erp_suppliers_select on public.erp_suppliers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view') or public.has_role_in_organization(organization_id, 'stock'));
create policy erp_suppliers_write on public.erp_suppliers for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_achats', 'manage'));

-- Demande interne, étape optionnelle avant commande.
create table if not exists public.erp_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_erp_purchase_requests_org on public.erp_purchase_requests(organization_id);
alter table public.erp_purchase_requests enable row level security;

create policy erp_purchase_requests_select on public.erp_purchase_requests for select to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'view')
    or public.has_module_permission(organization_id, 'erp_receptions', 'view')
  );
create policy erp_purchase_requests_insert on public.erp_purchase_requests for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'create')
    or public.has_module_permission(organization_id, 'erp_receptions', 'create')
  );
create policy erp_purchase_requests_update_draft on public.erp_purchase_requests for update to authenticated
  using (
    status = 'draft'
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  )
  with check (
    status in ('draft', 'submitted')
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  );
-- Revue (approve/reject) réservée à owner/manager.
create policy erp_purchase_requests_review on public.erp_purchase_requests for update to authenticated
  using (status = 'submitted' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (status in ('approved', 'rejected') and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy erp_purchase_requests_delete on public.erp_purchase_requests for delete to authenticated
  using (
    status = 'draft'
    and (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  );

create table if not exists public.erp_purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.erp_purchase_requests(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  notes text
);
create index if not exists idx_erp_purchase_request_lines_org on public.erp_purchase_request_lines(organization_id);
create index if not exists idx_erp_purchase_request_lines_request on public.erp_purchase_request_lines(request_id);
alter table public.erp_purchase_request_lines enable row level security;

create policy erp_purchase_request_lines_select on public.erp_purchase_request_lines for select to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'view')
    or public.has_module_permission(organization_id, 'erp_receptions', 'view')
  );
create policy erp_purchase_request_lines_write on public.erp_purchase_request_lines for all to authenticated
  using (
    (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  )
  with check (
    (public.has_module_permission(organization_id, 'erp_achats', 'manage') or public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  );

create table if not exists public.erp_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  request_id uuid references public.erp_purchase_requests(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_received', 'received', 'cancelled')),
  expected_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_purchase_orders_org on public.erp_purchase_orders(organization_id);
create index if not exists idx_erp_purchase_orders_supplier on public.erp_purchase_orders(supplier_id);
alter table public.erp_purchase_orders enable row level security;

create policy erp_purchase_orders_select on public.erp_purchase_orders for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view') or public.has_role_in_organization(organization_id, 'stock'));
create policy erp_purchase_orders_insert on public.erp_purchase_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_achats', 'create'));
create policy erp_purchase_orders_update_draft on public.erp_purchase_orders for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status in ('draft', 'confirmed') and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
-- Annulation possible tant que la réception n'est pas terminée. Les
-- transitions vers partially_received/received passent exclusivement par
-- confirm_erp_goods_receipt() plus bas.
create policy erp_purchase_orders_cancel on public.erp_purchase_orders for update to authenticated
  using (status in ('confirmed', 'partially_received') and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status = 'cancelled' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
create policy erp_purchase_orders_delete on public.erp_purchase_orders for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));

-- received_quantity jamais modifiée directement (aucune policy update ne
-- s'applique une fois la commande hors 'draft') : incrémentée exclusivement
-- par confirm_erp_goods_receipt() (security definer, bypass RLS).
create table if not exists public.erp_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0,
  received_quantity numeric(14,3) not null default 0,
  check (received_quantity >= 0 and received_quantity <= quantity)
);
create index if not exists idx_erp_purchase_order_lines_org on public.erp_purchase_order_lines(organization_id);
create index if not exists idx_erp_purchase_order_lines_order on public.erp_purchase_order_lines(purchase_order_id);
alter table public.erp_purchase_order_lines enable row level security;

-- `stock` volontairement absent (unit_cost sensible) : voir
-- erp_purchase_order_lines_for_receiving() ci-dessous.
create policy erp_purchase_order_lines_select on public.erp_purchase_order_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
create policy erp_purchase_order_lines_write on public.erp_purchase_order_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

-- Masquage de colonne pour `stock` : produit/quantité commandée/reçue
-- uniquement, jamais unit_cost.
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
revoke all on function public.erp_purchase_order_lines_for_receiving(uuid, uuid) from public;
grant execute on function public.erp_purchase_order_lines_for_receiving(uuid, uuid) to authenticated;

-- Réception physique — rôle stock, jamais buyer directement.
create table if not exists public.erp_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_goods_receipts_org on public.erp_goods_receipts(organization_id);
create index if not exists idx_erp_goods_receipts_order on public.erp_goods_receipts(purchase_order_id);
alter table public.erp_goods_receipts enable row level security;

create policy erp_goods_receipts_select on public.erp_goods_receipts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_receptions', 'view'));
create policy erp_goods_receipts_insert on public.erp_goods_receipts for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_receptions', 'create'));
create policy erp_goods_receipts_update on public.erp_goods_receipts for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'));
create policy erp_goods_receipts_delete on public.erp_goods_receipts for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_receptions', 'manage'));

create table if not exists public.erp_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id uuid not null references public.erp_goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references public.erp_purchase_order_lines(id) on delete restrict,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_goods_receipt_lines_org on public.erp_goods_receipt_lines(organization_id);
create index if not exists idx_erp_goods_receipt_lines_receipt on public.erp_goods_receipt_lines(receipt_id);
alter table public.erp_goods_receipt_lines enable row level security;

create policy erp_goods_receipt_lines_select on public.erp_goods_receipt_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_receptions', 'view'));
create policy erp_goods_receipt_lines_write on public.erp_goods_receipt_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_receptions', 'manage')
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_receptions', 'manage')
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  );

-- confirm_erp_goods_receipt() : crée les mouvements 'purchase_receipt'
-- (coût repris de la ligne de commande, jamais saisi par stock), incrémente
-- received_quantity (bloque le sur-réceptionnement), recalcule le statut de
-- la commande, passe la réception "confirmed". Réception partielle
-- supportée nativement (plusieurs erp_goods_receipts par commande).
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
revoke all on function public.confirm_erp_goods_receipt(uuid, uuid) from public;
grant execute on function public.confirm_erp_goods_receipt(uuid, uuid) to authenticated;

-- Rapprochement facture fournisseur — pas de mouvement de stock associé.
create table if not exists public.erp_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  purchase_order_id uuid references public.erp_purchase_orders(id) on delete set null,
  reference text,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'disputed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_supplier_invoices_org on public.erp_supplier_invoices(organization_id);
create index if not exists idx_erp_supplier_invoices_supplier on public.erp_supplier_invoices(supplier_id);
alter table public.erp_supplier_invoices enable row level security;

create policy erp_supplier_invoices_select on public.erp_supplier_invoices for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'view'));
create policy erp_supplier_invoices_write on public.erp_supplier_invoices for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_factures_fournisseurs', 'manage'));

-- Retour marchandise au fournisseur — porté par buyer en V1 (pas stock),
-- choix simplificateur assumé (voir migration 050).
create table if not exists public.erp_supplier_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  purchase_order_id uuid references public.erp_purchase_orders(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_supplier_returns_org on public.erp_supplier_returns(organization_id);
alter table public.erp_supplier_returns enable row level security;

create policy erp_supplier_returns_select on public.erp_supplier_returns for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
create policy erp_supplier_returns_insert on public.erp_supplier_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_achats', 'create'));
create policy erp_supplier_returns_update on public.erp_supplier_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));
create policy erp_supplier_returns_delete on public.erp_supplier_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_achats', 'manage'));

create table if not exists public.erp_supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.erp_supplier_returns(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2)
);
create index if not exists idx_erp_supplier_return_lines_org on public.erp_supplier_return_lines(organization_id);
create index if not exists idx_erp_supplier_return_lines_return on public.erp_supplier_return_lines(return_id);
alter table public.erp_supplier_return_lines enable row level security;

create policy erp_supplier_return_lines_select on public.erp_supplier_return_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_achats', 'view'));
create policy erp_supplier_return_lines_write on public.erp_supplier_return_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_achats', 'manage')
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  );

-- confirm_erp_supplier_return() : crée un mouvement 'supplier_return' par
-- ligne (sortie de stock, bloquée si stock insuffisant) et passe le retour
-- "confirmed".
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
revoke all on function public.confirm_erp_supplier_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_supplier_return(uuid, uuid) to authenticated;

-- =============== ZegERP — Module 3/10 : Ventes & CRM (migrations 051+052).
-- Rôle salesperson, strictement cloisonné de buyer (aucune policy commune).
-- Asymétrie assumée vs module 2 : erp_delivery_notes est porté par
-- salesperson (pas stock, contrairement à erp_goods_receipts) ; à
-- l'inverse erp_customer_returns est porté par stock (pas salesperson,
-- symétrique de erp_goods_receipts) — voir migration 052 pour le détail. ===============
alter type public.app_role add value if not exists 'salesperson';
alter type public.erp_stock_movement_type add value if not exists 'sale';
alter type public.erp_stock_movement_type add value if not exists 'customer_return';

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_customers_write on public.erp_customers for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_sales_pipeline_stages_write on public.erp_sales_pipeline_stages for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- converted_customer_id renseigné manuellement quand un prospect devient
-- client (pas de RPC de conversion en V1, comme la non-conversion
-- automatique demande→commande du module 2).
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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_prospects_write on public.erp_prospects for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_quotes_insert on public.erp_quotes for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
create policy erp_quotes_update_draft on public.erp_quotes for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('draft', 'sent') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
create policy erp_quotes_resolve on public.erp_quotes for update to authenticated
  using (status = 'sent' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('accepted', 'refused', 'expired') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
create policy erp_quotes_delete on public.erp_quotes for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_quote_lines_write on public.erp_quote_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_quotes q where q.id = quote_id and q.status = 'draft')
  );

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_sales_orders_insert on public.erp_sales_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
create policy erp_sales_orders_update_draft on public.erp_sales_orders for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status in ('draft', 'confirmed') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
create policy erp_sales_orders_cancel on public.erp_sales_orders for update to authenticated
  using (status in ('confirmed', 'partially_delivered') and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status = 'cancelled' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
create policy erp_sales_orders_delete on public.erp_sales_orders for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

-- delivered_quantity jamais modifiée directement : incrémentée
-- exclusivement par confirm_erp_delivery() (security definer).
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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_sales_order_lines_write on public.erp_sales_order_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_sales_orders o where o.id = sales_order_id and o.status = 'draft')
  );

-- Portée salesperson (pas stock — asymétrie assumée, voir en-tête de section).
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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_delivery_notes_insert on public.erp_delivery_notes for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'create'));
create policy erp_delivery_notes_update on public.erp_delivery_notes for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));
create policy erp_delivery_notes_delete on public.erp_delivery_notes for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_delivery_note_lines_write on public.erp_delivery_note_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_ventes', 'manage')
    and exists (select 1 from public.erp_delivery_notes d where d.id = delivery_note_id and d.status = 'draft')
  );

-- confirm_erp_delivery() : crée les mouvements 'sale' (coût repris de
-- erp_products.cost — snapshot COGS approximatif V1), incrémente
-- delivered_quantity, recalcule le statut de la commande, passe la
-- livraison "confirmed". Livraison partielle supportée nativement.
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
revoke all on function public.confirm_erp_delivery(uuid, uuid) from public;
grant execute on function public.confirm_erp_delivery(uuid, uuid) to authenticated;

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
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
create policy erp_invoices_write on public.erp_invoices for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
create policy erp_invoice_lines_write on public.erp_invoice_lines for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

-- Avoir client — montant unique, pas de lignes détaillées en V1.
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
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
create policy erp_credit_notes_write on public.erp_credit_notes for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

-- Enum dédié (découplage vis-à-vis de public.payment_method ZegCaisse,
-- même principe que erp_stock_movement_type).
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
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'view'));
create policy erp_customer_payments_write on public.erp_customer_payments for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_facturation_ventes', 'manage'));

-- Portée stock (pas salesperson — symétrique de erp_goods_receipts).
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
  using (public.has_module_permission(organization_id, 'erp_retours_clients', 'view'));
create policy erp_customer_returns_insert on public.erp_customer_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_retours_clients', 'create'));
create policy erp_customer_returns_update on public.erp_customer_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'));
create policy erp_customer_returns_delete on public.erp_customer_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_retours_clients', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_retours_clients', 'view'));
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
revoke all on function public.confirm_erp_customer_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_customer_return(uuid, uuid) to authenticated;

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
  using (public.has_module_permission(organization_id, 'erp_ventes', 'view'));
create policy erp_crm_activities_write on public.erp_crm_activities for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_ventes', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_ventes', 'manage'));

-- =============== ZegERP — Module 4/10 : POS ERP (migration 053). Aucun
-- rôle/enum nouveau — réutilise cashier (existant) et 'sale'/
-- 'customer_return' (déjà ajoutés module 3). Isolé du POS ZegCaisse. ===============
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
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
create policy erp_cash_sessions_insert on public.erp_cash_sessions for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
create policy erp_cash_sessions_update on public.erp_cash_sessions for update to authenticated
  using (status = 'open' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_pos', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
create policy erp_pos_sales_insert on public.erp_pos_sales for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
create policy erp_pos_sales_update_draft on public.erp_pos_sales for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (status in ('draft', 'cancelled') and public.has_module_permission(organization_id, 'erp_pos', 'manage'));
create policy erp_pos_sales_delete on public.erp_pos_sales for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));

-- returned_quantity jamais modifiée directement : incrémentée
-- exclusivement par confirm_erp_pos_return() (security definer).
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
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
create policy erp_pos_sale_lines_write on public.erp_pos_sale_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_sales s where s.id = sale_id and s.status = 'draft')
  );

-- complete_erp_pos_sale() : crée un mouvement 'sale' par ligne (coût repris
-- de erp_products.cost), recalcule total_amount à partir des lignes,
-- passe la vente "completed". Bloque si la session de caisse est fermée.
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
revoke all on function public.complete_erp_pos_sale(uuid, uuid) from public;
grant execute on function public.complete_erp_pos_sale(uuid, uuid) to authenticated;

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
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
create policy erp_pos_returns_insert on public.erp_pos_returns for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_pos', 'create'));
create policy erp_pos_returns_update on public.erp_pos_returns for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));
create policy erp_pos_returns_delete on public.erp_pos_returns for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_pos', 'manage'));

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
  using (public.has_module_permission(organization_id, 'erp_pos', 'view'));
create policy erp_pos_return_lines_write on public.erp_pos_return_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_pos', 'manage')
    and exists (select 1 from public.erp_pos_returns r where r.id = return_id and r.status = 'draft')
  );

-- confirm_erp_pos_return() : crée un mouvement 'customer_return' par ligne
-- (warehouse repris de la session de caisse du retour), incrémente
-- returned_quantity (bloque le sur-retour), passe le retour "confirmed".
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
revoke all on function public.confirm_erp_pos_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_pos_return(uuid, uuid) to authenticated;

-- =============== ZegERP — Module 5/10 : Finance (migration 054). Aucun
-- rôle nouveau (owner/manager/accountant uniquement, validé — pas de
-- trésorier séparé). erp_cash_transaction_type : type entièrement nouveau,
-- pas d'extension d'enum existant, aucune contrainte de transaction. ===============
create table if not exists public.erp_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'cash' check (type in ('cash', 'bank')),
  account_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_cash_accounts_org on public.erp_cash_accounts(organization_id);
alter table public.erp_cash_accounts enable row level security;

create policy erp_cash_accounts_select on public.erp_cash_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
create policy erp_cash_accounts_write on public.erp_cash_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_finance', 'manage'));

-- Jamais d'écriture directe (comme erp_stock_levels, module 1) : maintenue
-- exclusivement par apply_erp_cash_transaction() plus bas.
create table if not exists public.erp_cash_account_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete cascade,
  balance numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (cash_account_id)
);
create index if not exists idx_erp_cash_account_balances_org on public.erp_cash_account_balances(organization_id);
alter table public.erp_cash_account_balances enable row level security;

create policy erp_cash_account_balances_select on public.erp_cash_account_balances for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));

create table if not exists public.erp_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  to_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (from_account_id <> to_account_id)
);
create index if not exists idx_erp_fund_transfers_org on public.erp_fund_transfers(organization_id);
alter table public.erp_fund_transfers enable row level security;

create policy erp_fund_transfers_select on public.erp_fund_transfers for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
create policy erp_fund_transfers_insert on public.erp_fund_transfers for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_finance', 'create'));
create policy erp_fund_transfers_update on public.erp_fund_transfers for update to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_finance', 'manage'))
  with check (status = 'draft' and public.has_module_permission(organization_id, 'erp_finance', 'manage'));
create policy erp_fund_transfers_delete on public.erp_fund_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

do $$ begin
  create type public.erp_cash_transaction_type as enum ('in', 'out', 'transfer_in', 'transfer_out');
exception when duplicate_object then null;
end $$;

-- Ledger immuable (comme erp_stock_movements). 'transfer_in'/'transfer_out'
-- exclus de l'insert direct — uniquement créés par
-- confirm_erp_fund_transfer().
create table if not exists public.erp_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  type public.erp_cash_transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  reason text,
  source_type text,
  source_id uuid,
  transfer_id uuid references public.erp_fund_transfers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_cash_transactions_org on public.erp_cash_transactions(organization_id);
create index if not exists idx_erp_cash_transactions_account on public.erp_cash_transactions(cash_account_id);
create index if not exists idx_erp_cash_transactions_transfer on public.erp_cash_transactions(transfer_id);
alter table public.erp_cash_transactions enable row level security;

create policy erp_cash_transactions_select on public.erp_cash_transactions for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_finance', 'view'));
create policy erp_cash_transactions_insert on public.erp_cash_transactions for insert to authenticated
  with check (
    type in ('in', 'out')
    and public.has_module_permission(organization_id, 'erp_finance', 'create')
  );

-- Pas de garde anti-négatif (contrairement au stock) : un compte peut
-- légitimement passer en négatif (découvert, caisse en attente de dépôt).
create or replace function public.apply_erp_cash_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,2);
begin
  delta := case new.type
    when 'in' then new.amount
    when 'transfer_in' then new.amount
    when 'out' then -new.amount
    when 'transfer_out' then -new.amount
    else 0
  end;

  insert into public.erp_cash_account_balances (organization_id, cash_account_id, balance)
  values (new.organization_id, new.cash_account_id, delta)
  on conflict (cash_account_id)
  do update set balance = public.erp_cash_account_balances.balance + delta, updated_at = now();

  return new;
end;
$$;
create trigger trg_erp_cash_transactions_apply
  after insert on public.erp_cash_transactions
  for each row execute function public.apply_erp_cash_transaction();

-- confirm_erp_fund_transfer() : crée la paire transfer_out/transfer_in et
-- passe le transfert "confirmed".
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
revoke all on function public.confirm_erp_fund_transfer(uuid, uuid) from public;
grant execute on function public.confirm_erp_fund_transfer(uuid, uuid) to authenticated;

-- =============== ZegERP — Module 6/10 : Comptabilité (migration 055).
-- Aucun rôle nouveau (owner/manager/accountant). Saisie manuelle en V1 :
-- aucune écriture générée automatiquement depuis Achats/Ventes/Finance. ===============
create table if not exists public.erp_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.erp_chart_of_accounts(id) on delete set null,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_chart_of_accounts_org on public.erp_chart_of_accounts(organization_id);
alter table public.erp_chart_of_accounts enable row level security;

create policy erp_chart_of_accounts_select on public.erp_chart_of_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
create policy erp_chart_of_accounts_write on public.erp_chart_of_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

create table if not exists public.erp_accounting_journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_accounting_journals_org on public.erp_accounting_journals(organization_id);
alter table public.erp_accounting_journals enable row level security;

create policy erp_accounting_journals_select on public.erp_accounting_journals for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
create policy erp_accounting_journals_write on public.erp_accounting_journals for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

create table if not exists public.erp_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_erp_accounting_periods_org on public.erp_accounting_periods(organization_id);
alter table public.erp_accounting_periods enable row level security;

create policy erp_accounting_periods_select on public.erp_accounting_periods for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
create policy erp_accounting_periods_insert on public.erp_accounting_periods for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'create'));
create policy erp_accounting_periods_update on public.erp_accounting_periods for update to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));
create policy erp_accounting_periods_delete on public.erp_accounting_periods for delete to authenticated
  using (status = 'open' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Garde-fou clôture : aucune écriture ne peut viser une date couverte par
-- une période 'closed' (insert et update tant que draft).
create table if not exists public.erp_journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  journal_id uuid not null references public.erp_accounting_journals(id) on delete restrict,
  entry_date date not null default current_date,
  reference text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists idx_erp_journal_entries_org on public.erp_journal_entries(organization_id);
create index if not exists idx_erp_journal_entries_journal on public.erp_journal_entries(journal_id);
alter table public.erp_journal_entries enable row level security;

create policy erp_journal_entries_select on public.erp_journal_entries for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
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
create policy erp_journal_entries_delete on public.erp_journal_entries for delete to authenticated
  using (status = 'draft' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));

-- Une ligne est soit un débit soit un crédit, jamais les deux.
create table if not exists public.erp_journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_id uuid not null references public.erp_journal_entries(id) on delete cascade,
  account_id uuid not null references public.erp_chart_of_accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  label text,
  check (debit = 0 or credit = 0)
);
create index if not exists idx_erp_journal_entry_lines_org on public.erp_journal_entry_lines(organization_id);
create index if not exists idx_erp_journal_entry_lines_entry on public.erp_journal_entry_lines(entry_id);
alter table public.erp_journal_entry_lines enable row level security;

create policy erp_journal_entry_lines_select on public.erp_journal_entry_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
create policy erp_journal_entry_lines_write on public.erp_journal_entry_lines for all to authenticated
  using (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  )
  with check (
    public.has_module_permission(organization_id, 'erp_comptabilite', 'manage')
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  );

-- post_erp_journal_entry() : vérifie l'équilibre débit = crédit et la
-- non-clôture de la période avant de passer l'écriture "posted" (immuable
-- ensuite).
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
revoke all on function public.post_erp_journal_entry(uuid, uuid) from public;
grant execute on function public.post_erp_journal_entry(uuid, uuid) to authenticated;

create table if not exists public.erp_bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  statement_date date not null,
  statement_balance numeric(14,2) not null default 0,
  reconciled_balance numeric(14,2),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_erp_bank_reconciliations_org on public.erp_bank_reconciliations(organization_id);
alter table public.erp_bank_reconciliations enable row level security;

create policy erp_bank_reconciliations_select on public.erp_bank_reconciliations for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
create policy erp_bank_reconciliations_insert on public.erp_bank_reconciliations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'erp_comptabilite', 'create'));
create policy erp_bank_reconciliations_update on public.erp_bank_reconciliations for update to authenticated
  using (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'))
  with check (status = 'in_progress' and public.has_module_permission(organization_id, 'erp_comptabilite', 'manage'));
create policy erp_bank_reconciliations_delete on public.erp_bank_reconciliations for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.erp_bank_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_id uuid not null references public.erp_bank_reconciliations(id) on delete cascade,
  cash_transaction_id uuid not null references public.erp_cash_transactions(id) on delete restrict,
  unique (reconciliation_id, cash_transaction_id)
);
create index if not exists idx_erp_bank_reconciliation_lines_org on public.erp_bank_reconciliation_lines(organization_id);
create index if not exists idx_erp_bank_reconciliation_lines_reconciliation on public.erp_bank_reconciliation_lines(reconciliation_id);
alter table public.erp_bank_reconciliation_lines enable row level security;

create policy erp_bank_reconciliation_lines_select on public.erp_bank_reconciliation_lines for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_comptabilite', 'view'));
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

-- complete_erp_bank_reconciliation() : recalcule reconciled_balance à
-- partir des transactions pointées et passe le rapprochement "completed".
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
revoke all on function public.complete_erp_bank_reconciliation(uuid, uuid) from public;
grant execute on function public.complete_erp_bank_reconciliation(uuid, uuid) to authenticated;

-- =============== ZegERP — Module 7/10 : RH (migrations 056+057). Périmètre
-- strict owner/manager/hr_manager (données personnelles sensibles) — pas
-- d'accountant ni d'autre rôle métier. file_url texte simple en V1, pas
-- encore raccroché au bucket erp-documents (module 8, non livré). ===============
alter type public.app_role add value if not exists 'hr_manager';

create table if not exists public.erp_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_departments_org on public.erp_departments(organization_id);
alter table public.erp_departments enable row level security;

create policy erp_departments_select on public.erp_departments for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_departments_write on public.erp_departments for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

create table if not exists public.erp_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.erp_departments(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_positions_org on public.erp_positions(organization_id);
alter table public.erp_positions enable row level security;

create policy erp_positions_select on public.erp_positions for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_positions_write on public.erp_positions for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

-- user_id optionnel : un employé n'a pas forcément de compte ZegOS.
create table if not exists public.erp_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.erp_departments(id) on delete set null,
  position_id uuid references public.erp_positions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  hire_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_employees_org on public.erp_employees(organization_id);
create index if not exists idx_erp_employees_department on public.erp_employees(department_id);
alter table public.erp_employees enable row level security;

create policy erp_employees_select on public.erp_employees for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_employees_write on public.erp_employees for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

create table if not exists public.erp_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present', 'absent', 'late', 'half_day')),
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);
create index if not exists idx_erp_attendance_org on public.erp_attendance(organization_id);
create index if not exists idx_erp_attendance_employee on public.erp_attendance(employee_id);
alter table public.erp_attendance enable row level security;

create policy erp_attendance_select on public.erp_attendance for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_attendance_write on public.erp_attendance for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

-- Pas de split créateur/approbateur (contrairement à erp_purchase_requests,
-- module 2) : hr_manager porte une autorité managériale complète validée
-- sur son périmètre.
create table if not exists public.erp_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  leave_type text not null default 'paid' check (leave_type in ('paid', 'unpaid', 'sick', 'other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  check (end_date >= start_date)
);
create index if not exists idx_erp_leave_requests_org on public.erp_leave_requests(organization_id);
create index if not exists idx_erp_leave_requests_employee on public.erp_leave_requests(employee_id);
alter table public.erp_leave_requests enable row level security;

create policy erp_leave_requests_select on public.erp_leave_requests for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_leave_requests_write on public.erp_leave_requests for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

create table if not exists public.erp_employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  name text not null,
  document_type text not null default 'other' check (document_type in ('contract', 'id_card', 'diploma', 'certificate', 'other')),
  file_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_employee_documents_org on public.erp_employee_documents(organization_id);
create index if not exists idx_erp_employee_documents_employee on public.erp_employee_documents(employee_id);
alter table public.erp_employee_documents enable row level security;

create policy erp_employee_documents_select on public.erp_employee_documents for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'view'));
create policy erp_employee_documents_write on public.erp_employee_documents for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_rh', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_rh', 'manage'));

-- =============== ZegERP — Module 8/10 : Gestion documentaire (migration
-- 058). Aucun rôle nouveau. RLS entité-scopée via erp_document_attachments
-- (pas une liste de rôles à plat) : un document suit les droits de
-- l'entité à laquelle il est rattaché. erp-documents est le premier bucket
-- Storage PRIVÉ de ce dépôt (sensibilité du contenu — contrats, pièces
-- d'identité employé) ; niveau storage grossier (toute l'organisation),
-- nuance fine par entité dans les tables ci-dessous. ===============
create table if not exists public.erp_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.erp_suppliers(id) on delete set null,
  customer_id uuid references public.erp_customers(id) on delete set null,
  employee_id uuid references public.erp_employees(id) on delete set null,
  name text not null,
  contract_type text not null default 'other' check (contract_type in ('supplier', 'customer', 'employee', 'lease', 'other')),
  value numeric(14,2),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'expired', 'terminated')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_contracts_org on public.erp_contracts(organization_id);
alter table public.erp_contracts enable row level security;

create policy erp_contracts_select on public.erp_contracts for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_documents', 'view'));
create policy erp_contracts_write on public.erp_contracts for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_documents', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_documents', 'manage'));

-- Métadonnées seulement ; le fichier vit dans le bucket erp-documents.
-- Policies après erp_document_attachments (dont elles dépendent).
create table if not exists public.erp_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document_type text not null default 'other' check (document_type in ('contract', 'invoice', 'id_card', 'certificate', 'report', 'other')),
  file_path text not null,
  file_size bigint,
  mime_type text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_documents_org on public.erp_documents(organization_id);
alter table public.erp_documents enable row level security;

-- Polymorphe : entity_type + entity_id, pas de FK stricte des deux côtés.
create table if not exists public.erp_document_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.erp_documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('supplier', 'customer', 'employee', 'contract')),
  entity_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id)
);
create index if not exists idx_erp_document_attachments_org on public.erp_document_attachments(organization_id);
create index if not exists idx_erp_document_attachments_entity on public.erp_document_attachments(entity_type, entity_id);
create index if not exists idx_erp_document_attachments_document on public.erp_document_attachments(document_id);
alter table public.erp_document_attachments enable row level security;

create policy erp_document_attachments_select on public.erp_document_attachments for select to authenticated
  using (
    (entity_type = 'supplier' and public.has_module_permission(organization_id, 'erp_achats', 'view'))
    or (entity_type = 'customer' and public.has_module_permission(organization_id, 'erp_ventes', 'view'))
    or (entity_type = 'employee' and public.has_module_permission(organization_id, 'erp_rh', 'view'))
    or (entity_type = 'contract' and public.has_module_permission(organization_id, 'erp_documents', 'view'))
  );
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

-- erp_documents — policies (erp_document_attachments existe désormais).
-- owner/manager voient/gèrent tout ; les autres rôles n'ont accès à un
-- document que s'il est attaché à une entité de leur périmètre.
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
create policy erp_documents_insert on public.erp_documents for insert to authenticated
  with check (
    public.has_module_permission(organization_id, 'erp_documents', 'create')
    or public.has_module_permission(organization_id, 'erp_achats', 'create')
    or public.has_module_permission(organization_id, 'erp_ventes', 'create')
    or public.has_module_permission(organization_id, 'erp_rh', 'create')
  );
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

-- Bucket Storage erp-documents (PRIVÉ). Convention de chemin obligatoire :
-- {organization_id}/{document_id}/{nom_fichier}.
insert into storage.buckets (id, name, public)
values ('erp-documents', 'erp-documents', false)
on conflict (id) do nothing;

create policy erp_documents_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'erp-documents'
    and public.has_organization_access(((storage.foldername(name))[1])::uuid)
  );
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

-- =============== ZegERP — Module 9/10 : Rapports & BI (migration 059).
-- Aucun rôle nouveau. Vues standard (pas security definer) : héritent
-- automatiquement de la RLS des tables sous-jacentes, aucune policy dédiée
-- nécessaire sur les vues elles-mêmes. ===============
create or replace view public.erp_v_stock_valuation as
select
  sl.organization_id,
  sl.product_id,
  p.name as product_name,
  sl.warehouse_id,
  w.name as warehouse_name,
  sl.quantity,
  p.cost,
  sl.quantity * p.cost as valuation
from public.erp_stock_levels sl
join public.erp_products p on p.id = sl.product_id
join public.erp_warehouses w on w.id = sl.warehouse_id;

create or replace view public.erp_v_purchase_orders_summary as
select
  o.organization_id,
  o.id as purchase_order_id,
  o.supplier_id,
  s.name as supplier_name,
  o.reference,
  o.status,
  o.created_at,
  coalesce(sum(l.quantity * l.unit_cost), 0) as total_amount,
  coalesce(sum(l.received_quantity * l.unit_cost), 0) as received_amount
from public.erp_purchase_orders o
join public.erp_suppliers s on s.id = o.supplier_id
left join public.erp_purchase_order_lines l on l.purchase_order_id = o.id
group by o.organization_id, o.id, o.supplier_id, s.name, o.reference, o.status, o.created_at;

-- Unifie commandes client et ventes comptoir, `channel` distingue l'origine.
create or replace view public.erp_v_sales_summary as
select
  o.organization_id,
  'sales_order'::text as channel,
  o.id as sale_id,
  o.customer_id,
  c.name as customer_name,
  o.reference,
  o.status,
  o.created_at,
  coalesce(sum(l.quantity * l.unit_price), 0) as total_amount
from public.erp_sales_orders o
join public.erp_customers c on c.id = o.customer_id
left join public.erp_sales_order_lines l on l.sales_order_id = o.id
group by o.organization_id, o.id, o.customer_id, c.name, o.reference, o.status, o.created_at
union all
select
  s.organization_id,
  'pos'::text as channel,
  s.id as sale_id,
  s.customer_id,
  c.name as customer_name,
  s.reference,
  s.status,
  s.created_at,
  s.total_amount
from public.erp_pos_sales s
left join public.erp_customers c on c.id = s.customer_id;

create or replace view public.erp_v_cash_position as
select
  a.organization_id,
  a.id as cash_account_id,
  a.name,
  a.type,
  coalesce(b.balance, 0) as balance
from public.erp_cash_accounts a
left join public.erp_cash_account_balances b on b.cash_account_id = a.id;

-- Seule vraie table du module : configuration de rapport sauvegardée,
-- privée à son auteur (organization_id ET created_by = auth.uid()).
create table if not exists public.erp_custom_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_erp_custom_reports_org on public.erp_custom_reports(organization_id);
create index if not exists idx_erp_custom_reports_author on public.erp_custom_reports(created_by);
alter table public.erp_custom_reports enable row level security;

create policy erp_custom_reports_select on public.erp_custom_reports for select to authenticated
  using (public.has_organization_access(organization_id) and created_by = auth.uid());
create policy erp_custom_reports_write on public.erp_custom_reports for all to authenticated
  using (public.has_organization_access(organization_id) and created_by = auth.uid())
  with check (public.has_organization_access(organization_id) and created_by = auth.uid());

-- =============== ZegERP — Module 10/10 : Administration (migration 060).
-- Aucun rôle nouveau, aucune table de rôles/permissions dédiée —
-- organization_members.role reste la seule source de vérité. Seule
-- addition : erp_settings (une ligne par organisation), champs limités à
-- ce dont les modules déjà livrés ont besoin (dépôt par défaut, préfixes
-- facture/devis, mois de début d'exercice fiscal). ===============
create table if not exists public.erp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  default_warehouse_id uuid references public.erp_warehouses(id) on delete set null,
  invoice_prefix text not null default 'FAC-',
  quote_prefix text not null default 'DEV-',
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);
create index if not exists idx_erp_settings_org on public.erp_settings(organization_id);
alter table public.erp_settings enable row level security;

create policy erp_settings_select on public.erp_settings for select to authenticated
  using (public.has_module_permission(organization_id, 'erp_parametres', 'view'));
create policy erp_settings_write on public.erp_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'erp_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'erp_parametres', 'manage'));

-- =============== Réservations ZegCaisse (migration 062) — pas une vente :
-- ne bouge jamais le stock avant d'être honorée, d'où une table dédiée
-- plutôt qu'un détournement de sales.status (collision sémantique avec les
-- tickets en attente, éphémères). items en jsonb : pas de ventilation TVA
-- par ligne ni de mouvement de stock avant d'être honorée. ===============
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0,
  deposit numeric(14,2) not null default 0,
  reservation_date date not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reservations_org on public.reservations(organization_id);
create index if not exists idx_reservations_date on public.reservations(organization_id, reservation_date);
alter table public.reservations enable row level security;

create policy reservations_select on public.reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'view'));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'reservations', 'create'));
create policy reservations_update on public.reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'reservations', 'manage'));
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'manage'));

-- =============== reservation_payments (migration 074) ===============
-- Paiements échelonnés : reservations.deposit était un unique versement
-- figé à la création — reservation_payments journalise chaque versement
-- (comme `payments` pour les ventes), add_reservation_payment() (plus bas)
-- l'incrémente atomiquement.
create table if not exists public.reservation_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_reservation_payments_reservation on public.reservation_payments(reservation_id);
alter table public.reservation_payments enable row level security;
create policy reservation_payments_select on public.reservation_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'view'));
create policy reservation_payments_insert on public.reservation_payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'reservations', 'manage'));

-- add_reservation_payment (migration 074) : même schéma que
-- add_sale_payment() (migration 024) — incrément atomique sous le verrou de
-- ligne de l'UPDATE, security invoker (les policies RLS ci-dessus et
-- reservations_update s'appliquent normalement).
create or replace function public.add_reservation_payment(p_reservation_id uuid, p_amount numeric, p_method public.payment_method)
returns public.reservations
language plpgsql as $$
declare
  v_organization_id uuid;
  v_reservation public.reservations;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  select organization_id into v_organization_id from public.reservations where id = p_reservation_id;
  if v_organization_id is null then
    raise exception 'Réservation introuvable.';
  end if;

  insert into public.reservation_payments (organization_id, reservation_id, amount, method, created_by)
  values (v_organization_id, p_reservation_id, p_amount, p_method, auth.uid());

  update public.reservations
  set deposit = deposit + p_amount,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

revoke all on function public.add_reservation_payment(uuid, numeric, public.payment_method) from public;
grant execute on function public.add_reservation_payment(uuid, numeric, public.payment_method) to authenticated;

-- =============== FIN ===============
-- Rappel: RLS activé sur les 25 tables ZegCaisse (19 + super_admins, plans,
-- admin_impersonations, support_tickets, support_messages) + les 15 tables
-- ZegHotel (hotel_*, migrations 020f-020j).
-- Aucune policy USING (true) — seule "plans" a une lecture ouverte à
-- "anon" (formules publiques), volontairement et limitée à is_active=true.
-- Permissions différenciées par app_role sur 14 des 15 tables métier
-- ZegCaisse (notifications reste ouverte à tout membre ; stock_levels est en
-- lecture seule pour tous — voir db/AUDIT-SECURITE.md pour la matrice
-- complète) et sur les 15 tables ZegHotel (front_desk/housekeeping scopés
-- comme documenté dans ARCHITECTURE.md).
-- Super Admin (is_super_admin()) : accès étendu strictement limité à
-- organizations, subscriptions, subscription_payments, profiles, plans,
-- admin_impersonations, support_tickets, support_messages — jamais aux
-- données opérationnelles des boutiques (sales/stock/customers/etc.) ni aux
-- tables ZegHotel.
