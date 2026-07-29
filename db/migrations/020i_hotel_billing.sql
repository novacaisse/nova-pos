-- Migration 020i — ZegHotel, étape 4/4 (partie facturation) : folios,
-- charges et paiements. À exécuter après 020f/020g/020h.
--
-- Un seul folio par réservation en V1 (pas de folio par chambre pour un
-- séjour multi-chambres) — correspond à "dossier de charges actif d'un
-- séjour" au singulier dans la demande initiale.

create table if not exists public.hotel_folios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.hotel_reservations(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reservation_id)
);
create index if not exists idx_hotel_folios_org on public.hotel_folios(organization_id);
alter table public.hotel_folios enable row level security;
drop policy if exists hotel_folios_select on public.hotel_folios;
create policy hotel_folios_select on public.hotel_folios for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_folios_write on public.hotel_folios;
create policy hotel_folios_write on public.hotel_folios for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));

create table if not exists public.hotel_folio_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio_id uuid not null references public.hotel_folios(id) on delete cascade,
  kind text not null check (kind in ('room','extra','penalty','tax','discount')),
  description text not null,
  amount numeric(14,2) not null,
  quantity integer not null default 1,
  charge_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_folio_charges_org on public.hotel_folio_charges(organization_id);
create index if not exists idx_hotel_folio_charges_folio on public.hotel_folio_charges(folio_id);
alter table public.hotel_folio_charges enable row level security;
drop policy if exists hotel_folio_charges_select on public.hotel_folio_charges;
create policy hotel_folio_charges_select on public.hotel_folio_charges for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_folio_charges_write on public.hotel_folio_charges;
create policy hotel_folio_charges_write on public.hotel_folio_charges for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));

-- Nommée hotel_payments (pas payments) : public.payments existe déjà
-- côté ZegCaisse (paiements de vente) — collision directe évitée.
create table if not exists public.hotel_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  folio_id uuid not null references public.hotel_folios(id) on delete cascade,
  amount numeric(14,2) not null,
  method text not null check (method in ('cash','mobile_money','card','bank_transfer')),
  kind text not null default 'payment' check (kind in ('deposit','payment','refund')),
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_payments_org on public.hotel_payments(organization_id);
create index if not exists idx_hotel_payments_folio on public.hotel_payments(folio_id);
alter table public.hotel_payments enable row level security;
drop policy if exists hotel_payments_select on public.hotel_payments;
create policy hotel_payments_select on public.hotel_payments for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','accountant']::public.app_role[]));
drop policy if exists hotel_payments_insert on public.hotel_payments;
create policy hotel_payments_insert on public.hotel_payments for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));
-- Modifier/supprimer un paiement déjà enregistré est réservé à
-- owner/manager (intégrité financière — un front_desk qui se trompe
-- doit faire corriger par son responsable, pas éditer directement).
drop policy if exists hotel_payments_update on public.hotel_payments;
create policy hotel_payments_update on public.hotel_payments for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists hotel_payments_delete on public.hotel_payments;
create policy hotel_payments_delete on public.hotel_payments for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
