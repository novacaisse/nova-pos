-- Migration 051 — ZegERP, étape préliminaire au module 3/10 (Ventes &
-- CRM) : ajoute UNIQUEMENT les nouvelles valeurs d'enum requises par ce
-- module. Présentée pour relecture — NE PAS exécuter automatiquement. À
-- exécuter après 050, avant 052.
--
-- IMPORTANT — à exécuter SEULE, dans sa propre exécution, avant la
-- migration 052 : même précaution que 049/035/020f (Postgres interdit
-- d'utiliser une nouvelle valeur d'enum dans la même transaction que celle
-- qui l'a ajoutée).
--
-- 1. `salesperson` (Commercial) — rôle validé dans ARCHITECTURE_ERP.md,
--    section "Rôles ZegERP — validés". Couvre erp_customers/erp_prospects/
--    erp_quotes/erp_sales_orders/erp_delivery_notes/erp_invoices (création)
--    /erp_crm_activities. Strictement cloisonné de `buyer` (validé, aucun
--    chevauchement de lecture avec les données d'achat/coûts fournisseur).
alter type public.app_role add value if not exists 'salesperson';

-- 2. Deux nouvelles valeurs de erp_stock_movement_type : la livraison
--    client et le retour client ont chacun leur propre type plutôt que de
--    réutiliser 'out'/'in' — même raison de traçabilité que
--    purchase_receipt/supplier_return (migration 049).
alter type public.erp_stock_movement_type add value if not exists 'sale';
alter type public.erp_stock_movement_type add value if not exists 'customer_return';
