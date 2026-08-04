-- Migration 063 — Rôles personnalisés, Phase A : schéma + fonction
-- has_module_permission(). Présentée pour relecture — NE PAS exécuter
-- automatiquement.
--
-- Objectif (demandé) : le propriétaire peut créer ses propres rôles avec
-- des permissions par module, en plus des rôles de base déjà existants
-- (l'enum public.app_role) ; ces permissions doivent être RÉELLEMENT
-- vérifiées en RLS, pas seulement côté UI. Cette migration ne change
-- AUCUN comportement existant — elle ajoute l'infrastructure et la
-- reproduit fidèlement pour les rôles de base actuels ; le branchement
-- réel sur les tables métier de ZegCaisse vient dans la migration 064
-- (Phase C), puis ZegHotel/ZegResto/ZegERP module par module ensuite
-- (Phase D — hors scope de cette migration, non spéculé ici).
--
-- Modèle retenu — 3 niveaux par module (pas plus, pour rester simple et
-- gérable dans l'UI) :
--   view   : lecture (SELECT)
--   create : création (INSERT)
--   manage : modification + suppression (UPDATE + DELETE)
-- C'est un compromis : la matrice RLS actuelle a quelques nuances plus
-- fines qu'un simple view/create/manage (ex. stock_movements où le type
-- de mouvement autorisé dépend du rôle) — ces nuances métier restent
-- codées en dur dans chaque policy à côté de l'appel à
-- has_module_permission(), qui ne remplace que la partie "quel rôle a le
-- droit", jamais la logique métier (voir migration 064 pour le détail).
--
-- Équipe (organization_members) reste volontairement HORS de ce système :
-- gérer qui a quel rôle est un pouvoir qui ne doit jamais pouvoir être
-- délégué à un rôle personnalisé (risque d'escalade de privilèges — un
-- rôle personnalisé qui pourrait s'auto-attribuer plus de droits). Seul
-- 'owner' gère l'équipe, exactement comme aujourd'hui (shop_members_*),
-- inchangé par cette migration.

-- =============== Catalogue des modules (permissions disponibles) ===============
-- open_view = true : la lecture reste ouverte à tout membre de
-- l'organisation, quel que soit son rôle (reproduit fidèlement les
-- policies *_select actuelles basées sur has_organization_access() seul,
-- sans filtre de rôle — categories/products/stock_levels/stock_movements/
-- organization_settings). has_module_permission() court-circuite la
-- vérification de permission pour ces modules au niveau 'view'.
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
  ('parametres',   'pos', 'Paramètres',    true,  11)
on conflict (key) do nothing;

-- =============== Rôles personnalisés (par organisation) ===============
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

-- organization_members.custom_role_id : NULL = comportement actuel
-- (permissions dérivées de l'enum role via default_role_permissions
-- ci-dessous) ; non NULL = permissions dérivées du rôle personnalisé.
-- Le rôle de base (organization_members.role) reste TOUJOURS renseigné,
-- même avec un rôle personnalisé : il continue de servir de repli pour
-- tout ce qui n'est pas encore branché sur has_module_permission() (ex.
-- ZegHotel/ZegResto/ZegERP tant que la Phase D n'est pas faite).
alter table public.organization_members add column if not exists custom_role_id uuid references public.organization_roles(id) on delete set null;

alter table public.organization_roles enable row level security;
alter table public.organization_role_permissions enable row level security;

-- Gestion des rôles personnalisés : même périmètre que la gestion de
-- l'équipe elle-même (owner uniquement en écriture — cohérent avec le
-- risque d'escalade de privilèges documenté plus haut). Lecture élargie à
-- owner/manager (un manager doit pouvoir voir les rôles disponibles pour
-- comprendre l'organisation, même s'il ne peut pas les modifier).
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

-- =============== Repli : permissions par défaut des rôles de base ===============
-- Reproduit fidèlement la matrice RLS actuelle de ZegCaisse (lue
-- directement dans les policies de ce fichier, pas depuis
-- db/AUDIT-SECURITE.md qui date d'avant plusieurs modules ajoutés depuis).
-- Une ligne absente = false par défaut (coalesce dans la fonction).
create table if not exists public.default_role_permissions (
  role public.app_role not null,
  module_key text not null references public.permission_modules(key),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_manage boolean not null default false,
  primary key (role, module_key)
);

-- owner et manager : accès complet à tous les modules ZegCaisse, sans
-- exception, comme aujourd'hui.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'pos'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- cashier : produits/stock/parametres déjà ouverts (open_view) ; view+create
-- sur clients/ventes/devis/reservations (jamais manage — sales_update/
-- quotes_update/etc. excluent cashier) ; rien sur fournisseurs/dépenses/
-- abonnement ; rapports masqué (accès en lecture aux ventes/dépenses
-- nécessaire pour ce module, cashier n'a accès qu'aux ventes en partie).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cashier', 'clients', true, true, false),
  ('cashier', 'ventes', true, true, false),
  ('cashier', 'devis', true, true, false),
  ('cashier', 'reservations', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- stock : produits en CRUD complet (categories_write/products_write
-- incluent 'stock' sur insert/update/delete) ; fournisseurs en view+create
-- (suppliers_write/purchase_orders_* incluent 'stock' sur insert/update,
-- jamais delete) ; stock_movements "create" = insert non restreint (voir
-- migration 064) ; rien sur clients/ventes/devis/réservations/dépenses/
-- abonnement/rapports (stock n'apparaît dans aucune de ces policies select).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('stock', 'produits', true, true, true),
  ('stock', 'fournisseurs', true, true, false),
  ('stock', 'stock', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- accountant : lecture seule sur fournisseurs/clients/ventes/devis/
-- réservations/abonnement/rapports (present dans tous les *_select) ;
-- dépenses en CRUD complet (expenses_* inclut 'accountant' partout) ;
-- rien en écriture ailleurs.
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

-- rapports : module sans table dédiée (agrégation côté client de
-- sales/expenses) — vue accordée à qui a une vraie visibilité financière.
-- Amélioration délibérée par rapport à aujourd'hui : le nav affiche
-- actuellement "/app/rapports" à cashier (HIDDEN_FOR ne l'exclut pas),
-- mais RLS lui bloque déjà sales_select en partie et expenses_select en
-- totalité — écran visible avec des données à moitié vides. Masqué ici
-- pour cashier/stock, cohérent avec le principe déjà appliqué partout
-- ailleurs dans HIDDEN_FOR ("éviter un écran vide plutôt qu'une
-- restriction de sécurité").
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('owner', 'rapports', true, true, true),
  ('manager', 'rapports', true, true, true)
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- =============== has_module_permission() ===============
-- Fonction unique appelée par les policies RLS (migration 064+) — jamais
-- de logique de permission dupliquée dans chaque policy. security definer
-- comme has_role_in_organization()/has_any_role_in_organization(), pour
-- les mêmes raisons (lit organization_members sans re-déclencher RLS sur
-- cette table depuis l'intérieur d'une policy d'une autre table).
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
    return false; -- pas membre de cette organisation
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
