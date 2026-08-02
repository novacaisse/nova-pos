-- Migration 058 — ZegERP, module 8/10 : Gestion documentaire. Présentée
-- pour relecture — NE PAS exécuter automatiquement. À exécuter après 057.
--
-- Aucun rôle nouveau. RLS entité-scopée (pas une simple liste de rôles à
-- plat) : ARCHITECTURE_ERP.md, section module 8, l'annonçait explicitement
-- ("l'accès à un document suit les droits déjà accordés sur l'entité à
-- laquelle il est rattaché... détail RLS à finaliser au moment de coder ce
-- module") — implémenté ici via erp_document_attachments : un document
-- attaché à un employé suit les droits `hr_manager`, attaché à un
-- fournisseur suit `buyer`, à un client suit `salesperson`, à un contrat
-- suit `accountant`. owner/manager voient/gèrent toujours tout.
--
-- erp-documents est le PREMIER bucket Storage PRIVÉ de ce dépôt (tous les
-- buckets existants — product-images/resto-menu-photos/avatars/... — sont
-- publics en lecture). Justifié par la sensibilité du contenu (pièces
-- d'identité employé, contrats) : une simple URL non-devinable ne suffit
-- pas comme protection pour ce type de document. Le niveau storage reste
-- volontairement grossier (accès à toute l'organisation) ; la nuance fine
-- par entité vit dans erp_documents/erp_document_attachments (RLS DB),
-- exactement comme product-images/avatars laissent la nuance métier aux
-- tables `products`/`profiles` et se contentent d'un filtrage large côté
-- storage.

-- =============== erp_contracts (owner/manager/accountant — pas de
-- rattachement polymorphe : un contrat EST un type d'entité pour
-- erp_document_attachments, pas une cible parmi d'autres) ===============
create table if not exists public.erp_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.erp_suppliers(id) on delete set null,
  customer_id uuid references public.erp_customers(id) on delete set null,
  employee_id uuid references public.erp_employees(id) on delete set null,
  name text not null,
  contract_type text not null default 'other' check (contract_type in ('supplier', 'customer', 'employee', 'lease', 'other')),
  value numeric(14,2),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'expired', 'terminated')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_contracts_org on public.erp_contracts(organization_id);
alter table public.erp_contracts enable row level security;

create policy erp_contracts_select on public.erp_contracts for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_contracts_write on public.erp_contracts for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));

-- =============== erp_documents (métadonnées ; le fichier lui-même vit
-- dans le bucket erp-documents, file_path = chemin storage, jamais le
-- fichier dupliqué en base — même principe que product-images/
-- resto-menu-photos, module 1/ZegResto) ===============
create table if not exists public.erp_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document_type text not null default 'other' check (document_type in ('contract', 'invoice', 'id_card', 'certificate', 'report', 'other')),
  file_path text not null,
  file_size bigint,
  mime_type text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_documents_org on public.erp_documents(organization_id);
alter table public.erp_documents enable row level security;
-- Policies créées plus bas (après erp_document_attachments, dont elles
-- dépendent par sous-requête — `create policy` résout les noms de table à
-- la création, erp_document_attachments doit donc déjà exister).

-- =============== erp_document_attachments (polymorphe : entity_type +
-- entity_id, pas de FK stricte des deux côtés — entity_id peut pointer vers
-- erp_suppliers/erp_customers/erp_employees/erp_contracts selon
-- entity_type) ===============
create table if not exists public.erp_document_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.erp_documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('supplier', 'customer', 'employee', 'contract')),
  entity_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id)
);
create index if not exists idx_erp_document_attachments_org on public.erp_document_attachments(organization_id);
create index if not exists idx_erp_document_attachments_entity on public.erp_document_attachments(entity_type, entity_id);
create index if not exists idx_erp_document_attachments_document on public.erp_document_attachments(document_id);
alter table public.erp_document_attachments enable row level security;

-- Attacher un document à une entité requiert le rôle d'écriture de cette
-- entité (rattacher un document à un employé requiert hr_manager, etc.) —
-- owner/manager peuvent toujours tout attacher.
create policy erp_document_attachments_select on public.erp_document_attachments for select to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or (entity_type = 'supplier' and public.has_any_role_in_organization(organization_id, array['accountant','buyer']::public.app_role[]))
    or (entity_type = 'customer' and public.has_any_role_in_organization(organization_id, array['accountant','salesperson']::public.app_role[]))
    or (entity_type = 'employee' and public.has_any_role_in_organization(organization_id, array['hr_manager']::public.app_role[]))
    or (entity_type = 'contract' and public.has_any_role_in_organization(organization_id, array['accountant']::public.app_role[]))
  );
create policy erp_document_attachments_write on public.erp_document_attachments for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or (entity_type = 'supplier' and public.has_any_role_in_organization(organization_id, array['buyer']::public.app_role[]))
    or (entity_type = 'customer' and public.has_any_role_in_organization(organization_id, array['salesperson']::public.app_role[]))
    or (entity_type = 'employee' and public.has_any_role_in_organization(organization_id, array['hr_manager']::public.app_role[]))
    or (entity_type = 'contract' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or (entity_type = 'supplier' and public.has_any_role_in_organization(organization_id, array['buyer']::public.app_role[]))
    or (entity_type = 'customer' and public.has_any_role_in_organization(organization_id, array['salesperson']::public.app_role[]))
    or (entity_type = 'employee' and public.has_any_role_in_organization(organization_id, array['hr_manager']::public.app_role[]))
    or (entity_type = 'contract' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  );

-- =============== erp_documents — policies (erp_document_attachments existe
-- désormais). owner/manager voient/gèrent tout ; les autres rôles n'ont
-- accès à un document que s'il est attaché à une entité de leur périmètre.
-- Un document sans attachement n'est visible/gérable que par owner/manager. ===============
create policy erp_documents_select on public.erp_documents for select to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','buyer']::public.app_role[]))
          or (a.entity_type = 'customer' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','salesperson']::public.app_role[]))
          or (a.entity_type = 'employee' and public.has_any_role_in_organization(erp_documents.organization_id, array['hr_manager']::public.app_role[]))
          or (a.entity_type = 'contract' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant']::public.app_role[]))
        )
    )
  );
-- Insert : pas encore d'attachement au moment de l'upload (le document est
-- créé, puis attaché) — ouvert à tout rôle métier susceptible de générer
-- un document. La visibilité fine se joue ensuite via l'attachement.
create policy erp_documents_insert on public.erp_documents for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[]));
create policy erp_documents_update on public.erp_documents for update to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','buyer']::public.app_role[]))
          or (a.entity_type = 'customer' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','salesperson']::public.app_role[]))
          or (a.entity_type = 'employee' and public.has_any_role_in_organization(erp_documents.organization_id, array['hr_manager']::public.app_role[]))
          or (a.entity_type = 'contract' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant']::public.app_role[]))
        )
    )
  )
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[]));
create policy erp_documents_delete on public.erp_documents for delete to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[])
    or exists (
      select 1 from public.erp_document_attachments a
      where a.document_id = erp_documents.id
        and (
          (a.entity_type = 'supplier' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','buyer']::public.app_role[]))
          or (a.entity_type = 'customer' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant','salesperson']::public.app_role[]))
          or (a.entity_type = 'employee' and public.has_any_role_in_organization(erp_documents.organization_id, array['hr_manager']::public.app_role[]))
          or (a.entity_type = 'contract' and public.has_any_role_in_organization(erp_documents.organization_id, array['accountant']::public.app_role[]))
        )
    )
  );

-- =============== Bucket Storage erp-documents (PRIVÉ — voir en-tête de
-- fichier). Convention de chemin obligatoire côté client :
-- {organization_id}/{document_id}/{nom_fichier}. Niveau storage grossier
-- (toute l'organisation) ; nuance fine par entité dans les tables
-- ci-dessus. ===============
insert into storage.buckets (id, name, public)
values ('erp-documents', 'erp-documents', false)
on conflict (id) do nothing;

create policy erp_documents_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'erp-documents'
    and public.has_organization_access(((storage.foldername(name))[1])::uuid)
  );
create policy erp_documents_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-documents'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[])
  );
create policy erp_documents_bucket_update on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-documents'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[])
  )
  with check (
    bucket_id = 'erp-documents'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[])
  );
create policy erp_documents_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-documents'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager','accountant','buyer','salesperson','hr_manager']::public.app_role[])
  );
