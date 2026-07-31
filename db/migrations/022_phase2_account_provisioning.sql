-- 022_phase2_account_provisioning.sql
-- Phase 2 de "PROMPT COMBINÉ — Isolation ZegCaisse/ZegHotel + Restructuration
-- compte/établissements" (voir 021_accounts_restructure.sql, Phase 1,
-- confirmée exécutée et vérifiée en base réelle). Présentée pour relecture —
-- NE PAS exécuter automatiquement (aucun script CI/déploiement ne doit
-- lancer ce fichier) : à coller manuellement dans Supabase SQL Editor.
--
-- Remplace provision_organization() ("+ Ajouter une boutique/un
-- établissement", et 1ère organisation à l'inscription) pour qu'elle
-- s'appuie sur accounts/account_subscriptions plutôt que sur un comptage
-- global d'organizations :
-- - Ne crée plus jamais un nouveau compte pour un propriétaire qui en a
--   déjà un (accounts.owner_id est unique) : réutilise le compte existant,
--   n'en crée un que pour la toute première organisation du propriétaire.
-- - La limite d'établissements passe de plans.limits->'shops' (globale,
--   tous app_module confondus) à account_subscriptions/plans.max_establishments,
--   comptée par (account_id, app_module) — cohérente avec le modèle
--   multi-app de la Phase 1. Comme avant (ex-create_additional_shop), seule
--   la 2e organisation d'une même app est soumise à la limite ; la 1ère
--   n'est jamais bloquée (aucune account_subscription à vérifier pour ce
--   couple compte/app tant qu'elle n'existe pas encore).
-- - Crée la ligne account_subscriptions (account_id, app_module) en essai
--   par défaut si elle n'existe pas encore pour ce couple, même règle que
--   le backfill 5g de la Phase 1.
--
-- organizations.plan/trial_ends_at et la table subscriptions restent
-- inchangés (pilotent toujours le frontend actuel) — hors périmètre de
-- cette passe.

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
