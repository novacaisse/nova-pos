-- Migration 020b — partie 2/3 : complete_signup + create_additional_shop
-- (mêmes noms/signatures, corps corrigés pour organizations/organization_members)
--
-- À exécuter après la partie 1/3 (fonctions de sécurité), avant la partie 3/3.
--
-- returns public.organizations : le type composite associé à la table a
-- suivi son renommage automatiquement (comme pour les policies) — c'est
-- déjà son type réel actuel, "public.shops" n'existe plus.

create or replace function public.complete_signup(
  p_shop_name text,
  p_country text,
  p_currency text,
  p_shop_phone text,
  p_address text,
  p_owner_phone text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_organization public.organizations;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  if exists (select 1 from public.organization_members where user_id = v_uid) then
    raise exception 'Ce compte est déjà rattaché à une boutique.';
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_shop_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at)
      values (trim(p_shop_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends)
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
  values (v_organization.id, jsonb_build_object('phone', p_shop_phone, 'address', p_address));

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_organization;
end;
$$;

create or replace function public.create_additional_shop(
  p_name text,
  p_country text,
  p_currency text default 'XOF'
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
  if v_owned_count = 0 then
    raise exception 'Aucune boutique existante pour ce compte — utilisez l''inscription normale.';
  end if;

  select plan into v_plan_id from public.organizations where owner_id = v_uid order by created_at asc limit 1;
  -- Clé JSON encore nommée "shops" dans plans.limits — donnée, pas schéma,
  -- volontairement pas renommée par cette migration (voir plan présenté).
  select limits -> 'shops' into v_limit from public.plans where id = v_plan_id;

  if v_limit is not null and jsonb_typeof(v_limit) = 'number' then
    v_max_shops := (v_limit)::text::integer;
    if v_owned_count >= v_max_shops then
      raise exception 'Limite de boutiques atteinte pour votre formule (% maximum). Passez à une formule supérieure pour en ajouter.', v_max_shops;
    end if;
  end if;
  -- limite non numérique (ex. "∞") ou plan introuvable => pas de blocage.

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.organizations (name, slug, owner_id, country, currency, plan, trial_ends_at)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends)
      returning * into v_organization;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role) values (v_organization.id, v_uid, 'owner');
  insert into public.subscriptions (organization_id, plan, status, amount, currency, current_period_end)
  values (v_organization.id, 'trial', 'trialing', 0, coalesce(p_currency, 'XOF'), v_trial_ends);
  insert into public.organization_settings (organization_id, data) values (v_organization.id, '{}'::jsonb);

  return v_organization;
end;
$$;
