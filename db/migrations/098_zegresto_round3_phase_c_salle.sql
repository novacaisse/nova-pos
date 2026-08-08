-- Migration 098 — ZegResto Round 3, Phase C : Gestion de salle
-- (mission "47 fonctionnalités ZegResto", items #9 fusion de tables,
-- #11 transfert d'articles, #12 minuterie visuelle, #13 statuts enrichis).
-- Items déjà satisfaits par l'existant, sans changement de schéma :
--   #10 division d'une table en plusieurs additions — resto_bills.split_mode
--       ('egal'/'detaille') + resto_bill_splits couvrent déjà ce besoin
--       (chantier Facturation, migration 044).
--   #14 plan de salle par étage/zone — resto_zones (nom, ordre) est déjà un
--       regroupement libre, un propriétaire peut nommer une zone
--       "Terrasse"/"Étage 1" sans changement de schéma.
--   #15 réservation de table depuis le plan de salle — resto_reservations.
--       table_id existe déjà (migration 039), reste un branchement
--       frontend uniquement.
--   #16 historique de fréquentation par table — dérivé de resto_orders
--       (table_id, created_at) déjà en place, requête de rapport seulement.
--
-- Présentée pour relecture avant exécution (CLAUDE.md).

-- ============ #12 minuterie visuelle par table ============
-- Horodatage du dernier changement de statut — permet d'afficher "occupée
-- depuis Xmin" sur le plan de salle sans dépendre de resto_orders.created_at
-- (une table peut être occupée sans commande encore ouverte, ex. client
-- installé, commande pas encore prise).
alter table public.resto_tables add column if not exists statut_changed_at timestamptz not null default now();

-- ============ #13 statuts de table enrichis ============
-- arrivee (client installé, pas encore commandé) / en_cours (commande en
-- service) / addition_demandee (client a demandé l'addition) s'ajoutent
-- aux 4 statuts existants — le cycle par défaut du plan de salle reste
-- inchangé pour ne rien casser, ces 3 nouveaux statuts sont accessibles en
-- plus, pas à la place des existants.
alter table public.resto_tables drop constraint if exists resto_tables_statut_check;
alter table public.resto_tables add constraint resto_tables_statut_check
  check (statut in ('libre', 'occupee', 'reservee', 'nettoyage', 'arrivee', 'en_cours', 'addition_demandee'));

-- ============ #9 fusion de tables ============
-- table_id reste la table "principale" (celle qui a servi à créer la
-- commande, comportement inchangé pour tout le code existant) ;
-- table_ids_extra porte les tables fusionnées en plus, purement pour
-- affichage ("Tables 4+5") et pour marquer ces tables occupées elles
-- aussi — aucune contrainte FK sur array en Postgres, intégrité assurée
-- côté frontend (ne propose que des tables réellement libres de la même
-- organisation), même pattern que resto_menu_items.suggestion_ids
-- (migration 096).
alter table public.resto_orders add column if not exists table_ids_extra uuid[] not null default '{}';

-- ============ #11 transfert d'articles entre tables ============
-- RPC dédiée plutôt qu'un UPDATE direct : déplacer un article implique de
-- (re)créer une étape par défaut dans la commande cible si besoin (même
-- logique que add_resto_order_item()), et de vérifier que les deux
-- commandes sont bien ouvertes et de la même organisation — un simple
-- UPDATE resto_order_items.order_id direct laisserait passer un transfert
-- vers une commande fermée ou d'une autre organisation.
create or replace function public.transfer_resto_order_items(
  p_organization_id uuid,
  p_item_ids uuid[],
  p_target_order_id uuid
) returns setof public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_target public.resto_orders;
  v_course public.resto_order_courses;
  v_item_id uuid;
begin
  if not public.has_module_permission(p_organization_id, 'resto_commandes', 'manage') then
    raise exception 'Accès refusé.';
  end if;
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'Aucun article sélectionné.';
  end if;

  select * into v_target from public.resto_orders where id = p_target_order_id and organization_id = p_organization_id;
  if not found then raise exception 'Commande de destination introuvable.'; end if;
  if v_target.statut in ('fermee', 'annulee') then
    raise exception 'Impossible de transférer vers une commande fermée ou annulée.';
  end if;

  -- Étape par défaut de la commande cible (même logique que
  -- add_resto_order_item() : réutilise l'étape ordre=1 si elle existe déjà).
  select * into v_course from public.resto_order_courses
    where order_id = p_target_order_id and ordre = 1 order by created_at limit 1;
  if not found then
    insert into public.resto_order_courses (organization_id, order_id, ordre, statut)
    values (p_organization_id, p_target_order_id, 1, 'brouillon')
    returning * into v_course;
  end if;

  foreach v_item_id in array p_item_ids loop
    update public.resto_order_items
      set order_id = p_target_order_id, course_id = v_course.id
      where id = v_item_id and organization_id = p_organization_id and statut_ligne <> 'annulee'
        and order_id in (select id from public.resto_orders where organization_id = p_organization_id and statut not in ('fermee', 'annulee'));
  end loop;

  return query select * from public.resto_order_items where id = any(p_item_ids) and order_id = p_target_order_id;
end;
$$;
revoke all on function public.transfer_resto_order_items(uuid, uuid[], uuid) from public;
grant execute on function public.transfer_resto_order_items(uuid, uuid[], uuid) to authenticated;
