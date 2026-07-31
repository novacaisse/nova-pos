-- 023_admin_sync_and_suspension_enforcement.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Corrige deux familles de bugs trouvées en auditant le reste de l'app une
-- fois la restructuration compte/établissements (021/022) et son premier
-- correctif de paiement (Phase 5, moneyfusion.ts) posés :
--
-- A. Les outils Super Admin qui changent la formule/l'essai d'une
--    organisation (Boutiques) ne mettaient à jour QUE organizations.plan et
--    la table subscriptions par établissement — jamais account_subscriptions
--    (compte + app_module), la source lue par la page Abonnement, le
--    gating de modules (useCurrentPlan) et l'enforcement des limites — même
--    classe de bug que celle corrigée en Phase 5 pour les paiements réels,
--    ici pour les corrections manuelles. Pire : le changement de formule
--    écrivait aussi directement dans `subscriptions` depuis le client, une
--    table dont les policies RLS (subscriptions_update/subscriptions_write)
--    n'autorisent que owner/manager de l'organisation concernée — jamais
--    is_super_admin() — donc cette écriture échouait ou ne faisait rien
--    silencieusement dès qu'un Super Admin (rarement membre de la boutique
--    d'un client) l'utilisait. admin_set_payment_status (validation
--    manuelle d'un paiement, migration 020e) avait le même angle mort côté
--    account_subscriptions — corrigé ici pour rester le miroir exact de
--    verifyAndApplyPayment comme le documente déjà son commentaire d'origine.
--    Les deux nouvelles actions (changement de formule, prolongation
--    d'essai) passent donc par des fonctions security definer dédiées,
--    même schéma que admin_set_payment_status : vérifient is_super_admin()
--    server-side puis écrivent avec les privilèges de la fonction, jamais
--    depuis le client avec la session de l'appelant.
--
-- B. Rien n'empêchait un propriétaire suspendu de contourner la suspension
--    en créant simplement un nouvel établissement via "+ Ajouter une
--    boutique/un établissement" (provision_organization ne vérifiait pas
--    organizations.suspended). Corrigé ici. L'enforcement RLS complet de
--    organizations.suspended sur les tables métier (aujourd'hui un flag lu
--    uniquement côté client, app.tsx — un appel direct à l'API avec une
--    session déjà active continue de tout lire/écrire normalement) reste
--    hors périmètre de cette migration : voir la note à la section B
--    ci-dessous pour pourquoi ce n'est pas un simple ajout dans les
--    fonctions security definer partagées.

-- =============== A1. admin_set_payment_status : miroir exact de la Phase 5 ===============
create or replace function public.admin_set_payment_status(p_payment_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.subscription_payments;
  v_period_days integer;
  v_current_period_end timestamptz;
  v_plan_id text;
  v_organization public.organizations;
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

  -- p_status = 'paid' : même séquence que verifyAndApplyPayment côté Deno
  -- (supabase/functions/_shared/moneyfusion.ts, Phase 5).
  update public.subscription_payments
  set status = 'paid', paid_at = now()
  where id = p_payment_id;

  v_plan_id := v_payment.metadata ->> 'plan_id';
  v_period_days := case when v_payment.metadata ->> 'period' = 'year' then 365 else 30 end;
  v_current_period_end := now() + (v_period_days || ' days')::interval;

  if v_plan_id is not null then
    update public.subscriptions
    set status = 'active', plan = v_plan_id, current_period_end = v_current_period_end
    where id = v_payment.subscription_id;

    update public.organizations set plan = v_plan_id where id = v_payment.organization_id;

    select * into v_organization from public.organizations where id = v_payment.organization_id;
    if found and v_organization.account_id is not null then
      insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at, current_period_end)
      values (v_organization.account_id, v_organization.app_module, v_plan_id, 'active', null, v_current_period_end)
      on conflict (account_id, app_module) do update
        set plan_id = excluded.plan_id, status = excluded.status,
            trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
            updated_at = now();
    end if;
  end if;
end;
$$;

revoke all on function public.admin_set_payment_status(uuid, text) from public;
grant execute on function public.admin_set_payment_status(uuid, text) to authenticated;

-- =============== A2. admin_change_organization_plan (nouveau) ===============
create or replace function public.admin_change_organization_plan(p_organization_id uuid, p_plan text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_organization public.organizations;
  v_price numeric;
  v_currency text;
  v_period_end timestamptz := now() + interval '30 days';
  v_existing_sub_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;

  select * into v_organization from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'Organisation introuvable.';
  end if;

  update public.organizations
  set plan = p_plan, trial_ends_at = case when p_plan = 'trial' then trial_ends_at else null end
  where id = p_organization_id;

  if p_plan <> 'trial' then
    select price_month, currency into v_price, v_currency from public.plans where id = p_plan;

    select id into v_existing_sub_id from public.subscriptions
    where organization_id = p_organization_id order by created_at desc limit 1;

    if v_existing_sub_id is not null then
      update public.subscriptions
      set plan = p_plan, status = 'active', amount = coalesce(v_price, 0), currency = coalesce(v_currency, 'XOF'),
          current_period_end = v_period_end
      where id = v_existing_sub_id;
    else
      insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end, started_at)
      values (p_organization_id, p_plan, 'active', coalesce(v_price, 0), coalesce(v_currency, 'XOF'), v_period_end, now());
    end if;

    if v_organization.account_id is not null then
      insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at, current_period_end)
      values (v_organization.account_id, v_organization.app_module, p_plan, 'active', null, v_period_end)
      on conflict (account_id, app_module) do update
        set plan_id = excluded.plan_id, status = excluded.status,
            trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
            updated_at = now();
    end if;
  end if;
end;
$$;

revoke all on function public.admin_change_organization_plan(uuid, text) from public;
grant execute on function public.admin_change_organization_plan(uuid, text) to authenticated;

-- =============== A3. admin_extend_trial (nouveau) ===============
create or replace function public.admin_extend_trial(p_organization_id uuid, p_days integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_organization public.organizations;
  v_base timestamptz;
  v_new timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au Super Admin.';
  end if;

  select * into v_organization from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'Organisation introuvable.';
  end if;

  v_base := case when v_organization.trial_ends_at is not null and v_organization.trial_ends_at > now()
    then v_organization.trial_ends_at else now() end;
  v_new := v_base + (p_days || ' days')::interval;

  update public.organizations set trial_ends_at = v_new, plan = 'trial' where id = p_organization_id;

  if v_organization.account_id is not null then
    insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at)
    values (v_organization.account_id, v_organization.app_module, 'trial', 'trialing', v_new)
    on conflict (account_id, app_module) do update
      set plan_id = 'trial', status = 'trialing', trial_ends_at = excluded.trial_ends_at, updated_at = now();
  end if;
end;
$$;

revoke all on function public.admin_extend_trial(uuid, integer) from public;
grant execute on function public.admin_extend_trial(uuid, integer) to authenticated;

-- =============== B. Impossible de contourner une suspension en créant un nouvel établissement ===============
-- Ne couvre que cette porte de sortie précise. L'enforcement RLS complet de
-- organizations.suspended (aujourd'hui un flag lu uniquement côté client,
-- app.tsx) toucherait has_organization_access/has_role_in_organization/
-- has_any_role_in_organization, qui gouvernent aussi la lecture de la ligne
-- organizations elle-même (shops_select) : les y ajouter tel quel rendrait
-- une organisation suspendue invisible à ses propres membres, cassant
-- l'écran "Compte suspendu" au lieu de l'afficher. Ce fix mérite sa propre
-- passe dédiée (fonction séparée appliquée seulement aux tables métier
-- mutables, jamais à organizations/organization_members), pas un ajout à la
-- volée dans une migration par ailleurs sans rapport — laissé en l'état ici.
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

  if v_est_count > 0 then
    select plan_id into v_plan_id from public.account_subscriptions
    where account_id = v_account_id and app_module = p_app;
    if v_plan_id is not null then
      select max_establishments into v_max_establishments from public.plans where id = v_plan_id;
      if v_max_establishments is not null and v_est_count >= v_max_establishments then
        raise exception 'Limite d''établissements atteinte pour votre formule (% maximum). Passez à une formule supérieure pour en ajouter.', v_max_establishments;
      end if;
    end if;
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at, active_apps, account_id, app_module)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends, jsonb_build_array(p_app), v_account_id, p_app)
      returning * into v_organization;
      exit;
    exception when unique_violation then
      null; -- collision de slug : on retente avec un nouveau suffixe aléatoire
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, v_uid, 'owner');

  insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end)
  values (v_organization.id, 'trial', 'trialing', 0, coalesce(p_currency, 'XOF'), v_trial_ends);

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
