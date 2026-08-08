-- 092_hotel_hourly_reservation_decoupled.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Correctif urgent (bug remonté : "Réservations 1h/2h/5h... je ne vois pas
-- la possibilité de sélectionner l'heure").
--
-- Cause racine : create_hotel_reservation() ne calculait v_billing_unit
-- ('night'/'hour') qu'à partir de p_rate_plan_id — une réservation ne
-- pouvait devenir horaire que si une formule tarifaire hotel_rate_plans
-- avec billing_unit='hour' existait ET était sélectionnée. Or le tarif
-- horaire par TYPE de chambre (hotel_room_types.hourly_rate/
-- custom_hourly_rates, migration 087, exposé dans le formulaire de
-- réservation par la mission "Round 2 ZegHotel") ne passe jamais par une
-- formule tarifaire — un établissement qui configure uniquement ce
-- tarif-là (sans jamais créer de formule "Horaire" dans Paramètres >
-- Tarification) n'avait donc AUCUN moyen côté serveur d'enregistrer une
-- réservation horaire, même si le frontend envoyait déjà check_in_at/
-- check_out_at : v_billing_unit restait 'night', et hotel_reservation_
-- rooms.billing_unit (recopié depuis la réservation par le trigger
-- hotel_sync_reservation_room_on_insert) aussi — cassant silencieusement
-- la contrainte anti-chevauchement horaire, le hourly_rate figé pour la
-- facturation d'un dépassement au check-out, et tout report_horaire.
--
-- Correctif : l'intention "réservation horaire" est désormais portée par
-- la présence de p_check_in_at ET p_check_out_at (déjà envoyés par le
-- frontend dès que l'utilisateur choisit le mode horaire, indépendamment
-- de la formule tarifaire — voir le correctif frontend associé,
-- app.hotel.reservations.tsx) — la formule tarifaire reste consultée en
-- premier pour son hourly_rate (fallback), mais ne conditionne plus à
-- elle seule le passage en mode horaire. Le hourly_rate figé sur chaque
-- hotel_reservation_rooms (utilisé pour facturer un dépassement au
-- check-out) tombe en repli sur le tarif horaire du TYPE de chambre
-- (migration 087) quand la formule tarifaire n'en fournit pas — même
-- ordre de priorité que rateFor() côté client (app.hotel.reservations.tsx).
--
-- Signature identique à la version existante (schema.sql) — CREATE OR
-- REPLACE suffit, pas de DROP FUNCTION nécessaire (piège CLAUDE.md :
-- vérifié, aucun paramètre ajouté/retiré/retypé).
create or replace function public.create_hotel_reservation(
  p_organization_id uuid,
  p_guest_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms jsonb,
  p_rate_plan_id uuid default null,
  p_corporate_account_id uuid default null,
  p_channel text default 'direct',
  p_adults integer default 1,
  p_children integer default 0,
  p_notes text default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null
) returns public.hotel_reservations
language plpgsql as $$
declare
  v_reservation public.hotel_reservations;
  v_room jsonb;
  v_room_id uuid;
  v_room_type_id uuid;
  v_rate numeric(14,2);
  v_billing_unit text := 'night';
  v_hourly_rate numeric(14,2);
  v_room_hourly_rate numeric(14,2);
  v_billed_hours numeric;
begin
  if p_rooms is null or jsonb_array_length(p_rooms) = 0 then
    raise exception 'Sélectionnez au moins une chambre.';
  end if;

  if p_rate_plan_id is not null then
    select billing_unit, hourly_rate into v_billing_unit, v_hourly_rate
    from public.hotel_rate_plans where id = p_rate_plan_id;
    v_billing_unit := coalesce(v_billing_unit, 'night');
  end if;

  -- Décorrèle le mode horaire d'une formule tarifaire dédiée (voir
  -- commentaire de tête) : un créneau explicite suffit désormais.
  if p_check_in_at is not null and p_check_out_at is not null then
    v_billing_unit := 'hour';
  end if;

  if v_billing_unit = 'hour' and (p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at) then
    raise exception 'Une réservation horaire nécessite une heure d''arrivée et de départ prévues valides.';
  end if;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms
    where id = v_room_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Chambre introuvable.';
    end if;
    perform public.hotel_check_rate_restrictions(p_organization_id, v_room_type_id, p_check_in, p_check_out);
  end loop;

  insert into public.hotel_reservations (
    organization_id, guest_id, corporate_account_id, check_in, check_out,
    rate_plan_id, channel, adults, children, notes, created_by,
    billing_unit, check_in_at, check_out_at
  ) values (
    p_organization_id, p_guest_id, p_corporate_account_id, p_check_in,
    case when v_billing_unit = 'hour' then p_check_in else p_check_out end,
    p_rate_plan_id, coalesce(p_channel, 'direct'), coalesce(p_adults, 1), coalesce(p_children, 0), p_notes, auth.uid(),
    v_billing_unit, p_check_in_at, p_check_out_at
  ) returning * into v_reservation;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms where id = v_room_id;

    -- Tarif horaire figé sur la ligne (dépassement facturé au check-out) :
    -- celui de la formule tarifaire s'il y en a un, sinon celui du type de
    -- chambre (migration 087) — même ordre de priorité que rateFor() côté
    -- client.
    v_room_hourly_rate := null;
    if v_billing_unit = 'hour' then
      v_room_hourly_rate := v_hourly_rate;
      if v_room_hourly_rate is null then
        select hourly_rate into v_room_hourly_rate from public.hotel_room_types where id = v_room_type_id;
      end if;
    end if;

    if (v_room ? 'rate_amount') and (v_room->>'rate_amount') is not null then
      v_rate := (v_room->>'rate_amount')::numeric;
    elsif v_billing_unit = 'hour' then
      v_billed_hours := greatest(1, ceil(extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0));
      v_rate := round(v_billed_hours * coalesce(v_room_hourly_rate, 0), 2);
    else
      v_rate := public.hotel_compute_room_rate(v_room_type_id, p_check_in, p_check_out, p_rate_plan_id);
    end if;

    insert into public.hotel_reservation_rooms (organization_id, reservation_id, room_id, rate_amount, hourly_rate)
    values (p_organization_id, v_reservation.id, v_room_id, v_rate, v_room_hourly_rate);
  end loop;

  insert into public.hotel_folios (organization_id, reservation_id) values (p_organization_id, v_reservation.id);

  return v_reservation;
end;
$$;

revoke all on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) from public;
grant execute on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) to authenticated;
