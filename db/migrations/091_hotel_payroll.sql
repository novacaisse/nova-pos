-- 091_hotel_payroll.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Round 2, Phase D — module Gestion de paie simple (scope
-- confirmé : version simple ZegHotel — salaire de base par membre +
-- génération de bulletin mensuel, PAS de gestion fiscale/cotisations
-- détaillée type ZegERP RH, migration 057).
--
-- Deux tables :
--   1. hotel_payroll_profiles — salaire de base courant par membre
--      (organization_id, user_id) unique — une seule ligne par membre,
--      mise à jour au fil du temps (pas un historique).
--   2. hotel_payslips — un bulletin par membre par mois/année, avec le
--      salaire de base FIGÉ au moment de la génération (system_total-like
--      pattern, cf. migration 090) : un futur changement de salaire de
--      base ne doit jamais modifier rétroactivement un bulletin déjà
--      généré. adjustment permet une prime/retenue ponctuelle sur CE
--      bulletin précis, jamais sur le profil.
--
-- Permission 'hotel_payroll' — périmètre volontairement plus resserré que
-- 'hotel_finance' (migration 090) : owner/manager UNIQUEMENT, pas même
-- accountant (données personnelles de rémunération individuelle, pas de la
-- trésorerie agrégée) — même logique que le RH ZegERP strictement
-- owner/manager/hr_manager (migration 057), ZegHotel n'ayant pas de rôle
-- hr_manager dédié.

create table if not exists public.hotel_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  base_salary numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_hotel_payroll_profiles_org on public.hotel_payroll_profiles(organization_id);
alter table public.hotel_payroll_profiles enable row level security;

drop policy if exists hotel_payroll_profiles_select on public.hotel_payroll_profiles;
create policy hotel_payroll_profiles_select on public.hotel_payroll_profiles for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payroll', 'view'));
drop policy if exists hotel_payroll_profiles_write on public.hotel_payroll_profiles;
create policy hotel_payroll_profiles_write on public.hotel_payroll_profiles for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payroll', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_payroll', 'manage'));

create table if not exists public.hotel_payslips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year between 2020 and 2100),
  base_salary numeric(14,2) not null,
  adjustment numeric(14,2) not null default 0,
  adjustment_note text,
  net_total numeric(14,2) generated always as (base_salary + adjustment) stored,
  status text not null default 'draft' check (status in ('draft', 'paid')),
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, period_month, period_year)
);
create index if not exists idx_hotel_payslips_org on public.hotel_payslips(organization_id);
create index if not exists idx_hotel_payslips_period on public.hotel_payslips(organization_id, period_year, period_month);
alter table public.hotel_payslips enable row level security;

drop policy if exists hotel_payslips_select on public.hotel_payslips;
create policy hotel_payslips_select on public.hotel_payslips for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payroll', 'view'));
drop policy if exists hotel_payslips_insert on public.hotel_payslips;
create policy hotel_payslips_insert on public.hotel_payslips for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_payroll', 'create'));
drop policy if exists hotel_payslips_update on public.hotel_payslips;
create policy hotel_payslips_update on public.hotel_payslips for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payroll', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_payroll', 'manage'));
drop policy if exists hotel_payslips_delete on public.hotel_payslips;
create policy hotel_payslips_delete on public.hotel_payslips for delete to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payroll', 'manage'));

insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('hotel_payroll', 'hotel', 'Paie', false, 14)
on conflict (key) do nothing;

-- owner/manager uniquement (pas d'entrée accountant, contrairement à
-- hotel_finance — voir commentaire de tête).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('owner', 'hotel_payroll', true, true, true),
  ('manager', 'hotel_payroll', true, true, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- Rattrapage pour les membres hôtel déjà existants (même logique que la
-- migration 090).
insert into public.organization_module_permissions (organization_id, user_id, module_key, can_create, can_read, can_update, can_delete)
select om.organization_id, om.user_id, 'hotel_payroll',
  coalesce(orp.can_create, drp.can_create, false),
  coalesce(orp.can_view, drp.can_view, false),
  coalesce(orp.can_manage, drp.can_manage, false),
  coalesce(orp.can_manage, drp.can_manage, false)
from public.organization_members om
join public.organizations o on o.id = om.organization_id and o.app_module = 'hotel'
left join public.organization_role_permissions orp on orp.role_id = om.custom_role_id and orp.module_key = 'hotel_payroll'
left join public.default_role_permissions drp on drp.role = om.role and drp.module_key = 'hotel_payroll'
where om.role <> 'owner'
on conflict (organization_id, user_id, module_key) do nothing;
