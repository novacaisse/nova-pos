-- Migration 059 — ZegERP, module 9/10 : Rapports & BI. Présentée pour
-- relecture — NE PAS exécuter automatiquement. À exécuter après 058.
--
-- Aucun rôle nouveau, aucune nouvelle table de données métier — quatre
-- vues SQL agrégées (une par domaine : stock, achats, ventes, finance),
-- comme annoncé dans ARCHITECTURE_ERP.md. Une vue Postgres standard (pas
-- `security definer`, pas `security_barrier`) n'a AUCUNE RLS propre : elle
-- exécute sa requête avec les droits de l'utilisateur appelant, donc elle
-- hérite automatiquement de la RLS des tables sous-jacentes qu'elle
-- interroge — un `salesperson` qui sélectionne erp_v_sales_summary ne voit
-- que ce que la RLS de erp_sales_orders/erp_pos_sales lui permettrait déjà
-- de voir directement, sans fuite de périmètre et sans policy dédiée à
-- écrire ici.

-- =============== erp_v_stock_valuation (domaine stock) ===============
create or replace view public.erp_v_stock_valuation as
select
  sl.organization_id,
  sl.product_id,
  p.name as product_name,
  sl.warehouse_id,
  w.name as warehouse_name,
  sl.quantity,
  p.cost,
  sl.quantity * p.cost as valuation
from public.erp_stock_levels sl
join public.erp_products p on p.id = sl.product_id
join public.erp_warehouses w on w.id = sl.warehouse_id;

-- =============== erp_v_purchase_orders_summary (domaine achats) ===============
create or replace view public.erp_v_purchase_orders_summary as
select
  o.organization_id,
  o.id as purchase_order_id,
  o.supplier_id,
  s.name as supplier_name,
  o.reference,
  o.status,
  o.created_at,
  coalesce(sum(l.quantity * l.unit_cost), 0) as total_amount,
  coalesce(sum(l.received_quantity * l.unit_cost), 0) as received_amount
from public.erp_purchase_orders o
join public.erp_suppliers s on s.id = o.supplier_id
left join public.erp_purchase_order_lines l on l.purchase_order_id = o.id
group by o.organization_id, o.id, o.supplier_id, s.name, o.reference, o.status, o.created_at;

-- =============== erp_v_sales_summary (domaine ventes — unifie commandes
-- client et ventes comptoir, `channel` distingue l'origine) ===============
create or replace view public.erp_v_sales_summary as
select
  o.organization_id,
  'sales_order'::text as channel,
  o.id as sale_id,
  o.customer_id,
  c.name as customer_name,
  o.reference,
  o.status,
  o.created_at,
  coalesce(sum(l.quantity * l.unit_price), 0) as total_amount
from public.erp_sales_orders o
join public.erp_customers c on c.id = o.customer_id
left join public.erp_sales_order_lines l on l.sales_order_id = o.id
group by o.organization_id, o.id, o.customer_id, c.name, o.reference, o.status, o.created_at
union all
select
  s.organization_id,
  'pos'::text as channel,
  s.id as sale_id,
  s.customer_id,
  c.name as customer_name,
  s.reference,
  s.status,
  s.created_at,
  s.total_amount
from public.erp_pos_sales s
left join public.erp_customers c on c.id = s.customer_id;

-- =============== erp_v_cash_position (domaine finance) ===============
create or replace view public.erp_v_cash_position as
select
  a.organization_id,
  a.id as cash_account_id,
  a.name,
  a.type,
  coalesce(b.balance, 0) as balance
from public.erp_cash_accounts a
left join public.erp_cash_account_balances b on b.cash_account_id = a.id;

-- =============== erp_custom_reports (seule vraie table de ce module —
-- configuration de rapport sauvegardée, privée à son auteur : scopée par
-- organization_id ET created_by = auth.uid(), jamais partagée
-- automatiquement entre collègues, comme demandé) ===============
create table if not exists public.erp_custom_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_erp_custom_reports_org on public.erp_custom_reports(organization_id);
create index if not exists idx_erp_custom_reports_author on public.erp_custom_reports(created_by);
alter table public.erp_custom_reports enable row level security;

-- Pas de restriction par rôle métier au-delà de l'appartenance à
-- l'organisation : la confidentialité vient de created_by = auth.uid(),
-- pas d'un rôle particulier — n'importe quel membre peut sauvegarder ses
-- propres vues de rapport.
create policy erp_custom_reports_select on public.erp_custom_reports for select to authenticated
  using (public.has_organization_access(organization_id) and created_by = auth.uid());
create policy erp_custom_reports_write on public.erp_custom_reports for all to authenticated
  using (public.has_organization_access(organization_id) and created_by = auth.uid())
  with check (public.has_organization_access(organization_id) and created_by = auth.uid());
