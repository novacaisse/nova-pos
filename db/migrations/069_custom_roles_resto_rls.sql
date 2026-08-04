-- Migration 069 — Rôles personnalisés, Phase D-2 (ZegResto) : bascule des
-- policies RLS resto_* vers has_module_permission(), même principe que
-- 064 (ZegCaisse) et 067 (ZegHotel). Chaque carve-out métier existant est
-- préservé verbatim. Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 068.
--
-- Même règle générale qu'en migration 067 (ZegHotel) : partout où une
-- policy _delete séparée existe et est plus stricte que la policy _update
-- correspondante (resto_orders, resto_order_courses, resto_order_items,
-- resto_kitchen_tickets, resto_reservations, resto_bills), la suppression
-- reste codée en dur owner/manager, jamais déléguable via 'manage'.

-- =============== resto_zones / resto_tables (module 'resto_salle') ===============
drop policy if exists resto_zones_write on public.resto_zones;
create policy resto_zones_write on public.resto_zones for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage'));

drop policy if exists resto_tables_insert on public.resto_tables;
create policy resto_tables_insert on public.resto_tables for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage'));
-- Carve-out préservé : server peut changer le statut d'une table (plan de
-- salle) même sans permission 'manage' sur le module.
drop policy if exists resto_tables_update on public.resto_tables;
create policy resto_tables_update on public.resto_tables for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_salle', 'manage') or public.has_role_in_organization(organization_id, 'server'))
  with check (public.has_module_permission(organization_id, 'resto_salle', 'manage') or public.has_role_in_organization(organization_id, 'server'));
drop policy if exists resto_tables_delete on public.resto_tables;
create policy resto_tables_delete on public.resto_tables for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== resto_menu_categories / resto_menu_items / resto_modifiers / resto_modifier_options / resto_menu_item_modifiers (module 'resto_menu') ===============
drop policy if exists resto_menu_categories_write on public.resto_menu_categories;
create policy resto_menu_categories_write on public.resto_menu_categories for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

drop policy if exists resto_menu_items_write on public.resto_menu_items;
create policy resto_menu_items_write on public.resto_menu_items for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

drop policy if exists resto_modifiers_write on public.resto_modifiers;
create policy resto_modifiers_write on public.resto_modifiers for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_menu', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_menu', 'manage'));

drop policy if exists resto_modifier_options_write on public.resto_modifier_options;
create policy resto_modifier_options_write on public.resto_modifier_options for all to authenticated
  using (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_module_permission(m.organization_id, 'resto_menu', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_modifiers m
    where m.id = modifier_id
      and public.has_module_permission(m.organization_id, 'resto_menu', 'manage')
  ));

drop policy if exists resto_menu_item_modifiers_write on public.resto_menu_item_modifiers;
create policy resto_menu_item_modifiers_write on public.resto_menu_item_modifiers for all to authenticated
  using (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_module_permission(i.organization_id, 'resto_menu', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_menu_items i
    where i.id = menu_item_id
      and public.has_module_permission(i.organization_id, 'resto_menu', 'manage')
  ));

-- =============== resto_orders / resto_order_courses / resto_order_items (module 'resto_commandes') ===============
drop policy if exists resto_orders_insert on public.resto_orders;
create policy resto_orders_insert on public.resto_orders for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'create'));
drop policy if exists resto_orders_update on public.resto_orders;
create policy resto_orders_update on public.resto_orders for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
drop policy if exists resto_orders_delete on public.resto_orders;
create policy resto_orders_delete on public.resto_orders for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists resto_order_courses_insert on public.resto_order_courses;
create policy resto_order_courses_insert on public.resto_order_courses for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'create'));
drop policy if exists resto_order_courses_update on public.resto_order_courses;
create policy resto_order_courses_update on public.resto_order_courses for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
drop policy if exists resto_order_courses_delete on public.resto_order_courses;
create policy resto_order_courses_delete on public.resto_order_courses for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- INSERT direct reste owner/manager seulement (server passe par
-- add_resto_order_item(), migré plus bas) — inchangé, pas une permission
-- 'create' du module ouverte à server en direct sur cette table.
drop policy if exists resto_order_items_insert on public.resto_order_items;
create policy resto_order_items_insert on public.resto_order_items for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists resto_order_items_update on public.resto_order_items;
create policy resto_order_items_update on public.resto_order_items for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_commandes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_commandes', 'manage'));
drop policy if exists resto_order_items_delete on public.resto_order_items;
create policy resto_order_items_delete on public.resto_order_items for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== resto_kitchen_tickets (module 'resto_cuisine') ===============
-- INSERT direct reste owner/manager (les tickets naissent normalement via
-- send_resto_course()) — inchangé.
drop policy if exists resto_kitchen_tickets_insert on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_insert on public.resto_kitchen_tickets for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists resto_kitchen_tickets_update on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_update on public.resto_kitchen_tickets for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_cuisine', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_cuisine', 'manage'));
drop policy if exists resto_kitchen_tickets_delete on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_delete on public.resto_kitchen_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== resto_reservations (module 'resto_reservations') ===============
drop policy if exists resto_reservations_select on public.resto_reservations;
create policy resto_reservations_select on public.resto_reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_reservations', 'view'));
drop policy if exists resto_reservations_insert on public.resto_reservations;
create policy resto_reservations_insert on public.resto_reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_reservations', 'create'));
drop policy if exists resto_reservations_update on public.resto_reservations;
create policy resto_reservations_update on public.resto_reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_reservations', 'manage'));
drop policy if exists resto_reservations_delete on public.resto_reservations;
create policy resto_reservations_delete on public.resto_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== resto_recipes / resto_recipe_ingredients (module 'resto_recettes') ===============
drop policy if exists resto_recipes_select on public.resto_recipes;
create policy resto_recipes_select on public.resto_recipes for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_recettes', 'view'));
drop policy if exists resto_recipes_write on public.resto_recipes;
create policy resto_recipes_write on public.resto_recipes for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_recettes', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_recettes', 'manage'));

drop policy if exists resto_recipe_ingredients_select on public.resto_recipe_ingredients;
create policy resto_recipe_ingredients_select on public.resto_recipe_ingredients for select to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'view')
  ));
drop policy if exists resto_recipe_ingredients_write on public.resto_recipe_ingredients;
create policy resto_recipe_ingredients_write on public.resto_recipe_ingredients for all to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'manage')
  ))
  with check (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_module_permission(r.organization_id, 'resto_recettes', 'manage')
  ));

-- =============== resto_settings (module 'resto_parametres') ===============
drop policy if exists resto_settings_write on public.resto_settings;
create policy resto_settings_write on public.resto_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_parametres', 'manage'));

-- =============== resto_loyalty_accounts / resto_loyalty_transactions (module 'resto_fidelite') ===============
drop policy if exists resto_loyalty_accounts_select on public.resto_loyalty_accounts;
create policy resto_loyalty_accounts_select on public.resto_loyalty_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'view'));
-- Carve-out préservé : points_balance = 0 forcé dans le with check, tout
-- crédit de points passe exclusivement par apply_resto_bill_loyalty()/
-- add_resto_bill_payment() (security definer), jamais par écriture directe.
drop policy if exists resto_loyalty_accounts_insert on public.resto_loyalty_accounts;
create policy resto_loyalty_accounts_insert on public.resto_loyalty_accounts for insert to authenticated
  with check (
    points_balance = 0
    and public.has_module_permission(organization_id, 'resto_fidelite', 'create')
  );
drop policy if exists resto_loyalty_accounts_update on public.resto_loyalty_accounts;
create policy resto_loyalty_accounts_update on public.resto_loyalty_accounts for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'));
drop policy if exists resto_loyalty_accounts_delete on public.resto_loyalty_accounts;
create policy resto_loyalty_accounts_delete on public.resto_loyalty_accounts for delete to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'manage'));

drop policy if exists resto_loyalty_transactions_select on public.resto_loyalty_transactions;
create policy resto_loyalty_transactions_select on public.resto_loyalty_transactions for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_fidelite', 'view'));

-- =============== resto_bills / resto_bill_splits / resto_bill_split_items (module 'resto_facturation') ===============
drop policy if exists resto_bills_select on public.resto_bills;
create policy resto_bills_select on public.resto_bills for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));
drop policy if exists resto_bills_insert on public.resto_bills;
create policy resto_bills_insert on public.resto_bills for insert to authenticated
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'create'));
drop policy if exists resto_bills_update on public.resto_bills;
create policy resto_bills_update on public.resto_bills for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'manage'));
drop policy if exists resto_bills_delete on public.resto_bills;
create policy resto_bills_delete on public.resto_bills for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists resto_bill_splits_select on public.resto_bill_splits;
create policy resto_bill_splits_select on public.resto_bill_splits for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));
drop policy if exists resto_bill_splits_write on public.resto_bill_splits;
create policy resto_bill_splits_write on public.resto_bill_splits for all to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_facturation', 'manage'));

drop policy if exists resto_bill_split_items_select on public.resto_bill_split_items;
create policy resto_bill_split_items_select on public.resto_bill_split_items for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_facturation', 'view'));

-- =============== resto_bill_payments (module 'resto_paiements') ===============
drop policy if exists resto_bill_payments_select on public.resto_bill_payments;
create policy resto_bill_payments_select on public.resto_bill_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'resto_paiements', 'view'));
drop policy if exists resto_bill_payments_update on public.resto_bill_payments;
create policy resto_bill_payments_update on public.resto_bill_payments for update to authenticated
  using (public.has_module_permission(organization_id, 'resto_paiements', 'manage'))
  with check (public.has_module_permission(organization_id, 'resto_paiements', 'manage'));

-- =============== Fonctions security definer : autorisation réelle branchée sur has_module_permission() ===============
create or replace function public.add_resto_order_item(
  p_organization_id uuid,
  p_order_id uuid,
  p_menu_item_id uuid,
  p_quantite numeric,
  p_modifiers jsonb default '[]'::jsonb,
  p_course_id uuid default null
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_order public.resto_orders;
  v_item public.resto_menu_items;
  v_modifier_total numeric(14,2) := 0;
  v_unit_price numeric(14,2);
  v_order_item public.resto_order_items;
  v_course_id uuid;
  v_course public.resto_order_courses;
  v_recipe_id uuid;
  v_ingredient record;
begin
  if not public.has_module_permission(p_organization_id, 'resto_commandes', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'Quantité invalide.';
  end if;

  select * into v_order from public.resto_orders where id = p_order_id and organization_id = p_organization_id;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_order.statut in ('fermee', 'annulee') then
    raise exception 'Impossible d''ajouter un article à une commande fermée ou annulée.';
  end if;

  select * into v_item from public.resto_menu_items where id = p_menu_item_id and organization_id = p_organization_id;
  if not found then raise exception 'Article introuvable.'; end if;
  if not v_item.disponible then raise exception 'Cet article n''est plus disponible.'; end if;

  if p_course_id is not null then
    select * into v_course from public.resto_order_courses where id = p_course_id and order_id = p_order_id;
    if not found then raise exception 'Étape introuvable.'; end if;
    v_course_id := p_course_id;
  else
    select * into v_course from public.resto_order_courses
      where order_id = p_order_id and ordre = 1
      order by created_at limit 1;
    if not found then
      insert into public.resto_order_courses (organization_id, order_id, ordre, statut)
      values (p_organization_id, p_order_id, 1, 'brouillon')
      returning * into v_course;
    end if;
    v_course_id := v_course.id;
  end if;

  select coalesce(sum((opt->>'impact_prix')::numeric), 0) into v_modifier_total
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) opt;
  v_unit_price := v_item.prix + v_modifier_total;

  insert into public.resto_order_items (organization_id, order_id, course_id, menu_item_id, quantite, modifiers_choisis, statut_ligne, prix_unitaire)
  values (p_organization_id, p_order_id, v_course_id, p_menu_item_id, p_quantite, coalesce(p_modifiers, '[]'::jsonb), 'en_attente', v_unit_price)
  returning * into v_order_item;

  select id into v_recipe_id from public.resto_recipes where menu_item_id = p_menu_item_id;
  if v_recipe_id is not null then
    for v_ingredient in
      select ingredient_ref, quantite from public.resto_recipe_ingredients where recipe_id = v_recipe_id
    loop
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_ingredient.ingredient_ref, 'sale', v_ingredient.quantite * p_quantite, 'Recette ZegResto', auth.uid());
    end loop;
  end if;

  if v_course.statut in ('envoyee', 'en_preparation', 'pret') then
    update public.resto_kitchen_tickets set statut = 'en_attente', ready_at = null
      where course_id = v_course_id and statut = 'pret';
    if v_course.statut = 'pret' then
      update public.resto_order_courses set statut = 'en_preparation' where id = v_course_id;
    end if;
  end if;

  return v_order_item;
end;
$$;

create or replace function public.send_resto_course(
  p_organization_id uuid,
  p_course_id uuid
) returns public.resto_order_courses
language plpgsql security definer set search_path = public as $$
declare
  v_course public.resto_order_courses;
  v_item_count integer;
  v_existing_ticket public.resto_kitchen_tickets;
begin
  if not public.has_module_permission(p_organization_id, 'resto_commandes', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_course from public.resto_order_courses where id = p_course_id and organization_id = p_organization_id;
  if not found then raise exception 'Étape introuvable.'; end if;

  select count(*) into v_item_count from public.resto_order_items
    where course_id = p_course_id and statut_ligne <> 'annulee';
  if v_item_count = 0 then
    raise exception 'Aucun article à envoyer pour cette étape.';
  end if;

  select * into v_existing_ticket from public.resto_kitchen_tickets where course_id = p_course_id;
  if not found then
    insert into public.resto_kitchen_tickets (organization_id, order_id, course_id, statut)
    values (p_organization_id, v_course.order_id, p_course_id, 'en_attente');
  elsif v_existing_ticket.statut = 'pret' then
    update public.resto_kitchen_tickets set statut = 'en_attente', ready_at = null where id = v_existing_ticket.id;
  end if;

  update public.resto_order_courses set statut = 'envoyee', sent_at = now() where id = p_course_id
  returning * into v_course;

  update public.resto_orders set statut = 'envoyee' where id = v_course.order_id and statut = 'ouverte';

  return v_course;
end;
$$;

-- p_statut = 'pret' : accessible à qui a 'manage' sur resto_cuisine (cook)
-- OU sur resto_commandes (server) — reproduit exactement l'union
-- owner/manager/server/cook d'origine. p_statut = 'servie' : seulement
-- resto_commandes.manage (owner/manager/server) — cook en est exclu, comme
-- avant (il ne "sert" jamais un plat).
create or replace function public.mark_resto_order_item_statut(
  p_organization_id uuid,
  p_item_id uuid,
  p_statut text
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_allowed boolean;
  v_item public.resto_order_items;
begin
  if p_statut not in ('pret', 'servie') then
    raise exception 'Statut invalide.';
  end if;
  if p_statut = 'pret' then
    v_allowed := public.has_module_permission(p_organization_id, 'resto_cuisine', 'manage')
      or public.has_module_permission(p_organization_id, 'resto_commandes', 'manage');
  else
    v_allowed := public.has_module_permission(p_organization_id, 'resto_commandes', 'manage');
  end if;
  if not v_allowed then
    raise exception 'Accès refusé.';
  end if;

  update public.resto_order_items set statut_ligne = p_statut
    where id = p_item_id and organization_id = p_organization_id and statut_ligne <> 'annulee'
    returning * into v_item;
  if not found then raise exception 'Article de commande introuvable.'; end if;

  return v_item;
end;
$$;

create or replace function public.create_resto_bill(
  p_organization_id uuid,
  p_order_id uuid,
  p_split_mode text default 'aucun',
  p_split_count integer default null
) returns public.resto_bills
language plpgsql security invoker set search_path = public as $$
declare
  v_total numeric(14,2);
  v_bill public.resto_bills;
  v_part numeric(14,2);
  i integer;
begin
  if not public.has_module_permission(p_organization_id, 'resto_facturation', 'create') then
    raise exception 'Accès refusé.';
  end if;
  select coalesce(sum(prix_unitaire * quantite), 0) into v_total
  from public.resto_order_items where order_id = p_order_id and statut_ligne <> 'annulee';

  insert into public.resto_bills (order_id, organization_id, total, split_mode)
  values (p_order_id, p_organization_id, v_total, coalesce(p_split_mode, 'aucun'))
  returning * into v_bill;

  if p_split_mode = 'egal' and p_split_count is not null and p_split_count > 1 then
    v_part := trunc(v_total / p_split_count, 2);
    for i in 1..p_split_count loop
      insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
      values (p_organization_id, v_bill.id, i, case when i = p_split_count then v_total - v_part * (p_split_count - 1) else v_part end);
    end loop;
  end if;

  return v_bill;
end;
$$;

create or replace function public.set_resto_bill_split_items(
  p_bill_id uuid,
  p_assignments jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_assignment jsonb;
  v_split_index integer;
begin
  select * into v_bill from public.resto_bills where id = p_bill_id;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_module_permission(v_bill.organization_id, 'resto_facturation', 'manage') then
    raise exception 'Accès refusé.';
  end if;

  delete from public.resto_bill_split_items where bill_id = p_bill_id;
  delete from public.resto_bill_splits where bill_id = p_bill_id;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    insert into public.resto_bill_split_items (organization_id, bill_id, split_index, order_item_id)
    values (v_bill.organization_id, p_bill_id, (v_assignment->>'split_index')::integer, (v_assignment->>'order_item_id')::uuid);
  end loop;

  for v_split_index in
    select distinct (a->>'split_index')::integer from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) a
  loop
    insert into public.resto_bill_splits (organization_id, bill_id, split_index, montant)
    select v_bill.organization_id, p_bill_id, v_split_index,
      coalesce(sum(oi.prix_unitaire * oi.quantite), 0)
    from public.resto_bill_split_items bsi
    join public.resto_order_items oi on oi.id = bsi.order_item_id
    where bsi.bill_id = p_bill_id and bsi.split_index = v_split_index;
  end loop;
end;
$$;

create or replace function public.add_resto_bill_payment(
  p_bill_id uuid,
  p_montant numeric,
  p_methode text,
  p_split_id uuid default null
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_total_paid numeric(14,2);
  v_table_id uuid;
  v_net_total numeric(14,2);
  v_loyalty_enabled boolean;
  v_earn_amount_per_point numeric(14,2);
  v_points_earned integer;
begin
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide.';
  end if;

  select * into v_bill from public.resto_bills where id = p_bill_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if not public.has_module_permission(v_bill.organization_id, 'resto_paiements', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if v_bill.statut = 'payee' then raise exception 'Cette note est déjà réglée.'; end if;
  if v_bill.statut = 'annulee' then raise exception 'Cette note a été annulée.'; end if;

  insert into public.resto_bill_payments (organization_id, bill_id, split_id, methode, montant, statut)
  values (v_bill.organization_id, p_bill_id, p_split_id, p_methode, p_montant, 'validee');

  select coalesce(sum(montant), 0) into v_total_paid
  from public.resto_bill_payments where bill_id = p_bill_id and statut = 'validee';

  v_net_total := greatest(v_bill.total - v_bill.loyalty_discount, 0);

  if v_total_paid >= v_net_total then
    update public.resto_bills set statut = 'payee' where id = p_bill_id returning * into v_bill;
    update public.resto_orders set statut = 'fermee', closed_at = now() where id = v_bill.order_id
    returning table_id into v_table_id;
    if v_table_id is not null then
      update public.resto_tables set statut = 'libre' where id = v_table_id and statut <> 'libre';
    end if;

    if v_bill.loyalty_account_id is not null then
      select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_earn_amount_per_point, 100)
        into v_loyalty_enabled, v_earn_amount_per_point
        from (select 1) x left join public.resto_settings rs on rs.organization_id = v_bill.organization_id;
      if v_loyalty_enabled then
        v_points_earned := floor(v_net_total / v_earn_amount_per_point)::integer;
        if v_points_earned > 0 then
          update public.resto_loyalty_accounts set points_balance = points_balance + v_points_earned, updated_at = now()
            where id = v_bill.loyalty_account_id;
          insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
          values (v_bill.organization_id, v_bill.loyalty_account_id, p_bill_id, 'earn', v_points_earned, v_net_total);
          update public.resto_bills set loyalty_points_earned = v_points_earned where id = p_bill_id returning * into v_bill;
        end if;
      end if;
    end if;
  end if;

  return v_bill;
end;
$$;

create or replace function public.apply_resto_bill_loyalty(
  p_organization_id uuid,
  p_bill_id uuid,
  p_telephone text,
  p_nom text default null,
  p_redeem_points integer default 0
) returns public.resto_bills
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.resto_bills;
  v_account public.resto_loyalty_accounts;
  v_loyalty_enabled boolean;
  v_redeem_value_per_point numeric(14,4);
  v_min_redeem integer;
  v_discount numeric(14,2) := 0;
  v_phone text;
begin
  if not public.has_module_permission(p_organization_id, 'resto_fidelite', 'create') then
    raise exception 'Accès refusé.';
  end if;
  v_phone := nullif(trim(p_telephone), '');
  if v_phone is null then raise exception 'Numéro de téléphone requis.'; end if;
  if p_redeem_points is null or p_redeem_points < 0 then raise exception 'Points invalides.'; end if;

  select * into v_bill from public.resto_bills where id = p_bill_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Note introuvable.'; end if;
  if v_bill.statut <> 'ouverte' then raise exception 'Cette note ne peut plus être modifiée.'; end if;

  select coalesce(rs.loyalty_enabled, false), coalesce(rs.loyalty_redeem_value_per_point, 1), coalesce(rs.loyalty_min_points_to_redeem, 1)
    into v_loyalty_enabled, v_redeem_value_per_point, v_min_redeem
    from (select 1) x left join public.resto_settings rs on rs.organization_id = p_organization_id;
  if not v_loyalty_enabled then
    raise exception 'Le programme de fidélité n''est pas activé pour cet établissement.';
  end if;

  if v_bill.loyalty_points_redeemed > 0 and v_bill.loyalty_account_id is not null then
    update public.resto_loyalty_accounts set points_balance = points_balance + v_bill.loyalty_points_redeemed, updated_at = now()
      where id = v_bill.loyalty_account_id;
    delete from public.resto_loyalty_transactions where bill_id = p_bill_id and type = 'spend';
  end if;

  select * into v_account from public.resto_loyalty_accounts where organization_id = p_organization_id and telephone = v_phone;
  if not found then
    insert into public.resto_loyalty_accounts (organization_id, telephone, nom, points_balance)
    values (p_organization_id, v_phone, p_nom, 0)
    returning * into v_account;
  elsif p_nom is not null and coalesce(v_account.nom, '') = '' then
    update public.resto_loyalty_accounts set nom = p_nom, updated_at = now() where id = v_account.id returning * into v_account;
  end if;

  if p_redeem_points > 0 then
    if p_redeem_points < v_min_redeem then
      raise exception 'Minimum % points requis pour un échange.', v_min_redeem;
    end if;
    if v_account.points_balance < p_redeem_points then
      raise exception 'Solde de points insuffisant.';
    end if;
    v_discount := round(least(p_redeem_points * v_redeem_value_per_point, v_bill.total), 2);
    update public.resto_loyalty_accounts set points_balance = points_balance - p_redeem_points, updated_at = now() where id = v_account.id;
    insert into public.resto_loyalty_transactions (organization_id, account_id, bill_id, type, points, montant)
    values (p_organization_id, v_account.id, p_bill_id, 'spend', p_redeem_points, v_discount);
  end if;

  update public.resto_bills set loyalty_account_id = v_account.id, loyalty_discount = v_discount, loyalty_points_redeemed = p_redeem_points
    where id = p_bill_id
    returning * into v_bill;

  return v_bill;
end;
$$;
