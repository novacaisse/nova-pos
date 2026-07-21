-- =====================================================================
-- NovaCaisse — Migration 004 : recherche d'utilisateur par email
-- (flux d'invitation Équipe)
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Contexte : il n'y a pas d'API admin (service role) disponible pour créer
-- un compte au nom d'un tiers. Le flux retenu est : la personne invitée
-- crée elle-même son compte via /rejoindre (aucune boutique créée), puis le
-- owner l'ajoute à son équipe depuis Équipe en saisissant son email. Comme
-- le client ne peut pas interroger auth.users directement (RLS), cette
-- fonction (security definer) ne renvoie que l'UUID correspondant à un
-- email — rien d'autre de auth.users n'est exposé.
--
-- Limite connue, acceptée pour ce scope minimal : n'importe quel compte
-- authentifié peut vérifier si un email donné est déjà enregistré sur la
-- plateforme (énumération d'emails). L'exécution est réservée aux rôles
-- authentifiés (pas anon) pour limiter l'exposition ; pas de protection
-- supplémentaire (rate-limiting, etc.) au-delà de ça dans ce scope.
-- =====================================================================

create or replace function public.find_user_id_by_email(_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to authenticated;

-- =====================================================================
-- Correction nécessaire trouvée en implémentant l'écran Équipe :
-- profiles_all (schéma initial) restreint SELECT à id = auth.uid(), donc
-- un owner listant son équipe ne peut voir ni le nom ni le téléphone de ses
-- coéquipiers (RLS les filtre silencieusement, la requête ne renvoie rien).
-- On ajoute une policy SELECT supplémentaire (OR avec l'existante) limitée
-- à la lecture, pour les personnes qui partagent au moins une boutique.
-- profiles_all reste inchangée et continue de restreindre insert/update/
-- delete à soi-même uniquement.
-- =====================================================================
drop policy if exists profiles_select_shopmates on public.profiles;
create policy profiles_select_shopmates on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.shop_members me
      join public.shop_members them on them.shop_id = me.shop_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

-- =============== FIN ===============
