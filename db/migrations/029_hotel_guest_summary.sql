-- 029_hotel_guest_summary.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 2 — Module Clients (/app/hotel/clients) : vue CRM des
-- hotel_guests indépendante d'une réservation particulière (historique des
-- séjours, total dépensé, dernière visite). hotel_guest_summary() agrège
-- ça côté serveur plutôt que de faire remonter tous les folios/charges au
-- client pour calculer les totaux localement (coûteux dès que l'historique
-- s'accumule). Security invoker (pas definer) : les policies RLS
-- existantes sur hotel_reservations/hotel_folios/hotel_folio_charges
-- s'appliquent normalement avec la session de l'appelant — aucun nouveau
-- droit accordé, juste une agrégation.
create or replace function public.hotel_guest_summary(_organization_id uuid)
returns table (
  guest_id uuid, total_stays bigint, total_spent numeric, last_check_in date
)
language sql stable set search_path = public as $$
  select
    r.guest_id,
    count(distinct r.id) as total_stays,
    coalesce(sum(fc.amount * fc.quantity), 0) as total_spent,
    max(r.check_in) as last_check_in
  from public.hotel_reservations r
  left join public.hotel_folios f on f.reservation_id = r.id
  left join public.hotel_folio_charges fc on fc.folio_id = f.id
  where r.organization_id = _organization_id
    and r.status <> 'cancelled'
  group by r.guest_id;
$$;

revoke all on function public.hotel_guest_summary(uuid) from public;
grant execute on function public.hotel_guest_summary(uuid) to authenticated;
