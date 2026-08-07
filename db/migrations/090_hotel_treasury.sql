-- 090_hotel_treasury.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Round 2, Phase C — module Finance/Trésorerie simplifié (scope
-- confirmé : version ZegHotel simplifiée, PAS de duplication du
-- Finance+Comptabilité complet de ZegERP, migrations 054-057 — pas de
-- grand livre, pas de plan comptable, pas de virements inter-comptes).
--
-- Deux tables :
--   1. hotel_treasury_accounts — comptes de trésorerie déclarés par
--      l'hôtel (ex. "Caisse principale", "Compte bancaire Ecobank"),
--      purement informatifs : aucune écriture du reste de l'app n'y est
--      liée par clé étrangère (hotel_payments/hotel_pos_sales/expenses
--      n'ont pas de account_id, et n'en gagnent pas ici — changer leur
--      schéma est hors périmètre de cette phase).
--   2. hotel_treasury_reconciliations — rapprochement périodique : le
--      solde théorique (system_total) est calculé côté client à la
--      création à partir des données déjà existantes (hotel_payments
--      filtrés par méthode selon le type de compte, hotel_pos_sales,
--      expenses) puis figé dans la ligne — comme
--      hotel_reservation_rooms.hourly_rate, un recalcul rétroactif ne
--      doit jamais changer un rapprochement déjà clôturé. Le montant
--      compté réellement (statement_amount, caisse comptée ou relevé
--      bancaire) est saisi manuellement par l'utilisateur ; l'écart est
--      une colonne générée.
--
-- Nouvelle clé de permission 'hotel_finance' (app_module='hotel',
-- open_view=false) — contrairement à 'fournisseurs'/'depenses' (gap
-- documenté, jamais corrigé faute de confirmation), celle-ci est nouvelle
-- et donc seedée correctement dès sa création : owner/manager en accès
-- complet, accountant en lecture seule (même périmètre que
-- hotel_payments/hotel_rapports), aucun accès front_desk/housekeeping
-- (données financières hors de leur périmètre, cohérent avec
-- hotel_corporate). Backfill explicite pour les membres déjà existants
-- (le trigger de la migration 089 ne couvre que les nouvelles lignes
-- organization_members, pas les nouvelles lignes permission_modules).

create table if not exists public.hotel_treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'cash' check (type in ('cash', 'bank')),
  account_number text,
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_treasury_accounts_org on public.hotel_treasury_accounts(organization_id);
alter table public.hotel_treasury_accounts enable row level security;

drop policy if exists hotel_treasury_accounts_select on public.hotel_treasury_accounts;
create policy hotel_treasury_accounts_select on public.hotel_treasury_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_finance', 'view'));
drop policy if exists hotel_treasury_accounts_insert on public.hotel_treasury_accounts;
create policy hotel_treasury_accounts_insert on public.hotel_treasury_accounts for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_finance', 'create'));
drop policy if exists hotel_treasury_accounts_update on public.hotel_treasury_accounts;
create policy hotel_treasury_accounts_update on public.hotel_treasury_accounts for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_finance', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_finance', 'manage'));
drop policy if exists hotel_treasury_accounts_delete on public.hotel_treasury_accounts;
create policy hotel_treasury_accounts_delete on public.hotel_treasury_accounts for delete to authenticated
  using (public.has_module_permission(organization_id, 'hotel_finance', 'manage'));

create table if not exists public.hotel_treasury_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.hotel_treasury_accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  -- Figé au moment de la création (voir commentaire de tête) — jamais
  -- recalculé après coup.
  system_total numeric(14,2) not null,
  statement_amount numeric(14,2) not null,
  difference numeric(14,2) generated always as (statement_amount - system_total) stored,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_treasury_reconciliations_org on public.hotel_treasury_reconciliations(organization_id);
create index if not exists idx_hotel_treasury_reconciliations_account on public.hotel_treasury_reconciliations(account_id);
alter table public.hotel_treasury_reconciliations enable row level security;

drop policy if exists hotel_treasury_reconciliations_select on public.hotel_treasury_reconciliations;
create policy hotel_treasury_reconciliations_select on public.hotel_treasury_reconciliations for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_finance', 'view'));
drop policy if exists hotel_treasury_reconciliations_insert on public.hotel_treasury_reconciliations;
create policy hotel_treasury_reconciliations_insert on public.hotel_treasury_reconciliations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_finance', 'create'));
-- Pas de policy update : un rapprochement clôturé ne se corrige pas, on en
-- crée un nouveau (même logique que le ledger erp_cash_transactions,
-- migration 054 — un rapprochement est une preuve, pas un brouillon).
drop policy if exists hotel_treasury_reconciliations_delete on public.hotel_treasury_reconciliations;
create policy hotel_treasury_reconciliations_delete on public.hotel_treasury_reconciliations for delete to authenticated
  using (public.has_module_permission(organization_id, 'hotel_finance', 'manage'));

insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('hotel_finance', 'hotel', 'Finance', false, 13)
on conflict (key) do nothing;

insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('owner', 'hotel_finance', true, true, true),
  ('manager', 'hotel_finance', true, true, true),
  ('accountant', 'hotel_finance', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- Rattrapage pour les membres hôtel déjà existants — même requête que le
-- backfill de la migration 089, restreinte à la nouvelle clé.
insert into public.organization_module_permissions (organization_id, user_id, module_key, can_create, can_read, can_update, can_delete)
select om.organization_id, om.user_id, 'hotel_finance',
  coalesce(orp.can_create, drp.can_create, false),
  coalesce(orp.can_view, drp.can_view, false),
  coalesce(orp.can_manage, drp.can_manage, false),
  coalesce(orp.can_manage, drp.can_manage, false)
from public.organization_members om
join public.organizations o on o.id = om.organization_id and o.app_module = 'hotel'
left join public.organization_role_permissions orp on orp.role_id = om.custom_role_id and orp.module_key = 'hotel_finance'
left join public.default_role_permissions drp on drp.role = om.role and drp.module_key = 'hotel_finance'
where om.role <> 'owner'
on conflict (organization_id, user_id, module_key) do nothing;
