-- Migration 039 — ZegResto, étape 5/7 : Réservations (staff + formulaire
-- public /resto/reserver/$slug). Présentée pour relecture — NE PAS
-- exécuter automatiquement. À exécuter après 038 (Commandes/KDS).
--
-- Exception de scope validée avec Anselme : ZegResto V1 inclut une page
-- publique (hors /app et /admin) pour la réservation client — cas unique
-- à ce module, ne pas étendre à ZegCaisse/ZegHotel sans validation
-- explicite. Plutôt qu'une policy RLS "insert to anon" sur resto_reservations
-- (qui exposerait la table à l'écriture anonyme, même restreinte par
-- colonnes), le formulaire public passe par une seule RPC security definer
-- dédiée (resto_public_create_reservation) : surface d'attaque plus petite,
-- validation centralisée, aucun accès anonyme direct à la table.

create table if not exists public.resto_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_id uuid references public.resto_tables(id) on delete set null,
  nom_client text not null,
  telephone_client text,
  date_heure timestamptz not null,
  nombre_couverts integer not null check (nombre_couverts > 0),
  statut text not null default 'pending' check (statut in ('pending', 'confirmee', 'annulee', 'honoree')),
  source text not null default 'staff' check (source in ('staff', 'public')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_reservations_org on public.resto_reservations(organization_id);
create index if not exists idx_resto_reservations_date on public.resto_reservations(date_heure);
alter table public.resto_reservations enable row level security;

-- accountant en lecture seule (même pattern que le reste du module) ; cook
-- n'a aucun accès (hors de son périmètre KDS). server gère les réservations
-- au même titre qu'owner/manager — c'est le rôle "front of house" côté
-- ZegResto (pas de front_desk ici, contrairement à ZegHotel).
drop policy if exists resto_reservations_select on public.resto_reservations;
create policy resto_reservations_select on public.resto_reservations for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
drop policy if exists resto_reservations_insert on public.resto_reservations;
create policy resto_reservations_insert on public.resto_reservations for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_reservations_update on public.resto_reservations;
create policy resto_reservations_update on public.resto_reservations for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_reservations_delete on public.resto_reservations;
create policy resto_reservations_delete on public.resto_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- resto_public_organization_info() : identité minimale d'un restaurant à
-- partir de son slug public — juste de quoi afficher le nom sur le
-- formulaire avant soumission. Filtre explicitement app_module = 'resto'
-- pour qu'un slug ZegCaisse/ZegHotel ne fuite jamais par cette route.
create or replace function public.resto_public_organization_info(p_slug text)
returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name from public.organizations o
  where o.slug = p_slug and o.app_module = 'resto' and not o.suspended;
$$;
revoke all on function public.resto_public_organization_info(text) from public;
grant execute on function public.resto_public_organization_info(text) to anon, authenticated;

-- resto_public_create_reservation() : seule porte d'écriture anonyme de
-- tout ZegResto. Toujours source='pending'/'public', jamais de table_id
-- (assignée par le staff à la confirmation, cf. /app/resto/reservations).
-- Aucune limite de débit/anti-spam en V1 (assumé, documenté dans
-- ARCHITECTURE.md) — à ajouter si abus constaté (captcha, throttling par IP
-- côté edge, etc.), hors scope de ce chantier SQL.
create or replace function public.resto_public_create_reservation(
  p_slug text,
  p_nom_client text,
  p_telephone_client text,
  p_date_heure timestamptz,
  p_nombre_couverts integer,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
  v_id uuid;
begin
  select id into v_organization_id from public.organizations
  where slug = p_slug and app_module = 'resto' and not suspended;
  if v_organization_id is null then
    raise exception 'Restaurant introuvable.';
  end if;
  if p_nom_client is null or trim(p_nom_client) = '' then
    raise exception 'Nom requis.';
  end if;
  if p_nombre_couverts is null or p_nombre_couverts <= 0 then
    raise exception 'Nombre de couverts invalide.';
  end if;
  if p_date_heure is null or p_date_heure <= now() then
    raise exception 'La date et l''heure doivent être dans le futur.';
  end if;

  insert into public.resto_reservations
    (organization_id, nom_client, telephone_client, date_heure, nombre_couverts, statut, source, notes)
  values
    (v_organization_id, trim(p_nom_client), nullif(trim(coalesce(p_telephone_client, '')), ''), p_date_heure, p_nombre_couverts, 'pending', 'public', p_notes)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.resto_public_create_reservation(text, text, text, timestamptz, integer, text) from public;
grant execute on function public.resto_public_create_reservation(text, text, text, timestamptz, integer, text) to anon, authenticated;
