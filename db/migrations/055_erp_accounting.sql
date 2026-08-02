-- Migration 055 — ZegERP, module 6/10 : Comptabilité. Présentée pour
-- relecture — NE PAS exécuter automatiquement. À exécuter après 054.
--
-- Aucun rôle nouveau (owner/manager/accountant uniquement, même périmètre
-- que Finance module 5). Aucune migration d'enum : tous les statuts sont
-- des `text` avec check constraint (comme app_module), pas des enums
-- Postgres — cohérent avec le choix déjà fait pour la plupart des statuts
-- ZegERP (draft/confirmed...).
--
-- Intégration Achats/Ventes/Finance → Comptabilité : saisie manuelle en V1
-- (aucune écriture générée automatiquement depuis erp_purchase_orders/
-- erp_sales_orders/erp_cash_transactions) — même limite assumée que le
-- module 5 pour les mêmes raisons (pas demandé, ajout possible plus tard
-- sans casser ce qui existe).

-- =============== erp_chart_of_accounts (plan comptable SYSCOHADA — `code`
-- porte la numérotation SYSCOHADA elle-même, `type` est une classification
-- simplifiée pour les rapports, pas une redite de la numérotation) ===============
create table if not exists public.erp_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.erp_chart_of_accounts(id) on delete set null,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_chart_of_accounts_org on public.erp_chart_of_accounts(organization_id);
alter table public.erp_chart_of_accounts enable row level security;

create policy erp_chart_of_accounts_select on public.erp_chart_of_accounts for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_chart_of_accounts_write on public.erp_chart_of_accounts for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));

-- =============== erp_accounting_journals (codes SYSCOHADA usuels : VE
-- vente, AC achat, BQ banque, CA caisse, OD opérations diverses — texte
-- libre, pas une liste figée, chaque organisation garde la main) ===============
create table if not exists public.erp_accounting_journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_accounting_journals_org on public.erp_accounting_journals(organization_id);
alter table public.erp_accounting_journals enable row level security;

create policy erp_accounting_journals_select on public.erp_accounting_journals for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_accounting_journals_write on public.erp_accounting_journals for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));

-- =============== erp_accounting_periods (clôtures — créée avant
-- erp_journal_entries, qui la référence via une sous-requête pour bloquer
-- toute écriture sur une période fermée) ===============
create table if not exists public.erp_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_erp_accounting_periods_org on public.erp_accounting_periods(organization_id);
alter table public.erp_accounting_periods enable row level security;

create policy erp_accounting_periods_select on public.erp_accounting_periods for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_accounting_periods_insert on public.erp_accounting_periods for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
-- Clôture/réouverture : pas de RPC dédiée nécessaire, aucun mouvement de
-- stock/cash généré par ce changement de statut lui-même (contrairement
-- aux confirmations de réception/livraison/transfert) — une simple policy
-- update suffit ; l'effet de blocage se joue au niveau des policies
-- erp_journal_entries plus bas, pas ici.
create policy erp_accounting_periods_update on public.erp_accounting_periods for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_accounting_periods_delete on public.erp_accounting_periods for delete to authenticated
  using (status = 'open' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== erp_journal_entries + erp_journal_entry_lines (grand
-- livre en partie double) ===============
create table if not exists public.erp_journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  journal_id uuid not null references public.erp_accounting_journals(id) on delete restrict,
  entry_date date not null default current_date,
  reference text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists idx_erp_journal_entries_org on public.erp_journal_entries(organization_id);
create index if not exists idx_erp_journal_entries_journal on public.erp_journal_entries(journal_id);
alter table public.erp_journal_entries enable row level security;

-- Garde-fou clôture : aucune écriture (insert ou passage en draft→draft
-- avec changement de date) ne peut viser une date couverte par une période
-- 'closed'. L'absence de période pour une date donnée ne bloque rien (une
-- organisation n'est pas obligée de créer une période pour chaque mois).
create policy erp_journal_entries_select on public.erp_journal_entries for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_journal_entries_insert on public.erp_journal_entries for insert to authenticated
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and not exists (
      select 1 from public.erp_accounting_periods p
      where p.organization_id = erp_journal_entries.organization_id
        and p.status = 'closed'
        and erp_journal_entries.entry_date between p.start_date and p.end_date
    )
  );
-- Édition libre tant que 'draft'. Le passage à 'posted' (qui vérifie
-- l'équilibre débit/crédit) passe exclusivement par post_erp_journal_entry()
-- plus bas, jamais par une écriture directe de `status`.
create policy erp_journal_entries_update_draft on public.erp_journal_entries for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (
    status = 'draft'
    and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and not exists (
      select 1 from public.erp_accounting_periods p
      where p.organization_id = erp_journal_entries.organization_id
        and p.status = 'closed'
        and erp_journal_entries.entry_date between p.start_date and p.end_date
    )
  );
create policy erp_journal_entries_delete on public.erp_journal_entries for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));

-- Une ligne est soit un débit soit un crédit, jamais les deux (convention
-- comptable standard).
create table if not exists public.erp_journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_id uuid not null references public.erp_journal_entries(id) on delete cascade,
  account_id uuid not null references public.erp_chart_of_accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  label text,
  check (debit = 0 or credit = 0)
);
create index if not exists idx_erp_journal_entry_lines_org on public.erp_journal_entry_lines(organization_id);
create index if not exists idx_erp_journal_entry_lines_entry on public.erp_journal_entry_lines(entry_id);
alter table public.erp_journal_entry_lines enable row level security;

create policy erp_journal_entry_lines_select on public.erp_journal_entry_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_journal_entry_lines_write on public.erp_journal_entry_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and exists (select 1 from public.erp_journal_entries e where e.id = entry_id and e.status = 'draft')
  );

-- post_erp_journal_entry() : vérifie l'équilibre débit = crédit (intégrité
-- comptable non négociable) et la non-clôture de la période avant de
-- passer l'écriture "posted" (immuable ensuite — aucune policy update ne
-- s'applique hors 'draft').
create or replace function public.post_erp_journal_entry(
  p_organization_id uuid,
  p_entry_id uuid
) returns public.erp_journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.erp_journal_entries;
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','accountant']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_entry from public.erp_journal_entries
    where id = p_entry_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Écriture introuvable.'; end if;
  if v_entry.status <> 'draft' then raise exception 'Cette écriture a déjà été comptabilisée.'; end if;

  if exists (
    select 1 from public.erp_accounting_periods p
    where p.organization_id = p_organization_id and p.status = 'closed'
      and v_entry.entry_date between p.start_date and p.end_date
  ) then
    raise exception 'La période comptable de cette écriture est clôturée.';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_total_debit, v_total_credit
    from public.erp_journal_entry_lines where entry_id = p_entry_id;

  if v_total_debit = 0 and v_total_credit = 0 then
    raise exception 'Aucune ligne pour cette écriture.';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'Écriture déséquilibrée : débit (%) différent du crédit (%).', v_total_debit, v_total_credit;
  end if;

  update public.erp_journal_entries set status = 'posted', posted_at = now()
    where id = p_entry_id returning * into v_entry;

  return v_entry;
end;
$$;
revoke all on function public.post_erp_journal_entry(uuid, uuid) from public;
grant execute on function public.post_erp_journal_entry(uuid, uuid) to authenticated;

-- =============== erp_bank_reconciliations + erp_bank_reconciliation_lines
-- (rapproche erp_cash_transactions, module 5, avec un relevé bancaire) ===============
create table if not exists public.erp_bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  statement_date date not null,
  statement_balance numeric(14,2) not null default 0,
  reconciled_balance numeric(14,2),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_erp_bank_reconciliations_org on public.erp_bank_reconciliations(organization_id);
alter table public.erp_bank_reconciliations enable row level security;

create policy erp_bank_reconciliations_select on public.erp_bank_reconciliations for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_bank_reconciliations_insert on public.erp_bank_reconciliations for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_bank_reconciliations_update on public.erp_bank_reconciliations for update to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_bank_reconciliations_delete on public.erp_bank_reconciliations for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Table de pointage : associe les transactions (module 5) incluses dans ce
-- rapprochement. reconciled_balance recalculé à la validation, pas ici.
create table if not exists public.erp_bank_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_id uuid not null references public.erp_bank_reconciliations(id) on delete cascade,
  cash_transaction_id uuid not null references public.erp_cash_transactions(id) on delete restrict,
  unique (reconciliation_id, cash_transaction_id)
);
create index if not exists idx_erp_bank_reconciliation_lines_org on public.erp_bank_reconciliation_lines(organization_id);
create index if not exists idx_erp_bank_reconciliation_lines_reconciliation on public.erp_bank_reconciliation_lines(reconciliation_id);
alter table public.erp_bank_reconciliation_lines enable row level security;

create policy erp_bank_reconciliation_lines_select on public.erp_bank_reconciliation_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_bank_reconciliation_lines_write on public.erp_bank_reconciliation_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and exists (select 1 from public.erp_bank_reconciliations r where r.id = reconciliation_id and r.status = 'in_progress')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
    and exists (select 1 from public.erp_bank_reconciliations r where r.id = reconciliation_id and r.status = 'in_progress')
    and exists (
      select 1 from public.erp_bank_reconciliations r
      join public.erp_cash_transactions t on t.id = cash_transaction_id
      where r.id = reconciliation_id and t.cash_account_id = r.cash_account_id
    )
  );

-- complete_erp_bank_reconciliation() : recalcule reconciled_balance à
-- partir des transactions pointées (somme signée : in/transfer_in positif,
-- out/transfer_out négatif) et passe le rapprochement "completed". L'écart
-- avec statement_balance reste à afficher côté frontend (pas bloquant —
-- un rapprochement peut se clôturer avec un écart documenté en `notes`).
create or replace function public.complete_erp_bank_reconciliation(
  p_organization_id uuid,
  p_reconciliation_id uuid
) returns public.erp_bank_reconciliations
language plpgsql security definer set search_path = public as $$
declare
  v_reconciliation public.erp_bank_reconciliations;
  v_balance numeric(14,2);
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','accountant']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_reconciliation from public.erp_bank_reconciliations
    where id = p_reconciliation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Rapprochement introuvable.'; end if;
  if v_reconciliation.status <> 'in_progress' then raise exception 'Ce rapprochement a déjà été clôturé.'; end if;

  select coalesce(sum(case when t.type in ('in', 'transfer_in') then t.amount else -t.amount end), 0)
    into v_balance
    from public.erp_bank_reconciliation_lines l
    join public.erp_cash_transactions t on t.id = l.cash_transaction_id
    where l.reconciliation_id = p_reconciliation_id;

  update public.erp_bank_reconciliations
    set status = 'completed', completed_at = now(), reconciled_balance = v_balance
    where id = p_reconciliation_id returning * into v_reconciliation;

  return v_reconciliation;
end;
$$;
revoke all on function public.complete_erp_bank_reconciliation(uuid, uuid) from public;
grant execute on function public.complete_erp_bank_reconciliation(uuid, uuid) to authenticated;
