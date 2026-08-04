-- Migration 070 — Rôles personnalisés, Phase D-3 (ZegERP) : catalogue de
-- modules + permissions par défaut, même mécanique que 063/066/068. Ne
-- change ENCORE aucun comportement (la bascule RLS elle-même est en
-- migration 071, même phase). Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 068/069.
--
-- Découpage — plus fin que les 10 nav "pages" ZegERP, parce que plusieurs
-- pages regroupent des tables aux permissions réellement différentes
-- (Achats mélange buyer et stock avec des périmètres disjoints ;
-- Ventes mélange salesperson et stock de la même façon) — voir
-- ARCHITECTURE_ERP.md. 15 modules :
--   erp_produits, erp_stock : module 1 (Stock/Produits)
--   erp_achats, erp_factures_fournisseurs, erp_receptions : module 2 (Achats)
--   erp_ventes, erp_facturation_ventes, erp_retours_clients : module 3 (Ventes)
--   erp_pos : module 4
--   erp_finance : module 5
--   erp_comptabilite : module 6
--   erp_rh : module 7
--   erp_documents : module 8
--   erp_rapports : module 9 (nav uniquement — erp_custom_reports reste
--     scopé created_by = auth.uid(), jamais touché par ce système)
--   erp_parametres : module 10
insert into public.permission_modules (key, app_module, label, open_view, sort_order) values
  ('erp_produits',              'erp', 'Produits',                true,  1),
  ('erp_stock',                 'erp', 'Stock',                   false, 2),
  ('erp_achats',                'erp', 'Achats',                  false, 3),
  ('erp_factures_fournisseurs', 'erp', 'Factures fournisseurs',   false, 4),
  ('erp_receptions',            'erp', 'Réceptions',              false, 5),
  ('erp_ventes',                'erp', 'Ventes & CRM',            false, 6),
  ('erp_facturation_ventes',    'erp', 'Facturation client',      false, 7),
  ('erp_retours_clients',       'erp', 'Retours client',          false, 8),
  ('erp_pos',                   'erp', 'POS ERP',                 false, 9),
  ('erp_finance',                'erp', 'Finance',                 false, 10),
  ('erp_comptabilite',          'erp', 'Comptabilité',            false, 11),
  ('erp_rh',                    'erp', 'RH',                      false, 12),
  ('erp_documents',             'erp', 'Gestion documentaire',    false, 13),
  ('erp_rapports',              'erp', 'Rapports & BI',           false, 14),
  ('erp_parametres',            'erp', 'Paramètres',              false, 15)
on conflict (key) do nothing;

-- owner/manager : accès complet à tous les modules ZegERP.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage)
select r::public.app_role, m.key, true, true, true
from unnest(array['owner','manager']) r, public.permission_modules m
where m.app_module = 'erp'
on conflict (role, module_key) do update set can_view = true, can_create = true, can_manage = true;

-- stock — erp_product_categories/erp_brands/erp_units/erp_products/
-- erp_warehouses "for all" l'incluent (erp_produits/erp_stock complets) ;
-- transferts/inventaires/mouvements idem (erp_stock) ; réceptions
-- exclusivement stock côté écriture (erp_receptions) ; retours client
-- portés par stock, pas salesperson (erp_retours_clients, symétrique de
-- erp_receptions). Accès à erp_suppliers/erp_purchase_orders (lecture
-- seule, jamais l'écriture) préservé en carve-out direct sur les policies
-- (migration 071), PAS via ce module — erp_purchase_order_lines masque
-- délibérément stock (unit_cost sensible, cf. ARCHITECTURE_ERP.md) et
-- erp_supplier_returns ne l'inclut jamais, donc erp_achats.view reste le
-- domaine propre de buyer, sans stock dedans.
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('stock', 'erp_produits', true, true, true),
  ('stock', 'erp_stock', true, true, true),
  ('stock', 'erp_receptions', true, true, true),
  ('stock', 'erp_retours_clients', true, true, true),
  ('stock', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- buyer — fournisseurs/commandes/retours fournisseur (erp_achats) ;
-- factures fournisseur, y compris l'écriture (erp_factures_fournisseurs,
-- élargi à buyer comme à accountant dans la policy d'origine) ; aucun accès
-- réceptions (rôle stock exclusivement).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('buyer', 'erp_achats', true, true, true),
  ('buyer', 'erp_factures_fournisseurs', true, true, true),
  ('buyer', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- salesperson — clients/pipeline(lecture seule, écriture réservée owner/
-- manager)/prospects/devis/commandes/livraisons/CRM (erp_ventes) ; factures/
-- avoirs/encaissements, y compris l'écriture (erp_facturation_ventes,
-- élargi à salesperson comme à accountant) ; aucun accès retours client
-- (rôle stock exclusivement, symétrique des réceptions côté achats).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('salesperson', 'erp_ventes', true, true, true),
  ('salesperson', 'erp_facturation_ventes', true, true, true),
  ('salesperson', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- hr_manager — périmètre strictement resserré (données personnelles
-- sensibles) : rien hors erp_rh, y compris les rapports (aucune des 4 vues
-- ne couvre un domaine RH, cf. ARCHITECTURE_ERP.md).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('hr_manager', 'erp_rh', true, true, true)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- cashier — POS ERP exclusivement (réutilisé tel quel, comme côté
-- ZegCaisse), plus le domaine Ventes des rapports (canal POS).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('cashier', 'erp_pos', true, true, true),
  ('cashier', 'erp_rapports', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;

-- accountant — lecture large sur tout le périmètre financier/opérationnel,
-- écriture élargie là où la policy d'origine l'incluait explicitement
-- (factures fournisseur/client, avoirs, encaissements, Finance,
-- Comptabilité, Gestion documentaire — erp_contracts "for all" l'inclut).
insert into public.default_role_permissions (role, module_key, can_view, can_create, can_manage) values
  ('accountant', 'erp_stock', true, false, false),
  ('accountant', 'erp_achats', true, false, false),
  ('accountant', 'erp_factures_fournisseurs', true, true, true),
  ('accountant', 'erp_receptions', true, false, false),
  ('accountant', 'erp_ventes', true, false, false),
  ('accountant', 'erp_facturation_ventes', true, true, true),
  ('accountant', 'erp_retours_clients', true, false, false),
  ('accountant', 'erp_pos', true, false, false),
  ('accountant', 'erp_finance', true, true, true),
  ('accountant', 'erp_comptabilite', true, true, true),
  ('accountant', 'erp_documents', true, true, true),
  ('accountant', 'erp_rapports', true, false, false),
  ('accountant', 'erp_parametres', true, false, false)
on conflict (role, module_key) do update set can_view = excluded.can_view, can_create = excluded.can_create, can_manage = excluded.can_manage;
