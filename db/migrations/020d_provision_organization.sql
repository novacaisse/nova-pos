-- Migration 020d — ZegOS Chantier 2, étape 4/4 : remplace complete_signup()
-- et create_additional_shop() par une seule fonction provision_organization().
--
-- Contexte : ces deux fonctions faisaient presque la même chose, avec une
-- distinction qui n'avait de sens que parce que complete_signup() combinait
-- jusqu'ici création de compte ET création de boutique en une transaction
-- (complete_signup refusait si le compte avait déjà une boutique ;
-- create_additional_shop exigeait l'inverse). Le nouveau parcours
-- d'inscription sépare la création de compte (auth.signUp, déjà en place)
-- du choix d'application + création d'organisation — il n'y a donc plus
-- besoin de deux fonctions : que ce soit la 1ère organisation d'un compte
-- ou la 3e, l'opération est désormais identique.
--
-- Logique métier strictement préservée pour chaque cas :
-- - 1ère organisation du compte (v_owned_count = 0) : aucune vérification
--   de limite (comme l'ancien complete_signup), plan 'trial', essai 3 jours.
-- - Organisations suivantes : vérifie plans.limits.shops comme le faisait
--   l'ancien create_additional_shop.
-- Nouveau : p_app est stocké dans organizations.active_apps (colonne
-- ajoutée par 020c) — 'pos' pour ZegCaisse aujourd'hui.
--
-- p_phone/p_address/p_owner_phone restent optionnels (défaut null) : le
-- flux "+ Ajouter une boutique" (Paramètres, ex-create_additional_shop) ne
-- les collecte pas, exactement comme avant.

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
  v_owned_count integer;
  v_plan_id text;
  v_limit jsonb;
  v_max_shops integer;
  v_organization public.organizations;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  select count(*) into v_owned_count from public.organizations where owner_id = v_uid;

  -- Limite de boutiques par formule : uniquement à partir de la 2e
  -- organisation du compte (comportement identique à l'ancien
  -- create_additional_shop) — la toute première n'est jamais bloquée
  -- (comportement identique à l'ancien complete_signup).
  if v_owned_count > 0 then
    select plan into v_plan_id from public.organizations where owner_id = v_uid order by created_at asc limit 1;
    -- Clé JSON encore nommée "shops" dans plans.limits — donnée, pas
    -- schéma, jamais renommée par les migrations organizations (020a/020c).
    select limits -> 'shops' into v_limit from public.plans where id = v_plan_id;

    if v_limit is not null and jsonb_typeof(v_limit) = 'number' then
      v_max_shops := (v_limit)::text::integer;
      if v_owned_count >= v_max_shops then
        raise exception 'Limite de boutiques atteinte pour votre formule (% maximum). Passez à une formule supérieure pour en ajouter.', v_max_shops;
      end if;
    end if;
    -- limite non numérique (ex. "∞") ou plan introuvable => pas de blocage.
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at, active_apps)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends, jsonb_build_array(p_app))
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

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_organization;
end;
$$;

revoke all on function public.provision_organization(text, text, text, text, text, text, text) from public;
grant execute on function public.provision_organization(text, text, text, text, text, text, text) to authenticated;

-- Aucun autre objet (policy, trigger, vue) ne dépend de complete_signup()
-- ni de create_additional_shop() — appelées uniquement depuis le client
-- via supabase.rpc(). DROP direct sans CASCADE, sans risque.
drop function if exists public.complete_signup(text, text, text, text, text, text);
drop function if exists public.create_additional_shop(text, text, text);
