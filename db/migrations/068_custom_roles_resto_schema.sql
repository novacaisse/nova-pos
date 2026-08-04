-- Migration 068 — Rôles personnalisés, Phase D-2 (ZegResto) : catalogue de
-- modules + permissions par défaut, même mécanique que 063 (ZegCaisse) et
-- 066 (ZegHotel). Ne change ENCORE aucun comportement (la bascule RLS elle-
-- même est en migration 069, même phase). Présentée pour relecture — NE PAS
-- exécuter automatiquement. À exécuter après 066/067.
--
-- Découpage — calqué sur les items de nav ZegResto (Salle, Commandes,
-- Cuisine, Menu, Réservations, Rapports, Paramètres) plus des modules
-- internes sans page dédiée mais dont la granularité RLS diffère du reste
-- (recettes — lecture restreinte owner/manager/accountant ; facturation vs
-- paiements — server peut modifier une note mais jamais un paiement déjà
-- enregistré ; fidélité — server peut créer un compte mais pas le modifier).
--
-- open_view=true : les 5 policies select des tables concernées listent déjà
-- littéralement TOUS les rôles qui peuvent exister dans une organisation
-- ZegResto (owner/manager/accountant/server/cook) — équivalent en pratique à
-- "ouvert à tout membre", même traitement que produits/stock côté ZegCaisse.
insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('resto_salle',        'resto', 'Salle',                true,  1),
  ('resto_commandes',    'resto', 'Commandes',            true,  2),
  ('resto_cuisine',      'resto', 'Cuisine (KDS)',        true,  3),
  ('resto_menu',         'resto', 'Menu',                 true,  4),
  ('resto_recettes',     'resto', 'Recettes',             false, 5),
  ('resto_reservations', 'resto', 'Réservations',         false, 6),
  ('resto_facturation',  'resto', 'Facturation',          false, 7),
  ('resto_paiements',    'resto', 'Paiements',            false, 8),
  ('resto_fidelite',     'resto', 'Fidélité',             false, 9),
  ('resto_rapports',     'resto', 'Rapports',             false, 10),
  ('resto_parametres',   'resto', 'Paramètres',           true,  11)
on conflict (key) do nothing;

-- owner/manager : accès complet à tous les modules ZegResto.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'resto'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- accountant — lecture seule partout où il apparaît (jamais dans une
-- policy insert/update/delete ZegResto) : recettes (coûts), réservations,
-- facturation, paiements, fidélité, rapports. Salle/Commandes/Cuisine/Menu/
-- Paramètres déjà couverts par open_view.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'resto_recettes', true, false, false),
  ('accountant', 'resto_reservations', true, false, false),
  ('accountant', 'resto_facturation', true, false, false),
  ('accountant', 'resto_paiements', true, false, false),
  ('accountant', 'resto_fidelite', true, false, false),
  ('accountant', 'resto_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- server — reproduit resto_orders_insert/update (create+manage), send_resto_course()/
-- add_resto_order_item() (owner,manager,server) ; hotel_kitchen... non, resto_kitchen_tickets_insert/update
-- exclut server (aucun droit sur resto_cuisine) ; resto_reservations_insert/update
-- l'inclut (create+manage, suppression en carve-out migration 069) ;
-- resto_bills_insert/update + resto_bill_splits_write l'incluent (create+manage
-- sur resto_facturation, suppression en carve-out) ; resto_bill_payments
-- reste owner/manager en update (server : create seulement, via
-- add_resto_bill_payment()) ; resto_loyalty_accounts_insert l'inclut (create,
-- avec points_balance=0 forcé, préservé en migration 069) mais pas l'update
-- (owner/manager seuls) ; aucun droit sur resto_recettes/resto_rapports
-- (absent de leurs policies select).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('server', 'resto_commandes', true, true, true),
  ('server', 'resto_reservations', true, true, true),
  ('server', 'resto_facturation', true, true, true),
  ('server', 'resto_paiements', true, true, false),
  ('server', 'resto_fidelite', true, true, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- cook — scopé KDS uniquement (mark_resto_order_item_statut() côté 'pret'
-- passe par resto_cuisine.manage, voir migration 069) : resto_kitchen_tickets_update
-- l'inclut (manage, suppression en carve-out) ; aucune création directe de
-- ticket (kitchen_tickets_insert = owner/manager seuls, les tickets naissent
-- via send_resto_course()) ; aucun droit sur commandes/réservations/
-- facturation/paiements/fidélité/recettes/rapports (absent de toutes leurs
-- policies select respectives, sauf commandes qui reste en lecture via
-- open_view).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cook', 'resto_cuisine', true, false, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;
