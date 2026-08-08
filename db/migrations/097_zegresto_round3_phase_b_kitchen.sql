-- Migration 097 — ZegResto Round 3, Phase B : Cuisine & production
-- (mission "47 fonctionnalités ZegResto", items #21 allergènes, #22 note
-- libre client, #23 priorisation manuelle de ticket). Les autres items de
-- la Phase B sont purement frontend :
--   #17 impression ticket thermique (mise en page imprimable, aucune
--       donnée nouvelle)
--   #18 routage KDS multi-poste (resto_menu_items.station existe déjà
--       depuis un chantier précédent, jamais exploité côté KDS jusqu'ici)
--   #19 estimation temps de préparation affichée au serveur
--       (resto_menu_items.temps_preparation_min existe déjà, affiché en
--       gestion de menu mais pas encore côté prise de commande)
--   #20 alerte rupture d'ingrédient (calculée côté client à partir de
--       resto_recipes/resto_recipe_ingredients/stock_levels déjà en place
--       — apply_stock_movement() bloque déjà l'ajout en dur si la recette
--       dépasse le stock, cette alerte est un signal proactif avant le
--       clic, pas une nouvelle règle serveur)
--   #24 historique temps réels vs estimés (dérivé de
--       resto_kitchen_tickets.created_at/ready_at déjà en place, croisé
--       avec temps_preparation_min)
--
-- Présentée pour relecture avant exécution (CLAUDE.md).

alter table public.resto_menu_items add column if not exists allergenes text[] not null default '{}';
alter table public.resto_order_items add column if not exists notes text;
alter table public.resto_kitchen_tickets add column if not exists priorite boolean not null default false;
