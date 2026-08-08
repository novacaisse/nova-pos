-- Migration 093 — Défense en profondeur sur find_user_id_by_email(),
-- suite à AUDIT_ANON_RPC_2026-08.md, action #1 (recommandation "alternative
-- plus robuste").
--
-- Les migrations 080/081 (déjà dans le repo, PR #25, mais dont l'audit
-- 2026-08-06 confirme qu'elles n'ont pas encore été exécutées en base —
-- has_function_privilege() montre anon toujours EXECUTE sur les 13
-- fonctions concernées) retirent déjà l'accès anon au niveau du GRANT :
-- `revoke execute on function public.find_user_id_by_email(text) from anon;`
-- Cette migration-ci ajoute une seconde couche indépendante du GRANT : un
-- contrôle interne dans le corps de la fonction elle-même, pour qu'un
-- oubli de GRANT futur (ou une régression du default ACL du projet — cf.
-- migration 095) ne suffise plus à réexposer l'énumération d'emails.
--
-- Passage de `language sql` à `language plpgsql` nécessaire : `raise
-- exception` n'existe qu'en PL/pgSQL.
--
-- Piège évité : auth.uid() est NULL aussi bien pour anon QUE pour l'appel
-- service_role de l'Edge Function create-team-member (seul appelant
-- légitime, cf. audit) — ce client est construit avec la clé service_role
-- sans en-tête Authorization utilisateur (supabase/functions/
-- create-team-member/index.ts, `admin.rpc(...)`), donc son JWT ne porte
-- aucun claim "sub". Un simple `if auth.uid() is null then raise` aurait
-- cassé l'invitation de membre d'équipe existant. auth.role() distingue
-- les deux cas : 'service_role' pour l'Edge Function (claim "role" du JWT
-- signé service_role), 'anon' pour un appel sans session — seul ce dernier
-- doit être rejeté.
--
-- Signature identique (_email text) -> uuid : CREATE OR REPLACE suffit,
-- les GRANT/REVOKE existants sur cette signature sont conservés tels
-- quels par Postgres (non réinitialisés par CREATE OR REPLACE) — réaffirmés
-- ci-dessous quand même, en pure redondance défensive, au cas où les
-- migrations 080/081 n'auraient pas encore été exécutées au moment de
-- celle-ci.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create or replace function public.find_user_id_by_email(_email text)
returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Non authentifié.';
  end if;
  return (select id from auth.users where lower(email) = lower(_email) limit 1);
end;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
revoke execute on function public.find_user_id_by_email(text) from anon;
