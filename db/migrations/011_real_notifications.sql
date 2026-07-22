-- Migration 011 — notifications réelles (Bloc 5).
-- La table `notifications` existe déjà dans le schéma (migration initiale)
-- avec sa RLS, mais rien n'a jamais écrit dedans. Cette migration ajoute
-- 3 triggers qui génèrent de vrais événements internes :
--   1. Vente importante (sales, AFTER INSERT)
--   2. Stock bas / rupture de stock (stock_levels, AFTER INSERT OR UPDATE)
--   3. Nouveau membre ajouté à l'équipe (shop_members, AFTER INSERT)
--
-- Les 2 autres événements de la liste validée (devis bientôt expiré, essai
-- qui expire) ne sont PAS des événements ponctuels déclenchables par un
-- trigger — ce sont des conditions qui deviennent vraies simplement parce
-- que le temps passe, sans qu'aucune ligne ne soit insérée/modifiée à ce
-- moment-là. Les gérer côté serveur demanderait une tâche planifiée
-- (pg_cron ou Edge Function schedulée), une pièce d'infrastructure
-- supplémentaire non confirmée disponible sur ce projet. Décision prise
-- pour rester dans le périmètre déjà validé : ces deux-là sont calculés
-- côté client (à la volée, à partir de quotes.valid_until et
-- shops.trial_ends_at déjà chargés), affichés dans la même liste que les
-- notifications réelles mais non persistés en base. À valider/ajuster.

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
    where shop_id = new.shop_id and status <> 'cancelled' and id <> new.id
    order by created_at desc limit 30
  ) recent;

  -- Pas assez d'historique (< 5 ventes) : pas de comparaison significative,
  -- on ne notifie pas sur les toutes premières ventes d'une boutique.
  if v_count >= 5 and v_avg > 0 and new.total >= 2 * v_avg then
    insert into public.notifications (shop_id, title, body, kind)
    values (
      new.shop_id, 'Vente importante',
      'Une vente de ' || round(new.total)::text || ' FCFA vient d''être enregistrée (réf. ' || new.reference || ').',
      'big_sale'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_big_sale on public.sales;
create trigger trg_notify_big_sale
  after insert on public.sales
  for each row execute function public.notify_big_sale();

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
    insert into public.notifications (shop_id, title, body, kind)
    values (new.shop_id, 'Rupture de stock', v_name || ' est en rupture de stock.', 'stock_out');
  elsif new.quantity <= v_threshold and (tg_op = 'INSERT' or old.quantity > v_threshold) then
    insert into public.notifications (shop_id, title, body, kind)
    values (new.shop_id, 'Stock bas', v_name || ' passe sous le seuil d''alerte (' || new.quantity || ').', 'stock_low');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_stock_level on public.stock_levels;
create trigger trg_notify_stock_level
  after insert or update of quantity on public.stock_levels
  for each row execute function public.notify_stock_level();

create or replace function public.notify_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  -- Ne notifie pas l'insertion du owner lui-même (créée à l'inscription /
  -- complete_signup) : ce n'est pas "un nouveau membre a rejoint l'équipe".
  if new.role = 'owner' then
    return new;
  end if;

  select full_name into v_name from public.profiles where id = new.user_id;
  insert into public.notifications (shop_id, title, body, kind)
  values (
    new.shop_id, 'Nouveau membre',
    coalesce(v_name, 'Un nouveau membre') || ' a rejoint l''équipe (' || new.role || ').',
    'new_member'
  );
  return new;
end $$;

drop trigger if exists trg_notify_new_member on public.shop_members;
create trigger trg_notify_new_member
  after insert on public.shop_members
  for each row execute function public.notify_new_member();
