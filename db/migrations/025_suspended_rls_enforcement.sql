-- 025_suspended_rls_enforcement.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Complète la migration 023 (qui bloquait déjà le contournement de
-- suspension via "+ Ajouter une boutique") : organizations.suspended
-- n'avait jusqu'ici AUCUN effet RLS sur les tables métier — seul le SPA
-- redirigeait vers l'écran "Compte suspendu" (app.tsx). Un appel direct à
-- l'API Supabase avec une session déjà active d'un membre de cette
-- organisation continuait à tout lire/écrire normalement (produits,
-- ventes, stock, réservations hôtel...).
--
-- has_organization_access/has_role_in_organization/has_any_role_in_organization
-- gouvernent la quasi-totalité des policies RLS métier (146 références dans
-- schema.sql) — patcher leur corps suffit donc à propager le blocage
-- partout SANS toucher un seul texte de policy individuelle, tant que la
-- signature (nom + types d'arguments) de chacune des 3 fonctions ne change
-- pas : un `create or replace function` à signature identique remplace le
-- corps sans casser les policies qui en dépendent déjà (contrairement à un
-- `drop function` qui les entraînerait en cascade).
--
-- Une seule exception nécessaire : organizations.shops_select elle-même
-- utilisait has_organization_access(id) — en durcissant cette fonction, la
-- ligne organizations d'un établissement suspendu serait devenue invisible
-- à ses propres membres, cassant l'écran "Compte suspendu" (qui a besoin
-- de lire organizations.suspended/name pour s'afficher) au lieu de
-- l'afficher. shops_select est donc réécrite ci-dessous avec une
-- vérification d'appartenance équivalente mais SANS ce nouveau filtre —
-- c'est la seule policy modifiée dans cette migration.

create or replace function public.has_organization_access(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = _shop_id and m.user_id = auth.uid() and not o.suspended
  );
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

-- Seule exception : la lecture de la ligne organizations elle-même reste
-- possible même suspendue (mais pas sa modification/suppression :
-- shops_update/shops_delete restent régies par has_any_role_in_organization/
-- has_role_in_organization ci-dessus, donc désormais bloquées elles aussi
-- pour une organisation suspendue — comportement voulu, pas un oubli).
drop policy if exists shops_select on public.organizations;
create policy shops_select on public.organizations for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id and m.user_id = auth.uid()
    )
  );
