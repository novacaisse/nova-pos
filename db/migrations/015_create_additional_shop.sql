-- Bloc 13 (Paramètres) : RPC pour qu'un owner ajoute une boutique
-- supplémentaire depuis l'app (jusqu'ici uniquement possible via
-- complete_signup() au tout premier compte). Mirroir de complete_signup()
-- mais : (a) exige déjà au moins une boutique existante possédée par
-- l'appelant, (b) fait respecter plans.limits.shops.
--
-- Décision : chaque boutique garde son propre plan/abonnement indépendant
-- (comme le fait déjà complete_signup() et comme subscriptions.shop_id le
-- suppose dans le schéma existant) — pas de refonte vers un abonnement
-- partagé multi-boutiques dans ce bloc, ce serait un changement
-- d'architecture plus large à traiter à part. La limite plans.limits.shops
-- appliquée ici se base sur le plan de la boutique la plus ancienne du
-- compte (proxy raisonnable de "la formule choisie par ce propriétaire").
create or replace function public.create_additional_shop(
  p_name text,
  p_country text,
  p_currency text default 'XOF'
) returns public.shops
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owned_count integer;
  v_plan_id text;
  v_limit jsonb;
  v_max_shops integer;
  v_shop public.shops;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  select count(*) into v_owned_count from public.shops where owner_id = v_uid;
  if v_owned_count = 0 then
    raise exception 'Aucune boutique existante pour ce compte — utilisez l''inscription normale.';
  end if;

  select plan into v_plan_id from public.shops where owner_id = v_uid order by created_at asc limit 1;
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
      insert into public.shops (name, slug, owner_id, country, currency, plan, trial_ends_at)
      values (trim(p_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends)
      returning * into v_shop;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.shop_members (shop_id, user_id, role) values (v_shop.id, v_uid, 'owner');
  insert into public.subscriptions (shop_id, plan, status, amount, currency, current_period_end)
  values (v_shop.id, 'trial', 'trialing', 0, coalesce(p_currency, 'XOF'), v_trial_ends);
  insert into public.shop_settings (shop_id, data) values (v_shop.id, '{}'::jsonb);

  return v_shop;
end;
$$;

revoke all on function public.create_additional_shop(text, text, text) from public;
grant execute on function public.create_additional_shop(text, text, text) to authenticated;
