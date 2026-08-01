-- Migration 041 — ZegResto, étape 7/7 : Facturation (notes, partage,
-- paiements). Présentée pour relecture — NE PAS exécuter automatiquement.
-- À exécuter après 040 (Stock & recettes).
--
-- Comme pour resto_order_items/resto_kitchen_tickets (migration 038),
-- organization_id est ajouté sur resto_bill_splits/resto_bill_split_items/
-- resto_bill_payments (non listées dans le schéma de la demande initiale,
-- qui ne l'avait explicitement que sur resto_bills) — cohérence RLS,
-- pas de sous-select en cascade sur chaque lecture.

create table if not exists public.resto_bills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  total numeric(14,2) not null default 0,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'payee', 'annulee')),
  split_mode text not null default 'aucun' check (split_mode in ('aucun', 'egal', 'detaille')),
  created_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists idx_resto_bills_org on public.resto_bills(organization_id);
alter table public.resto_bills enable row level security;

drop policy if exists resto_bills_select on public.resto_bills;
create policy resto_bills_select on public.resto_bills for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
drop policy if exists resto_bills_insert on public.resto_bills;
create policy resto_bills_insert on public.resto_bills for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_bills_update on public.resto_bills;
create policy resto_bills_update on public.resto_bills for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_bills_delete on public.resto_bills;
create policy resto_bills_delete on public.resto_bills for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Un split par "convive" (mode égal : montant saisi/réparti manuellement ;
-- mode détaillé : montant recalculé depuis resto_bill_split_items par
-- set_resto_bill_split_items() ci-dessous — jamais les deux mécanismes en
-- même temps sur une même note, cf. resto_bills.split_mode).
create table if not exists public.resto_bill_splits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_index integer not null,
  montant numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (bill_id, split_index)
);
create index if not exists idx_resto_bill_splits_org on public.resto_bill_splits(organization_id);
create index if not exists idx_resto_bill_splits_bill on public.resto_bill_splits(bill_id);
alter table public.resto_bill_splits enable row level security;

drop policy if exists resto_bill_splits_select on public.resto_bill_splits;
create policy resto_bill_splits_select on public.resto_bill_splits for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
drop policy if exists resto_bill_splits_write on public.resto_bill_splits;
create policy resto_bill_splits_write on public.resto_bill_splits for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));

-- Mode détaillé uniquement : quelle ligne de commande appartient à quel
-- convive (split_index). Peuplée uniquement par set_resto_bill_split_items()
-- (jamais d'écriture directe côté client — la cohérence avec resto_bill_splits
-- doit rester atomique).
create table if not exists public.resto_bill_split_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_index integer not null,
  order_item_id uuid not null references public.resto_order_items(id) on delete cascade,
  unique (bill_id, order_item_id)
);
create index if not exists idx_resto_bill_split_items_org on public.resto_bill_split_items(organization_id);
create index if not exists idx_resto_bill_split_items_bill on public.resto_bill_split_items(bill_id);
alter table public.resto_bill_split_items enable row level security;

drop policy if exists resto_bill_split_items_select on public.resto_bill_split_items;
create policy resto_bill_split_items_select on public.resto_bill_split_items for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
-- Pas de policy insert/update/delete "to authenticated" : cette table n'est
-- modifiée QUE par set_resto_bill_split_items() (security definer,
-- contourne la RLS), pour garantir qu'elle reste toujours synchronisée
-- avec resto_bill_splits.montant — jamais d'écriture directe cliente.

create table if not exists public.resto_bill_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null references public.resto_bills(id) on delete cascade,
  split_id uuid references public.resto_bill_splits(id) on delete set null,
  methode text not null check (methode in ('mobile_money', 'cash', 'carte')),
  montant numeric(14,2) not null check (montant > 0),
  statut text not null default 'validee' check (statut in ('validee', 'annulee')),
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_bill_payments_org on public.resto_bill_payments(organization_id);
create index if not exists idx_resto_bill_payments_bill on public.resto_bill_payments(bill_id);
alter table public.resto_bill_payments enable row level security;

drop policy if exists resto_bill_payments_select on public.resto_bill_payments;
create policy resto_bill_payments_select on public.resto_bill_payments for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
-- Pas de policy insert : les paiements ne sont enregistrés que via
-- add_resto_bill_payment() (security definer plus bas), qui doit rester la
-- seule voie pour garantir la mise à jour atomique du statut de la note
-- (payee dès que la somme des paiements couvre le total).
drop policy if exists resto_bill_payments_update on public.resto_bill_payments;
create policy resto_bill_payments_update on public.resto_bill_payments for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- create_resto_bill() : ouvre la note d'une commande — total calculé depuis
-- les lignes non annulées de resto_order_items (jamais recalculé après,
-- même logique que les autres montants figés du projet). p_split_count :
-- utilisé seulement si p_split_mode = 'egal' — répartit le total en N parts
-- égales (le reliquat d'arrondi est absorbé par la dernière part).
create or replace function public.create_resto_bill(
  p_organization_id uuid,
  p_order_id uuid,
  p_split_mode text default 'aucun',
  p_split_count integer default null
) returns public.resto_bills
language plpgsql security invoker set search_path = public as $$
declare
  v_total numeric(14,2);
  v_bill public.resto_bills;
  v_part numeric(14,2);
  i integer;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','server']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;
  select coalesce(sum(prix_unitaire * quantite), 0) into v_total
  from public.resto_order_items where order_id = p_order_id and statut_ligne <> 'annulee';

  insert into public.resto_bills (order_id, organization_id, total, split_mode)
  values (p_order_id, p_organization_id, v_total, coalesce(p_split_mode, 'aucun'))
  returning * into v_bill;

  if p_split_mode = 'egal' and p_split_count is not null and p_split_count > 1 then
    v_part := trunc(v_total / p_split_count, 2);
    for i in 1..p_split_count loop
      insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
      values (p_organization_id, v_bill.id, i, case when i = p_split_count then v_total - v_part * (p_split_count - 1) else v_part end);
    end loop;
  end if;

  return v_bill;
end;
$$;
revoke all on function public.create_resto_bill(uuid, uuid, text, integer) from public;
grant execute on function public.create_resto_bill(uuid, uuid, text, integer) to authenticated;

-- set_resto_bill_split_items() : mode détaillé — remplace intégralement
-- l'affectation ligne↔convive et recalcule resto_bill_splits.montant en
-- une transaction (jamais d'incohérence entre les deux tables). Security
-- definer car resto_bill_split_items n'a pas de policy insert directe
-- (voir plus haut).
create or replace function public.set_resto_bill_split_items(
  p_bill_id uuid,
  p_assignments jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_assignment jsonb;
  v_split_index integer;
begin
  select * into v_bill from public.resto_bills where id = p_bill_id;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_any_role_in_organization(v_bill.organization_id, array['owner','manager','server']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  delete from public.resto_bill_split_items where bill_id = p_bill_id;
  delete from public.resto_bill_splits where bill_id = p_bill_id;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    insert into public.resto_bill_split_items (organization_id, bill_id, split_index, order_item_id)
    values (v_bill.organization_id, p_bill_id, (v_assignment->>'split_index')::integer, (v_assignment->>'order_item_id')::uuid);
  end loop;

  for v_split_index in
    select distinct (a->>'split_index')::integer from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) a
  loop
    insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
    select v_bill.organization_id, p_bill_id, v_split_index,
      coalesce(sum(oi.prix_unitaire * oi.quantite), 0)
    from public.resto_bill_split_items bsi
    join public.resto_order_items oi on oi.id = bsi.order_item_id
    where bsi.bill_id = p_bill_id and bsi.split_index = v_split_index;
  end loop;
end;
$$;
revoke all on function public.set_resto_bill_split_items(uuid, jsonb) from public;
grant execute on function public.set_resto_bill_split_items(uuid, jsonb) to authenticated;

-- add_resto_bill_payment() : accumulation atomique sous verrou de ligne
-- (même pattern que add_sale_payment, migration 024, à ceci près que
-- add_sale_payment est security invoker parce que la table payments a une
-- policy insert directe — resto_bill_payments n'en a volontairement AUCUNE
-- (voir plus haut), donc cette fonction doit être security definer pour
-- pouvoir y écrire du tout). Vérifie elle-même le rôle de l'appelant avant
-- toute écriture. Dès que la somme des paiements validés couvre le total,
-- la note passe "payee", la commande "fermee" (closed_at posé) et la table
-- redevient "libre" si elle ne l'était pas déjà (commande sur place).
create or replace function public.add_resto_bill_payment(
  p_bill_id uuid,
  p_montant numeric,
  p_methode text,
  p_split_id uuid default null
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_total_paid numeric(14,2);
  v_table_id uuid;
begin
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide.';
  end if;

  select * into v_bill from public.resto_bills where id = p_bill_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_any_role_in_organization(v_bill.organization_id, array['owner','manager','server']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;
  if v_bill.statut = 'payee' then raise exception 'Cette note est déjà réglée.'; end if;
  if v_bill.statut = 'annulee' then raise exception 'Cette note a été annulée.'; end if;

  insert into public.resto_bill_payments (organization_id, bill_id, split_id, methode, montant, statut)
  values (v_bill.organization_id, p_bill_id, p_split_id, p_methode, p_montant, 'validee');

  select coalesce(sum(montant), 0) into v_total_paid
  from public.resto_bill_payments where bill_id = p_bill_id and statut = 'validee';

  if v_total_paid >= v_bill.total then
    update public.resto_bills set statut = 'payee' where id = p_bill_id returning * into v_bill;
    update public.resto_orders set statut = 'fermee', closed_at = now() where id = v_bill.order_id
    returning table_id into v_table_id;
    if v_table_id is not null then
      update public.resto_tables set statut = 'libre' where id = v_table_id and statut <> 'libre';
    end if;
  end if;

  return v_bill;
end;
$$;
revoke all on function public.add_resto_bill_payment(uuid, numeric, text, uuid) from public;
grant execute on function public.add_resto_bill_payment(uuid, numeric, text, uuid) to authenticated;
