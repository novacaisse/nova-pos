-- 089_seed_member_permissions_trigger.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Correctif (mission "mise à jour ZegHotel", suite Phase 3, problème n°2
-- signalé : un front_desk réel de test — ZETHEL — n'avait pas la
-- permission 'hotel_pos_interne' que default_role_permissions lui accorde
-- pourtant par défaut).
--
-- Cause racine identifiée : la migration 084 (permission_matrix.sql) a fait
-- un backfill PONCTUEL de organization_module_permissions pour tous les
-- membres existants AU MOMENT où elle a tourné (insert ... select ... on
-- conflict do nothing). Aucun trigger ne reproduit ce seeding pour les
-- membres ajoutés DEPUIS — has_module_permission() renvoie alors false pour
-- tout module tant qu'un owner n'ouvre pas manuellement la matrice de
-- permissions (TeamPage) pour ce membre. Portée : tous les nouveaux membres
-- non-owner de TOUTES les organisations (4 apps), pas seulement ZETHEL —
-- le cas trouvé n'était qu'un symptôme visible.
--
-- Ce correctif a deux volets :
--   1. Un trigger AFTER INSERT ON organization_members qui reproduit la
--      logique de seeding de la migration 084 pour la seule ligne insérée
--      (jamais pour un UPDATE de rôle — un changement de rôle reste un
--      choix explicite via la matrice de permissions, pas un reset silencieux
--      de permissions potentiellement déjà personnalisées).
--   2. Un nouveau passage du backfill de la migration 084 (même clause
--      on conflict do nothing, sans risque de doublon ni d'écrasement) pour
--      rattraper tous les membres ajoutés entre la migration 084 et
--      aujourd'hui — corrige directement le cas ZETHEL et tout autre
--      organisation dans la même situation.

create or replace function public.seed_member_module_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then
    return new;
  end if;

  insert into public.organization_module_permissions (organization_id, user_id, module_key, can_create, can_read, can_update, can_delete)
  select new.organization_id, new.user_id, pm.key,
    coalesce(orp.can_create, drp.can_create, false),
    coalesce(orp.can_view, drp.can_view, false),
    coalesce(orp.can_manage, drp.can_manage, false),
    coalesce(orp.can_manage, drp.can_manage, false)
  from public.organizations o
  join public.permission_modules pm on pm.app_module = o.app_module
  left join public.organization_role_permissions orp on orp.role_id = new.custom_role_id and orp.module_key = pm.key
  left join public.default_role_permissions drp on drp.role = new.role and drp.module_key = pm.key
  where o.id = new.organization_id
  on conflict (organization_id, user_id, module_key) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_member_module_permissions() from public;

drop trigger if exists trg_seed_member_module_permissions on public.organization_members;
create trigger trg_seed_member_module_permissions
  after insert on public.organization_members
  for each row execute function public.seed_member_module_permissions();

-- Rattrapage pour les membres déjà ajoutés depuis la migration 084 — même
-- requête que son backfill initial, idempotente (on conflict do nothing).
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
