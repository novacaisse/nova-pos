-- Migration 072 — Bug rapporté : "column "status" is of type
-- subscription_status but expression is of type text" à la création d'une
-- organisation. provision_organization() déclarait v_sub_status en text
-- puis l'insérait directement dans subscriptions.status (enum
-- subscription_status) — Postgres n'auto-caste jamais un texte déjà typé
-- (variable) vers un enum à l'insertion, contrairement à un littéral de
-- chaîne ('active') dont le type "unknown" se résout au type de la colonne
-- cible. Correction : v_sub_status déclarée directement en
-- public.subscription_status (les affectations depuis des littéraux
-- restent valides). CREATE OR REPLACE sûr : signature inchangée.
-- Présentée pour relecture — NE PAS exécuter automatiquement.
create or replace function public.provision_organization(
  p_app text,
  p_name text,
  p_country text,
  p_currency text default 'XOF',
  p_phone text default null,
  p_address text default null,
  p_owner_phone text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_est_count integer;
  v_plan_id text;
  v_max_establishments integer;
  v_organization public.organizations;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
  v_acct_sub public.account_subscriptions%rowtype;
  v_org_plan text;
  v_org_trial_ends timestamptz;
  v_sub_status public.subscription_status;
  v_sub_amount numeric;
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  if exists (select 1 from public.organizations where owner_id = v_uid and suspended) then
    raise exception 'Compte suspendu : contactez le support avant de créer un nouvel établissement.';
  end if;

  insert into public.accounts (owner_id, name) values (v_uid, trim(p_name))
  on conflict (owner_id) do nothing
  returning id into v_account_id;
  if v_account_id is null then
    select id into v_account_id from public.accounts where owner_id = v_uid;
  end if;

  select count(*) into v_est_count from public.organizations
  where account_id = v_account_id and app_module = p_app;

  select * into v_acct_sub from public.account_subscriptions
  where account_id = v_account_id and app_module = p_app;

  if v_est_count > 0 and v_acct_sub.plan_id is not null then
    v_plan_id := v_acct_sub.plan_id;
    select max_establishments into v_max_establishments from public.plans where id = v_plan_id;
    if v_max_establishments is not null and v_est_count >= v_max_establishments then
      raise exception 'Limite d''établissements atteinte pour votre formule (% maximum). Passez à une formule supérieure pour en ajouter.', v_max_establishments;
    end if;
  end if;

  if v_acct_sub.account_id is not null and v_acct_sub.status = 'active' then
    -- Abonnement payé déjà actif pour ce couple compte/app : la nouvelle
    -- organisation en hérite directement, jamais un essai.
    v_org_plan := v_acct_sub.plan_id;
    v_org_trial_ends := null;
    v_sub_status := 'active';
    select price_month into v_sub_amount from public.plans where id = v_acct_sub.plan_id;
  elsif v_acct_sub.account_id is not null then
    -- Essai déjà en cours pour ce couple compte/app : la nouvelle
    -- organisation partage la MÊME échéance, jamais un nouveau délai de 3
    -- jours (sinon créer une boutique permettrait de prolonger l'essai
    -- indéfiniment).
    v_org_plan := 'trial';
    v_org_trial_ends := v_acct_sub.trial_ends_at;
    v_sub_status := 'trialing';
    v_sub_amount := 0;
  else
    -- Aucun abonnement pour ce couple compte/app : 1er établissement de
    -- cette app sur ce compte, comportement d'origine (nouvel essai de 3
    -- jours).
    v_org_plan := 'trial';
    v_org_trial_ends := v_trial_ends;
    v_sub_status := 'trialing';
    v_sub_amount := 0;
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at, active_apps, account_id, app_module)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), v_org_plan, v_org_trial_ends, jsonb_build_array(p_app), v_account_id, p_app)
      returning * into v_organization;
      exit;
    exception when unique_violation then
      null; -- collision de slug : on retente avec un nouveau suffixe aléatoire
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, v_uid, 'owner');

  insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end)
  values (v_organization.id, v_org_plan, v_sub_status, coalesce(v_sub_amount, 0), coalesce(p_currency, 'XOF'), coalesce(v_acct_sub.current_period_end, v_org_trial_ends));

  insert into public.organization_settings (organization_id, data)
  values (v_organization.id, jsonb_build_object('phone', p_phone, 'address', p_address));

  insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at)
  values (v_account_id, p_app, 'trial', 'trialing', v_trial_ends)
  on conflict (account_id, app_module) do nothing;

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_organization;
end;
$$;

revoke all on function public.provision_organization(text, text, text, text, text, text, text) from public;
grant execute on function public.provision_organization(text, text, text, text, text, text, text) to authenticated;
