-- Migration 037 — ZegResto, étape 3/7 : Salle (zones/tables) + Menu
-- (catégories/articles/modificateurs). Présentée pour relecture — NE PAS
-- exécuter automatiquement. À exécuter après 035 (rôles) et 036
-- (app_module) — utilise 'server'/'cook' dans les policies RLS ci-dessous.

-- =============== SALLE ===============

create table if not exists public.resto_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_zones_org on public.resto_zones(organization_id);
alter table public.resto_zones enable row level security;

drop policy if exists resto_zones_select on public.resto_zones;
create policy resto_zones_select on public.resto_zones for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_zones_write on public.resto_zones;
create policy resto_zones_write on public.resto_zones for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
drop policy if exists resto_tables_select on public.resto_tables;
create policy resto_tables_select on public.resto_tables for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_tables_insert on public.resto_tables;
create policy resto_tables_insert on public.resto_tables for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists resto_tables_update on public.resto_tables;
create policy resto_tables_update on public.resto_tables for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_tables_delete on public.resto_tables;
create policy resto_tables_delete on public.resto_tables for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== MENU ===============

create table if not exists public.resto_menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_menu_categories_org on public.resto_menu_categories(organization_id);
alter table public.resto_menu_categories enable row level security;

drop policy if exists resto_menu_categories_select on public.resto_menu_categories;
create policy resto_menu_categories_select on public.resto_menu_categories for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_menu_categories_write on public.resto_menu_categories;
create policy resto_menu_categories_write on public.resto_menu_categories for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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

drop policy if exists resto_menu_items_select on public.resto_menu_items;
create policy resto_menu_items_select on public.resto_menu_items for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_menu_items_write on public.resto_menu_items;
create policy resto_menu_items_write on public.resto_menu_items for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.resto_modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_modifiers_org on public.resto_modifiers(organization_id);
alter table public.resto_modifiers enable row level security;

drop policy if exists resto_modifiers_select on public.resto_modifiers;
create policy resto_modifiers_select on public.resto_modifiers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_modifiers_write on public.resto_modifiers;
create policy resto_modifiers_write on public.resto_modifiers for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

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
-- resto_modifiers, même schéma que resto_menu_item_modifiers ci-dessous.
-- Piège classique (cf. bug historique shop_members_insert documenté dans
-- CLAUDE.md/AGENTS.md) : pas de dépendance circulaire ici car
-- has_any_role_in_organization() ne référence jamais resto_modifier_options
-- ni resto_menu_item_modifiers en retour.
drop policy if exists resto_modifier_options_select on public.resto_modifier_options;
create policy resto_modifier_options_select on public.resto_modifier_options for select to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_any_role_in_organization(m.organization_id, array['owner','manager','accountant','server','cook']::public.app_role[])
  ));
drop policy if exists resto_modifier_options_write on public.resto_modifier_options;
create policy resto_modifier_options_write on public.resto_modifier_options for all to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_any_role_in_organization(m.organization_id, array['owner','manager']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_any_role_in_organization(m.organization_id, array['owner','manager']::public.app_role[])
  ));

create table if not exists public.resto_menu_item_modifiers (
  menu_item_id uuid not null references public.resto_menu_items(id) on delete cascade,
  modifier_id uuid not null references public.resto_modifiers(id) on delete cascade,
  primary key (menu_item_id, modifier_id)
);
alter table public.resto_menu_item_modifiers enable row level security;

drop policy if exists resto_menu_item_modifiers_select on public.resto_menu_item_modifiers;
create policy resto_menu_item_modifiers_select on public.resto_menu_item_modifiers for select to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_any_role_in_organization(i.organization_id, array['owner','manager','accountant','server','cook']::public.app_role[])
  ));
drop policy if exists resto_menu_item_modifiers_write on public.resto_menu_item_modifiers;
create policy resto_menu_item_modifiers_write on public.resto_menu_item_modifiers for all to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_any_role_in_organization(i.organization_id, array['owner','manager']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_any_role_in_organization(i.organization_id, array['owner','manager']::public.app_role[])
  ));
