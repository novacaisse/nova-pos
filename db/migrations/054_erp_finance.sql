-- Migration 054 — ZegERP, module 5/10 : Finance. Présentée pour relecture
-- — NE PAS exécuter automatiquement. À exécuter après 053.
--
-- Aucun rôle nouveau — validé dans ARCHITECTURE_ERP.md ("Finance... owner/
-- manager/accountant uniquement, aucun rôle trésorier séparé"). Aucune
-- migration d'enum préalable non plus : erp_cash_transaction_type est un
-- type entièrement nouveau (créé et utilisé dans ce même fichier), pas une
-- extension d'un enum existant — la restriction "ALTER TYPE seul dans sa
-- transaction" ne s'applique qu'à l'ajout de valeurs à un type déjà en
-- usage (voir CLAUDE.md), pas à la création d'un nouveau type.
--
-- balance jamais exposée en écriture directe : comme erp_stock_levels
-- (module 1), erp_cash_account_balances n'a AUCUNE policy insert/update/
-- delete — maintenue exclusivement par apply_erp_cash_transaction()
-- (trigger security definer). erp_cash_accounts (infos statiques du
-- compte : nom/type) reste une table séparée, normalement éditable.

-- =============== erp_cash_accounts ===============
create table if not exists public.erp_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'cash' check (type in ('cash', 'bank')),
  account_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_cash_accounts_org on public.erp_cash_accounts(organization_id);
alter table public.erp_cash_accounts enable row level security;

create policy erp_cash_accounts_select on public.erp_cash_accounts for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_cash_accounts_write on public.erp_cash_accounts for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));

-- =============== erp_cash_account_balances (jamais d'écriture directe) ===============
create table if not exists public.erp_cash_account_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete cascade,
  balance numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (cash_account_id)
);
create index if not exists idx_erp_cash_account_balances_org on public.erp_cash_account_balances(organization_id);
alter table public.erp_cash_account_balances enable row level security;

create policy erp_cash_account_balances_select on public.erp_cash_account_balances for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
-- Pas de policy insert/update/delete : lignes gérées exclusivement par le
-- trigger apply_erp_cash_transaction() (security definer, plus bas).

-- =============== erp_fund_transfers (créée avant erp_cash_transactions,
-- qui la référence pour traçabilité — même ordre que erp_stock_transfers/
-- erp_stock_movements, module 1) ===============
create table if not exists public.erp_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  to_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (from_account_id <> to_account_id)
);
create index if not exists idx_erp_fund_transfers_org on public.erp_fund_transfers(organization_id);
alter table public.erp_fund_transfers enable row level security;

create policy erp_fund_transfers_select on public.erp_fund_transfers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_fund_transfers_insert on public.erp_fund_transfers for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
-- Comme les transferts de stock (module 1) : la confirmation (qui crée les
-- transactions) passe exclusivement par confirm_erp_fund_transfer(), jamais
-- par une écriture directe de `status`.
create policy erp_fund_transfers_update on public.erp_fund_transfers for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_fund_transfers_delete on public.erp_fund_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== erp_cash_transactions (ledger immuable, comme
-- erp_stock_movements) ===============
do $$ begin
  create type public.erp_cash_transaction_type as enum ('in', 'out', 'transfer_in', 'transfer_out');
exception when duplicate_object then null;
end $$;

create table if not exists public.erp_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.erp_cash_accounts(id) on delete restrict,
  type public.erp_cash_transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  reason text,
  -- Lien libre (pas de FK stricte, polymorphe) vers l'origine d'une
  -- transaction manuelle — ex. 'customer_payment'/'supplier_invoice' — les
  -- modules Achats/Ventes ne génèrent pas encore de transaction
  -- automatiquement en V1 (hors scope, voir ARCHITECTURE_ERP.md).
  source_type text,
  source_id uuid,
  transfer_id uuid references public.erp_fund_transfers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_cash_transactions_org on public.erp_cash_transactions(organization_id);
create index if not exists idx_erp_cash_transactions_account on public.erp_cash_transactions(cash_account_id);
create index if not exists idx_erp_cash_transactions_transfer on public.erp_cash_transactions(transfer_id);
alter table public.erp_cash_transactions enable row level security;

create policy erp_cash_transactions_select on public.erp_cash_transactions for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
-- 'transfer_in'/'transfer_out' exclus de l'insert direct — uniquement créés
-- par confirm_erp_fund_transfer() (security definer, plus bas). Ledger
-- immuable : aucune policy update/delete.
create policy erp_cash_transactions_insert on public.erp_cash_transactions for insert to authenticated
  with check (
    type in ('in', 'out')
    and public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[])
  );

-- Maintient erp_cash_account_balances à jour à chaque transaction — pas de
-- garde anti-négatif (contrairement au stock) : un compte peut légitimement
-- passer en négatif (découvert bancaire, caisse en attente d'un dépôt).
create or replace function public.apply_erp_cash_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,2);
begin
  delta := case new.type
    when 'in' then new.amount
    when 'transfer_in' then new.amount
    when 'out' then -new.amount
    when 'transfer_out' then -new.amount
    else 0
  end;

  insert into public.erp_cash_account_balances (organization_id, cash_account_id, balance)
  values (new.organization_id, new.cash_account_id, delta)
  on conflict (cash_account_id)
  do update set balance = public.erp_cash_account_balances.balance + delta, updated_at = now();

  return new;
end;
$$;
drop trigger if exists trg_erp_cash_transactions_apply on public.erp_cash_transactions;
create trigger trg_erp_cash_transactions_apply
  after insert on public.erp_cash_transactions
  for each row execute function public.apply_erp_cash_transaction();

-- confirm_erp_fund_transfer() : crée la paire 'transfer_out'/'transfer_in'
-- (compte source décrémenté, compte destination incrémenté) et passe le
-- transfert "confirmed".
create or replace function public.confirm_erp_fund_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_fund_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_fund_transfers;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','accountant']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_fund_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'draft' then raise exception 'Ce transfert a déjà été confirmé.'; end if;

  insert into public.erp_cash_transactions (organization_id, cash_account_id, type, amount, reference, transfer_id, created_by)
  values (p_organization_id, v_transfer.from_account_id, 'transfer_out', v_transfer.amount, v_transfer.reference, p_transfer_id, auth.uid());
  insert into public.erp_cash_transactions (organization_id, cash_account_id, type, amount, reference, transfer_id, created_by)
  values (p_organization_id, v_transfer.to_account_id, 'transfer_in', v_transfer.amount, v_transfer.reference, p_transfer_id, auth.uid());

  update public.erp_fund_transfers set status = 'confirmed', confirmed_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;
revoke all on function public.confirm_erp_fund_transfer(uuid, uuid) from public;
grant execute on function public.confirm_erp_fund_transfer(uuid, uuid) to authenticated;
