-- 032_hotel_notifications.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 5 — Communications automatisées, via la table
-- notifications du socle partagé (migration 011). Cette table est
-- STRICTEMENT interne (notifications.user_id référence auth.users — un
-- client hôtel n'a pas de compte, il ne peut donc jamais recevoir quoi que
-- ce soit via ce canal) : ce qui est livré ici, ce sont des RAPPELS pour
-- le personnel ("confirmation à envoyer", "rappel arrivée demain",
-- "remerciement à envoyer"), pas un envoi réel de SMS/email au client — une
-- vraie intégration de messagerie sortante (Twilio, SendGrid…) est hors
-- périmètre, comme le sont volontairement les canaux de distribution
-- (Phase 8).
--
-- Deux événements déclenchables par trigger (création, check-out) suivent
-- exactement le patron déjà en place pour notify_big_sale/notify_stock_level/
-- notify_new_member (migration 011). Le rappel "arrivée demain" (J-1) est
-- un événement "temps qui passe", non déclenchable par trigger — calculé
-- côté client dans useAppNotifications.ts, comme le sont déjà
-- quote_expiring/trial_expiring (voir ce fichier).

create or replace function public.notify_hotel_reservation_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guest_name text;
begin
  select full_name into v_guest_name from public.hotel_guests where id = new.guest_id;
  insert into public.notifications (organization_id, title, body, kind)
  values (
    new.organization_id, 'Nouvelle réservation',
    'Confirmation à envoyer à ' || coalesce(v_guest_name, 'un client') || ' — arrivée le ' || to_char(new.check_in, 'DD/MM/YYYY') || '.',
    'hotel_reservation_created'
  );
  return new;
end $$;

drop trigger if exists trg_notify_hotel_reservation_created on public.hotel_reservations;
create trigger trg_notify_hotel_reservation_created
  after insert on public.hotel_reservations
  for each row execute function public.notify_hotel_reservation_created();

create or replace function public.notify_hotel_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_guest_name text;
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    select full_name into v_guest_name from public.hotel_guests where id = new.guest_id;
    insert into public.notifications (organization_id, title, body, kind)
    values (
      new.organization_id, 'Séjour terminé',
      'Message de remerciement à envoyer à ' || coalesce(v_guest_name, 'un client') || '.',
      'hotel_stay_thankyou'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_hotel_checkout on public.hotel_reservations;
create trigger trg_notify_hotel_checkout
  after update on public.hotel_reservations
  for each row execute function public.notify_hotel_checkout();
