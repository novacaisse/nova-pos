-- Migration 020k — OPTIONNELLE, correctif de données pour LOT A (audit
-- ZegOS Phase 1) : avant ce lot, aucune ligne de charge "chambre" n'était
-- jamais postée dans hotel_folio_charges (bug applicatif corrigé dans
-- useCheckInReservation, src/lib/data/hotelHooks.ts — le check-in poste
-- désormais une charge kind='room' par chambre réservée). Les réservations
-- déjà check-in/check-out AVANT ce correctif ont un folio qui ne verra
-- jamais cette charge rétroactivement puisque le check-in ne se refait pas.
--
-- Ce script comble ce trou pour les réservations existantes : pour chaque
-- réservation déjà "checked_in" ou "checked_out" dont le folio n'a encore
-- aucune charge kind='room', il poste une ligne par chambre réservée,
-- calculée à partir de hotel_reservation_rooms.rate_amount (même logique
-- que le hook : montant par nuit x nombre de nuits).
--
-- Idempotent (ne réinsère rien pour un folio qui a déjà une charge "room")
-- — peut être exécuté plusieurs fois sans risque. Aucun effet sur les
-- réservations encore "pending"/"confirmed"/"cancelled"/"no_show" (jamais
-- occupées, rien à facturer).
insert into public.hotel_folio_charges (organization_id, folio_id, kind, description, amount, quantity, charge_date)
select
  rr.organization_id,
  f.id,
  'room',
  'Chambre ' || coalesce(r.number, '—') || ' — ' || coalesce(rt.name, ''),
  rr.rate_amount / greatest(1, round(extract(epoch from (rr.check_out::timestamp - rr.check_in::timestamp)) / 86400)::int),
  greatest(1, round(extract(epoch from (rr.check_out::timestamp - rr.check_in::timestamp)) / 86400)::int),
  rr.check_in
from public.hotel_reservation_rooms rr
join public.hotel_reservations res on res.id = rr.reservation_id
join public.hotel_folios f on f.reservation_id = res.id
left join public.hotel_rooms r on r.id = rr.room_id
left join public.hotel_room_types rt on rt.id = r.room_type_id
where res.status in ('checked_in', 'checked_out')
  and not exists (
    select 1 from public.hotel_folio_charges fc
    where fc.folio_id = f.id and fc.kind = 'room'
  );
