-- =====================================================================
-- NovaCaisse — Migration 005 : fondations Super Admin + formules éditables
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Portée :
--   1. super_admins + is_super_admin() — mécanisme d'accès admin, séparé
--      de shop_members (pas lié à une boutique).
--   2. plans — remplace le catalogue statique (mock/subscription.ts) par
--      une vraie table éditable depuis /admin/parametres, lue publiquement
--      par /tarifs (anon).
--   3. shops.suspended — nouvelle colonne pour l'action "Suspendre".
--   4. admin_impersonations — journal d'audit "se connecter en tant que"
--      (écrit uniquement par l'Edge Function via service role).
--   5. Extension RLS pour le Super Admin, strictement limitée à : shops,
--      subscriptions, subscription_payments, profiles, plans. Aucune autre
--      table n'est touchée (sales/customers/products/etc. restent hors de
--      portée du Super Admin, sauf chemin d'impersonation séparé).
-- =====================================================================

-- =============== 1. super_admins ===============
-- Aucun grant à "authenticated" volontairement : cette table n'est gérée
-- que manuellement via le SQL Editor (jamais depuis l'app), et
-- is_super_admin() y accède via ses propres privilèges de security definer,
-- indépendamment des grants sur la table elle-même.
create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.super_admins enable row level security;
-- Aucune policy ajoutée : select/insert/update/delete refusés par défaut
-- pour "authenticated". Seul un accès direct (SQL Editor / service role)
-- peut lire ou écrire cette table.

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- =============== 2. plans ===============
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

-- Reprend les 3 formules actuellement codées en dur (mock/subscription.ts)
-- pour que /tarifs ne se retrouve pas vide après la migration. price_year
-- reprend le calcul "-20%" déjà appliqué côté client jusqu'ici — modifiable
-- ensuite depuis /admin/parametres.
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

grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;

alter table public.plans enable row level security;

-- Lecture publique des formules actives (page /tarifs, y compris visiteurs
-- non connectés) ; le Super Admin voit aussi les formules désactivées pour
-- pouvoir les réactiver.
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

-- =============== 3. shops.suspended ===============
alter table public.shops add column if not exists suspended boolean not null default false;

-- =============== 4. admin_impersonations (journal d'audit) ===============
create table if not exists public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_impersonations enable row level security;
grant select on public.admin_impersonations to authenticated;
-- Pas de grant insert/update/delete à "authenticated" : seule l'Edge
-- Function admin-impersonate (service role, contourne RLS) écrit ici.
drop policy if exists admin_impersonations_select on public.admin_impersonations;
create policy admin_impersonations_select on public.admin_impersonations for select to authenticated
  using (public.is_super_admin());

-- =============== 5. Extension RLS Super Admin (périmètre limité) ===============

drop policy if exists shops_select_admin on public.shops;
create policy shops_select_admin on public.shops for select to authenticated
  using (public.is_super_admin());
drop policy if exists shops_update_admin on public.shops;
create policy shops_update_admin on public.shops for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists shops_delete_admin on public.shops;
create policy shops_delete_admin on public.shops for delete to authenticated
  using (public.is_super_admin());

drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin on public.subscriptions for select to authenticated
  using (public.is_super_admin());

drop policy if exists subscription_payments_select_admin on public.subscription_payments;
create policy subscription_payments_select_admin on public.subscription_payments for select to authenticated
  using (public.is_super_admin());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_super_admin());

-- =============== FIN ===============
-- Rappel : aucune policy ajoutée sur sales/sale_items/payments/customers/
-- products/stock_levels/stock_movements/expenses/suppliers/promotions/
-- quotes/quote_items/notifications/shop_members — le Super Admin n'y a
-- toujours aucun accès en dehors du chemin d'impersonation séparé.
