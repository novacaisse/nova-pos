-- Migration 062 — ZegCaisse : module Réservations (bloc demandé côté POS).
-- Présentée pour relecture — NE PAS exécuter automatiquement.
--
-- Une réservation n'est PAS une vente : elle ne bouge jamais le stock tant
-- qu'elle n'est pas honorée (contrairement à un ticket en attente, qui EST
-- une vraie ligne `sales` en status 'draft', éphémère). D'où une table
-- dédiée plutôt qu'un détournement de `sales.status` — cf. discussion dans
-- l'historique de session : réutiliser 'draft' aurait collisionné
-- sémantiquement avec les tickets en attente de la Caisse (éphémères, "en
-- cours de construction") alors qu'une réservation est un engagement
-- persistant à honorer à une date donnée.
--
-- items est stocké en jsonb (pas de table reservation_items séparée) :
-- une réservation ne nécessite ni ventilation TVA par ligne, ni mouvement
-- de stock avant d'être honorée — un simple instantané {product_id, name,
-- quantity, unit_price} suffit, cohérent avec la demande ("articles,
-- montant, avance, reste, date").
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0,
  deposit numeric(14,2) not null default 0,
  reservation_date date not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reservations_org on public.reservations(organization_id);
create index if not exists idx_reservations_date on public.reservations(organization_id, reservation_date);
alter table public.reservations enable row level security;

-- Même périmètre de rôles que sales (022a) : lecture owner/manager/
-- cashier/accountant, création owner/manager/cashier, modification/
-- suppression owner/manager (un cashier crée une réservation mais ne
-- l'annule/l'honore pas seul — même logique que sales_update).
create policy reservations_select on public.reservations for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier','accountant']::public.app_role[]));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy reservations_update on public.reservations for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
