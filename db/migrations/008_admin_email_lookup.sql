-- =====================================================================
-- NovaCaisse — Migration 008 : lookup email pour l'écran Boutiques
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Contexte : auth.users n'est jamais exposé au client, même au Super
-- Admin. L'écran Boutiques a besoin de l'email du owner pour le contact —
-- cette fonction ne renvoie une ligne QUE si l'appelant est super admin
-- (vérifié à l'intérieur de la fonction, pas seulement via les grants).
-- =====================================================================

create or replace function public.admin_get_user_emails(_user_ids uuid[])
returns table(user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select id, email from auth.users
  where id = any(_user_ids) and public.is_super_admin();
$$;

revoke all on function public.admin_get_user_emails(uuid[]) from public;
grant execute on function public.admin_get_user_emails(uuid[]) to authenticated;

-- =============== FIN ===============
