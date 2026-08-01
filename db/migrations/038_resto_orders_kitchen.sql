-- Migration 038 — ZegResto, étape 4/7 : Commandes + KDS (cuisine),
-- flux temps réel. Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 037 (Salle/Menu).
--
-- Écart par rapport au schéma listé dans la demande initiale : resto_order_items
-- et resto_kitchen_tickets gagnent une colonne organization_id qui n'était
-- pas listée (seul resto_orders l'avait explicitement) — ajoutée pour
-- rester cohérent avec la règle du projet ("organization_id comme clé de
-- rattachement partout, comme ZegCaisse/ZegHotel") et pour permettre des
-- policies RLS directes plutôt qu'un sous-select vers resto_orders sur
-- CHAQUE lecture (le flux KDS lit ces deux tables en continu).

create table if not exists public.resto_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_id uuid references public.resto_tables(id) on delete set null,
  type text not null default 'salle' check (type in ('salle', 'emporter', 'livraison')),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'envoyee', 'servie', 'fermee', 'annulee')),
  server_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_resto_orders_org on public.resto_orders(organization_id);
create index if not exists idx_resto_orders_table on public.resto_orders(table_id);
alter table public.resto_orders enable row level security;

drop policy if exists resto_orders_select on public.resto_orders;
create policy resto_orders_select on public.resto_orders for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_orders_insert on public.resto_orders;
create policy resto_orders_insert on public.resto_orders for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_orders_update on public.resto_orders;
create policy resto_orders_update on public.resto_orders for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_orders_delete on public.resto_orders;
create policy resto_orders_delete on public.resto_orders for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.resto_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  menu_item_id uuid references public.resto_menu_items(id) on delete set null,
  quantite numeric(10,2) not null check (quantite > 0),
  modifiers_choisis jsonb not null default '[]'::jsonb,
  statut_ligne text not null default 'en_attente' check (statut_ligne in ('en_attente', 'servie', 'annulee')),
  prix_unitaire numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_order_items_org on public.resto_order_items(organization_id);
create index if not exists idx_resto_order_items_order on public.resto_order_items(order_id);
alter table public.resto_order_items enable row level security;

-- INSERT volontairement restreint à owner/manager en direct : server passe
-- par add_resto_order_item() (security definer) ci-dessous, qui synchronise
-- aussi le ticket cuisine dans la même transaction — jamais d'écriture
-- directe côté client pour cette table depuis l'UI server.
drop policy if exists resto_order_items_select on public.resto_order_items;
create policy resto_order_items_select on public.resto_order_items for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_order_items_insert on public.resto_order_items;
create policy resto_order_items_insert on public.resto_order_items for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
drop policy if exists resto_order_items_update on public.resto_order_items;
create policy resto_order_items_update on public.resto_order_items for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_order_items_delete on public.resto_order_items;
create policy resto_order_items_delete on public.resto_order_items for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Un ticket par commande (flux unique — pas de resto_kitchen_stations en
-- V1, cf. décision produit du prompt ZegResto). ready_at posé au passage à
-- 'pret', effacé si le ticket est remis en attente (nouvel article ajouté
-- après coup, cf. add_resto_order_item()).
create table if not exists public.resto_kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'en_preparation', 'pret')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (order_id)
);
create index if not exists idx_resto_kitchen_tickets_org on public.resto_kitchen_tickets(organization_id);
alter table public.resto_kitchen_tickets enable row level security;

drop policy if exists resto_kitchen_tickets_select on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_select on public.resto_kitchen_tickets for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_kitchen_tickets_insert on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_insert on public.resto_kitchen_tickets for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
-- update inclut cook : c'est lui qui fait avancer le ticket
-- en_attente -> en_preparation -> pret depuis l'écran KDS.
drop policy if exists resto_kitchen_tickets_update on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_update on public.resto_kitchen_tickets for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','cook']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','cook']::public.app_role[]));
drop policy if exists resto_kitchen_tickets_delete on public.resto_kitchen_tickets;
create policy resto_kitchen_tickets_delete on public.resto_kitchen_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- Réplication complète (avant/après) pour que les clients réaltime du KDS
-- reçoivent la ligne entière sur UPDATE, pas seulement la clé primaire.
alter table public.resto_kitchen_tickets replica identity full;
alter table public.resto_order_items replica identity full;
alter table public.resto_orders replica identity full;

-- Première utilisation de Supabase Realtime dans ce projet (ZegHotel
-- housekeeping, malgré son besoin similaire de "statuts à jour en temps
-- réel", fonctionne en réalité par polling/invalidation TanStack Query,
-- pas par postgres_changes) — ces trois tables rejoignent la publication
-- realtime pour que le KDS et l'écran Commandes se mettent à jour sans
-- action de l'utilisateur. `do $$ ... exception when duplicate_object`
-- pour rester ré-exécutable sans erreur si déjà membre de la publication.
do $$ begin
  alter publication supabase_realtime add table public.resto_kitchen_tickets;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.resto_order_items;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.resto_orders;
exception when duplicate_object then null;
end $$;

-- add_resto_order_item() : RPC security definer — server n'a pas de droit
-- d'écriture direct sur resto_order_items (voir plus haut), donc ajouter un
-- article à une commande passe forcément par ici, en une transaction
-- (article + synchronisation du ticket cuisine). Le prix unitaire est figé
-- à l'insertion (prix de l'article + somme des impacts des modificateurs
-- choisis), jamais recalculé après coup — même logique que hourly_rate figé
-- sur hotel_reservation_rooms (ZegHotel Phase 1).
-- PHASE 4 (stock & recettes) étendra cette fonction, MÊME SIGNATURE (donc
-- create or replace sûr, pas de nouvel overload) pour décrémenter le stock
-- des ingrédients via resto_recipe_ingredients quand une recette existe
-- pour l'article commandé.
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
