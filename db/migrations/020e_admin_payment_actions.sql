-- Migration 020e — Super Admin : validation manuelle des paiements MoneyFusion.
--
-- Contexte : la vérification automatique (Edge Function
-- check-subscription-payment → verifyAndApplyPayment → proxy Squid →
-- API MoneyFusion) n'a jamais pu être testée en conditions réelles avant
-- déploiement (voir db/AUDIT-SECURITE.md §12). Si le proxy ou l'API
-- échoue silencieusement, le paiement reste "pending" indéfiniment côté
-- client, qui continue de sonder sans jamais recevoir de réponse
-- définitive. Cette fonction donne au Super Admin un moyen de débloquer
-- un paiement manuellement, en dernier recours — même logique métier que
-- la branche "paid"/"failed" de verifyAndApplyPayment
-- (supabase/functions/_shared/moneyfusion.ts), dupliquée ici car un côté
-- est du Deno/TS (appelé par MoneyFusion et par le client) et l'autre du
-- SQL (appelé uniquement par un Super Admin authentifié) — même
-- comportement, deux points d'entrée différents.

create or replace function public.admin_set_payment_status(p_payment_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.subscription_payments;
  v_period_days integer;
  v_current_period_end timestamptz;
  v_plan_id text;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;
  if p_status not in ('paid', 'failed') then
    raise exception 'Statut invalide : % (attendu paid ou failed).', p_status;
  end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;

  if p_status = 'failed' then
    update public.subscription_payments set status = 'failed' where id = p_payment_id;
    return;
  end if;

  -- p_status = 'paid' : même séquence que verifyAndApplyPayment côté Deno.
  update public.subscription_payments
  set status = 'paid', paid_at = now()
  where id = p_payment_id;

  v_plan_id := v_payment.metadata ->> 'plan_id';
  v_period_days := case when v_payment.metadata ->> 'period' = 'year' then 365 else 30 end;
  v_current_period_end := now() + (v_period_days || ' days')::interval;

  -- Pas de plan_id en métadonnées (paiement créé avant l'ajout de cette
  -- clé, ou flux différent) => paiement marqué payé mais abonnement/plan
  -- laissés inchangés plutôt que deviner une formule.
  if v_plan_id is not null then
    update public.subscriptions
    set status = 'active', plan = v_plan_id, current_period_end = v_current_period_end
    where id = v_payment.subscription_id;

    update public.organizations set plan = v_plan_id where id = v_payment.organization_id;
  end if;
end;
$$;

revoke all on function public.admin_set_payment_status(uuid, text) from public;
grant execute on function public.admin_set_payment_status(uuid, text) to authenticated;
