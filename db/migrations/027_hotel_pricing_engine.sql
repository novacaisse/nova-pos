-- 027_hotel_pricing_engine.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Corrige un gap trouvé en auditant la création de réservation ZegHotel
-- (useCreateHotelReservation, src/lib/data/hotelHooks.ts) : Paramètres >
-- Tarification permet de configurer des formules tarifaires
-- (hotel_rate_plans.price_adjustment_pct), des tarifs saisonniers
-- (hotel_seasonal_rates.price_override) et des restrictions (séjour
-- minimum, fermé aux arrivées, stop-vente — hotel_rate_restrictions), mais
-- RIEN de tout cela n'était appliqué à la création d'une réservation : le
-- prix facturé venait uniquement de room_type.base_price × nuits, la
-- formule tarifaire choisie n'était enregistrée que pour l'affichage, et
-- aucune restriction ne bloquait quoi que ce soit.
--
-- Règle de précédence retenue (confirmée avec Emmanuel) : pour chaque
-- nuit, le tarif saisonnier (s'il y en a un qui s'applique) REMPLACE
-- base_price ; le pourcentage de la formule tarifaire s'applique ensuite
-- sur ce total (remplacement puis ajustement relatif, cohérent avec les
-- noms des colonnes : price_override vs price_adjustment_pct).
--
-- Restrictions : bloquantes strictement (pas de simple avertissement),
-- cohérent avec le garde-fou anti-survente de stock de la migration 026 —
-- confirmé avec Emmanuel.

-- =============== 1. Calcul du tarif (seasonal override + rate plan %) ===============
create or replace function public.hotel_compute_room_rate(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_id uuid
) returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_base numeric(14,2);
  v_adjustment_pct numeric(5,2) := 0;
  v_day date;
  v_night_price numeric(14,2);
  v_total numeric(14,2) := 0;
begin
  select base_price into v_base from public.hotel_room_types where id = p_room_type_id;
  if not found then
    raise exception 'Type de chambre introuvable.';
  end if;

  if p_rate_plan_id is not null then
    select price_adjustment_pct into v_adjustment_pct
    from public.hotel_rate_plans where id = p_rate_plan_id;
  end if;

  v_day := p_check_in;
  while v_day < p_check_out loop
    select price_override into v_night_price
    from public.hotel_seasonal_rates
    where room_type_id = p_room_type_id
      and v_day between start_date and end_date
      and (days_of_week is null or extract(dow from v_day)::int = any(days_of_week))
    order by start_date desc
    limit 1;

    v_total := v_total + coalesce(v_night_price, v_base);
    v_day := v_day + 1;
  end loop;

  return round(v_total * (1 + coalesce(v_adjustment_pct, 0) / 100.0), 2);
end;
$$;

revoke all on function public.hotel_compute_room_rate(uuid, date, date, uuid) from public;
grant execute on function public.hotel_compute_room_rate(uuid, date, date, uuid) to authenticated;

-- =============== 2. Restrictions (séjour min / stop-vente / fermé à l'arrivée) ===============
create or replace function public.hotel_check_rate_restrictions(
  p_organization_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
) returns void
language plpgsql stable set search_path = public as $$
declare
  v_max_min_stay integer;
begin
  if exists (
    select 1 from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and stop_sell
      and daterange(start_date, end_date, '[]') && daterange(p_check_in, p_check_out)
  ) then
    raise exception 'Ces dates sont fermées à la vente pour ce type de chambre.';
  end if;

  if exists (
    select 1 from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and closed_to_arrival
      and p_check_in between start_date and end_date
  ) then
    raise exception 'Les arrivées ne sont pas autorisées à cette date pour ce type de chambre.';
  end if;

  select max(min_stay) into v_max_min_stay
  from public.hotel_rate_restrictions
  where organization_id = p_organization_id
    and (room_type_id = p_room_type_id or room_type_id is null)
    and min_stay is not null
    and p_check_in between start_date and end_date;

  if v_max_min_stay is not null and (p_check_out - p_check_in) < v_max_min_stay then
    raise exception 'Séjour minimum de % nuit(s) requis pour ces dates.', v_max_min_stay;
  end if;
end;
$$;

revoke all on function public.hotel_check_rate_restrictions(uuid, uuid, date, date) from public;
grant execute on function public.hotel_check_rate_restrictions(uuid, uuid, date, date) to authenticated;

-- =============== 3. create_hotel_reservation() — réservation atomique ===============
-- Même raisonnement que create_sale (migration 026) : une réservation
-- multi-chambres enchaînait plusieurs écritures client séparées
-- (hotel_reservations, hotel_reservation_rooms, hotel_folios) sans
-- transaction. Ici en plus : vérifie les restrictions AVANT toute
-- écriture, et calcule le tarif définitif si le client n'en fournit pas
-- un explicite (rate_amount = null → override manuel non utilisé côté
-- staff, comportement inchangé sinon). Security invoker : les policies
-- RLS hotel_reservations_insert/hotel_resv_rooms_write/hotel_folios_write
-- s'appliquent normalement.
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
  p_notes text default null
) returns public.hotel_reservations
language plpgsql as $$
declare
  v_reservation public.hotel_reservations;
  v_room jsonb;
  v_room_id uuid;
  v_room_type_id uuid;
  v_rate numeric(14,2);
begin
  if p_rooms is null or jsonb_array_length(p_rooms) = 0 then
    raise exception 'Sélectionnez au moins une chambre.';
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
    rate_plan_id, channel, adults, children, notes, created_by
  ) values (
    p_organization_id, p_guest_id, p_corporate_account_id, p_check_in, p_check_out,
    p_rate_plan_id, coalesce(p_channel, 'direct'), coalesce(p_adults, 1), coalesce(p_children, 0), p_notes, auth.uid()
  ) returning * into v_reservation;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms where id = v_room_id;

    if (v_room ? 'rate_amount') and (v_room->>'rate_amount') is not null then
      v_rate := (v_room->>'rate_amount')::numeric;
    else
      v_rate := public.hotel_compute_room_rate(v_room_type_id, p_check_in, p_check_out, p_rate_plan_id);
    end if;

    insert into public.hotel_reservation_rooms (organization_id, reservation_id, room_id, rate_amount)
    values (p_organization_id, v_reservation.id, v_room_id, v_rate);
  end loop;

  insert into public.hotel_folios (organization_id, reservation_id) values (p_organization_id, v_reservation.id);

  return v_reservation;
end;
$$;

revoke all on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text) from public;
grant execute on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text) to authenticated;
