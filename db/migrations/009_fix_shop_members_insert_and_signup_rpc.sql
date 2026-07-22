-- Migration 009 — corrige le bug bloquant d'inscription (boutique jamais
-- rattachée à son propriétaire) et remplace la séquence d'inserts client
-- fragile par une fonction serveur atomique.
--
-- Root cause (confirmé en relisant les policies RLS de db/schema.sql) :
-- shop_members_insert vérifiait shops.owner_id via un subquery direct sur
-- `shops`, soumis à la RLS de `shops` (has_shop_access -> shop_members).
-- Au moment du tout premier insert shop_members d'un nouveau propriétaire,
-- shop_members est encore vide pour lui : has_shop_access(shop_id) est donc
-- false, `shops` est invisible au subquery, le check échoue, l'insert est
-- rejeté par Postgres — systématiquement, pour toute nouvelle inscription,
-- indépendamment de la confirmation email. inscription.tsx ne vérifiait pas
-- l'erreur sur cet insert (silencieusement avalée) et poursuivait comme si
-- de rien n'était : boutique orpheline, invisible pour son propre créateur.

-- =============== Partie A — fix RLS (bug ponctuel) ===============
-- Même principe que has_shop_access/has_role_in_shop : encapsuler le
-- contrôle cross-table dans une fonction security definer pour qu'il
-- contourne la RLS de la table lue, au lieu d'un subquery direct qui y est
-- soumis. Comportement fonctionnel inchangé (owner-only, confirmé
-- intentionnel dans AUDIT-SECURITE.md §8) — seule la circularité est levée.
create or replace function public.is_shop_owner(_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops where id = _shop_id and owner_id = auth.uid());
$$;

drop policy if exists shop_members_insert on public.shop_members;
create policy shop_members_insert on public.shop_members for insert to authenticated
  with check (public.is_shop_owner(shop_id));

-- =============== Partie B — inscription atomique ===============
-- Remplace la séquence côté client (insert shops, puis shop_members, puis
-- subscriptions, puis shop_settings — 4 requêtes séparées, dont 2 sans
-- vérification d'erreur) par une seule fonction security definer : tout
-- s'exécute en une transaction, tout contourne la RLS en interne (comme
-- has_shop_access), tout réussit ou rien n'est créé (rollback automatique
-- sur exception). Élimine cette classe de bug par construction plutôt que
-- de la corriger au cas par cas.
create or replace function public.complete_signup(
  p_shop_name text,
  p_country text,
  p_currency text,
  p_shop_phone text,
  p_address text,
  p_owner_phone text default null
) returns public.shops
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shop public.shops;
  v_slug text;
  v_base text;
  v_trial_ends timestamptz := now() + interval '3 days';
begin
  if v_uid is null then
    raise exception 'Non authentifié.';
  end if;

  if exists (select 1 from public.shop_members where user_id = v_uid) then
    raise exception 'Ce compte est déjà rattaché à une boutique.';
  end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_shop_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then
    v_base := 'boutique';
  end if;

  loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
    begin
      insert into public.shops (name, slug, owner_id, country, currency, plan, trial_ends_at)
      values (trim(p_shop_name), v_slug, v_uid, p_country, coalesce(p_currency, 'XOF'), 'trial', v_trial_ends)
      returning * into v_shop;
      exit;
    exception when unique_violation then
      null; -- collision de slug : on retente avec un nouveau suffixe aléatoire
    end;
  end loop;

  insert into public.shop_members (shop_id, user_id, role)
  values (v_shop.id, v_uid, 'owner');

  insert into public.subscriptions (shop_id, plan, status, amount, currency, current_period_end)
  values (v_shop.id, 'trial', 'trialing', 0, coalesce(p_currency, 'XOF'), v_trial_ends);

  insert into public.shop_settings (shop_id, data)
  values (v_shop.id, jsonb_build_object('phone', p_shop_phone, 'address', p_address));

  if p_owner_phone is not null and p_owner_phone <> '' then
    update public.profiles set phone = p_owner_phone where id = v_uid;
  end if;

  return v_shop;
end;
$$;

revoke all on function public.complete_signup(text, text, text, text, text, text) from public;
grant execute on function public.complete_signup(text, text, text, text, text, text) to authenticated;
