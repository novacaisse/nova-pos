-- Migration 084 — Refonte permissions : matrice CRUD directe par membre
-- (mission "Onboarding + MoneyFusion + permissions", Partie 4).
--
-- Remplace la SOURCE de vérité des permissions (rôles personnalisés
-- nommés : organization_roles/organization_role_permissions, avec repli
-- sur default_role_permissions pour les rôles hérités) par une matrice
-- directe par membre : organization_module_permissions(organization_id,
-- user_id, module_key, can_create, can_read, can_update, can_delete).
--
-- Décision structurante : has_module_permission(_org_id, _module_key,
-- _level) GARDE EXACTEMENT sa signature et son vocabulaire existant
-- ('view'/'create'/'manage') — les 287 policies RLS qui l'appellent déjà
-- (vérifié : select count(*) from pg_policies where qual/with_check like
-- '%has_module_permission%') n'ont donc AUCUN texte à changer et héritent
-- automatiquement de la nouvelle matrice. 'manage' est conservé comme
-- alias de (can_update ET can_delete) pour ces call sites non encore
-- migrés au vocabulaire fin — 'read'/'update'/'delete' sont les nouveaux
-- verbes de premier rang pour tout code écrit à partir de maintenant.
-- Alternative rejetée : réécrire le texte des ~287 policies une par une
-- pour forcer 'read'/'update'/'delete' partout — risque de rupture RLS
-- massif sur une base réelle pour un gain nul (le comportement observable
-- est strictement identique via l'alias 'manage').
--
-- Le propriétaire (role='owner') n'est JAMAIS piloté par la matrice —
-- accès total structurel, court-circuité avant toute lecture de la table.
-- Élimine le risque qu'un propriétaire se retire lui-même l'accès par
-- erreur, et évite d'avoir à maintenir une ligne "owner" par module.
--
-- Backfill : chaque membre non-owner reçoit une ligne can_read=can_view,
-- can_create=can_create, can_update=can_manage, can_delete=can_manage
-- pour chaque module de son application, dérivée de son rôle personnalisé
-- s'il en a un (aucun compte réel n'en a actuellement) sinon de son rôle
-- hérité (default_role_permissions) — reproduit exactement l'accès
-- effectif actuel, aucune perte silencieuse à la bascule.
--
-- organization_roles/organization_role_permissions/default_role_permissions
-- NE SONT PAS supprimées dans cette migration (risque de perte
-- irréversible sur une base réelle sans marge de retour arrière) — elles
-- deviennent orphelines dès que has_module_permission() ne les lit plus ;
-- un nettoyage définitif (DROP) est laissé à une migration de suivi
-- séparée, après une période d'observation.
--
-- Exceptions explicitement NON converties dans cette migration (43 sites
-- has_any_role_in_organization au total ; 15 convertis ci-dessous,
-- 28 laissés intacts, documentés dans RAPPORT_FINALISATION_ZEGHOTEL_2026-08.md) :
-- - Les DELETE/INSERT actuellement verrouillés en dur owner/manager
--   (hotel_rooms, hotel_reservations, resto_orders, resto_bills,
--   erp_*_delete, etc.) — les rendre délégables via la matrice serait un
--   changement de posture de sécurité (actuellement "jamais délégable",
--   documenté comme choix produit délibéré dans les commits Phase D),
--   pas une simple bascule technique. Choix par défaut : ne rien changer
--   (le plus sûr), décision explicite laissée à Anselme.
-- - organizations (shops_update) et les policies Storage (product-images/
--   resto-menu-photos/shop-logos) : structurelles/transverses, pas
--   scopées à un seul module métier.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create table if not exists public.organization_module_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null references public.permission_modules(key) on delete cascade,
  can_create boolean not null default false,
  can_read boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (organization_id, user_id, module_key)
);
create index if not exists idx_org_module_perms_org on public.organization_module_permissions(organization_id);
create index if not exists idx_org_module_perms_user on public.organization_module_permissions(user_id);
alter table public.organization_module_permissions enable row level security;

-- Lecture : le propriétaire voit la matrice complète de son organisation
-- (nécessaire pour l'éditeur), un membre voit seulement sa propre ligne
-- (pas d'usage prévu côté UI aujourd'hui, mais cohérent avec le principe
-- RLS "jamais plus que nécessaire").
create policy org_module_perms_select on public.organization_module_permissions for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_module_permissions.organization_id
      and m.user_id = auth.uid() and m.role = 'owner'
  )
);
-- Écriture : réservée au propriétaire (mission Partie 4, "réservée au
-- propriétaire de l'organisation uniquement") — jamais manager, contrairement
-- au reste du projet où owner/manager sont souvent équivalents.
create policy org_module_perms_write on public.organization_module_permissions for all to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_module_permissions.organization_id
      and m.user_id = auth.uid() and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_module_permissions.organization_id
      and m.user_id = auth.uid() and m.role = 'owner'
  )
);

insert into public.organization_module_permissions (organization_id, user_id, module_key, can_create, can_read, can_update, can_delete)
select om.organization_id, om.user_id, pm.key,
  coalesce(orp.can_create, drp.can_create, false),
  coalesce(orp.can_view, drp.can_view, false),
  coalesce(orp.can_manage, drp.can_manage, false),
  coalesce(orp.can_manage, drp.can_manage, false)
from public.organization_members om
join public.organizations o on o.id = om.organization_id
join public.permission_modules pm on pm.app_module = o.app_module
left join public.organization_role_permissions orp on orp.role_id = om.custom_role_id and orp.module_key = pm.key
left join public.default_role_permissions drp on drp.role = om.role and drp.module_key = pm.key
where om.role <> 'owner'
on conflict (organization_id, user_id, module_key) do nothing;

create or replace function public.has_module_permission(_org_id uuid, _module_key text, _level text default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.app_role;
  v_open_view boolean;
  v_row public.organization_module_permissions;
begin
  if not exists (
    select 1 from public.organizations o where o.id = _org_id and not o.suspended
  ) then
    return false;
  end if;

  select role into v_role from public.organization_members
  where organization_id = _org_id and user_id = auth.uid();
  if v_role is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if _level in ('view', 'read') then
    select open_view into v_open_view from public.permission_modules where key = _module_key;
    if coalesce(v_open_view, false) then
      return true;
    end if;
  end if;

  select * into v_row from public.organization_module_permissions
  where organization_id = _org_id and user_id = auth.uid() and module_key = _module_key;

  if v_row is null then
    return false;
  end if;

  return coalesce(case _level
    when 'create' then v_row.can_create
    when 'view' then v_row.can_read
    when 'read' then v_row.can_read
    when 'update' then v_row.can_update
    when 'delete' then v_row.can_delete
    when 'manage' then (v_row.can_update and v_row.can_delete)
    else v_row.can_read
  end, false);
end;
$$;
revoke all on function public.has_module_permission(uuid, text, text) from public;
grant execute on function public.has_module_permission(uuid, text, text) to authenticated;

-- my_module_permissions() (mission Partie 4) : ajoute can_read/can_update/
-- can_delete pour l'écran Équipe (raccourci UI ; RLS reste la seule
-- barrière réelle, comme avant) — can_view/can_manage conservés tels
-- quels pour ne rien casser côté appelants existants (nav ZegCaisse/
-- ZegHotel/ZegResto/ZegERP, qui ne lisent que can_view).
drop function if exists public.my_module_permissions(uuid);
create or replace function public.my_module_permissions(p_organization_id uuid)
returns table (module_key text, can_view boolean, can_create boolean, can_manage boolean, can_read boolean, can_update boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select m.key,
    public.has_module_permission(p_organization_id, m.key, 'view'),
    public.has_module_permission(p_organization_id, m.key, 'create'),
    public.has_module_permission(p_organization_id, m.key, 'manage'),
    public.has_module_permission(p_organization_id, m.key, 'read'),
    public.has_module_permission(p_organization_id, m.key, 'update'),
    public.has_module_permission(p_organization_id, m.key, 'delete')
  from public.permission_modules m
  where m.app_module = (select app_module from public.organizations where id = p_organization_id);
$$;
revoke all on function public.my_module_permissions(uuid) from public;
grant execute on function public.my_module_permissions(uuid) to authenticated;

-- ============ Conversion des 15 policies SELECT "open_view" ZegResto ============
-- Ces policies listaient déjà littéralement tous les rôles possibles
-- d'une organisation ZegResto (owner/manager/accountant/server/cook) —
-- exactement ce que représente open_view=true sur les modules
-- resto_commandes/resto_cuisine/resto_menu/resto_salle (vérifié : les 4
-- ont open_view=true). Conversion mécanique, comportement identique,
-- fait enfin converger ces 15 policies vers l'unique fonction de
-- permission au lieu de has_any_role_in_organization().
drop policy if exists resto_orders_select on public.resto_orders;
create policy resto_orders_select on public.resto_orders for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'view'));

drop policy if exists resto_order_items_select on public.resto_order_items;
create policy resto_order_items_select on public.resto_order_items for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'view'));

drop policy if exists resto_order_courses_select on public.resto_order_courses;
create policy resto_order_courses_select on public.resto_order_courses for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'view'));

drop policy if exists resto_kitchen_tickets_select on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_select on public.resto_kitchen_tickets for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_cuisine', 'view'));

drop policy if exists resto_tables_select on public.resto_tables;
create policy resto_tables_select on public.resto_tables for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'view'));

drop policy if exists resto_zones_select on public.resto_zones;
create policy resto_zones_select on public.resto_zones for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'view'));

drop policy if exists resto_menu_items_select on public.resto_menu_items;
create policy resto_menu_items_select on public.resto_menu_items for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'view'));

drop policy if exists resto_menu_categories_select on public.resto_menu_categories;
create policy resto_menu_categories_select on public.resto_menu_categories for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'view'));

drop policy if exists resto_modifiers_select on public.resto_modifiers;
create policy resto_modifiers_select on public.resto_modifiers for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'view'));

drop policy if exists resto_modifier_options_select on public.resto_modifier_options;
create policy resto_modifier_options_select on public.resto_modifier_options for select to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = resto_modifier_options.modifier_id
      and public.has_module_permission(m.organization_id, 'resto_menu', 'view')
  ));

drop policy if exists resto_menu_item_modifiers_select on public.resto_menu_item_modifiers;
create policy resto_menu_item_modifiers_select on public.resto_menu_item_modifiers for select to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = resto_menu_item_modifiers.menu_item_id
      and public.has_module_permission(i.organization_id, 'resto_menu', 'view')
  ));
