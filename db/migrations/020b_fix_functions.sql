-- Migration 020b — ZegOS Chantier 2, étape 2/4 : corrige le corps des
-- fonctions qui référençaient encore shops/shop_id/shop_members en
-- interne après 020a (ALTER TABLE ne réécrit PAS le texte des fonctions
-- plpgsql, contrairement aux policies RLS/contraintes qui suivent
-- automatiquement le renommage par OID).
--
-- ⚠️ URGENT — sans cette migration, l'application reste cassée même avec
-- un frontend parfaitement à jour : has_shop_access() et consorts (appelés
-- par la quasi-totalité des 111 policies RLS) échouent à l'exécution
-- puisqu'ils interrogent encore la table "shop_members", qui n'existe
-- plus depuis 020a. C'est la cause racine de la panne actuelle (pas
-- seulement l'inscription — toute requête protégée par RLS est concernée).
--
-- Logique strictement préservée — uniquement un renommage des références
-- internes (shop_id → organization_id, shops → organizations,
-- shop_members → organization_members, shop_settings → organization_settings).
-- La clé JSON "shops" dans plans.limits n'est PAS renommée ici (donnée,
-- pas schéma — voir note dans create_additional_shop ci-dessous).
--
-- Script rejouable sans risque : les renommages sont encadrés par une
-- vérification conditionnelle (ne s'exécutent que si l'ancien nom existe
-- encore), donc un essai interrompu en cours de route (copier-coller
-- tronqué, etc.) peut être relancé depuis le début sans erreur
-- "function ... does not exist" sur les fonctions déjà renommées.

-- =============== 1. Fonctions de sécurité (renommage + corps) ===============
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'has_shop_access') then
    alter function public.has_shop_access(uuid) rename to has_organization_access;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'current_user_shops') then
    alter function public.current_user_shops() rename to current_user_organizations;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'has_role_in_shop') then
    alter function public.has_role_in_shop(uuid, public.app_role) rename to has_role_in_organization;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'has_any_role_in_shop') then
    alter function public.has_any_role_in_shop(uuid, public.app_role[]) rename to has_any_role_in_organization;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'is_shop_owner') then
    alter function public.is_shop_owner(uuid) rename to is_organization_owner;
  end if;
end $$;

create or replace function public.has_organization_access(_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid());
$$;

create or replace function public.current_user_organizations()
returns setof uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.has_role_in_organization(_organization_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid() and role = _role);
$$;

create or replace function public.has_any_role_in_organization(_organization_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _organization_id and user_id = auth.uid() and role = any(_roles));
$$;

create or replace function public.is_organization_owner(_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = _organization_id and owner_id = auth.uid());
$$;

-- =============== 2. complete_signup (même nom, corps corrigé) ===============
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

-- =============== 3. create_additional_shop (même nom, corps corrigé) ========
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

-- =============== 4. Fonctions déclenchées par trigger (même nom, corps corrigé) ===
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'return' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'sale' then -new.quantity
    when 'transfer' then -new.quantity
    else 0
  end;
  insert into public.stock_levels (organization_id, product_id, quantity)
  values (new.organization_id, new.product_id, delta)
  on conflict (organization_id, product_id)
  do update set quantity = public.stock_levels.quantity + delta, updated_at = now();
  return new;
end $$;

create or replace function public.notify_big_sale()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_avg numeric;
  v_count int;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select count(*), avg(total) into v_count, v_avg
  from (
    select total from public.sales
    where organization_id = new.organization_id and status <> 'cancelled' and id <> new.id
    order by created_at desc limit 30
  ) recent;

  if v_count >= 5 and v_avg > 0 and new.total >= 2 * v_avg then
    insert into public.notifications (organization_id, title, body, kind)
    values (
      new.organization_id, 'Vente importante',
      'Une vente de ' || round(new.total)::text || ' FCFA vient d''être enregistrée (réf. ' || new.reference || ').',
      'big_sale'
    );
  end if;
  return new;
end $$;

create or replace function public.notify_stock_level()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_threshold integer;
begin
  select name, low_stock_threshold into v_name, v_threshold
  from public.products where id = new.product_id;
  if v_name is null then
    return new;
  end if;

  if new.quantity <= 0 and (tg_op = 'INSERT' or old.quantity > 0) then
    insert into public.notifications (organization_id, title, body, kind)
    values (new.organization_id, 'Rupture de stock', v_name || ' est en rupture de stock.', 'stock_out');
  elsif new.quantity <= v_threshold and (tg_op = 'INSERT' or old.quantity > v_threshold) then
    insert into public.notifications (organization_id, title, body, kind)
    values (new.organization_id, 'Stock bas', v_name || ' passe sous le seuil d''alerte (' || new.quantity || ').', 'stock_low');
  end if;
  return new;
end $$;

create or replace function public.notify_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.role = 'owner' then
    return new;
  end if;

  select full_name into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (organization_id, title, body, kind)
  values (
    new.organization_id, 'Nouveau membre',
    coalesce(v_name, 'Un nouveau membre') || ' a rejoint l''équipe (' || new.role || ').',
    'new_member'
  );
  return new;
end $$;

-- Note : aucune policy RLS, aucun trigger (CREATE TRIGGER), aucune
-- contrainte n'a besoin d'être touché ici — ils suivent automatiquement
-- le renommage des fonctions/tables/colonnes par OID (voir 020a).
-- handle_new_user() ne référence aucune colonne shop_id/table shops —
-- non touchée, aucune action nécessaire.
