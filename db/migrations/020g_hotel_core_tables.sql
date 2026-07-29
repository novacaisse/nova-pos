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
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists hotel_rooms_update on public.hotel_rooms;
create policy hotel_rooms_update on public.hotel_rooms for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','housekeeping']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','housekeeping']::public.app_role[]));
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
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_rate_plans_org on public.hotel_rate_plans(organization_id);
alter table public.hotel_rate_plans enable row level security;
drop policy if exists hotel_rate_plans_select on public.hotel_rate_plans;
create policy hotel_rate_plans_select on public.hotel_rate_plans for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists hotel_rate_plans_write on public.hotel_rate_plans;
create policy hotel_rate_plans_write on public.hotel_rate_plans for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_corporate_write on public.hotel_corporate_accounts;
create policy hotel_corporate_write on public.hotel_corporate_accounts for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== channels (structure seule, hors scope V1) ===============
-- Aucune logique de synchronisation — juste la table pour ne pas avoir à
-- migrer le schéma quand cette intégration sera vraiment développée.
create table if not exists public.hotel_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  external_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_channels_org on public.hotel_channels(organization_id);
alter table public.hotel_channels enable row level security;
drop policy if exists hotel_channels_all on public.hotel_channels;
create policy hotel_channels_all on public.hotel_channels for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
