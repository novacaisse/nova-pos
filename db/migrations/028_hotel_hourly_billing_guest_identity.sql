-- 028_hotel_hourly_billing_guest_identity.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 1 — "6 nouveaux modules + réservations nuitée/horaire +
-- sélecteur de période universel" : réservations à la nuit ET à l'heure
-- (courant en Afrique de l'Ouest pour certains établissements), infos
-- client complètes (CNI/passeport, adresse, date de naissance).
--
-- Décisions produit confirmées avec Emmanuel avant implémentation :
-- - Double-réservation horaire : check_in/check_out (date) restent la
--   source de vérité pour tout le système existant (rapports, dashboard,
--   moteur de tarification migration 027, contrainte nuitée) — une 2e
--   contrainte d'exclusion, additive, gère spécifiquement le
--   chevauchement d'heures entre réservations horaires sur la même
--   chambre le même jour, SANS toucher au code nuitée stabilisé.
-- - Arrondi horaire : à l'heure supérieure, 1h minimum facturée (règle
--   documentée ici, pas encore configurable par établissement — à
--   ouvrir si un besoin réel de configuration apparaît).
-- - Données d'identité (CNI/passeport/adresse/date de naissance) :
--   lecture restreinte en RLS à owner/manager/front_desk uniquement (pas
--   accountant, pas housekeeping) — une fonction dédiée
--   hotel_guest_contact() donne aux autres rôles qui en ont besoin
--   (accountant) une lecture "contact seul" (nom/email/téléphone), sans
--   jamais exposer les colonnes sensibles, y compris via un appel API
--   direct (masquage fait en SQL, pas seulement côté client).
-- - date_of_birth plutôt qu'un âge stocké (qui deviendrait faux avec le
--   temps).

-- =============== 1. hotel_rate_plans : billing_unit + hourly_rate ===============
alter table public.hotel_rate_plans
  add column if not exists billing_unit text not null default 'night',
  add column if not exists hourly_rate numeric(14,2);

do $$ begin
  alter table public.hotel_rate_plans add constraint hotel_rate_plans_billing_unit_check
    check (billing_unit in ('night', 'hour'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.hotel_rate_plans add constraint hotel_rate_plans_hourly_rate_check
    check (billing_unit <> 'hour' or hourly_rate is not null);
exception when duplicate_object then null; end $$;

-- =============== 2. hotel_reservations : billing_unit + timestamptz ===============
-- check_in/check_out (date) restent la granularité "jour occupé" utilisée
-- partout ailleurs (dashboard, rapports, contrainte d'exclusion nuitée,
-- moteur de tarification). check_in_at/check_out_at (prévu) et
-- actual_check_in_at/actual_check_out_at (réel) s'y ajoutent, utilisés
-- uniquement pour la granularité horaire et l'audit des heures réelles.
alter table public.hotel_reservations
  add column if not exists billing_unit text not null default 'night',
  add column if not exists check_in_at timestamptz,
  add column if not exists check_out_at timestamptz,
  add column if not exists actual_check_in_at timestamptz,
  add column if not exists actual_check_out_at timestamptz;

do $$ begin
  alter table public.hotel_reservations add constraint hotel_reservations_billing_unit_check
    check (billing_unit in ('night', 'hour'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.hotel_reservations add constraint hotel_reservations_hourly_times_check
    check (billing_unit <> 'hour' or (check_in_at is not null and check_out_at is not null and check_out_at > check_in_at));
exception when duplicate_object then null; end $$;

-- Remplace la contrainte "check_out > check_in" (jamais nommée
-- explicitement à la création — nom auto-généré par Postgres, retrouvé
-- dynamiquement ici plutôt que deviné) pour autoriser une réservation
-- horaire sur un seul jour calendaire (check_in = check_out).
do $$
declare
  v_conname text;
begin
  select conname into v_conname from pg_constraint
  where conrelid = 'public.hotel_reservations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%check_out%>%check_in%'
    and conname <> 'hotel_reservations_dates_check';
  if v_conname is not null then
    execute format('alter table public.hotel_reservations drop constraint %I', v_conname);
  end if;
end $$;

do $$ begin
  alter table public.hotel_reservations add constraint hotel_reservations_dates_check
    check (check_out > check_in or billing_unit = 'hour');
exception when duplicate_object then null; end $$;

-- =============== 3. hotel_reservation_rooms : idem + double contrainte anti-collision ===============
alter table public.hotel_reservation_rooms
  add column if not exists billing_unit text not null default 'night',
  add column if not exists check_in_at timestamptz,
  add column if not exists check_out_at timestamptz,
  -- hourly_rate figé au moment de la réservation (indépendant d'un
  -- changement ultérieur de la formule tarifaire) : c'est ce montant, pas
  -- celui lu en direct sur hotel_rate_plans, qui sert à calculer la
  -- charge réelle au check-out.
  add column if not exists hourly_rate numeric(14,2);

-- La contrainte d'exclusion existante utilise daterange(check_in, check_out)
-- — pour une réservation horaire, check_in = check_out (même jour), ce qui
-- donne un daterange VIDE (aucune collision détectée avec quoi que ce
-- soit, y compris une réservation nuitée qui occupe déjà toute la
-- journée). On la remplace par daterange(check_in, greatest(check_out,
-- check_in + 1)) : comportement nuitée inchangé (check_out déjà > check_in),
-- mais une réservation horaire occupe désormais correctement 1 jour plein
-- au niveau de cette contrainte "jour" — la distinction fine entre
-- plusieurs passages horaires le même jour est gérée par la 2e contrainte
-- ci-dessous, sur la plage horaire précise.
do $$
declare
  v_conname text;
begin
  select conname into v_conname from pg_constraint
  where conrelid = 'public.hotel_reservation_rooms'::regclass and contype = 'x'
    and conname not in ('hotel_resv_rooms_excl', 'hotel_resv_rooms_hourly_excl');
  if v_conname is not null then
    execute format('alter table public.hotel_reservation_rooms drop constraint %I', v_conname);
  end if;
end $$;

do $$ begin
  alter table public.hotel_reservation_rooms
    add constraint hotel_resv_rooms_excl
    exclude using gist (
      room_id with =,
      daterange(check_in, greatest(check_out, check_in + 1)) with &&
    ) where (status in ('pending', 'confirmed', 'checked_in'));
exception when duplicate_object then null; end $$;

-- Chevauchement fin entre réservations horaires sur la même chambre le
-- même jour — n'entre en jeu que pour billing_unit = 'hour' (la
-- contrainte ci-dessus couvre déjà toute collision jour/nuitée).
do $$ begin
  alter table public.hotel_reservation_rooms
    add constraint hotel_resv_rooms_hourly_excl
    exclude using gist (
      room_id with =,
      tstzrange(check_in_at, check_out_at) with &&
    ) where (status in ('pending', 'confirmed', 'checked_in') and billing_unit = 'hour');
exception when duplicate_object then null; end $$;

-- Répercute désormais aussi billing_unit/check_in_at/check_out_at de la
-- réservation vers ses lignes hotel_reservation_rooms (même mécanisme
-- déjà en place pour check_in/check_out/status — signatures inchangées,
-- remplacement sans risque pour les triggers qui en dépendent déjà).
create or replace function public.hotel_sync_reservation_room_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reservation public.hotel_reservations;
begin
  select * into v_reservation from public.hotel_reservations where id = new.reservation_id;
  if not found then
    raise exception 'Réservation introuvable.';
  end if;
  new.check_in := v_reservation.check_in;
  new.check_out := v_reservation.check_out;
  new.status := v_reservation.status;
  new.billing_unit := v_reservation.billing_unit;
  new.check_in_at := v_reservation.check_in_at;
  new.check_out_at := v_reservation.check_out_at;
  return new;
end;
$$;

create or replace function public.hotel_sync_reservation_room_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.status is distinct from old.status
     or new.billing_unit is distinct from old.billing_unit
     or new.check_in_at is distinct from old.check_in_at
     or new.check_out_at is distinct from old.check_out_at then
    update public.hotel_reservation_rooms
    set check_in = new.check_in, check_out = new.check_out, status = new.status,
        billing_unit = new.billing_unit, check_in_at = new.check_in_at, check_out_at = new.check_out_at
    where reservation_id = new.id;
  end if;
  return new;
end;
$$;

-- =============== 4. hotel_check_rate_restrictions : même correctif de plage vide ===============
-- Même bug que la contrainte d'exclusion ci-dessus : daterange(p_check_in,
-- p_check_out) est vide quand p_check_in = p_check_out (réservation
-- horaire), donc un stop-vente ne bloquait jamais rien pour l'horaire.
-- min_stay (séjour minimum, un concept nuitée) est désormais ignoré pour
-- un séjour de 0 nuit. Signature inchangée (uuid, uuid, date, date) —
-- remplacement sans risque.
create or replace function public.hotel_check_rate_restrictions(
  p_organization_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
) returns void
language plpgsql stable set search_path = public as $$
declare
  v_max_min_stay integer;
  v_range daterange := daterange(p_check_in, greatest(p_check_out, p_check_in + 1));
begin
  if exists (
    select 1 from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and stop_sell
      and daterange(start_date, end_date, '[]') && v_range
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

  if p_check_out > p_check_in then
    select max(min_stay) into v_max_min_stay
    from public.hotel_rate_restrictions
    where organization_id = p_organization_id
      and (room_type_id = p_room_type_id or room_type_id is null)
      and min_stay is not null
      and p_check_in between start_date and end_date;

    if v_max_min_stay is not null and (p_check_out - p_check_in) < v_max_min_stay then
      raise exception 'Séjour minimum de % nuit(s) requis pour ces dates.', v_max_min_stay;
    end if;
  end if;
end;
$$;

-- =============== 5. create_hotel_reservation() : nuitée/horaire ===============
-- Ajoute p_check_in_at/p_check_out_at (prévu, requis si la formule choisie
-- est horaire) — signature différente de la version migration 027, donc
-- drop explicite d'abord (pas de policy ni d'autre fonction n'en dépend,
-- contrairement à has_organization_access et consorts : DROP sans risque
-- de cascade ici) pour garantir qu'une seule version existe, que 027 ait
-- déjà été exécutée ou non.
drop function if exists public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text);

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
    -- Réservation horaire sur un seul jour calendaire : check_out (date)
    -- forcé à check_in, quoi qu'ait envoyé le client pour ce paramètre.
    case when v_billing_unit = 'hour' then p_check_in else p_check_out end,
    p_rate_plan_id, coalesce(p_channel, 'direct'), coalesce(p_adults, 1), coalesce(p_children, 0), p_notes, auth.uid(),
    v_billing_unit, p_check_in_at, p_check_out_at
  ) returning * into v_reservation;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms where id = v_room_id;

    if (v_room ? 'rate_amount') and (v_room->>'rate_amount') is not null then
      v_rate := (v_room->>'rate_amount')::numeric;
    elsif v_billing_unit = 'hour' then
      -- Estimation à la réservation seulement (affichage avant l'arrivée) —
      -- arrondie à l'heure supérieure, 1h minimum. Le montant réel est
      -- recalculé et posté au check-out à partir de la durée effective
      -- (voir useCheckOutReservation côté client).
      v_billed_hours := greatest(1, ceil(extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0));
      v_rate := round(v_billed_hours * v_hourly_rate, 2);
    else
      v_rate := public.hotel_compute_room_rate(v_room_type_id, p_check_in, p_check_out, p_rate_plan_id);
    end if;

    insert into public.hotel_reservation_rooms (organization_id, reservation_id, room_id, rate_amount, hourly_rate)
    values (p_organization_id, v_reservation.id, v_room_id, v_rate, case when v_billing_unit = 'hour' then v_hourly_rate else null end);
  end loop;

  insert into public.hotel_folios (organization_id, reservation_id) values (p_organization_id, v_reservation.id);

  return v_reservation;
end;
$$;

revoke all on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) from public;
grant execute on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) to authenticated;

-- =============== 6. hotel_guests : infos complémentaires + RLS identité ===============
alter table public.hotel_guests
  add column if not exists date_of_birth date;

-- Restreint la lecture des données d'identité (id_document_type/number,
-- address, date_of_birth — désormais présentes) à owner/manager/front_desk
-- uniquement. accountant en avait la lecture jusqu'ici (policy
-- précédente) : hotel_guest_contact() ci-dessous lui donne (et à toute
-- autre extension future qui n'a besoin que du contact) un accès "nom/
-- email/téléphone" sans jamais exposer les colonnes sensibles — y compris
-- via un appel API direct, puisque le masquage est fait dans la fonction,
-- pas seulement côté client.
drop policy if exists hotel_guests_select on public.hotel_guests;
create policy hotel_guests_select on public.hotel_guests for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner', 'manager', 'front_desk']::public.app_role[]));

create or replace function public.hotel_guest_contact(_organization_id uuid)
returns table (
  id uuid, organization_id uuid, full_name text, email text, phone text,
  nationality text, notes text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_any_role_in_organization(_organization_id, array['owner', 'manager', 'front_desk', 'accountant']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;
  return query
    select g.id, g.organization_id, g.full_name, g.email, g.phone, g.nationality, g.notes, g.created_at
    from public.hotel_guests g
    where g.organization_id = _organization_id;
end;
$$;

revoke all on function public.hotel_guest_contact(uuid) from public;
grant execute on function public.hotel_guest_contact(uuid) to authenticated;
