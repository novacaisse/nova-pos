// Data layer ZegERP — un fichier par module (voir ARCHITECTURE_ERP.md pour
// le détail du schéma). Ce fichier couvre le module 1/10 : Stock/Produits
// (migration 048), seul module dont les écrans existent pour l'instant
// (chantier frontend construit au fil des phases, comme ZegResto en son
// temps). Mêmes conventions que restoHooks.ts/hotelHooks.ts : org-scoping
// via useOrganizationId(), query key `["erp_<table>", organizationId]`,
// RPC security definer pour tout ce qui a un invariant à préserver
// (transferts/inventaires — jamais d'écriture directe de `status`, cf.
// migration 048), realtime via useId() pour éviter la collision de topic
// de canal (bug corrigé ce trimestre côté ZegResto — voir CLAUDE.md).
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
        onChange,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, table, instanceId]);
}

// ============ Types ============
export type ErpProductCategory = { id: string; organization_id: string; parent_id: string | null; name: string; created_at: string };
export type ErpBrand = { id: string; organization_id: string; name: string; created_at: string };
export type ErpUnit = { id: string; organization_id: string; name: string; code: string; created_at: string };
export type ErpWarehouse = {
  id: string; organization_id: string; name: string; code: string | null; address: string | null;
  is_active: boolean; is_default: boolean; created_at: string;
};
export type ErpProduct = {
  id: string; organization_id: string; category_id: string | null; brand_id: string | null; unit_id: string | null;
  sku: string | null; barcode: string | null; name: string; description: string | null;
  price: number; cost: number; tax_rate: number; low_stock_threshold: number; image_url: string | null;
  is_active: boolean; created_at: string;
};
export type ErpStockLevel = {
  id: string; organization_id: string; product_id: string; warehouse_id: string; quantity: number; updated_at: string;
  erp_products: { name: string; sku: string | null; low_stock_threshold: number } | null;
  erp_warehouses: { name: string } | null;
};
export type ErpStockTransferStatus = "draft" | "in_transit" | "received";
export type ErpStockTransfer = {
  id: string; organization_id: string; reference: string | null;
  from_warehouse_id: string; to_warehouse_id: string; status: ErpStockTransferStatus;
  notes: string | null; created_by: string | null; created_at: string; sent_at: string | null; received_at: string | null;
  from_warehouse: { name: string } | null; to_warehouse: { name: string } | null;
};
export type ErpStockTransferLine = {
  id: string; organization_id: string; transfer_id: string; product_id: string; quantity: number;
  erp_products: { name: string; sku: string | null } | null;
};
export type ErpInventoryStatus = "in_progress" | "validated";
export type ErpInventory = {
  id: string; organization_id: string; warehouse_id: string; status: ErpInventoryStatus;
  notes: string | null; created_by: string | null; created_at: string; validated_at: string | null;
  erp_warehouses: { name: string } | null;
};
export type ErpInventoryLine = {
  id: string; organization_id: string; inventory_id: string; product_id: string;
  theoretical_quantity: number; counted_quantity: number | null; created_at: string;
  erp_products: { name: string; sku: string | null } | null;
};
export type ErpStockMovementType =
  | "in" | "out" | "adjustment" | "transfer_out" | "transfer_in"
  | "purchase_receipt" | "sale" | "supplier_return" | "customer_return";
export type ErpStockMovement = {
  id: string; organization_id: string; product_id: string; warehouse_id: string;
  type: ErpStockMovementType; quantity: number; unit_cost: number | null;
  reason: string | null; reference: string | null; created_at: string;
  erp_products: { name: string } | null; erp_warehouses: { name: string } | null;
};

// ============ Catégories ============
export function useErpProductCategories() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_product_categories", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpProductCategory[]> => {
      const { data, error } = await supabase.from("erp_product_categories")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpProductCategory[];
    },
  });
}
export function useUpsertErpProductCategory() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpProductCategory> & { name: string }) => {
      const { data, error } = await supabase.from("erp_product_categories")
        .upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpProductCategory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_product_categories", organizationId] }),
  });
}
export function useDeleteErpProductCategory() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_product_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_product_categories", organizationId] }),
  });
}

// ============ Marques ============
export function useErpBrands() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_brands", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpBrand[]> => {
      const { data, error } = await supabase.from("erp_brands").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpBrand[];
    },
  });
}
export function useUpsertErpBrand() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpBrand> & { name: string }) => {
      const { data, error } = await supabase.from("erp_brands").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpBrand;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_brands", organizationId] }),
  });
}
export function useDeleteErpBrand() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_brands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_brands", organizationId] }),
  });
}

// ============ Unités ============
export function useErpUnits() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_units", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpUnit[]> => {
      const { data, error } = await supabase.from("erp_units").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpUnit[];
    },
  });
}
export function useUpsertErpUnit() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpUnit> & { name: string; code: string }) => {
      const { data, error } = await supabase.from("erp_units").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpUnit;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_units", organizationId] }),
  });
}
export function useDeleteErpUnit() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_units", organizationId] }),
  });
}

// ============ Dépôts ============
export function useErpWarehouses() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_warehouses", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpWarehouse[]> => {
      const { data, error } = await supabase.from("erp_warehouses").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpWarehouse[];
    },
  });
}
export function useUpsertErpWarehouse() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpWarehouse> & { name: string }) => {
      const { data, error } = await supabase.from("erp_warehouses").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpWarehouse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_warehouses", organizationId] }),
  });
}
export function useDeleteErpWarehouse() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_warehouses", organizationId] }),
  });
}

// ============ Produits ============
export function useErpProducts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_products", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpProduct[]> => {
      const { data, error } = await supabase.from("erp_products").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpProduct[];
    },
  });
}
export function useUpsertErpProduct() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpProduct> & { name: string }) => {
      const { data, error } = await supabase.from("erp_products").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpProduct;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_products", organizationId] }),
  });
}
export function useDeleteErpProduct() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_products", organizationId] }),
  });
}

// ============ Niveaux de stock (lecture seule — maintenus par
// apply_erp_stock_movement(), jamais d'écriture directe côté client) ============
export function useErpStockLevels() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_stock_levels", () => qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] }));
  return useQuery({
    queryKey: ["erp_stock_levels", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpStockLevel[]> => {
      const { data, error } = await supabase.from("erp_stock_levels")
        .select("*, erp_products(name, sku, low_stock_threshold), erp_warehouses(name)")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpStockLevel[];
    },
  });
}

// ============ Transferts inter-dépôts ============
export function useErpStockTransfers() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_stock_transfers", () => qc.invalidateQueries({ queryKey: ["erp_stock_transfers", organizationId] }));
  return useQuery({
    queryKey: ["erp_stock_transfers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpStockTransfer[]> => {
      const { data, error } = await supabase.from("erp_stock_transfers")
        .select("*, from_warehouse:erp_warehouses!erp_stock_transfers_from_warehouse_id_fkey(name), to_warehouse:erp_warehouses!erp_stock_transfers_to_warehouse_id_fkey(name)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpStockTransfer[];
    },
  });
}
export function useErpStockTransferLines(transferId: string | null) {
  return useQuery({
    queryKey: ["erp_stock_transfer_lines", transferId],
    enabled: !!transferId,
    queryFn: async (): Promise<ErpStockTransferLine[]> => {
      const { data, error } = await supabase.from("erp_stock_transfer_lines")
        .select("*, erp_products(name, sku)").eq("transfer_id", transferId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpStockTransferLine[];
    },
  });
}
export function useUpsertErpStockTransfer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpStockTransfer> & { from_warehouse_id: string; to_warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_stock_transfers")
        .upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpStockTransfer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_stock_transfers", organizationId] }),
  });
}
export function useUpsertErpStockTransferLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpStockTransferLine> & { transfer_id: string; product_id: string; quantity: number }) => {
      const { data, error } = await supabase.from("erp_stock_transfer_lines")
        .upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpStockTransferLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_stock_transfer_lines", vars.transfer_id] }),
  });
}
export function useDeleteErpStockTransferLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; transferId: string }) => {
      const { error } = await supabase.from("erp_stock_transfer_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_stock_transfer_lines", vars.transferId] }),
  });
}
// Passe par send_erp_stock_transfer()/receive_erp_stock_transfer() (RPC
// security definer, migration 048) — jamais d'UPDATE direct de `status` :
// ces RPC garantissent que chaque transition crée bien ses mouvements de
// stock correspondants (transfer_out/transfer_in), voir ARCHITECTURE_ERP.md.
export function useSendErpStockTransfer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase.rpc("send_erp_stock_transfer", { p_organization_id: organizationId, p_transfer_id: transferId });
      if (error) throw error;
      return data as ErpStockTransfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_stock_transfers", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}
export function useReceiveErpStockTransfer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase.rpc("receive_erp_stock_transfer", { p_organization_id: organizationId, p_transfer_id: transferId });
      if (error) throw error;
      return data as ErpStockTransfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_stock_transfers", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}

// ============ Inventaires physiques ============
export function useErpInventories() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_inventories", () => qc.invalidateQueries({ queryKey: ["erp_inventories", organizationId] }));
  return useQuery({
    queryKey: ["erp_inventories", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpInventory[]> => {
      const { data, error } = await supabase.from("erp_inventories")
        .select("*, erp_warehouses(name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpInventory[];
    },
  });
}
export function useErpInventoryLines(inventoryId: string | null) {
  return useQuery({
    queryKey: ["erp_inventory_lines", inventoryId],
    enabled: !!inventoryId,
    queryFn: async (): Promise<ErpInventoryLine[]> => {
      const { data, error } = await supabase.from("erp_inventory_lines")
        .select("*, erp_products(name, sku)").eq("inventory_id", inventoryId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpInventoryLine[];
    },
  });
}
export function useUpsertErpInventory() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpInventory> & { warehouse_id: string }) => {
      const { data, error } = await supabase.from("erp_inventories")
        .upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpInventory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_inventories", organizationId] }),
  });
}
export function useUpsertErpInventoryLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpInventoryLine> & { inventory_id: string; product_id: string; theoretical_quantity: number }) => {
      const { data, error } = await supabase.from("erp_inventory_lines")
        .upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpInventoryLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_inventory_lines", vars.inventory_id] }),
  });
}
// Passe par validate_erp_inventory() (RPC security definer, migration 048)
// — compare comptage vs théorique et crée les mouvements 'adjustment'
// nécessaires en une seule transaction, jamais d'écriture directe de `status`.
export function useValidateErpInventory() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inventoryId: string) => {
      const { data, error } = await supabase.rpc("validate_erp_inventory", { p_organization_id: organizationId, p_inventory_id: inventoryId });
      if (error) throw error;
      return data as ErpInventory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_inventories", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
    },
  });
}

// ============ Mouvements de stock (ledger, lecture seule + insertion
// directe pour in/out/adjustment — transfer_in/out exclus côté RLS,
// uniquement créés par les RPC ci-dessus) ============
export function useErpStockMovements(limit = 50) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_stock_movements", () => qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] }));
  return useQuery({
    queryKey: ["erp_stock_movements", organizationId, limit],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpStockMovement[]> => {
      const { data, error } = await supabase.from("erp_stock_movements")
        .select("*, erp_products(name), erp_warehouses(name)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ErpStockMovement[];
    },
  });
}
export function useCreateErpStockMovement() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_id: string; warehouse_id: string; type: "in" | "out" | "adjustment";
      quantity: number; unit_cost?: number; reason?: string; reference?: string;
    }) => {
      const { data, error } = await supabase.from("erp_stock_movements")
        .insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpStockMovement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_stock_movements", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_stock_levels", organizationId] });
    },
  });
}

// ============ Tableau de bord ============
export type ErpDashboardStats = {
  productsCount: number;
  warehousesCount: number;
  lowStockCount: number;
  pendingTransfersCount: number;
  inProgressInventoriesCount: number;
};
export function useErpDashboardStats() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_stock_movements", () => qc.invalidateQueries({ queryKey: ["erp_dashboard_stats", organizationId] }));

  return useQuery({
    queryKey: ["erp_dashboard_stats", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ErpDashboardStats> => {
      const [
        { count: productsCount },
        { count: warehousesCount },
        { count: pendingTransfersCount },
        { count: inProgressInventoriesCount },
        { data: products },
        { data: levels },
      ] = await Promise.all([
        supabase.from("erp_products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!).eq("is_active", true),
        supabase.from("erp_warehouses").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!).eq("is_active", true),
        supabase.from("erp_stock_transfers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!).eq("status", "in_transit"),
        supabase.from("erp_inventories").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!).eq("status", "in_progress"),
        supabase.from("erp_products").select("id, low_stock_threshold").eq("organization_id", organizationId!).eq("is_active", true).gt("low_stock_threshold", 0),
        supabase.from("erp_stock_levels").select("product_id, quantity").eq("organization_id", organizationId!),
      ]);

      const qtyByProduct = new Map<string, number>();
      for (const l of (levels ?? []) as { product_id: string; quantity: number }[]) {
        qtyByProduct.set(l.product_id, (qtyByProduct.get(l.product_id) ?? 0) + Number(l.quantity));
      }
      const lowStockCount = ((products ?? []) as { id: string; low_stock_threshold: number }[])
        .filter((p) => (qtyByProduct.get(p.id) ?? 0) < p.low_stock_threshold).length;

      return {
        productsCount: productsCount ?? 0,
        warehousesCount: warehousesCount ?? 0,
        lowStockCount,
        pendingTransfersCount: pendingTransfersCount ?? 0,
        inProgressInventoriesCount: inProgressInventoriesCount ?? 0,
      };
    },
  });
}

// Indicateurs "période" du tableau de bord (sélecteur universel, même
// pattern que ZegHotel Phase 6 / ZegResto) — les compteurs de stock
// ci-dessus (produits, dépôts, transferts, inventaires) restent des
// instantanés "maintenant", ce bloc porte le seul indicateur réellement
// période-dépendant : le chiffre d'affaires du POS ERP (F4).
export function useErpPeriodStats(from: Date, to: Date) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_dashboard_period", organizationId, from.toISOString(), to.toISOString()],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_pos_sales")
        .select("total_amount")
        .eq("organization_id", organizationId!).eq("status", "completed")
        .gte("completed_at", from.toISOString()).lte("completed_at", to.toISOString());
      if (error) throw error;
      const sales = data ?? [];
      return {
        revenue: sales.reduce((s, x) => s + Number(x.total_amount), 0),
        salesCount: sales.length,
      };
    },
  });
}
