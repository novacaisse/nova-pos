-- Migration 066 — Rôles personnalisés, Phase D-1 (ZegHotel) : catalogue de
-- modules + permissions par défaut, même mécanique que la migration 063
-- pour ZegCaisse. Ne change ENCORE aucun comportement (les policies
-- hotel_* elles-mêmes sont migrées vers has_module_permission() dans la
-- migration 067, dans la même phase). Présentée pour relecture — NE PAS
-- exécuter automatiquement. À exécuter après 063/064/065.
--
-- Découpage des modules ZegHotel — calqué 1-pour-1 sur les items de nav
-- (voir HIDDEN_FOR / NAV dans AppSidebar.tsx) plus deux modules internes
-- sans page dédiée (hotel_folios, hotel_payments — accessibles depuis le
-- détail d'une réservation/le check-out, jamais une page à part, mais
-- une granularité utile pour un rôle personnalisé type "Réceptionniste
-- limité" qui gère les réservations sans jamais toucher aux paiements).
insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('hotel_reservations', 'hotel', 'Réservations',     false, 1),
  ('hotel_folios',       'hotel', 'Notes de séjour',  false, 2),
  ('hotel_payments',     'hotel', 'Paiements séjour', false, 3),
  -- open_view : hotel_rooms_select/hotel_room_types_select sont ouverts à
  -- tout membre (has_organization_access seul, cf. migration 020g) —
  -- nécessaire au calendrier/à la réservation.
  ('hotel_rooms',        'hotel', 'Chambres',         true,  4),
  ('hotel_housekeeping', 'hotel', 'Housekeeping',     false, 5),
  -- open_view : hotel_maintenance_select couvre déjà TOUT le personnel
  -- hôtel (owner/manager/front_desk/housekeeping/accountant) — équivalent
  -- à "ouvert à tout membre" dans ce contexte (migration 030).
  ('hotel_maintenance',  'hotel', 'Maintenance',      true,  6),
  ('hotel_clients',      'hotel', 'Clients',          false, 7),
  ('hotel_corporate',    'hotel', 'Comptes entreprise', false, 8),
  ('hotel_pos_interne',  'hotel', 'Point de vente interne', false, 9),
  ('hotel_rapports',     'hotel', 'Rapports',         false, 10),
  ('hotel_canaux',       'hotel', 'Canaux de distribution', false, 11),
  -- open_view : hotel_settings_select/hotel_rate_plans_select/
  -- hotel_seasonal_rates_select/hotel_rate_restrictions_select sont tous
  -- ouverts à tout membre (has_organization_access seul).
  ('hotel_parametres',   'hotel', 'Paramètres',       true,  12)
on conflict (key) do nothing;

-- owner/manager : accès complet à tous les modules ZegHotel, sans
-- exception, comme aujourd'hui ("Owner et manager ont un accès équivalent
-- partout", commentaire de tête de la migration 020g).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'hotel'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- front_desk — reproduit fidèlement hotel_reservations_*/hotel_resv_rooms_*
-- (view+create+manage, sauf la suppression d'une réservation qui reste
-- codée en dur owner/manager en migration 067, comme aujourd'hui) ;
-- hotel_folios_write "for all" l'inclut en entier (manage) ; hotel_payments
-- l'inclut en insert seulement (jamais update/delete — intégrité
-- financière, commentaire migration 020i) ; hotel_rooms : lecture seule
-- (pas dans hotel_rooms_insert/update) ; hotel_housekeeping_tasks : insert
-- + update (pas delete, carve-out migration 067) ; hotel_maintenance : create
-- seulement (pas dans hotel_maintenance_update) ; hotel_guests "for all"
-- l'inclut en entier ; hotel_corporate_accounts : lecture seule ;
-- hotel_pos_interne (post_hotel_pos_charge) : le seul rôle non-owner/manager
-- autorisé ; hotel_rapports : visible (HIDDEN_FOR ne l'exclut pas) ;
-- hotel_canaux : aucun accès (hotel_channels_all = owner/manager seuls).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('front_desk', 'hotel_reservations', true, true, true),
  ('front_desk', 'hotel_folios', true, true, true),
  ('front_desk', 'hotel_payments', true, true, false),
  ('front_desk', 'hotel_housekeeping', true, true, true),
  ('front_desk', 'hotel_maintenance', true, true, false),
  ('front_desk', 'hotel_clients', true, true, true),
  ('front_desk', 'hotel_corporate', true, false, false),
  ('front_desk', 'hotel_pos_interne', true, true, false),
  ('front_desk', 'hotel_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- housekeeping — scopé "statuts chambres et tâches de nettoyage/incidents
-- uniquement" (commentaire migration 020g/030) : hotel_rooms_update
-- l'inclut (mise à jour du statut housekeeping, jamais insert/delete —
-- carve-out migration 067, pas via ce module) ; hotel_housekeeping_tasks :
-- lecture + mise à jour de ses tâches (jamais création ni suppression) ;
-- hotel_maintenance : lecture + création + mise à jour (housekeeping est
-- souvent la coordinatrice technicien, seule suppression exclue) ; rien
-- d'autre (aucun accès financier/client, cf. hotel_guests_select qui
-- l'exclut explicitement).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('housekeeping', 'hotel_housekeeping', true, false, true),
  ('housekeeping', 'hotel_maintenance', true, true, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- accountant — lecture financière/facturation seulement (jamais de
-- création/modification opérationnelle) : réservations/folios/paiements
-- en lecture (hotel_reservations_select/hotel_folios_select/
-- hotel_payments_select l'incluent tous les trois), comptes entreprise en
-- lecture, rapports visibles. hotel_guests l'exclut (identité restreinte,
-- accès uniquement via hotel_guest_contact() — migration 028, inchangé).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'hotel_reservations', true, false, false),
  ('accountant', 'hotel_folios', true, false, false),
  ('accountant', 'hotel_payments', true, false, false),
  ('accountant', 'hotel_corporate', true, false, false),
  ('accountant', 'hotel_maintenance', true, false, false),
  ('accountant', 'hotel_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;
