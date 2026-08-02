-- Migration 057 — ZegERP, module 7/10 : RH. Présentée pour relecture — NE
-- PAS exécuter automatiquement. À exécuter après 056 (rôle hr_manager).
--
-- Périmètre strictement RH (validé, ARCHITECTURE_ERP.md) : toutes les
-- policies ci-dessous se limitent à owner/manager/hr_manager — pas
-- d'accountant, pas de buyer/salesperson/stock/cashier. Données
-- potentiellement sensibles (identité, congés, documents personnels) :
-- périmètre volontairement resserré, pas élargi "pour être pratique".
--
-- erp_employee_documents.file_url : texte simple en V1 (comme
-- erp_products.image_url, module 1), pas encore raccroché au bucket
-- Storage `erp-documents` prévu module 8 — pas de dépendance dure sur un
-- module non livré, cohérent avec "pas de demi-mesure" mais sans bloquer
-- ce module sur un autre pas encore construit.

-- =============== erp_departments ===============
create table if not exists public.erp_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_departments_org on public.erp_departments(organization_id);
alter table public.erp_departments enable row level security;

create policy erp_departments_select on public.erp_departments for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_departments_write on public.erp_departments for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));

-- =============== erp_positions ===============
create table if not exists public.erp_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.erp_departments(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_positions_org on public.erp_positions(organization_id);
alter table public.erp_positions enable row level security;

create policy erp_positions_select on public.erp_positions for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_positions_write on public.erp_positions for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));

-- =============== erp_employees (user_id optionnel : un employé n'a pas
-- forcément de compte ZegOS — ex. personnel de terrain sans accès app) ===============
create table if not exists public.erp_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.erp_departments(id) on delete set null,
  position_id uuid references public.erp_positions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  hire_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_employees_org on public.erp_employees(organization_id);
create index if not exists idx_erp_employees_department on public.erp_employees(department_id);
alter table public.erp_employees enable row level security;

create policy erp_employees_select on public.erp_employees for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_employees_write on public.erp_employees for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));

-- =============== erp_attendance ===============
create table if not exists public.erp_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present', 'absent', 'late', 'half_day')),
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);
create index if not exists idx_erp_attendance_org on public.erp_attendance(organization_id);
create index if not exists idx_erp_attendance_employee on public.erp_attendance(employee_id);
alter table public.erp_attendance enable row level security;

create policy erp_attendance_select on public.erp_attendance for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_attendance_write on public.erp_attendance for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));

-- =============== erp_leave_requests (approbation par owner/manager/
-- hr_manager — pas de split créateur/approbateur ici, contrairement à
-- erp_purchase_requests module 2 : hr_manager porte une autorité
-- managériale complète sur son périmètre, validé sans restriction
-- particulière dans ARCHITECTURE_ERP.md) ===============
create table if not exists public.erp_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  leave_type text not null default 'paid' check (leave_type in ('paid', 'unpaid', 'sick', 'other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  check (end_date >= start_date)
);
create index if not exists idx_erp_leave_requests_org on public.erp_leave_requests(organization_id);
create index if not exists idx_erp_leave_requests_employee on public.erp_leave_requests(employee_id);
alter table public.erp_leave_requests enable row level security;

create policy erp_leave_requests_select on public.erp_leave_requests for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_leave_requests_write on public.erp_leave_requests for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));

-- =============== erp_employee_documents ===============
create table if not exists public.erp_employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.erp_employees(id) on delete cascade,
  name text not null,
  document_type text not null default 'other' check (document_type in ('contract', 'id_card', 'diploma', 'certificate', 'other')),
  file_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_employee_documents_org on public.erp_employee_documents(organization_id);
create index if not exists idx_erp_employee_documents_employee on public.erp_employee_documents(employee_id);
alter table public.erp_employee_documents enable row level security;

create policy erp_employee_documents_select on public.erp_employee_documents for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
create policy erp_employee_documents_write on public.erp_employee_documents for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','hr_manager']::public.app_role[]));
