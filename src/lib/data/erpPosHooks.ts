// Data layer ZegERP — module 4/10 : POS ERP (migration 053). Aucun rôle ni
// enum nouveau : réutilise cashier et les types de mouvement sale/
// customer_return déjà posés par le module 3 — cohérent avec
// ARCHITECTURE_ERP.md. Isolé du POS ZegCaisse (sales/payments).
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

function useErpRealtimeInvalidate(table: string, onChange: () => void) {
  const organizationId = useOrganizationId();
  const instanceId = useId();
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`erp_${table}_${organizationId}_${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, table, instanceId]);
}

// ============ Types ============
export type ErpCashSessionStatus = "open" | "closed";
export type ErpCashSession = {
  id: string; organization_id: string; warehouse_id: string; status: ErpCashSessionStatus;
  opening_amount: number; closing_amount: number | null; notes: string | null;
  opened_at: string; closed_at: string | null;
  erp_warehouses: { name: string } | null;
};

export type ErpPosSaleStatus = "draft" | "completed" | "cancelled";
export type ErpPosSale = {
  id: string; organization_id: string; cash_session_id: string; customer_id: string | null;
  reference: string | null; status: ErpPosSaleStatus; payment_method: string;
  discount_amount: number; tax_amount: number; total_amount: number;
  created_at: string; completed_at: string | null;
};
export type ErpPosSaleLine = {
  id: string; organization_id: string; sale_id: string; product_id: string;
  quantity: number; unit_price: number; tax_rate: number; discount_amount: number; returned_quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpPosReturnStatus = "draft" | "confirmed";
export type ErpPosReturn = {
  id: string; organization_id: string; sale_id: string; cash_session_id: string;
  reason: string | null; status: ErpPosReturnStatus; created_at: string; confirmed_at: string | null;
};
export type ErpPosReturnLine = {
  id: string; organization_id: string; return_id: string; sale_line_id: string; product_id: string; quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};

// ============ Sessions de caisse ============
export function useErpCashSessions() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_cash_sessions", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCashSession[]> => {
      const { data, error } = await supabase.from("erp_cash_sessions").select("*, erp_warehouses(name)").eq("organization_id", organizationId!).order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpCashSession[];
    },
  });
}
export function useOpenErpCashSession() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { warehouse_id: string; opening_amount: number; notes?: string }) => {
      const { data, error } = await supabase.from("erp_cash_sessions").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCashSession;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_cash_sessions", organizationId] }),
  });
}
export function useCloseErpCashSession() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, closingAmount }: { id: string; closingAmount: number }) => {
      const { error } = await supabase.from("erp_cash_sessions")
        .update({ status: "closed", closing_amount: closingAmount, closed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_cash_sessions", organizationId] }),
  });
}

// ============ Ventes comptoir ============
export function useErpPosSales(sessionId?: string) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_pos_sales", () => qc.invalidateQueries({ queryKey: ["erp_pos_sales", organizationId] }));
  return useQuery({
    queryKey: ["erp_pos_sales", organizationId, sessionId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPosSale[]> => {
      let q = supabase.from("erp_pos_sales").select("*").eq("organization_id", organizationId!);
      if (sessionId) q = q.eq("cash_session_id", sessionId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpPosSale[];
    },
  });
}
export function useErpPosSaleLines(saleId: string | null) {
  return useQuery({
    queryKey: ["erp_pos_sale_lines", saleId],
    enabled: !!saleId,
    queryFn: async (): Promise<ErpPosSaleLine[]> => {
      const { data, error } = await supabase.from("erp_pos_sale_lines").select("*, erp_products(name, sku)").eq("sale_id", saleId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpPosSaleLine[];
    },
  });
}
export function useCreateErpPosSale() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cash_session_id: string; customer_id?: string; payment_method?: string; reference?: string }) => {
      const { data, error } = await supabase.from("erp_pos_sales").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPosSale;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_pos_sales", organizationId] }),
  });
}
export function useUpsertErpPosSaleLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sale_id: string; product_id: string; quantity: number; unit_price: number; tax_rate?: number; discount_amount?: number }) => {
      const { data, error } = await supabase.from("erp_pos_sale_lines").insert(input).select().single();
      if (error) throw error;
      return data as ErpPosSaleLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_pos_sale_lines", vars.sale_id] }),
  });
}
export function useDeleteErpPosSaleLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; saleId: string }) => {
      const { error } = await supabase.from("erp_pos_sale_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_pos_sale_lines", vars.saleId] }),
  });
}
export function useCancelErpPosSale() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_pos_sales").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_pos_sales", organizationId] }),
  });
}
// complete_erp_pos_sale() (RPC security definer, migration 053) : crée les
// mouvements 'sale', recalcule les totaux côté serveur (jamais fait
// confiance à une valeur envoyée par le client) — jamais d'écriture
// directe de `status`.
export function useCompleteErpPosSale() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { data, error } = await supabase.rpc("complete_erp_pos_sale", { p_organization_id: organizationId, p_sale_id: saleId });
      if (error) throw error;
      return data as ErpPosSale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_pos_sales", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}

// ============ Retours comptoir ============
export function useErpPosReturns() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_pos_returns", () => qc.invalidateQueries({ queryKey: ["erp_pos_returns", organizationId] }));
  return useQuery({
    queryKey: ["erp_pos_returns", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPosReturn[]> => {
      const { data, error } = await supabase.from("erp_pos_returns").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpPosReturn[];
    },
  });
}
export function useErpPosReturnLines(returnId: string | null) {
  return useQuery({
    queryKey: ["erp_pos_return_lines", returnId],
    enabled: !!returnId,
    queryFn: async (): Promise<ErpPosReturnLine[]> => {
      const { data, error } = await supabase.from("erp_pos_return_lines").select("*, erp_products(name, sku)").eq("return_id", returnId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpPosReturnLine[];
    },
  });
}
export function useCreateErpPosReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sale_id: string; cash_session_id: string; reason?: string }) => {
      const { data, error } = await supabase.from("erp_pos_returns").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPosReturn;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_pos_returns", organizationId] }),
  });
}
export function useUpsertErpPosReturnLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { return_id: string; sale_line_id: string; product_id: string; quantity: number }) => {
      const { data, error } = await supabase.from("erp_pos_return_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPosReturnLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_pos_return_lines", vars.return_id] }),
  });
}
export function useDeleteErpPosReturnLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; returnId: string }) => {
      const { error } = await supabase.from("erp_pos_return_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_pos_return_lines", vars.returnId] }),
  });
}
// confirm_erp_pos_return() (RPC security definer, migration 053) : crée un
// mouvement 'customer_return' par ligne, incrémente returned_quantity.
export function useConfirmErpPosReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_pos_return", { p_organization_id: organizationId, p_return_id: returnId });
      if (error) throw error;
      return data as ErpPosReturn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_pos_returns", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}
