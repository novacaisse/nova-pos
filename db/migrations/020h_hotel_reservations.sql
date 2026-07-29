-- Migration 020h — ZegHotel, étape 3/4 : clients, réservations et
-- attribution des chambres, avec protection anti-double-réservation au
-- niveau base (contrainte d'exclusion Postgres, pas seulement côté client).
-- À exécuter après 020f et 020g.

-- =============== guests ===============
create table if not exists public.hotel_guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  id_document_type text,
  id_document_number text,
  nationality text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_guests_org on public.hotel_guests(organization_id);
alter table public.hotel_guests enable row level security;
-- Housekeeping exclu délibérément (rôle scopé "statuts chambres et
-- tâches de nettoyage uniquement", voir 020g) — aucune donnée client/
-- financière ne doit lui être accessible.
drop policy if exists hotel_guests_select on public.hotel_guests;
create policy hotel_guests_select on public.hotel_guests for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_guests_write on public.hotel_guests;
create policy hotel_guests_write on public.hotel_guests for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));

-- =============== reservations ===============
create table if not exists public.hotel_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guest_id uuid not null references public.hotel_guests(id) on delete restrict,
  corporate_account_id uuid references public.hotel_corporate_accounts(id) on delete set null,
  check_in date not null,
  check_out date not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  rate_plan_id uuid references public.hotel_rate_plans(id) on delete set null,
  channel text not null default 'direct',
  adults integer not null default 1,
  children integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  check (check_out > check_in)
);
create index if not exists idx_hotel_reservations_org on public.hotel_reservations(organization_id);
create index if not exists idx_hotel_reservations_guest on public.hotel_reservations(guest_id);
create index if not exists idx_hotel_reservations_dates on public.hotel_reservations(organization_id, check_in, check_out);
alter table public.hotel_reservations enable row level security;
drop policy if exists hotel_reservations_select on public.hotel_reservations;
create policy hotel_reservations_select on public.hotel_reservations for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_reservations_insert on public.hotel_reservations;
create policy hotel_reservations_insert on public.hotel_reservations for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));
drop policy if exists hotel_reservations_update on public.hotel_reservations;
create policy hotel_reservations_update on public.hotel_reservations for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));
-- Suppression définitive (hors annulation, qui est un changement de
-- statut) réservée à owner/manager — conserve l'historique par défaut.
drop policy if exists hotel_reservations_delete on public.hotel_reservations;
create policy hotel_reservations_delete on public.hotel_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== reservation_rooms ===============
-- check_in/check_out/status sont dénormalisés depuis hotel_reservations
-- et synchronisés par trigger (jamais écrits directement par le client) :
-- une contrainte d'exclusion ne peut porter que sur des colonnes de cette
-- même table, impossible de contraindre directement via une jointure.
create table if not exists public.hotel_reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.hotel_reservations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete restrict,
  rate_amount numeric(14,2) not null,
  check_in date not null,
  check_out date not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (reservation_id, room_id),
  -- Bloque tout chevauchement de dates sur la même chambre tant que la
  -- réservation est "active" (pending/confirmed/checked_in) — cancelled/
  -- no_show/checked_out libèrent la chambre pour de nouvelles réservations
  -- sur les mêmes dates.
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out) with &&
  ) where (status in ('pending','confirmed','checked_in'))
);
create index if not exists idx_hotel_resv_rooms_org on public.hotel_reservation_rooms(organization_id);
create index if not exists idx_hotel_resv_rooms_reservation on public.hotel_reservation_rooms(reservation_id);
create index if not exists idx_hotel_resv_rooms_room on public.hotel_reservation_rooms(room_id);
alter table public.hotel_reservation_rooms enable row level security;
drop policy if exists hotel_resv_rooms_select on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_select on public.hotel_reservation_rooms for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_resv_rooms_write on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_write on public.hotel_reservation_rooms for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));

-- Remplit automatiquement check_in/check_out/status à l'insertion depuis
-- la réservation parente — le client n'a jamais à les fournir ni à les
-- tenir synchronisés lui-même.
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
  return new;
end;
$$;
drop trigger if exists trg_hotel_resv_room_insert on public.hotel_reservation_rooms;
create trigger trg_hotel_resv_room_insert
  before insert on public.hotel_reservation_rooms
  for each row execute function public.hotel_sync_reservation_room_on_insert();

-- Répercute tout changement de dates/statut de la réservation sur les
-- lignes hotel_reservation_rooms existantes (ex. annulation : libère la
-- chambre pour de nouvelles réservations ; changement de dates : la
-- contrainte d'exclusion protège aussi contre un nouveau chevauchement).
create or replace function public.hotel_sync_reservation_room_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.status is distinct from old.status then
    update public.hotel_reservation_rooms
    set check_in = new.check_in, check_out = new.check_out, status = new.status
    where reservation_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hotel_reservations_sync on public.hotel_reservations;
create trigger trg_hotel_reservations_sync
  after update on public.hotel_reservations
  for each row execute function public.hotel_sync_reservation_room_on_update();
