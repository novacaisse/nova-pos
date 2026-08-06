-- Migration 083 — MoneyFusion réel sur les 4 applications (mission
-- "Onboarding + MoneyFusion + permissions", Partie 2).
--
-- Jusqu'ici, seul l'abonnement SaaS (subscription_payments) avait une
-- vraie intégration MoneyFusion (create-subscription-payment +
-- moneyfusion-webhook). Dans chaque module, "Mobile Money" n'était qu'une
-- étiquette de méthode de paiement enregistrée manuellement par le staff,
-- sans passerelle réelle (constat AUDIT_ZEGHOTEL_FINALISATION_2026-08.md
-- §2b). Cette migration ajoute le ledger générique qui permet de
-- réutiliser le pattern déjà validé (lien de paiement + webhook +
-- vérification serveur auprès de MoneyFusion, jamais le statut du corps
-- de la requête webhook) pour ZegCaisse/ZegHotel/ZegResto/ZegERP.
--
-- payment_requests est le point de dispatch : une ligne = une demande de
-- paiement MoneyFusion pour UN enregistrement précis d'UN module précis.
-- provider_ref (le token MoneyFusion) est la clé de réconciliation au
-- retour du webhook — unique, c'est elle qui permet d'identifier sans
-- ambiguïté l'organisation, le module ET l'enregistrement à créditer.
-- Idempotence : le webhook (moneyfusion-webhook, non modifié dans son
-- principe) retourne tôt si status est déjà 'paid'/'failed', donc un
-- callback dupliqué ne peut jamais appliquer un paiement deux fois — même
-- garde-fou que subscription_payments.
--
-- Écriture réservée au service_role (Edge Functions) : le montant n'est
-- JAMAIS celui envoyé par le client, toujours recalculé côté serveur à
-- partir de l'enregistrement cible (sales.total-paid, solde de folio,
-- solde de note, total des lignes POS ERP) — comme create-subscription-
-- payment recalcule totalPrice depuis plans, jamais depuis le client.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  app_module text not null check (app_module in ('pos', 'hotel', 'resto', 'erp')),
  -- Une seule table cible par app_module dans ce premier jet (le point de
  -- paiement client identifié par la mission) : sales (ZegCaisse),
  -- hotel_folios (ZegHotel, acompte réservation ET solde folio — les deux
  -- pointent vers le même folio, cf. create_hotel_reservation qui crée la
  -- ligne hotel_folios dès la réservation), resto_bills (ZegResto),
  -- erp_pos_sales (ZegERP, vente 'draft' finalisée par le webhook).
  target_table text not null check (target_table in ('sales', 'hotel_folios', 'resto_bills', 'erp_pos_sales')),
  target_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider text not null default 'moneyfusion',
  provider_ref text unique,
  phone text,
  full_name text,
  -- kind (hotel: 'deposit'|'payment') et autres détails d'affichage —
  -- jamais relu pour une décision de sécurité, uniquement informatif/UI.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_payment_requests_org on public.payment_requests(organization_id);
create index if not exists idx_payment_requests_target on public.payment_requests(target_table, target_id);

alter table public.payment_requests enable row level security;

-- Lecture seule pour l'UI (statut pending/success/failed affiché) — gardée
-- par le même module que celui qui protège déjà l'enregistrement cible :
-- ventes (ZegCaisse), hotel_folios (ZegHotel), resto_paiements (ZegResto),
-- erp_pos (ZegERP). Note pour la Partie 4 (refonte permissions) : cette
-- policy devra être migrée vers has_module_permission() → nouvelle
-- fonction de matrice CRUD en même temps que le reste du schéma.
create policy payment_requests_select on public.payment_requests for select to authenticated
using (
  case target_table
    when 'sales' then public.has_module_permission(organization_id, 'ventes', 'view')
    when 'hotel_folios' then public.has_module_permission(organization_id, 'hotel_folios', 'view')
    when 'resto_bills' then public.has_module_permission(organization_id, 'resto_paiements', 'view')
    when 'erp_pos_sales' then public.has_module_permission(organization_id, 'erp_pos', 'view')
    else false
  end
);
-- Pas de policy insert/update/delete pour authenticated : la création
-- passe exclusivement par l'Edge Function create-module-payment
-- (service_role, montant recalculé serveur) et la mise à jour de statut
-- exclusivement par moneyfusion-webhook (service_role aussi) — les deux
-- contournent RLS via ce rôle, jamais via une policy accordée au client.

-- ============ Dispatch service_role pour ZegResto et ZegERP ============
-- add_resto_bill_payment() et complete_erp_pos_sale() vérifient l'accès en
-- interne via has_module_permission(), qui lit organization_members pour
-- auth.uid() — auth.uid() est NULL sous un appel service_role (le webhook
-- n'a pas de session utilisateur), donc l'appel échouerait avec "Accès
-- refusé." si on les appelait tel quel depuis moneyfusion-webhook. Chacune
-- est scindée en une fonction interne (logique métier inchangée, aucun
-- contrôle de rôle) réservée à service_role, et un wrapper public inchangé
-- pour les appelants authentifiés existants (même signature, CREATE OR
-- REPLACE sûr). ZegCaisse (add_sale_payment) et ZegHotel (insertion directe
-- dans hotel_payments) n'ont pas ce problème : ni contrôle interne
-- (add_sale_payment s'appuie sur la RLS de l'appelant, qui n'existe plus
-- de toute façon en SECURITY INVOKER sous service_role — bypass RLS
-- attendu et sûr, exactement comme pour subscription_payments), ni
-- fonction du tout côté hotel_payments (insertion directe, RLS bypassée
-- en service_role comme n'importe quelle écriture service_role du projet).

create or replace function public.apply_resto_bill_payment(
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
revoke all on function public.apply_resto_bill_payment(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_resto_bill_payment(uuid, numeric, text, uuid) to service_role;

create or replace function public.add_resto_bill_payment(
  p_bill_id uuid,
  p_montant numeric,
  p_methode text,
  p_split_id uuid default null
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.resto_bills where id = p_bill_id;
  if v_org is null then raise exception 'Note introuvable.'; end if;
  if not public.has_module_permission(v_org, 'resto_paiements', 'create') then
    raise exception 'Accès refusé.';
  end if;
  return public.apply_resto_bill_payment(p_bill_id, p_montant, p_methode, p_split_id);
end;
$$;
revoke all on function public.add_resto_bill_payment(uuid, numeric, text, uuid) from public;
grant execute on function public.add_resto_bill_payment(uuid, numeric, text, uuid) to authenticated;

create or replace function public.apply_complete_erp_pos_sale(
  p_organization_id uuid,
  p_sale_id uuid
) returns public.erp_pos_sales
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.erp_pos_sales;
  v_session public.erp_cash_sessions;
  v_line record;
  v_product_cost numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
begin
  select * into v_sale from public.erp_pos_sales
    where id = p_sale_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Vente introuvable.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Cette vente a déjà été finalisée ou annulée.'; end if;

  select * into v_session from public.erp_cash_sessions where id = v_sale.cash_session_id for update;
  if v_session.status <> 'open' then raise exception 'La session de caisse de cette vente n''est plus ouverte.'; end if;

  if not exists (select 1 from public.erp_pos_sale_lines where sale_id = p_sale_id) then
    raise exception 'Aucune ligne pour cette vente.';
  end if;

  for v_line in select * from public.erp_pos_sale_lines where sale_id = p_sale_id loop
    v_subtotal := v_subtotal + (v_line.quantity * v_line.unit_price) - v_line.discount_amount;
    v_tax := v_tax + (v_line.quantity * v_line.unit_price - v_line.discount_amount) * (v_line.tax_rate / 100);

    select cost into v_product_cost from public.erp_products where id = v_line.product_id;
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_session.warehouse_id, 'sale', v_line.quantity, v_product_cost, v_sale.reference, auth.uid());
  end loop;

  update public.erp_pos_sales
    set status = 'completed', completed_at = now(), tax_amount = v_tax, total_amount = v_subtotal + v_tax
    where id = p_sale_id returning * into v_sale;

  return v_sale;
end;
$$;
revoke all on function public.apply_complete_erp_pos_sale(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_complete_erp_pos_sale(uuid, uuid) to service_role;

create or replace function public.complete_erp_pos_sale(
  p_organization_id uuid,
  p_sale_id uuid
) returns public.erp_pos_sales
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_module_permission(p_organization_id, 'erp_pos', 'manage') then
    raise exception 'Accès refusé.';
  end if;
  return public.apply_complete_erp_pos_sale(p_organization_id, p_sale_id);
end;
$$;
revoke all on function public.complete_erp_pos_sale(uuid, uuid) from public;
grant execute on function public.complete_erp_pos_sale(uuid, uuid) to authenticated;
