// Data layer ZegERP — module 2/10 : Achats & Fournisseurs (migrations
// 049+050). Fichier séparé de erpHooks.ts (module 1) — un fichier par
// module ZegERP pour rester "reviewable" vu le nombre de modules, décision
// prise au démarrage du chantier frontend (voir ARCHITECTURE_ERP.md).
// Mêmes conventions que erpHooks.ts (org-scoping, query keys, RPC pour
// tout ce qui a un invariant). Masquage de colonne : erp_purchase_order_
// lines porte unit_cost (sensible) — le rôle stock n'a pas de policy
// SELECT dessus, uniquement erp_purchase_order_lines_for_receiving() (RPC),
// utilisée ici par useErpPurchaseOrderLinesForReceiving().
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
export type ErpSupplier = {
  id: string; organization_id: string; name: string; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null; tax_id: string | null;
  notes: string | null; is_active: boolean; created_at: string;
};

export type ErpPurchaseRequestStatus = "draft" | "submitted" | "approved" | "rejected";
export type ErpPurchaseRequest = {
  id: string; organization_id: string; reference: string | null; status: ErpPurchaseRequestStatus;
  notes: string | null; created_at: string; submitted_at: string | null; reviewed_at: string | null;
};
export type ErpPurchaseRequestLine = {
  id: string; organization_id: string; request_id: string; product_id: string; quantity: number; notes: string | null;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpPurchaseOrderStatus = "draft" | "confirmed" | "partially_received" | "received" | "cancelled";
export type ErpPurchaseOrder = {
  id: string; organization_id: string; supplier_id: string; request_id: string | null; reference: string | null;
  status: ErpPurchaseOrderStatus; expected_date: string | null; notes: string | null; created_at: string; confirmed_at: string | null;
  erp_suppliers: { name: string } | null;
};
// unit_cost volontairement absent : stock n'y a pas accès (voir en-tête de
// fichier) — cette forme sert aux rôles autorisés (owner/manager/accountant/
// buyer), useErpPurchaseOrderLinesForReceiving() sert le rôle stock.
export type ErpPurchaseOrderLine = {
  id: string; organization_id: string; purchase_order_id: string; product_id: string;
  quantity: number; unit_cost: number; received_quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};
export type ErpPurchaseOrderLineForReceiving = { id: string; product_id: string; quantity: number; received_quantity: number };

export type ErpGoodsReceiptStatus = "draft" | "confirmed";
export type ErpGoodsReceipt = {
  id: string; organization_id: string; purchase_order_id: string; warehouse_id: string; reference: string | null;
  status: ErpGoodsReceiptStatus; notes: string | null; created_at: string; confirmed_at: string | null;
  erp_warehouses: { name: string } | null;
};
export type ErpGoodsReceiptLine = {
  id: string; organization_id: string; receipt_id: string; purchase_order_line_id: string; product_id: string; quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpSupplierInvoiceStatus = "unpaid" | "partially_paid" | "paid" | "disputed";
export type ErpSupplierInvoice = {
  id: string; organization_id: string; supplier_id: string; purchase_order_id: string | null;
  reference: string | null; amount: number; due_date: string | null; status: ErpSupplierInvoiceStatus;
  notes: string | null; created_at: string;
  erp_suppliers: { name: string } | null;
};

export type ErpSupplierReturnStatus = "draft" | "confirmed";
export type ErpSupplierReturn = {
  id: string; organization_id: string; supplier_id: string; warehouse_id: string; purchase_order_id: string | null;
  reference: string | null; status: ErpSupplierReturnStatus; reason: string | null; created_at: string; confirmed_at: string | null;
  erp_suppliers: { name: string } | null; erp_warehouses: { name: string } | null;
};
export type ErpSupplierReturnLine = {
  id: string; organization_id: string; return_id: string; product_id: string; quantity: number; unit_cost: number | null;
  erp_products: { name: string; sku: string | null } | null;
};

// ============ Fournisseurs ============
export function useErpSuppliers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_suppliers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSupplier[]> => {
      const { data, error } = await supabase.from("erp_suppliers").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpSupplier[];
    },
  });
}
export function useUpsertErpSupplier() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpSupplier> & { name: string }) => {
      const { data, error } = await supabase.from("erp_suppliers").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpSupplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_suppliers", organizationId] }),
  });
}
export function useDeleteErpSupplier() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_suppliers", organizationId] }),
  });
}

// ============ Demandes d'achat ============
export function useErpPurchaseRequests() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_purchase_requests", () => qc.invalidateQueries({ queryKey: ["erp_purchase_requests", organizationId] }));
  return useQuery({
    queryKey: ["erp_purchase_requests", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPurchaseRequest[]> => {
      const { data, error } = await supabase.from("erp_purchase_requests").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpPurchaseRequest[];
    },
  });
}
export function useErpPurchaseRequestLines(requestId: string | null) {
  return useQuery({
    queryKey: ["erp_purchase_request_lines", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<ErpPurchaseRequestLine[]> => {
      const { data, error } = await supabase.from("erp_purchase_request_lines").select("*, erp_products(name, sku)").eq("request_id", requestId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpPurchaseRequestLine[];
    },
  });
}
export function useUpsertErpPurchaseRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpPurchaseRequest>) => {
      const { data, error } = await supabase.from("erp_purchase_requests").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPurchaseRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_requests", organizationId] }),
  });
}
export function useUpsertErpPurchaseRequestLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpPurchaseRequestLine> & { request_id: string; product_id: string; quantity: number }) => {
      const { data, error } = await supabase.from("erp_purchase_request_lines").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPurchaseRequestLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_purchase_request_lines", vars.request_id] }),
  });
}
export function useDeleteErpPurchaseRequestLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; requestId: string }) => {
      const { error } = await supabase.from("erp_purchase_request_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_purchase_request_lines", vars.requestId] }),
  });
}
// Soumission (draft→submitted) et revue (submitted→approved/rejected) sont
// deux UPDATE directs distincts côté RLS (policies séparées, migration
// 050) — pas de RPC nécessaire (aucun mouvement de stock/cash associé).
export function useSubmitErpPurchaseRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_purchase_requests").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_requests", organizationId] }),
  });
}
export function useReviewErpPurchaseRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.from("erp_purchase_requests")
        .update({ status: approve ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_requests", organizationId] }),
  });
}

// ============ Commandes fournisseur ============
export function useErpPurchaseOrders() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_purchase_orders", () => qc.invalidateQueries({ queryKey: ["erp_purchase_orders", organizationId] }));
  return useQuery({
    queryKey: ["erp_purchase_orders", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPurchaseOrder[]> => {
      const { data, error } = await supabase.from("erp_purchase_orders")
        .select("*, erp_suppliers(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpPurchaseOrder[];
    },
  });
}
// Accès complet (avec unit_cost) — owner/manager/accountant/buyer. Le rôle
// stock utilise useErpPurchaseOrderLinesForReceiving() à la place.
export function useErpPurchaseOrderLines(orderId: string | null) {
  return useQuery({
    queryKey: ["erp_purchase_order_lines", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ErpPurchaseOrderLine[]> => {
      const { data, error } = await supabase.from("erp_purchase_order_lines").select("*, erp_products(name, sku)").eq("purchase_order_id", orderId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpPurchaseOrderLine[];
    },
  });
}
// Masquage de colonne : appelle erp_purchase_order_lines_for_receiving()
// (RPC security definer, migration 050) — jamais unit_cost, seule voie
// d'accès du rôle stock aux lignes de commande.
export function useErpPurchaseOrderLinesForReceiving(orderId: string | null) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_purchase_order_lines_for_receiving", orderId],
    enabled: !!orderId && !!organizationId,
    queryFn: async (): Promise<ErpPurchaseOrderLineForReceiving[]> => {
      const { data, error } = await supabase.rpc("erp_purchase_order_lines_for_receiving", { p_organization_id: organizationId, p_purchase_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as ErpPurchaseOrderLineForReceiving[];
    },
  });
}
export function useUpsertErpPurchaseOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpPurchaseOrder> & { supplier_id: string }) => {
      const { data, error } = await supabase.from("erp_purchase_orders").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPurchaseOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_orders", organizationId] }),
  });
}
export function useUpsertErpPurchaseOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpPurchaseOrderLine> & { purchase_order_id: string; product_id: string; quantity: number; unit_cost: number }) => {
      const { data, error } = await supabase.from("erp_purchase_order_lines").upsert(input).select().single();
      if (error) throw error;
      return data as ErpPurchaseOrderLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_purchase_order_lines", vars.purchase_order_id] }),
  });
}
export function useDeleteErpPurchaseOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; orderId: string }) => {
      const { error } = await supabase.from("erp_purchase_order_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_purchase_order_lines", vars.orderId] }),
  });
}
// Confirmation (draft→confirmed) : simple UPDATE direct, policy dédiée
// (migration 050) — aucun mouvement de stock à cette étape (seule la
// réception en crée). Annulation : idem, policy séparée.
export function useConfirmErpPurchaseOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_purchase_orders").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_orders", organizationId] }),
  });
}
export function useCancelErpPurchaseOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_purchase_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_purchase_orders", organizationId] }),
  });
}

// ============ Réceptions (rôle stock — jamais buyer directement) ============
export function useErpGoodsReceipts(orderId?: string) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_goods_receipts", () => qc.invalidateQueries({ queryKey: ["erp_goods_receipts", organizationId] }));
  return useQuery({
    queryKey: ["erp_goods_receipts", organizationId, orderId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpGoodsReceipt[]> => {
      let q = supabase.from("erp_goods_receipts").select("*, erp_warehouses(name)").eq("organization_id", organizationId!);
      if (orderId) q = q.eq("purchase_order_id", orderId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpGoodsReceipt[];
    },
  });
}
export function useErpGoodsReceiptLines(receiptId: string | null) {
  return useQuery({
    queryKey: ["erp_goods_receipt_lines", receiptId],
    enabled: !!receiptId,
    queryFn: async (): Promise<ErpGoodsReceiptLine[]> => {
      const { data, error } = await supabase.from("erp_goods_receipt_lines").select("*, erp_products(name, sku)").eq("receipt_id", receiptId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpGoodsReceiptLine[];
    },
  });
}
export function useUpsertErpGoodsReceipt() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpGoodsReceipt> & { purchase_order_id: string; warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_goods_receipts").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpGoodsReceipt;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_goods_receipts", organizationId] }),
  });
}
export function useUpsertErpGoodsReceiptLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receipt_id: string; purchase_order_line_id: string; product_id: string; quantity: number }) => {
      const { data, error } = await supabase.from("erp_goods_receipt_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpGoodsReceiptLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_goods_receipt_lines", vars.receipt_id] }),
  });
}
export function useDeleteErpGoodsReceiptLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; receiptId: string }) => {
      const { error } = await supabase.from("erp_goods_receipt_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_goods_receipt_lines", vars.receiptId] }),
  });
}
// confirm_erp_goods_receipt() (RPC security definer, migration 050) : crée
// les mouvements 'purchase_receipt', incrémente received_quantity, bloque
// le sur-réceptionnement — jamais d'écriture directe de `status`.
export function useConfirmErpGoodsReceipt() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_goods_receipt", { p_organization_id: organizationId, p_receipt_id: receiptId });
      if (error) throw error;
      return data as ErpGoodsReceipt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_goods_receipts", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_purchase_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}

// ============ Factures fournisseur ============
export function useErpSupplierInvoices() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_supplier_invoices", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSupplierInvoice[]> => {
      const { data, error } = await supabase.from("erp_supplier_invoices")
        .select("*, erp_suppliers(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpSupplierInvoice[];
    },
  });
}
export function useUpsertErpSupplierInvoice() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpSupplierInvoice> & { supplier_id: string; amount: number }) => {
      const { data, error } = await supabase.from("erp_supplier_invoices").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpSupplierInvoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_supplier_invoices", organizationId] }),
  });
}
export function useDeleteErpSupplierInvoice() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_supplier_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_supplier_invoices", organizationId] }),
  });
}

// ============ Retours fournisseur (porté par buyer, pas stock) ============
export function useErpSupplierReturns() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_supplier_returns", () => qc.invalidateQueries({ queryKey: ["erp_supplier_returns", organizationId] }));
  return useQuery({
    queryKey: ["erp_supplier_returns", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSupplierReturn[]> => {
      const { data, error } = await supabase.from("erp_supplier_returns")
        .select("*, erp_suppliers(name), erp_warehouses(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpSupplierReturn[];
    },
  });
}
export function useErpSupplierReturnLines(returnId: string | null) {
  return useQuery({
    queryKey: ["erp_supplier_return_lines", returnId],
    enabled: !!returnId,
    queryFn: async (): Promise<ErpSupplierReturnLine[]> => {
      const { data, error } = await supabase.from("erp_supplier_return_lines").select("*, erp_products(name, sku)").eq("return_id", returnId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpSupplierReturnLine[];
    },
  });
}
export function useUpsertErpSupplierReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpSupplierReturn> & { supplier_id: string; warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_supplier_returns").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpSupplierReturn;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_supplier_returns", organizationId] }),
  });
}
export function useUpsertErpSupplierReturnLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { return_id: string; product_id: string; quantity: number; unit_cost?: number }) => {
      const { data, error } = await supabase.from("erp_supplier_return_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpSupplierReturnLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_supplier_return_lines", vars.return_id] }),
  });
}
export function useDeleteErpSupplierReturnLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; returnId: string }) => {
      const { error } = await supabase.from("erp_supplier_return_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_supplier_return_lines", vars.returnId] }),
  });
}
// confirm_erp_supplier_return() (RPC security definer, migration 050) :
// crée les mouvements 'supplier_return' (sortie), jamais d'écriture directe
// de `status`.
export function useConfirmErpSupplierReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_supplier_return", { p_organization_id: organizationId, p_return_id: returnId });
      if (error) throw error;
      return data as ErpSupplierReturn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_supplier_returns", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}
