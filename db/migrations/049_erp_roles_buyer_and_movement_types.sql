-- Migration 049 — ZegERP, étape préliminaire au module 2/10 (Achats &
-- Fournisseurs) : ajoute UNIQUEMENT les nouvelles valeurs d'enum requises
-- par ce module. Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 048, avant 050.
--
-- IMPORTANT — à exécuter SEULE, dans sa propre exécution, avant la
-- migration 050 : Postgres interdit d'utiliser une nouvelle valeur d'enum
-- dans la même transaction que celle qui l'a ajoutée (erreur "unsafe use
-- of new value of enum type"). Si le SQL Editor Supabase exécute tout le
-- collage en une seule transaction implicite, coller ce fichier seul,
-- valider, PUIS coller 050. Même précaution que 035_resto_roles.sql et
-- 020f_hotel_roles.sql.
--
-- 1. `buyer` (Acheteur) — rôle validé dans ARCHITECTURE_ERP.md, section
--    "Rôles ZegERP — validés". Couvre erp_suppliers/erp_purchase_requests/
--    erp_purchase_orders/erp_supplier_invoices/erp_supplier_returns.
alter type public.app_role add value if not exists 'buyer';

-- 2. Deux nouvelles valeurs de erp_stock_movement_type (enum créé par la
--    migration 048) : la réception de marchandises et le retour fournisseur
--    ont chacun leur propre type de mouvement plutôt que de réutiliser
--    'in'/'out' — traçabilité de l'origine du mouvement dans le ledger,
--    comme annoncé dans ARCHITECTURE_ERP.md section "Module 2".
alter type public.erp_stock_movement_type add value if not exists 'purchase_receipt';
alter type public.erp_stock_movement_type add value if not exists 'supplier_return';
