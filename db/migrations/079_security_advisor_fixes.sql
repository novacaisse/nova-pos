-- Migration 079 — Corrections suite au premier passage des Security
-- Advisors Supabase (connectés au projet pour la première fois) sur le
-- chantier ZegOS v2 (PR #22, migrations 073-078) :
--
-- 1. add_reservation_payment() (migration 074) n'avait pas de
--    search_path figé ("Function Search Path Mutable") — corrigé pour
--    matcher le pattern déjà suivi par le reste des RPC du fichier.
--
-- 2. hotel_room_dirty_on_checkout() / hotel_room_clean_on_task_done()
--    (migration 078) sont des fonctions trigger (elles lisent NEW/OLD,
--    invalide hors contexte trigger) : jamais destinées à être appelées
--    directement. Sur ce projet Supabase, les privilèges par défaut
--    accordent EXECUTE à `anon`/`authenticated` sur toute nouvelle
--    fonction créée dans `public`, indépendamment du rôle PUBLIC — un
--    simple `revoke ... from public` (comme fait pour create_hotel_pos_sale,
--    migration 077) ne suffit donc pas, il faut viser anon/authenticated
--    explicitement. Cela ferme leur exposition en tant que endpoints RPC
--    PostgREST (/rest/v1/rpc/...) sans rien changer à leur déclenchement
--    normal par les triggers (l'exécuteur de requête invoque une fonction
--    trigger indépendamment des privilèges EXECUTE du rôle appelant).
--
-- Note (hors scope de cette migration, à traiter séparément) : le même
-- audit montre que `anon` a EXECUTE sur la quasi-totalité des RPC du
-- projet (y compris des fonctions bien plus anciennes comme create_sale)
-- à cause de ce même comportement de privilèges par défaut Supabase — pas
-- une régression de ce chantier, mais un point à auditer projet entier
-- avant de resserrer plus largement (certaines RPC, ex. réservation
-- publique ZegResto, sont peut-être volontairement accessibles sans
-- session).
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create or replace function public.add_reservation_payment(p_reservation_id uuid, p_amount numeric, p_method public.payment_method)
returns public.reservations
language plpgsql set search_path = public as $$
declare
  v_organization_id uuid;
  v_reservation public.reservations;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  select organization_id into v_organization_id from public.reservations where id = p_reservation_id;
  if v_organization_id is null then
    raise exception 'Réservation introuvable.';
  end if;

  insert into public.reservation_payments (organization_id, reservation_id, amount, method, created_by)
  values (v_organization_id, p_reservation_id, p_amount, p_method, auth.uid());

  update public.reservations
  set deposit = deposit + p_amount,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

revoke all on function public.add_reservation_payment(uuid, numeric, public.payment_method) from public;
grant execute on function public.add_reservation_payment(uuid, numeric, public.payment_method) to authenticated;

revoke all on function public.hotel_room_dirty_on_checkout() from public, anon, authenticated;
revoke all on function public.hotel_room_clean_on_task_done() from public, anon, authenticated;
