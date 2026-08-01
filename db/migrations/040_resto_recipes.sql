-- Migration 040 — ZegResto, étape 6/7 : Stock & recettes. Présentée pour
-- relecture — NE PAS exécuter automatiquement. À exécuter après 039
-- (Réservations).
--
-- Décision produit à documenter (demandée explicitement dans le prompt
-- ZegResto) : resto_recipe_ingredients.ingredient_ref référence
-- directement public.products(id) — les ingrédients d'une recette SONT des
-- produits ZegCaisse ordinaires (farine, fromage, Coca…), avec leur stock
-- suivi par les tables déjà existantes stock_levels/stock_movements
-- (apply_stock_movement(), trigger sur stock_movements, garde-fou
-- anti-survente inclus). Pas de nouvelle table "ingrédients" autonome :
-- même réutilisation que le POS interne ZegHotel (Phase 7, migration 033,
-- post_hotel_pos_charge()) qui consomme déjà ce même catalogue. Limite
-- assumée en V1 : aucune conversion d'unité automatique — quantite/unite
-- sur resto_recipe_ingredients sont informatifs pour l'affichage, le
-- décrément de stock utilise directement quantite (en confiance que
-- l'unité choisie correspond à celle du produit-ingrédient en stock).

create table if not exists public.resto_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  menu_item_id uuid not null references public.resto_menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (menu_item_id)
);
create index if not exists idx_resto_recipes_org on public.resto_recipes(organization_id);
alter table public.resto_recipes enable row level security;

-- Recettes = information de coûtant/back-office, pas un écran de service :
-- select limité à owner/manager/accountant (comme le reste des données
-- financières du module), pas server/cook.
drop policy if exists resto_recipes_select on public.resto_recipes;
create policy resto_recipes_select on public.resto_recipes for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists resto_recipes_write on public.resto_recipes;
create policy resto_recipes_write on public.resto_recipes for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.resto_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.resto_recipes(id) on delete cascade,
  ingredient_ref uuid not null references public.products(id) on delete restrict,
  quantite numeric(14,3) not null check (quantite > 0),
  unite text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_recipe_ingredients_recipe on public.resto_recipe_ingredients(recipe_id);
alter table public.resto_recipe_ingredients enable row level security;

-- Pas d'organization_id propre (appartient à une recette, qui en a une) —
-- RLS remonte via sous-select, même pattern que resto_modifier_options.
drop policy if exists resto_recipe_ingredients_select on public.resto_recipe_ingredients;
create policy resto_recipe_ingredients_select on public.resto_recipe_ingredients for select to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_any_role_in_organization(r.organization_id, array['owner','manager','accountant']::public.app_role[])
  ));
drop policy if exists resto_recipe_ingredients_write on public.resto_recipe_ingredients;
create policy resto_recipe_ingredients_write on public.resto_recipe_ingredients for all to authenticated
  using (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_any_role_in_organization(r.organization_id, array['owner','manager']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.resto_recipes r
    where r.id = recipe_id
      and public.has_any_role_in_organization(r.organization_id, array['owner','manager']::public.app_role[])
  ));

-- add_resto_order_item() étendue — MÊME SIGNATURE que la version posée par
-- la migration 038 (create or replace sûr, pas de nouvel overload orphelin
-- si 038 a déjà été exécutée séparément). Ajoute, après l'insertion de la
-- ligne de commande, le décrément de stock des ingrédients de la recette
-- (s'il en existe une pour l'article commandé) via des lignes
-- stock_movements type 'sale' — le trigger apply_stock_movement() existant
-- fait le reste (mise à jour stock_levels + garde-fou anti-survente). Si un
-- ingrédient manque en stock, toute la transaction (article + ticket +
-- décréments déjà faits) est annulée — même sémantique que create_sale().
create or replace function public.add_resto_order_item(
  p_organization_id uuid,
  p_order_id uuid,
  p_menu_item_id uuid,
  p_quantite numeric,
  p_modifiers jsonb default '[]'::jsonb
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_order public.resto_orders;
  v_item public.resto_menu_items;
  v_modifier_total numeric(14,2) := 0;
  v_unit_price numeric(14,2);
  v_order_item public.resto_order_items;
  v_ticket public.resto_kitchen_tickets;
  v_recipe_id uuid;
  v_ingredient record;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','server']::public.app_role[]) then
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

  select coalesce(sum((opt->>'impact_prix')::numeric), 0) into v_modifier_total
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) opt;
  v_unit_price := v_item.prix + v_modifier_total;

  insert into public.resto_order_items (organization_id, order_id, menu_item_id, quantite, modifiers_choisis, statut_ligne, prix_unitaire)
  values (p_organization_id, p_order_id, p_menu_item_id, p_quantite, coalesce(p_modifiers, '[]'::jsonb), 'en_attente', v_unit_price)
  returning * into v_order_item;

  -- Décrément de stock (Phase 4) : optionnel, seulement si une recette
  -- existe pour cet article. p_quantite = nombre de plats commandés.
  select id into v_recipe_id from public.resto_recipes where menu_item_id = p_menu_item_id;
  if v_recipe_id is not null then
    for v_ingredient in
      select ingredient_ref, quantite from public.resto_recipe_ingredients where recipe_id = v_recipe_id
    loop
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_ingredient.ingredient_ref, 'sale', v_ingredient.quantite * p_quantite, 'Recette ZegResto', auth.uid());
    end loop;
  end if;

  select * into v_ticket from public.resto_kitchen_tickets where order_id = p_order_id;
  if not found then
    insert into public.resto_kitchen_tickets (organization_id, order_id, statut) values (p_organization_id, p_order_id, 'en_attente');
  elsif v_ticket.statut = 'pret' then
    update public.resto_kitchen_tickets set statut = 'en_attente', ready_at = null where id = v_ticket.id;
  end if;

  if v_order.statut = 'ouverte' then
    update public.resto_orders set statut = 'envoyee' where id = p_order_id;
  end if;

  return v_order_item;
end;
$$;
revoke all on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb) from public;
grant execute on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb) to authenticated;
