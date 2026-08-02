// Data layer ZegERP — module 3/10 : Ventes & CRM (migrations 051+052).
// Frontend Phase 3a : cycle de vente central seulement (clients, devis,
// commandes, livraisons, factures, retours) — pipeline prospects/avoirs/
// encaissements/activités CRM suivent en Phase 3b, même logique
// incrémentale que le reste de ce chantier. Cloisonnement strict
// salesperson/buyer déjà en place côté RLS (migration 052) ; à la
// différence du module 2, la livraison est portée par salesperson (pas
// stock) — même rôle gère commande et livraison ici.
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
export type ErpCustomer = {
  id: string; organization_id: string; name: string; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null; tax_id: string | null;
  notes: string | null; is_active: boolean; created_at: string;
};

export type ErpQuoteStatus = "draft" | "sent" | "accepted" | "refused" | "expired" | "converted";
export type ErpQuote = {
  id: string; organization_id: string; customer_id: string; reference: string | null;
  status: ErpQuoteStatus; valid_until: string | null; notes: string | null; created_at: string; sent_at: string | null;
  erp_customers: { name: string } | null;
};
export type ErpQuoteLine = {
  id: string; organization_id: string; quote_id: string; product_id: string; quantity: number; unit_price: number; tax_rate: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpSalesOrderStatus = "draft" | "confirmed" | "partially_delivered" | "delivered" | "cancelled";
export type ErpSalesOrder = {
  id: string; organization_id: string; customer_id: string; quote_id: string | null; reference: string | null;
  status: ErpSalesOrderStatus; expected_date: string | null; notes: string | null; created_at: string; confirmed_at: string | null;
  erp_customers: { name: string } | null;
};
export type ErpSalesOrderLine = {
  id: string; organization_id: string; sales_order_id: string; product_id: string;
  quantity: number; unit_price: number; tax_rate: number; delivered_quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpDeliveryNoteStatus = "draft" | "confirmed";
export type ErpDeliveryNote = {
  id: string; organization_id: string; sales_order_id: string; warehouse_id: string; reference: string | null;
  status: ErpDeliveryNoteStatus; notes: string | null; created_at: string; confirmed_at: string | null;
  erp_warehouses: { name: string } | null;
};
export type ErpDeliveryNoteLine = {
  id: string; organization_id: string; delivery_note_id: string; sales_order_line_id: string; product_id: string; quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpInvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";
export type ErpInvoice = {
  id: string; organization_id: string; customer_id: string; sales_order_id: string | null; reference: string | null;
  status: ErpInvoiceStatus; issue_date: string; due_date: string | null; notes: string | null; created_at: string;
  erp_customers: { name: string } | null;
};
export type ErpInvoiceLine = {
  id: string; organization_id: string; invoice_id: string; product_id: string; quantity: number; unit_price: number; tax_rate: number;
  erp_products: { name: string; sku: string | null } | null;
};

export type ErpCustomerReturnStatus = "draft" | "confirmed";
export type ErpCustomerReturn = {
  id: string; organization_id: string; customer_id: string; warehouse_id: string; sales_order_id: string | null;
  reference: string | null; status: ErpCustomerReturnStatus; reason: string | null; created_at: string; confirmed_at: string | null;
  erp_customers: { name: string } | null; erp_warehouses: { name: string } | null;
};
export type ErpCustomerReturnLine = {
  id: string; organization_id: string; return_id: string; product_id: string; quantity: number; unit_cost: number | null;
  erp_products: { name: string; sku: string | null } | null;
};

// ============ Clients ============
export function useErpCustomers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_customers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCustomer[]> => {
      const { data, error } = await supabase.from("erp_customers").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpCustomer[];
    },
  });
}
export function useUpsertErpCustomer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpCustomer> & { name: string }) => {
      const { data, error } = await supabase.from("erp_customers").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCustomer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_customers", organizationId] }),
  });
}
export function useDeleteErpCustomer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_customers", organizationId] }),
  });
}

// ============ Devis ============
export function useErpQuotes() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_quotes", () => qc.invalidateQueries({ queryKey: ["erp_quotes", organizationId] }));
  return useQuery({
    queryKey: ["erp_quotes", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpQuote[]> => {
      const { data, error } = await supabase.from("erp_quotes").select("*, erp_customers(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpQuote[];
    },
  });
}
export function useErpQuoteLines(quoteId: string | null) {
  return useQuery({
    queryKey: ["erp_quote_lines", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<ErpQuoteLine[]> => {
      const { data, error } = await supabase.from("erp_quote_lines").select("*, erp_products(name, sku)").eq("quote_id", quoteId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpQuoteLine[];
    },
  });
}
export function useUpsertErpQuote() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpQuote> & { customer_id: string }) => {
      const { data, error } = await supabase.from("erp_quotes").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpQuote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_quotes", organizationId] }),
  });
}
export function useUpsertErpQuoteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { quote_id: string; product_id: string; quantity: number; unit_price: number; tax_rate?: number }) => {
      const { data, error } = await supabase.from("erp_quote_lines").insert(input).select().single();
      if (error) throw error;
      return data as ErpQuoteLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_quote_lines", vars.quote_id] }),
  });
}
export function useDeleteErpQuoteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; quoteId: string }) => {
      const { error } = await supabase.from("erp_quote_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_quote_lines", vars.quoteId] }),
  });
}
// draft→sent et sent→accepted/refused/expired sont deux UPDATE directs
// distincts (policies séparées, migration 052) — aucun mouvement de stock
// à ce stade, pas de RPC nécessaire.
export function useSendErpQuote() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_quotes", organizationId] }),
  });
}
export function useResolveErpQuote() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "accepted" | "refused" | "expired" }) => {
      const { error } = await supabase.from("erp_quotes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_quotes", organizationId] }),
  });
}

// ============ Commandes client ============
export function useErpSalesOrders() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_sales_orders", () => qc.invalidateQueries({ queryKey: ["erp_sales_orders", organizationId] }));
  return useQuery({
    queryKey: ["erp_sales_orders", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSalesOrder[]> => {
      const { data, error } = await supabase.from("erp_sales_orders").select("*, erp_customers(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpSalesOrder[];
    },
  });
}
export function useErpSalesOrderLines(orderId: string | null) {
  return useQuery({
    queryKey: ["erp_sales_order_lines", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ErpSalesOrderLine[]> => {
      const { data, error } = await supabase.from("erp_sales_order_lines").select("*, erp_products(name, sku)").eq("sales_order_id", orderId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpSalesOrderLine[];
    },
  });
}
export function useUpsertErpSalesOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpSalesOrder> & { customer_id: string }) => {
      const { data, error } = await supabase.from("erp_sales_orders").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpSalesOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_sales_orders", organizationId] }),
  });
}
export function useUpsertErpSalesOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sales_order_id: string; product_id: string; quantity: number; unit_price: number; tax_rate?: number }) => {
      const { data, error } = await supabase.from("erp_sales_order_lines").insert(input).select().single();
      if (error) throw error;
      return data as ErpSalesOrderLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_sales_order_lines", vars.sales_order_id] }),
  });
}
export function useDeleteErpSalesOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; orderId: string }) => {
      const { error } = await supabase.from("erp_sales_order_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_sales_order_lines", vars.orderId] }),
  });
}
export function useConfirmErpSalesOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_sales_orders").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_sales_orders", organizationId] }),
  });
}
export function useCancelErpSalesOrder() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_sales_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_sales_orders", organizationId] }),
  });
}

// ============ Livraisons (portée par salesperson, pas stock — asymétrie
// assumée vs module 2, voir ARCHITECTURE_ERP.md) ============
export function useErpDeliveryNotes(orderId?: string) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_delivery_notes", () => qc.invalidateQueries({ queryKey: ["erp_delivery_notes", organizationId] }));
  return useQuery({
    queryKey: ["erp_delivery_notes", organizationId, orderId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpDeliveryNote[]> => {
      let q = supabase.from("erp_delivery_notes").select("*, erp_warehouses(name)").eq("organization_id", organizationId!);
      if (orderId) q = q.eq("sales_order_id", orderId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpDeliveryNote[];
    },
  });
}
export function useErpDeliveryNoteLines(deliveryId: string | null) {
  return useQuery({
    queryKey: ["erp_delivery_note_lines", deliveryId],
    enabled: !!deliveryId,
    queryFn: async (): Promise<ErpDeliveryNoteLine[]> => {
      const { data, error } = await supabase.from("erp_delivery_note_lines").select("*, erp_products(name, sku)").eq("delivery_note_id", deliveryId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpDeliveryNoteLine[];
    },
  });
}
export function useUpsertErpDeliveryNote() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpDeliveryNote> & { sales_order_id: string; warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_delivery_notes").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpDeliveryNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_delivery_notes", organizationId] }),
  });
}
export function useUpsertErpDeliveryNoteLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { delivery_note_id: string; sales_order_line_id: string; product_id: string; quantity: number }) => {
      const { data, error } = await supabase.from("erp_delivery_note_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpDeliveryNoteLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_delivery_note_lines", vars.delivery_note_id] }),
  });
}
export function useDeleteErpDeliveryNoteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; deliveryId: string }) => {
      const { error } = await supabase.from("erp_delivery_note_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_delivery_note_lines", vars.deliveryId] }),
  });
}
// confirm_erp_delivery() (RPC security definer, migration 052) : crée les
// mouvements 'sale', incrémente delivered_quantity, recalcule le statut de
// la commande — jamais d'écriture directe de `status`.
export function useConfirmErpDelivery() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_delivery", { p_organization_id: organizationId, p_delivery_note_id: deliveryId });
      if (error) throw error;
      return data as ErpDeliveryNote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_delivery_notes", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_sales_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}

// ============ Factures client ============
export function useErpInvoices() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_invoices", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpInvoice[]> => {
      const { data, error } = await supabase.from("erp_invoices").select("*, erp_customers(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpInvoice[];
    },
  });
}
export function useErpInvoiceLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["erp_invoice_lines", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<ErpInvoiceLine[]> => {
      const { data, error } = await supabase.from("erp_invoice_lines").select("*, erp_products(name, sku)").eq("invoice_id", invoiceId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpInvoiceLine[];
    },
  });
}
export function useUpsertErpInvoice() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpInvoice> & { customer_id: string }) => {
      const { data, error } = await supabase.from("erp_invoices").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpInvoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_invoices", organizationId] }),
  });
}
export function useUpsertErpInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { invoice_id: string; product_id: string; quantity: number; unit_price: number; tax_rate?: number }) => {
      const { data, error } = await supabase.from("erp_invoice_lines").insert(input).select().single();
      if (error) throw error;
      return data as ErpInvoiceLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_invoice_lines", vars.invoice_id] }),
  });
}
export function useDeleteErpInvoiceLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; invoiceId: string }) => {
      const { error } = await supabase.from("erp_invoice_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_invoice_lines", vars.invoiceId] }),
  });
}
export function useDeleteErpInvoice() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_invoices", organizationId] }),
  });
}

// ============ Retours client (portée par stock, pas salesperson —
// symétrique de erp_goods_receipts, module 2) ============
export function useErpCustomerReturns() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_customer_returns", () => qc.invalidateQueries({ queryKey: ["erp_customer_returns", organizationId] }));
  return useQuery({
    queryKey: ["erp_customer_returns", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCustomerReturn[]> => {
      const { data, error } = await supabase.from("erp_customer_returns")
        .select("*, erp_customers(name), erp_warehouses(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpCustomerReturn[];
    },
  });
}
export function useErpCustomerReturnLines(returnId: string | null) {
  return useQuery({
    queryKey: ["erp_customer_return_lines", returnId],
    enabled: !!returnId,
    queryFn: async (): Promise<ErpCustomerReturnLine[]> => {
      const { data, error } = await supabase.from("erp_customer_return_lines").select("*, erp_products(name, sku)").eq("return_id", returnId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpCustomerReturnLine[];
    },
  });
}
export function useUpsertErpCustomerReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpCustomerReturn> & { customer_id: string; warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_customer_returns").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCustomerReturn;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_customer_returns", organizationId] }),
  });
}
export function useUpsertErpCustomerReturnLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { return_id: string; product_id: string; quantity: number; unit_cost?: number }) => {
      const { data, error } = await supabase.from("erp_customer_return_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCustomerReturnLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_customer_return_lines", vars.return_id] }),
  });
}
export function useDeleteErpCustomerReturnLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; returnId: string }) => {
      const { error } = await supabase.from("erp_customer_return_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_customer_return_lines", vars.returnId] }),
  });
}
// confirm_erp_customer_return() (RPC security definer, migration 052) :
// crée les mouvements 'customer_return' (entrée) — jamais d'écriture
// directe de `status`.
export function useConfirmErpCustomerReturn() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_customer_return", { p_organization_id: organizationId, p_return_id: returnId });
      if (error) throw error;
      return data as ErpCustomerReturn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_customer_returns", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}
