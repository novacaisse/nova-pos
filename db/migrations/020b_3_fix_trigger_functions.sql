-- Migration 020b — partie 3/3 : fonctions déclenchées par trigger
-- (apply_stock_movement, notify_big_sale, notify_stock_level, notify_new_member)
--
-- À exécuter en dernier, après les parties 1/3 et 2/3.
--
-- Note : aucune policy RLS, aucun trigger (CREATE TRIGGER), aucune
-- contrainte n'a besoin d'être touché ici — ils suivent automatiquement
-- le renommage des fonctions/tables/colonnes par OID (voir 020a).
-- handle_new_user() ne référence aucune colonne shop_id/table shops —
-- non touchée, aucune action nécessaire.

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
