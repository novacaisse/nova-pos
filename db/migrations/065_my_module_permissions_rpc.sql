-- Migration 065 — Rôles personnalisés, complément Phase A : fonction
-- table-valued my_module_permissions(), pour que le frontend récupère en
-- UN SEUL appel les permissions de l'utilisateur courant sur tous les
-- modules d'une organisation (nav, boutons d'action) — plutôt que 33
-- appels scalaires à has_module_permission() (11 modules × 3 niveaux).
-- RLS reste la seule barrière réelle (migration 064) ; ceci n'est qu'un
-- raccourci de confort pour l'UI, jamais une source de vérité de sécurité.
-- Présentée pour relecture — NE PAS exécuter automatiquement. À exécuter
-- après 063/064.
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
