-- Migration 043 — ZegResto V2, étape 2 : envoi en cuisine par étapes
-- (courses). Présentée pour relecture — NE PAS exécuter automatiquement.
-- À exécuter après 042 (bucket photos).
--
-- Changement de comportement important par rapport à la V1 : un article
-- ajouté à une commande n'est plus envoyé en cuisine automatiquement
-- (add_resto_order_item() ne touche plus resto_kitchen_tickets). Il rejoint
-- une "étape" (resto_order_courses, ex. Entrée/Plat/Dessert ou un simple
-- numéro) en statut 'brouillon' ; c'est l'appel explicite à
-- send_resto_course() (nouveau, déclenché par le serveur) qui crée/relance
-- le ticket cuisine. Une commande simple (pas de gestion explicite
-- d'étapes côté UI) obtient automatiquement une étape par défaut — voir
-- add_resto_order_item() ci-dessous.
--
-- IMPORTANT — comme pour toute migration qui change la sémantique d'une
-- table déjà en production : si des commandes sont EN COURS (resto_orders
-- .statut in ('ouverte','envoyee')) au moment de l'exécution, leurs
-- éventuels tickets cuisine déjà créés par l'ancien flux (order_id seul,
-- sans course_id) resteront visibles pour historique mais ne seront plus
-- mis à jour par le nouveau flux — le personnel devra ajouter un nouvel
-- article (ce qui crée une étape par défaut et permettra un nouvel envoi)
-- pour ces commandes en transition. À exécuter de préférence en dehors du
-- service, comme toute migration structurante.

create table if not exists public.resto_order_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.resto_orders(id) on delete cascade,
  ordre integer not null default 1,
  nom text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoyee', 'en_preparation', 'pret', 'servie')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_resto_order_courses_org on public.resto_order_courses(organization_id);
create index if not exists idx_resto_order_courses_order on public.resto_order_courses(order_id);
alter table public.resto_order_courses enable row level security;

drop policy if exists resto_order_courses_select on public.resto_order_courses;
create policy resto_order_courses_select on public.resto_order_courses for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','server','cook']::public.app_role[]));
drop policy if exists resto_order_courses_insert on public.resto_order_courses;
create policy resto_order_courses_insert on public.resto_order_courses for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_order_courses_update on public.resto_order_courses;
create policy resto_order_courses_update on public.resto_order_courses for update to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','server']::public.app_role[]));
drop policy if exists resto_order_courses_delete on public.resto_order_courses;
create policy resto_order_courses_delete on public.resto_order_courses for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

alter table public.resto_order_items add column if not exists course_id uuid references public.resto_order_courses(id) on delete set null;
create index if not exists idx_resto_order_items_course on public.resto_order_items(course_id);

-- 'pret' ajouté : marquage ligne par ligne côté KDS par le cuisinier
-- (mark_resto_order_item_ready(), plus bas), distinct de 'servie' (posé
-- par le serveur une fois le plat effectivement apporté à table).
alter table public.resto_order_items drop constraint if exists resto_order_items_statut_ligne_check;
alter table public.resto_order_items add constraint resto_order_items_statut_ligne_check
  check (statut_ligne in ('en_attente', 'pret', 'servie', 'annulee'));

-- resto_kitchen_tickets repivote vers course_id (une étape = un ticket),
-- order_id conservé pour les jointures directes existantes. Ancienne
-- contrainte unique(order_id) retirée (plusieurs étapes = plusieurs
-- tickets pour la même commande) ; nouvel index unique partiel sur
-- course_id.
alter table public.resto_kitchen_tickets add column if not exists course_id uuid references public.resto_order_courses(id) on delete cascade;
alter table public.resto_kitchen_tickets drop constraint if exists resto_kitchen_tickets_order_id_key;
create unique index if not exists idx_resto_kitchen_tickets_course_unique on public.resto_kitchen_tickets(course_id) where course_id is not null;

-- add_resto_order_item() — signature étendue (p_course_id) : DROP puis
-- CREATE (pas un simple CREATE OR REPLACE) car changer la liste de
-- paramètres créerait un nouvel overload et laisserait l'ancienne
-- signature 5-arguments orpheline si la migration 038/040 a déjà tourné
-- séparément (piège documenté dans CLAUDE.md). Ne touche plus
-- resto_kitchen_tickets — l'envoi en cuisine est désormais un acte
-- explicite (send_resto_course()). p_course_id = null : réutilise ou crée
-- l'étape par défaut (ordre=1) de la commande, pour les commandes simples
-- qui ne gèrent pas explicitement plusieurs étapes.
drop function if exists public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb);
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

  -- Décrément de stock (Phase 4 ZegResto V1) : inchangé, toujours au
  -- moment de l'ajout au panier (pas repoussé à l'envoi en cuisine —
  -- écart non demandé par le prompt V2, documenté dans le résumé de fin
  -- de session).
  select id into v_recipe_id from public.resto_recipes where menu_item_id = p_menu_item_id;
  if v_recipe_id is not null then
    for v_ingredient in
      select ingredient_ref, quantite from public.resto_recipe_ingredients where recipe_id = v_recipe_id
    loop
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_ingredient.ingredient_ref, 'sale', v_ingredient.quantite * p_quantite, 'Recette ZegResto', auth.uid());
    end loop;
  end if;

  -- Si l'étape est déjà envoyée (article ajouté après coup) et que son
  -- ticket était déjà "pret", le repasser en attente — même logique que
  -- le comportement V1 au niveau commande.
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
revoke all on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb, uuid) from public;
grant execute on function public.add_resto_order_item(uuid, uuid, uuid, numeric, jsonb, uuid) to authenticated;

-- send_resto_course() : déclenchement explicite d'un envoi en cuisine par
-- le serveur — security definer (écrit resto_kitchen_tickets, comme
-- add_resto_order_item()).
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
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','server']::public.app_role[]) then
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
revoke all on function public.send_resto_course(uuid, uuid) from public;
grant execute on function public.send_resto_course(uuid, uuid) to authenticated;

-- mark_resto_order_item_ready() : narrow — le cuisinier n'a AUCUN accès
-- RLS direct en écriture à resto_order_items (une policy update large
-- l'exposerait à modifier n'importe quelle autre colonne de la ligne, ex.
-- prix_unitaire/quantite — RLS ne restreint que les lignes, jamais les
-- colonnes, cf. pattern hotel_guest_contact()). p_statut = 'pret' pour
-- cook comme pour le personnel de salle ; 'servie' reste réservé à
-- owner/manager/server (le cuisinier ne "sert" jamais un plat).
create or replace function public.mark_resto_order_item_statut(
  p_organization_id uuid,
  p_item_id uuid,
  p_statut text
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_roles public.app_role[];
  v_item public.resto_order_items;
begin
  if p_statut not in ('pret', 'servie') then
    raise exception 'Statut invalide.';
  end if;
  v_roles := case when p_statut = 'pret'
    then array['owner','manager','server','cook']::public.app_role[]
    else array['owner','manager','server']::public.app_role[]
  end;
  if not public.has_any_role_in_organization(p_organization_id, v_roles) then
    raise exception 'Accès refusé.';
  end if;

  update public.resto_order_items set statut_ligne = p_statut
    where id = p_item_id and organization_id = p_organization_id and statut_ligne <> 'annulee'
    returning * into v_item;
  if not found then raise exception 'Article de commande introuvable.'; end if;

  return v_item;
end;
$$;
revoke all on function public.mark_resto_order_item_statut(uuid, uuid, text) from public;
grant execute on function public.mark_resto_order_item_statut(uuid, uuid, text) to authenticated;
