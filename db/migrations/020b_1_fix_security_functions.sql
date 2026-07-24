-- Migration 020b — partie 1/3 : fonctions de sécurité (has_shop_access etc.)
--
-- ⚠️ URGENT — sans les 3 parties de 020b, l'application reste cassée même
-- avec un frontend à jour : ces fonctions (appelées par la quasi-totalité
-- des 111 policies RLS) référencent encore en interne la table
-- "shop_members", qui n'existe plus depuis 020a (ALTER TABLE ne réécrit
-- PAS le corps des fonctions plpgsql, contrairement aux policies RLS qui
-- suivent automatiquement le renommage par OID).
--
-- Logique strictement préservée — uniquement un renommage des références
-- internes (shop_id → organization_id, shop_members → organization_members).
--
-- À exécuter en premier, avant les parties 2/3 et 3/3.

alter function public.has_shop_access(uuid) rename to has_organization_access;
alter function public.current_user_shops() rename to current_user_organizations;
alter function public.has_role_in_shop(uuid, public.app_role) rename to has_role_in_organization;
alter function public.has_any_role_in_shop(uuid, public.app_role[]) rename to has_any_role_in_organization;
alter function public.is_shop_owner(uuid) rename to is_organization_owner;

create or replace function public.has_organization_access(_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid());
$$;

create or replace function public.current_user_organizations()
returns setof uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.has_role_in_organization(_organization_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid() and role = _role);
$$;

create or replace function public.has_any_role_in_organization(_organization_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid() and role = any(_roles));
$$;

create or replace function public.is_organization_owner(_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = _organization_id and owner_id = auth.uid());
$$;
