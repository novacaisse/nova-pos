// Data layer ZegERP — module 9/10 : Rapports & BI (migration 059).
// Quatre vues SQL agrégées (stock/achats/ventes/finance) — aucune RLS
// propre nécessaire côté vue : une vue Postgres standard hérite
// automatiquement de la RLS des tables qu'elle interroge, donc ces hooks
// ne font qu'exposer des SELECT en lecture seule, la restriction réelle
// vient des policies déjà écrites sur erp_stock_levels/erp_purchase_orders/
// erp_sales_orders/erp_pos_sales/erp_cash_accounts. erp_custom_reports est
// la seule vraie table : privée à son auteur (organization_id ET
// created_by = auth.uid()), jamais partagée automatiquement entre collègues.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

// ============ Types ============
export type ErpStockValuationRow = {
  organization_id: string; product_id: string; product_name: string;
  warehouse_id: string; warehouse_name: string; quantity: number; cost: number; valuation: number;
};
export type ErpPurchaseOrdersSummaryRow = {
  organization_id: string; purchase_order_id: string; supplier_id: string; supplier_name: string;
  reference: string | null; status: string; created_at: string; total_amount: number; received_amount: number;
};
export type ErpSalesSummaryRow = {
  organization_id: string; channel: "sales_order" | "pos"; sale_id: string; customer_id: string | null;
  customer_name: string | null; reference: string | null; status: string; created_at: string; total_amount: number;
};
export type ErpCashPositionRow = {
  organization_id: string; cash_account_id: string; name: string; type: string; balance: number;
};
export type ErpCustomReportType = "stock_valuation" | "purchases" | "sales" | "cash_position";
export type ErpCustomReport = {
  id: string; organization_id: string; created_by: string; name: string; description: string | null;
  config: { report_type?: ErpCustomReportType }; created_at: string; updated_at: string;
};

// ============ Rapports (vues, lecture seule) ============
export function useErpStockValuationReport() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_v_stock_valuation", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpStockValuationRow[]> => {
      const { data, error } = await supabase.from("erp_v_stock_valuation").select("*").eq("organization_id", organizationId!).order("valuation", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpStockValuationRow[];
    },
  });
}
export function useErpPurchaseOrdersSummaryReport() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_v_purchase_orders_summary", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPurchaseOrdersSummaryRow[]> => {
      const { data, error } = await supabase.from("erp_v_purchase_orders_summary").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpPurchaseOrdersSummaryRow[];
    },
  });
}
export function useErpSalesSummaryReport() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_v_sales_summary", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSalesSummaryRow[]> => {
      const { data, error } = await supabase.from("erp_v_sales_summary").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpSalesSummaryRow[];
    },
  });
}
export function useErpCashPositionReport() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_v_cash_position", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCashPositionRow[]> => {
      const { data, error } = await supabase.from("erp_v_cash_position").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpCashPositionRow[];
    },
  });
}

// ============ Rapports personnalisés (favoris privés) ============
export function useErpCustomReports() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_custom_reports", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCustomReport[]> => {
      const { data, error } = await supabase.from("erp_custom_reports").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpCustomReport[];
    },
  });
}
export function useUpsertErpCustomReport() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; description?: string | null; report_type: ErpCustomReportType }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("erp_custom_reports").upsert({
        id: input.id, organization_id: organizationId, created_by: userData.user?.id,
        name: input.name, description: input.description ?? null, config: { report_type: input.report_type },
      }).select().single();
      if (error) throw error;
      return data as ErpCustomReport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_custom_reports", organizationId] }),
  });
}
export function useDeleteErpCustomReport() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_custom_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_custom_reports", organizationId] }),
  });
}
