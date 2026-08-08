-- Migration 096 — ZegResto Round 3, Phase A : POS vitesse & saisie
-- (mission "47 fonctionnalités ZegResto", items #2 favoris par créneau,
-- #7 suggestions d'accompagnement, #8 annulation de ligne avec motif
-- obligatoire). Les autres items de la Phase A (#1 recherche déjà en
-- place, #3 duplication, #4 mode express, #5 raccourcis clavier, #6 saisie
-- vocale) sont purement frontend, aucun changement de schéma nécessaire.
--
-- Présentée pour relecture avant exécution (CLAUDE.md).

-- ============ #2 Favoris par créneau + #7 suggestions d'accompagnement ============
-- favori_creneaux : un plat peut être épinglé sur un ou plusieurs créneaux
-- (matin/midi/soir) — filtre rapide côté prise de commande. suggestion_ids
-- auto-référence d'autres resto_menu_items (pas de contrainte FK sur les
-- tableaux en Postgres — intégrité assurée côté frontend, qui ne propose
-- que des articles existants du même menu, même pattern que les colonnes
-- jsonb non contraintes déjà présentes ailleurs dans le projet, ex.
-- hotel_room_types.custom_hourly_rates).
alter table public.resto_menu_items
  add column if not exists favori_creneaux text[] not null default '{}',
  add column if not exists suggestion_ids uuid[] not null default '{}';

do $$ begin
  alter table public.resto_menu_items add constraint resto_menu_items_favori_creneaux_check
    check (favori_creneaux <@ array['matin','midi','soir']::text[]);
exception when duplicate_object then null; end $$;

-- ============ #8 Annulation de ligne avec motif obligatoire ============
-- Constat en écrivant cette migration : statut_ligne='annulee' existe déjà
-- dans le check constraint et est filtré partout en lecture (neq('annulee'))
-- mais RIEN ne l'écrit jamais aujourd'hui — aucun chemin frontend
-- n'annule une ligne de commande. C'est cette fonctionnalité elle-même
-- qu'on construit ici, pas juste un champ motif ajouté après coup.
alter table public.resto_order_items add column if not exists annulation_motif text;

-- Changement de signature (ajout de p_motif) — DROP explicite requis
-- (piège CLAUDE.md : CREATE OR REPLACE sur une signature différente crée
-- un overload orphelin plutôt que de remplacer).
drop function if exists public.mark_resto_order_item_statut(uuid, uuid, text);

-- 'annulee' reste réservé à resto_commandes.manage (owner/manager/server) —
-- comme 'servie', le cuisinier n'annule jamais une ligne lui-même, il la
-- marque seulement prête. Motif obligatoire non vide, contrôlé côté
-- serveur (pas seulement le frontend) — traçabilité pour le futur rapport
-- de gaspillage (Phase F).
create or replace function public.mark_resto_order_item_statut(
  p_organization_id uuid,
  p_item_id uuid,
  p_statut text,
  p_motif text default null
) returns public.resto_order_items
language plpgsql security definer set search_path = public as $$
declare
  v_allowed boolean;
  v_item public.resto_order_items;
begin
  if p_statut not in ('pret', 'servie', 'annulee') then
    raise exception 'Statut invalide.';
  end if;
  if p_statut = 'annulee' and (p_motif is null or btrim(p_motif) = '') then
    raise exception 'Un motif est obligatoire pour annuler une ligne.';
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

  update public.resto_order_items
    set statut_ligne = p_statut,
        annulation_motif = case when p_statut = 'annulee' then p_motif else annulation_motif end
    where id = p_item_id and organization_id = p_organization_id and statut_ligne <> 'annulee'
    returning * into v_item;
  if not found then raise exception 'Article de commande introuvable.'; end if;

  return v_item;
end;
$$;
revoke all on function public.mark_resto_order_item_statut(uuid, uuid, text, text) from public;
grant execute on function public.mark_resto_order_item_statut(uuid, uuid, text, text) to authenticated;
