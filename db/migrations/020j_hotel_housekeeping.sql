-- Migration 020j — ZegHotel, étape finale : tâches de ménage et
-- incidents de maintenance. À exécuter après 020f/020g/020h/020i.

create table if not exists public.hotel_housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete cascade,
  task_date date not null default current_date,
  kind text not null default 'cleaning' check (kind in ('cleaning','turnover','inspection')),
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_hotel_housekeeping_org on public.hotel_housekeeping_tasks(organization_id);
create index if not exists idx_hotel_housekeeping_room on public.hotel_housekeeping_tasks(room_id);
create index if not exists idx_hotel_housekeeping_date on public.hotel_housekeeping_tasks(organization_id, task_date);
alter table public.hotel_housekeeping_tasks enable row level security;
-- Génération des tâches (owner/manager/front_desk, typiquement depuis un
-- bouton "générer les tâches du jour") ; la gouvernante lit et met à jour
-- le statut de ses tâches, jamais n'en crée ni n'en supprime.
drop policy if exists hotel_housekeeping_select on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_select on public.hotel_housekeeping_tasks for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping']::public.app_role[]));
drop policy if exists hotel_housekeeping_insert on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_insert on public.hotel_housekeeping_tasks for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk']::public.app_role[]));
drop policy if exists hotel_housekeeping_update on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_update on public.hotel_housekeeping_tasks for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping']::public.app_role[]));
drop policy if exists hotel_housekeeping_delete on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_delete on public.hotel_housekeeping_tasks for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.hotel_maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_hotel_maintenance_org on public.hotel_maintenance_tickets(organization_id);
create index if not exists idx_hotel_maintenance_room on public.hotel_maintenance_tickets(room_id);
alter table public.hotel_maintenance_tickets enable row level security;
-- Tout le monde qui peut voir une chambre peut signaler un incident
-- (housekeeping/front_desk en particulier) ; suivi/résolution réservé à
-- owner/manager/housekeeping (souvent la gouvernante qui gère aussi la
-- coordination avec un technicien).
drop policy if exists hotel_maintenance_select on public.hotel_maintenance_tickets;
create policy hotel_maintenance_select on public.hotel_maintenance_tickets for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping']::public.app_role[]));
drop policy if exists hotel_maintenance_insert on public.hotel_maintenance_tickets;
create policy hotel_maintenance_insert on public.hotel_maintenance_tickets for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping']::public.app_role[]));
drop policy if exists hotel_maintenance_update on public.hotel_maintenance_tickets;
create policy hotel_maintenance_update on public.hotel_maintenance_tickets for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','housekeeping']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','housekeeping']::public.app_role[]));
drop policy if exists hotel_maintenance_delete on public.hotel_maintenance_tickets;
create policy hotel_maintenance_delete on public.hotel_maintenance_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
