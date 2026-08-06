-- Migration 081 — Corrige un oubli de la migration 080 : le revoke sur les
-- 12 fonctions trigger ne visait que `anon, authenticated`, jamais
-- `public`. Or ces 12 fonctions n'avaient jamais eu de `revoke ... from
-- public` à leur création (contrairement à find_user_id_by_email, qui
-- l'avait déjà depuis la migration 004, et à hotel_room_dirty_on_checkout/
-- hotel_room_clean_on_task_done, migration 079, qui l'incluaient déjà) —
-- elles ont donc conservé le privilège EXECUTE que Postgres accorde à
-- PUBLIC par défaut à la création de toute fonction. Comme `anon` et
-- `authenticated` héritent implicitement de PUBLIC, le revoke nommé de la
-- migration 080 s'est bien appliqué (confirmé : plus d'entrée anon=/
-- authenticated= dans proacl) mais n'a rien changé au résultat observable
-- via has_function_privilege(), toujours vrai via l'héritage PUBLIC.
--
-- Vérifié après exécution de la migration 080 (proacl de handle_new_user :
-- {=X/postgres,postgres=X/postgres,service_role=X/postgres} — l'entrée
-- "=X/postgres", rôle vide avant le "=", est précisément le grant PUBLIC).
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.apply_stock_movement() from public, anon, authenticated;
revoke all on function public.apply_erp_stock_movement() from public, anon, authenticated;
revoke all on function public.apply_erp_cash_transaction() from public, anon, authenticated;
revoke all on function public.enforce_single_default_erp_warehouse() from public, anon, authenticated;
revoke all on function public.hotel_sync_reservation_room_on_insert() from public, anon, authenticated;
revoke all on function public.hotel_sync_reservation_room_on_update() from public, anon, authenticated;
revoke all on function public.notify_big_sale() from public, anon, authenticated;
revoke all on function public.notify_hotel_checkout() from public, anon, authenticated;
revoke all on function public.notify_hotel_reservation_created() from public, anon, authenticated;
revoke all on function public.notify_new_member() from public, anon, authenticated;
revoke all on function public.notify_stock_level() from public, anon, authenticated;
