-- Migration 045 — ZegResto V2, étape 5 : programme de fidélité (points).
-- Présentée pour relecture — NE PAS exécuter automatiquement. À exécuter
-- après 044 (resto_settings).
--
-- Identité indépendante de ZegResto, clé = numéro de téléphone (PAS de FK
-- vers public.customers, qui appartient à ZegCaisse) — décision produit
-- explicite pour préserver l'isolation entre applications (même principe
-- que hotel_guests pour ZegHotel, cf. ARCHITECTURE.md). Un client qui
-- fréquente à la fois une boutique ZegCaisse et un restaurant ZegResto du
-- même compte a donc deux profils fidélité distincts pour l'instant — ce
-- n'est PAS une primitive de plateforme partagée, uniquement une fonctionnalité
-- ZegResto (voir ARCHITECTURE.md pour la note explicite).
--
-- Taux de conversion 100% configurables (resto_settings, complété ici par
-- ALTER TABLE — additif, ne touche pas aux colonnes KDS de la migration
-- 044) : combien un client dépense pour gagner 1 point
-- (loyalty_earn_amount_per_point), et la valeur d'1 point en remise
-- (loyalty_redeem_value_per_point). Aucune valeur n'est codée en dur côté
-- application — seules les colonnes ci-dessous portent des défauts
-- raisonnables, modifiables depuis les Paramètres (chantier 8).

alter table public.resto_settings add column if not exists loyalty_enabled boolean not null default false;
alter table public.resto_settings add column if not exists loyalty_earn_amount_per_point numeric(14,2) not null default 100 check (loyalty_earn_amount_per_point > 0);
alter table public.resto_settings add column if not exists loyalty_redeem_value_per_point numeric(14,4) not null default 1 check (loyalty_redeem_value_per_point >= 0);
alter table public.resto_settings add column if not exists loyalty_min_points_to_redeem integer not null default 1 check (loyalty_min_points_to_redeem >= 0);

create table if not exists public.resto_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  telephone text not null,
  nom text,
  points_balance integer not null default 0 check (points_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, telephone)
);
create index if not exists idx_resto_loyalty_accounts_org on public.resto_loyalty_accounts(organization_id);
alter table public.resto_loyalty_accounts enable row level security;

create policy resto_loyalty_accounts_select on public.resto_loyalty_accounts for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));
-- INSERT limité à points_balance = 0 : la création d'un compte (première
-- visite d'un numéro) ne doit jamais pouvoir démarrer avec un solde non
-- nul — tout crédit de points passe ensuite exclusivement par les RPC
-- security definer ci-dessous, jamais par une écriture directe.
create policy resto_loyalty_accounts_insert on public.resto_loyalty_accounts for insert to authenticated
  with check (
    points_balance = 0
    and public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[])
  );
-- UPDATE direct réservé à owner/manager (correction nom/téléphone) —
-- server n'a aucun accès UPDATE direct sur cette table : RLS ne masque que
-- des lignes, jamais des colonnes (cf. hotel_guest_contact()), donc lui
-- laisser un accès UPDATE, même pour "juste le nom", l'exposerait aussi à
-- modifier points_balance directement.
create policy resto_loyalty_accounts_update on public.resto_loyalty_accounts for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy resto_loyalty_accounts_delete on public.resto_loyalty_accounts for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Historique earn/spend — écriture exclusivement via les RPC ci-dessous
-- (aucune policy insert/update/delete accordée à quiconque directement) :
-- lecture seule pour le staff, même en tant que owner/manager.
create table if not exists public.resto_loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.resto_loyalty_accounts(id) on delete cascade,
  bill_id uuid references public.resto_bills(id) on delete set null,
  type text not null check (type in ('earn', 'spend')),
  points integer not null check (points > 0),
  montant numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_loyalty_transactions_org on public.resto_loyalty_transactions(organization_id);
create index if not exists idx_resto_loyalty_transactions_account on public.resto_loyalty_transactions(account_id);
create index if not exists idx_resto_loyalty_transactions_bill on public.resto_loyalty_transactions(bill_id);
alter table public.resto_loyalty_transactions enable row level security;

create policy resto_loyalty_transactions_select on public.resto_loyalty_transactions for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server']::public.app_role[]));

-- resto_bills : rattachement optionnel à un compte fidélité + montant de
-- remise appliqué (calculé par apply_resto_bill_loyalty(), jamais saisi
-- librement) et compteurs pour affichage/traçabilité. Additif — la policy
-- resto_bills_update existante (owner/manager/server) couvre déjà ces
-- nouvelles colonnes ; voir le résumé de fin de chantier pour la réserve
-- de sécurité que ça implique (déjà valable pour la colonne `total`
-- préexistante, non spécifique à la fidélité).
alter table public.resto_bills add column if not exists loyalty_account_id uuid references public.resto_loyalty_accounts(id) on delete set null;
alter table public.resto_bills add column if not exists loyalty_discount numeric(14,2) not null default 0 check (loyalty_discount >= 0);
alter table public.resto_bills add column if not exists loyalty_points_earned integer not null default 0;
alter table public.resto_bills add column if not exists loyalty_points_redeemed integer not null default 0;

-- apply_resto_bill_loyalty() : rattache (ou crée) un compte fidélité à une
-- note encore ouverte, et échange éventuellement des points contre une
-- remise. Ré-appelable (le serveur change d'avis sur le nombre de points) :
-- rembourse d'abord tout échange précédent sur cette note avant d'appliquer
-- le nouveau. Ne touche jamais resto_bills.total (le brut reste inchangé,
-- seule loyalty_discount varie) — la RPC de paiement compare le montant
-- réglé à (total - loyalty_discount).
create or replace function public.apply_resto_bill_loyalty(
  p_organization_id uuid,
  p_bill_id uuid,
  p_telephone text,
  p_nom text default null,
  p_redeem_points integer default 0
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_account public.resto_loyalty_accounts;
  v_loyalty_enabled boolean;
  v_redeem_value_per_point numeric(14,4);
  v_min_redeem integer;
  v_discount numeric(14,2) := 0;
  v_phone text;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','server']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;
  v_phone := nullif(trim(p_telephone), '');
  if v_phone is null then raise exception 'Numéro de téléphone requis.'; end if;
  if p_redeem_points is null or p_redeem_points < 0 then raise exception 'Points invalides.'; end if;

  select * into v_bill from public.resto_bills where id = p_bill_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if v_bill.statut <> 'ouverte' then raise exception 'Cette note ne peut plus être modifiée.'; end if;

  select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_redeem_value_per_point, 1), coalesce(rs.loyalty_min_points_to_redeem, 1)
    into v_loyalty_enabled, v_redeem_value_per_point, v_min_redeem
    from (select 1) x left join public.resto_settings rs on rs.organization_id = p_organization_id;
  if not v_loyalty_enabled then
    raise exception 'Le programme de fidélité n''est pas activé pour cet établissement.';
  end if;

  -- Ré-application : rembourse l'échange précédent sur cette note avant
  -- d'appliquer le nouveau (idempotent si le serveur rappelle la RPC).
  if v_bill.loyalty_points_redeemed > 0 and v_bill.loyalty_account_id is not null then
    update public.resto_loyalty_accounts set points_balance = points_balance + v_bill.loyalty_points_redeemed, updated_at = now()
      where id = v_bill.loyalty_account_id;
    delete from public.resto_loyalty_transactions where bill_id = p_bill_id and type = 'spend';
  end if;

  select * into v_account from public.resto_loyalty_accounts where organization_id = p_organization_id and telephone = v_phone;
  if not found then
    insert into public.resto_loyalty_accounts (organization_id, telephone, nom, points_balance)
    values (p_organization_id, v_phone, p_nom, 0)
    returning * into v_account;
  elsif p_nom is not null and coalesce(v_account.nom, '') = '' then
    update public.resto_loyalty_accounts set nom = p_nom, updated_at = now() where id = v_account.id returning * into v_account;
  end if;

  if p_redeem_points > 0 then
    if p_redeem_points < v_min_redeem then
      raise exception 'Minimum % points requis pour un échange.', v_min_redeem;
    end if;
    if v_account.points_balance < p_redeem_points then
      raise exception 'Solde de points insuffisant.';
    end if;
    v_discount := round(least(p_redeem_points * v_redeem_value_per_point, v_bill.total), 2);
    update public.resto_loyalty_accounts set points_balance = points_balance - p_redeem_points, updated_at = now() where id = v_account.id;
    insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
    values (p_organization_id, v_account.id, p_bill_id, 'spend', p_redeem_points, v_discount);
  end if;

  update public.resto_bills set loyalty_account_id = v_account.id, loyalty_discount = v_discount, loyalty_points_redeemed = p_redeem_points
    where id = p_bill_id
    returning * into v_bill;

  return v_bill;
end;
$$;
revoke all on function public.apply_resto_bill_loyalty(uuid, uuid, text, text, integer) from public;
grant execute on function public.apply_resto_bill_loyalty(uuid, uuid, text, text, integer) to authenticated;

-- add_resto_bill_payment() : même signature qu'à la création (migration
-- 041) — create or replace sûr. Deux changements : (1) le seuil de
-- règlement intégral tient compte de loyalty_discount ; (2) accrual des
-- points sur le montant net réellement payé, une fois la note "payee", si
-- un compte fidélité est rattaché et le programme activé.
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
  v_net_total numeric(14,2);
  v_loyalty_enabled boolean;
  v_earn_amount_per_point numeric(14,2);
  v_points_earned integer;
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

  v_net_total := greatest(v_bill.total - v_bill.loyalty_discount, 0);

  if v_total_paid >= v_net_total then
    update public.resto_bills set statut = 'payee' where id = p_bill_id returning * into v_bill;
    update public.resto_orders set statut = 'fermee', closed_at = now() where id = v_bill.order_id
    returning table_id into v_table_id;
    if v_table_id is not null then
      update public.resto_tables set statut = 'libre' where id = v_table_id and statut <> 'libre';
    end if;

    if v_bill.loyalty_account_id is not null then
      select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_earn_amount_per_point, 100)
        into v_loyalty_enabled, v_earn_amount_per_point
        from (select 1) x left join public.resto_settings rs on rs.organization_id = v_bill.organization_id;
      if v_loyalty_enabled then
        v_points_earned := floor(v_net_total / v_earn_amount_per_point)::integer;
        if v_points_earned > 0 then
          update public.resto_loyalty_accounts set points_balance = points_balance + v_points_earned, updated_at = now()
            where id = v_bill.loyalty_account_id;
          insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
          values (v_bill.organization_id, v_bill.loyalty_account_id, p_bill_id, 'earn', v_points_earned, v_net_total);
          update public.resto_bills set loyalty_points_earned = v_points_earned where id = p_bill_id returning * into v_bill;
        end if;
      end if;
    end if;
  end if;

  return v_bill;
end;
$$;
revoke all on function public.add_resto_bill_payment(uuid, numeric, text, uuid) from public;
grant execute on function public.add_resto_bill_payment(uuid, numeric, text, uuid) to authenticated;
