-- Migration 080 — Retire l'accès anon aux fonctions RPC qui n'en ont pas
-- besoin, suite à AUDIT_ANON_RPC_2026-08.md (audit du 2026-08, PR #24).
--
-- Cause racine (confirmée dans l'audit via pg_default_acl) : ce projet
-- Supabase a un privilège par défaut, posé à la création du projet
-- (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role), qui accorde EXECUTE à `anon`
-- DIRECTEMENT et NOMMÉMENT sur toute nouvelle fonction de `public`. Le
-- pattern `revoke all on function ... from public; grant execute ... to
-- authenticated;` utilisé dans toutes les migrations précédentes ne retire
-- que le privilège hérité du pseudo-rôle PUBLIC — jamais celui accordé
-- nommément à `anon`. D'où la nécessité d'un `revoke ... from anon`
-- explicite ci-dessous, seule façon de fermer réellement l'accès.
--
-- 1. find_user_id_by_email() — aucun contrôle interne (contrairement aux
--    autres RPC du projet qui passent par has_module_permission()/
--    is_super_admin()/auth.uid()). Documentée dans db/AUDIT-SECURITE.md
--    (section 7, migration 004) comme volontairement "authenticated only,
--    pas anon" dès l'origine — intention jamais appliquée en pratique à
--    cause de la cause racine ci-dessus. Seul appelant légitime vérifié
--    dans le repo : supabase/functions/create-team-member/index.ts, via
--    le client service_role (verify_jwt = true sur cette Edge Function,
--    cf. supabase/config.toml) — aucun appel anon ou authenticated côté
--    navigateur nulle part dans src/. Le grant authenticated existant est
--    conservé tel quel (comportement d'origine documenté).
--
-- 2. Fonctions trigger exposées comme endpoints RPC sans nécessité —
--    aucune n'est appelée directement nulle part dans le repo (vérifié :
--    aucune occurrence de .rpc("<nom>") dans src/ ni supabase/functions/),
--    seulement référencées par `create trigger ... execute function`.
--    Un appel RPC direct échoue de toute façon hors contexte trigger (NEW/
--    OLD non définis) — non exploitables, mais inutilement exposées.
--    Revoke anon ET authenticated (seul le mécanisme trigger doit pouvoir
--    les déclencher). rls_auto_enable() est un event trigger géré par la
--    plateforme Supabase elle-même (pas une fonction créée par une
--    migration de ce dépôt) — volontairement exclue de cette migration,
--    cf. AUDIT_ANON_RPC_2026-08.md.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

revoke execute on function public.find_user_id_by_email(text) from anon;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.apply_stock_movement() from anon, authenticated;
revoke execute on function public.apply_erp_stock_movement() from anon, authenticated;
revoke execute on function public.apply_erp_cash_transaction() from anon, authenticated;
revoke execute on function public.enforce_single_default_erp_warehouse() from anon, authenticated;
revoke execute on function public.hotel_sync_reservation_room_on_insert() from anon, authenticated;
revoke execute on function public.hotel_sync_reservation_room_on_update() from anon, authenticated;
revoke execute on function public.notify_big_sale() from anon, authenticated;
revoke execute on function public.notify_hotel_checkout() from anon, authenticated;
revoke execute on function public.notify_hotel_reservation_created() from anon, authenticated;
revoke execute on function public.notify_new_member() from anon, authenticated;
revoke execute on function public.notify_stock_level() from anon, authenticated;
