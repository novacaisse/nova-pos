// Supabase data hooks — multi-tenant, always filtered by current organization_id.
// RLS also enforces this server-side; the organization_id filter is belt + suspenders.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppRole } from "@/lib/roles";
import { invokeFn } from "@/lib/data/invokeFn";

// ============ TYPES (Supabase shape) ============
export type Category = { id: string; organization_id: string; name: string; color: string | null };
export type Product = {
  id: string; organization_id: string; category_id: string | null; supplier_id: string | null;
  sku: string | null; barcode: string | null; name: string; description: string | null;
  price: number; cost: number; tax_rate: number; unit: string | null;
  image_url: string | null; is_active: boolean; low_stock_threshold: number;
};
export type ProductWithStock = Product & { stock: number };

export type Customer = {
  id: string; organization_id: string; name: string;
  email: string | null; phone: string | null; address: string | null;
  loyalty_points: number; credit_balance: number; notes: string | null;
  created_at: string;
};
export type Supplier = {
  id: string; organization_id: string; name: string;
  contact: string | null; email: string | null; phone: string | null;
  address: string | null; notes: string | null; created_at: string;
};
export type Expense = {
  id: string; organization_id: string; category: string | null; label: string;
  amount: number; paid_at: string; method: string | null; notes: string | null;
  created_at: string;
};
export type StockMovement = {
  id: string; organization_id: string; product_id: string;
  type: "in" | "out" | "adjustment" | "transfer" | "sale" | "return";
  quantity: number; unit_cost: number | null; reason: string | null;
  reference: string | null; created_by: string | null; created_at: string;
};
export type Sale = {
  id: string; organization_id: string; reference: string;
  customer_id: string | null; cashier_id: string | null;
  status: "draft" | "completed" | "refunded" | "partially_refunded" | "cancelled";
  subtotal: number; discount: number; tax: number; total: number;
  paid: number; change_due: number;
  payment_method: "cash" | "mobile_money" | "card" | "credit" | "mixed";
  notes: string | null; created_at: string;
};
export type SaleItem = {
  id: string; organization_id: string; sale_id: string; product_id: string | null;
  name: string; quantity: number; unit_price: number; discount: number;
  tax_rate: number; total: number;
};

// ============ HELPERS ============
// Formatage monétaire par devise (Paramètres > Devise, organizations.currency) —
// avant, chaque montant affiché dans l'app était formaté en F (XOF) en dur,
// quelle que soit la devise réellement configurée pour la boutique.
type CurrencyMeta = { symbol: string; decimals: number; position: "before" | "after" };
const CURRENCY_META: Record<string, CurrencyMeta> = {
  XOF: { symbol: "F", decimals: 0, position: "after" },
  XAF: { symbol: "F", decimals: 0, position: "after" },
  EUR: { symbol: "€", decimals: 2, position: "after" },
  USD: { symbol: "$", decimals: 2, position: "before" },
  GHS: { symbol: "₵", decimals: 2, position: "before" },
  NGN: { symbol: "₦", decimals: 2, position: "before" },
};

export function formatMoney(n: number, currency?: string | null): string {
  const meta = CURRENCY_META[currency ?? "XOF"] ?? CURRENCY_META.XOF;
  const num = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals,
  }).format(n);
  return meta.position === "before" ? `${meta.symbol} ${num}` : `${num} ${meta.symbol}`;
}

// Historique : formatage XOF fixe, conservé pour les écrans sans contexte
// de boutique unique (cross-boutiques côté Super Admin, pages publiques
// avant inscription). Dans une page qui a une boutique courante, préférer
// useFormatMoney() ci-dessous.
export function formatXOF(n: number): string {
  return formatMoney(n, "XOF");
}

// Lie formatMoney() à la devise de la boutique active — à utiliser dans
// tout composant qui affiche des montants au sein de l'app boutique. Le nom
// local peut rester `formatXOF` à l'appel (const formatXOF = useFormatMoney())
// pour ne pas avoir à renommer chaque site d'appel existant.
export function useFormatMoney() {
  const { currentOrganization } = useOrganization();
  const currency = currentOrganization?.currency;
  return (n: number) => formatMoney(n, currency);
}

// Une vente compte-t-elle dans le CA affiché (Dashboard, Ventes,
// Rapports) ? Exclut les brouillons (jamais finalisés, jamais du vrai CA)
// et les ventes annulées/remboursées (le stock a été réintégré, l'argent
// rendu ou jamais encaissé) — sans ce filtre, ces ventes gonflaient le CA
// affiché partout (bug remonté : "le CA doit être réduit après annulation").
export function isRevenueSale(s: { status: Sale["status"] }): boolean {
  return s.status === "completed" || s.status === "partially_refunded";
}

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id ?? null;
}

// ============ CATEGORIES ============
export function useCategories() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["categories", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
}
export function useUpsertCategory() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<Category> & { name: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const payload = { ...c, organization_id: organizationId };
      const { data, error } = await supabase.from("categories")
        .upsert(payload).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", organizationId] }),
  });
}
export function useDeleteCategory() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", organizationId] }),
  });
}

// ============ PRODUCTS (with stock) ============
export function useProducts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["products", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ProductWithStock[]> => {
      const { data, error } = await supabase.from("products")
        .select("*, stock_levels(quantity)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        stock: Number(p.stock_levels?.[0]?.quantity ?? 0),
      }));
    },
  });
}
export function useUpsertProduct() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<Product> & { name: string; price: number }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { stock, ...rest } = p as any;
      const payload: any = { ...rest, organization_id: organizationId };
      const { data, error } = await supabase.from("products").upsert(payload).select().single();
      if (error) throw error;
      // Optional initial stock (only on create)
      if (!p.id && typeof stock === "number" && stock > 0) {
        await supabase.from("stock_movements").insert({
          organization_id: organizationId, product_id: data.id, type: "in",
          quantity: stock, reason: "Stock initial",
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}
export function useDeleteProduct() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products", organizationId] }),
  });
}

export type BulkImportProductRow = {
  name: string; sku?: string | null; barcode?: string | null; category_name?: string | null;
  price: number; cost?: number; unit?: string | null; low_stock_threshold?: number; stock?: number;
};
// Import en masse (CSV, "Excel" au sens où le fichier vient d'un tableur —
// voir app.produits.index.tsx pour le parsing) : une ligne par produit,
// une catégorie retrouvée/créée par nom (jamais par id, le fichier ne
// connaît que des noms), un produit retrouvé par SKU s'il existe déjà
// (mise à jour du catalogue, jamais du stock — le stock existant n'est
// touché que pour un produit réellement nouveau, via le même mécanisme
// "stock initial" que la création manuelle dans useUpsertProduct).
// Boucle séquentielle plutôt qu'un upsert(...).select() en un seul appel :
// plus lent sur un très gros fichier, mais chaque ligne réussit ou échoue
// indépendamment (une erreur de ligne n'annule jamais tout l'import), et
// le rattachement stock initial → produit fraîchement créé reste sans
// ambiguïté (pas de réappariement fragile après un upsert en lot).
export function useBulkImportProducts() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: BulkImportProductRow[]) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data: existingCats } = await supabase.from("categories").select("id, name").eq("organization_id", organizationId);
      const catByName = new Map<string, string>((existingCats ?? []).map((c) => [c.name.toLowerCase(), c.id]));

      let created = 0, updated = 0;
      const errors: { row: number; message: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          if (!r.name?.trim()) throw new Error("Nom manquant");
          if (!(r.price >= 0)) throw new Error("Prix invalide");

          let categoryId: string | null = null;
          const catName = r.category_name?.trim();
          if (catName) {
            const key = catName.toLowerCase();
            if (!catByName.has(key)) {
              const { data: newCat, error: catErr } = await supabase.from("categories")
                .insert({ organization_id: organizationId, name: catName, color: "#0891b2" }).select("id").single();
              if (catErr) throw catErr;
              catByName.set(key, newCat.id);
            }
            categoryId = catByName.get(key)!;
          }

          const sku = r.sku?.trim() || null;
          let existingId: string | null = null;
          if (sku) {
            const { data: existing } = await supabase.from("products").select("id")
              .eq("organization_id", organizationId).eq("sku", sku).maybeSingle();
            existingId = existing?.id ?? null;
          }

          const payload = {
            organization_id: organizationId, name: r.name.trim(), sku, barcode: r.barcode?.trim() || null,
            category_id: categoryId, price: r.price, cost: r.cost ?? 0,
            unit: r.unit?.trim() || "pcs", low_stock_threshold: r.low_stock_threshold ?? 5,
          };

          if (existingId) {
            const { error } = await supabase.from("products").update(payload).eq("id", existingId);
            if (error) throw error;
            updated++;
          } else {
            const { data: inserted, error } = await supabase.from("products").insert(payload).select("id").single();
            if (error) throw error;
            created++;
            if (r.stock && r.stock > 0) {
              await supabase.from("stock_movements").insert({
                organization_id: organizationId, product_id: inserted.id, type: "in",
                quantity: r.stock, reason: "Import en masse", created_by: user?.id,
              });
            }
          }
        } catch (e: any) {
          errors.push({ row: i + 1, message: e?.message ?? "Erreur inconnue" });
        }
      }
      return { created, updated, errors };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["categories", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}

// ============ CUSTOMERS ============
export function useCustomers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["customers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from("customers")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}
export function useUpsertCustomer() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<Customer> & { name: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("customers")
        .upsert({ ...c, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers", organizationId] }),
  });
}
export function useDeleteCustomer() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers", organizationId] }),
  });
}

// Historique d'activité d'un client (fiche détail) — un `Sale` porte déjà
// son propre paid/total/payment_method, ce qui couvre "achats + paiement"
// pour l'essentiel des cas ; les paiements complémentaires multiples sur
// une même vente (table `payments`, cf. Bloc 11) ne sont pas détaillés
// séparément ici, simplification assumée pour cette fiche.
export function useCustomerSales(customerId: string | null) {
  return useQuery({
    queryKey: ["customer_sales", customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<(Sale & { sale_items: SaleItem[] })[]> => {
      const { data, error } = await supabase.from("sales")
        .select("*, sale_items(*)").eq("customer_id", customerId!)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as (Sale & { sale_items: SaleItem[] })[];
    },
  });
}

// ============ SUPPLIERS ============
export function useSuppliers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["suppliers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from("suppliers")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}
export function useUpsertSupplier() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<Supplier> & { name: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("suppliers")
        .upsert({ ...s, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });
}
export function useDeleteSupplier() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });
}

// ============ BONS DE COMMANDE (Fournisseurs) ============
// draft éditable librement, sent verrouillée (annulable), received marque
// la réception en un bloc : crée les mouvements de stock 'in' pour chaque
// ligne liée à un produit et met à jour products.cost au dernier coût
// facturé. Pas de réception partielle ligne par ligne (migration 014).
export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";
export type PurchaseOrder = {
  id: string; organization_id: string; supplier_id: string;
  reference: string; status: PurchaseOrderStatus;
  expected_at: string | null; notes: string | null;
  created_by: string | null; created_at: string;
};
export type PurchaseOrderItem = {
  id: string; organization_id: string; purchase_order_id: string;
  product_id: string | null; name: string;
  quantity: number; unit_cost: number; total: number;
};
export type PurchaseOrderWithItems = PurchaseOrder & {
  purchase_order_items: PurchaseOrderItem[]; suppliers: { name: string } | null;
};

export function usePurchaseOrders() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["purchase_orders", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<PurchaseOrderWithItems[]> => {
      const { data, error } = await supabase.from("purchase_orders")
        .select("*, purchase_order_items(*), suppliers(name)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PurchaseOrderWithItems[];
    },
  });
}

export function useUpsertPurchaseOrder() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string; supplier_id: string; expected_at?: string | null; notes?: string | null;
      items: { product_id: string | null; name: string; quantity: number; unit_cost: number }[];
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const items = input.items.map((it) => ({ ...it, total: it.quantity * it.unit_cost }));
      const payload = {
        organization_id: organizationId, supplier_id: input.supplier_id,
        expected_at: input.expected_at || null, notes: input.notes ?? null,
      };

      let poId = input.id;
      if (poId) {
        const { error } = await supabase.from("purchase_orders").update(payload).eq("id", poId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("purchase_orders").insert({
          ...payload, reference: newTicketRef("BC"), created_by: user?.id,
        }).select().single();
        if (error) throw error;
        poId = data.id;
      }

      if (items.length) {
        const itemsPayload = items.map((it) => ({ organization_id: organizationId, purchase_order_id: poId, ...it }));
        const { error } = await supabase.from("purchase_order_items").insert(itemsPayload);
        if (error) throw error;
      }
      return poId!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders", organizationId] }),
  });
}

export function useDeletePurchaseOrder() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders", organizationId] }),
  });
}

export function useSendPurchaseOrder() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").update({ status: "sent" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders", organizationId] }),
  });
}

export function useCancelPurchaseOrder() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders", organizationId] }),
  });
}

// Réception : crée les mouvements de stock 'in' pour chaque ligne liée à
// un produit, met à jour products.cost au dernier coût facturé (logique
// "dernier coût connu", pas de moyenne pondérée), puis passe le bon à
// 'received'.
export function useReceivePurchaseOrder() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (po: PurchaseOrderWithItems) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const stockRows = po.purchase_order_items
        .filter((it) => it.product_id)
        .map((it) => ({
          organization_id: organizationId, product_id: it.product_id!,
          type: "in" as const, quantity: it.quantity, unit_cost: it.unit_cost,
          reason: `Réception ${po.reference}`, reference: po.reference,
          created_by: user?.id,
        }));
      if (stockRows.length) {
        const { error: e1 } = await supabase.from("stock_movements").insert(stockRows);
        if (e1) throw e1;
      }
      for (const it of po.purchase_order_items) {
        if (!it.product_id) continue;
        await supabase.from("products").update({ cost: it.unit_cost }).eq("id", it.product_id);
      }
      const { error: e2 } = await supabase.from("purchase_orders").update({ status: "received" }).eq("id", po.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}

// ============ EXPENSES ============
export function useExpenses() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["expenses", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase.from("expenses")
        .select("*").eq("organization_id", organizationId!).order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });
}
export function useUpsertExpense() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Partial<Expense> & { label: string; amount: number }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const payload: any = { ...e, organization_id: organizationId };
      if (!e.id) payload.created_by = user?.id;
      const { data, error } = await supabase.from("expenses").upsert(payload).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", organizationId] }),
  });
}
export function useDeleteExpense() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", organizationId] }),
  });
}

// ============ STOCK MOVEMENTS ============
export function useStockMovements(limit = 100) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["stock_movements", organizationId, limit],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("*, products(name)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({ ...m, product_name: m.products?.name ?? "—" }));
    },
  });
}
// Historique entrées/sorties d'un seul produit (popup détail produit) —
// useStockMovements ci-dessus ne filtre que par organisation, pas par
// produit.
export function useProductStockMovements(productId: string | null) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["stock_movements", organizationId, "product", productId],
    enabled: !!organizationId && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("*").eq("organization_id", organizationId!).eq("product_id", productId!)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as StockMovement[];
    },
  });
}
export function useCreateStockMovement() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      product_id: string; type: StockMovement["type"];
      quantity: number; reason?: string; reference?: string; unit_cost?: number;
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { error } = await supabase.from("stock_movements").insert({
        organization_id: organizationId, created_by: user?.id, ...m,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
    },
  });
}

// ============ SALES ============
// Accepte soit une limite (rétrocompatible avec les appels existants), soit
// des options incluant un filtre de date — utilisé par Rapports pour filtrer
// côté requête plutôt que de tout charger et trier côté client.
export function useSales(opts: number | { limit?: number; from?: string; to?: string } = 200) {
  const { limit = 200, from, to } = typeof opts === "number" ? { limit: opts } : opts;
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["sales", organizationId, limit, from, to],
    enabled: !!organizationId,
    queryFn: async () => {
      let q = supabase.from("sales")
        .select("*, sale_items(*), customers(name)")
        .eq("organization_id", organizationId!);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as (Sale & { sale_items: SaleItem[]; customers: { name: string } | null })[];
    },
  });
}

// RPC atomique (migration 026) plutôt que 4 écritures client séparées
// (sales, sale_items, payments, stock_movements) : si le panier survend un
// produit, apply_stock_movement() lève désormais une exception (garde-fou
// ajoutée dans la même migration) — sans transaction, la vente restait déjà
// créée et payée avec des mouvements de stock partiels pour le reste du
// panier. Un appel RPC = une transaction Postgres : en cas de survente,
// tout est annulé (sale, sale_items, payments, mouvements déjà insérés).
export function useCreateSale() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reference: string;
      customer_id?: string | null;
      items: { product_id: string | null; name: string; quantity: number; unit_price: number; discount?: number; tax_rate?: number }[];
      discount?: number;
      payment_method: Sale["payment_method"];
      paid: number;
      notes?: string;
      status?: Sale["status"];
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.rpc("create_sale", {
        p_organization_id: organizationId,
        p_reference: input.reference,
        p_customer_id: input.customer_id ?? null,
        p_payment_method: input.payment_method,
        p_paid: input.paid,
        p_items: input.items,
        p_discount: input.discount ?? 0,
        p_notes: input.notes ?? null,
        p_status: input.status ?? "completed",
      });
      if (error) throw error;
      return data as Sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", organizationId] });
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}

// Annuler une vente déjà finalisée : remet le stock des lignes liées à un
// vrai produit (mouvement 'return', symétrique du 'sale' créé par
// useCreateSale) puis passe le statut à 'cancelled'. Reçu à imprimer,
// paiements déjà encaissés : pas de remboursement automatique, c'est un
// geste manuel (caisse/mobile money) laissé à l'utilisateur, comme pour
// un remboursement classique.
export function useCancelSale() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: Sale & { sale_items: SaleItem[] }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const stockRows = sale.sale_items
        .filter((it) => it.product_id)
        .map((it) => ({
          organization_id: organizationId, product_id: it.product_id!,
          type: "return" as const, quantity: it.quantity,
          reason: `Annulation vente ${sale.reference}`, reference: sale.reference,
          created_by: user?.id,
        }));
      if (stockRows.length) {
        const { error: e1 } = await supabase.from("stock_movements").insert(stockRows);
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase.from("sales").update({ status: "cancelled" }).eq("id", sale.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", organizationId] });
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}

// Paiement complémentaire sur une vente à crédit (paid < total) : ajoute
// une ligne payments et met à jour sales.paid/change_due. Ne touche ni au
// stock ni aux lignes de la vente.
// RPC atomique (migration 024) plutôt que lire sale.paid côté client puis
// réécrire paid/change_due : deux paiements complémentaires ajoutés à
// quelques instants d'écart sur la même vente à crédit lisaient tous les
// deux la même valeur `sale.paid` obsolète, et le second écrasait l'effet
// du premier sur la colonne (perte de mise à jour concurrente, alors que
// le journal `payments` restait correct, lui). L'incrément se fait
// désormais en une seule instruction SQL atomique côté serveur.
export function useAddSalePayment() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sale, amount, method }: { sale: Sale; amount: number; method: Sale["payment_method"] }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      if (amount <= 0) throw new Error("Le montant doit être positif.");
      const { error } = await supabase.rpc("add_sale_payment", {
        p_sale_id: sale.id, p_amount: amount, p_method: method,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales", organizationId] }),
  });
}

// ============ RÉSERVATIONS (migration 062) ============
// Pas une vente : ne bouge jamais le stock avant d'être honorée (contrairement
// à un ticket en attente, qui EST une vraie ligne `sales` en 'draft',
// éphémère) — table dédiée, items en jsonb (pas de ventilation TVA par
// ligne ni de mouvement de stock nécessaire avant d'honorer la réservation).
export type ReservationStatus = "pending" | "fulfilled" | "cancelled";
export type ReservationItem = { product_id: string | null; name: string; quantity: number; unit_price: number };
export type Reservation = {
  id: string; organization_id: string; reference: string;
  customer_id: string | null; customer_name: string; customer_phone: string | null;
  items: ReservationItem[]; total: number; deposit: number;
  reservation_date: string; status: ReservationStatus; notes: string | null;
  created_at: string; updated_at: string;
};
export function useReservations() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["reservations", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase.from("reservations")
        .select("*").eq("organization_id", organizationId!).order("reservation_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Reservation[];
    },
  });
}
export function useUpsertReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<Reservation> & { customer_name: string; items: ReservationItem[]; total: number; reservation_date: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("reservations")
        .upsert({ ...r, organization_id: organizationId, updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return data as Reservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations", organizationId] }),
  });
}
export function useUpdateReservationStatus() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const { error } = await supabase.from("reservations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations", organizationId] }),
  });
}
export function useDeleteReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations", organizationId] }),
  });
}

// ============ TICKETS EN ATTENTE (Caisse) ============
// Persistés comme de vraies lignes `sales` (status: 'draft', déjà prévu
// dans l'enum sale_status) au lieu d'un state React perdu au reload. Le
// libellé personnalisé du ticket est stocké dans `notes` (déjà existant,
// pas de migration nécessaire). Aucun mouvement de stock ni paiement n'est
// créé pour un brouillon — reprendre un ticket recharge son panier puis
// supprime le brouillon ; le paiement final passe par le circuit normal
// useCreateSale (status "completed"), qui reste inchangé.
export type HoldTicket = Sale & { sale_items: SaleItem[]; customers: { name: string } | null };

export function useHoldTickets() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hold_tickets", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HoldTicket[]> => {
      const { data, error } = await supabase.from("sales")
        .select("*, sale_items(*), customers(name)")
        .eq("organization_id", organizationId!).eq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HoldTicket[];
    },
  });
}

export function useSaveHoldTicket() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      label?: string;
      customer_id?: string | null;
      items: { product_id: string | null; name: string; quantity: number; unit_price: number; discount?: number }[];
      discount?: number;
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const items = input.items.map((it) => ({
        ...it, discount: it.discount ?? 0, tax_rate: 0,
        total: it.quantity * it.unit_price - (it.discount ?? 0),
      }));
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const discount = input.discount ?? 0;
      const total = Math.max(0, subtotal - discount);

      const { data: sale, error: e1 } = await supabase.from("sales").insert({
        organization_id: organizationId, reference: newTicketRef("H"),
        customer_id: input.customer_id ?? null, cashier_id: user?.id,
        status: "draft", subtotal, discount, tax: 0, total,
        paid: 0, change_due: 0, payment_method: "cash",
        notes: input.label?.trim() || null,
      }).select().single();
      if (e1) throw e1;

      const itemsPayload = items.map((it) => ({
        organization_id: organizationId, sale_id: sale.id,
        product_id: it.product_id, name: it.name, quantity: it.quantity,
        unit_price: it.unit_price, discount: it.discount, tax_rate: it.tax_rate, total: it.total,
      }));
      const { error: e2 } = await supabase.from("sale_items").insert(itemsPayload);
      if (e2) throw e2;
      return sale;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hold_tickets", organizationId] }),
  });
}

export function useDeleteHoldTicket() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hold_tickets", organizationId] }),
  });
}

// ============ DEVIS ============
export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "converted" | "expired";
export type Quote = {
  id: string; organization_id: string; reference: string;
  customer_id: string | null;
  status: QuoteStatus;
  subtotal: number; discount: number; tax: number; total: number;
  valid_until: string | null;
  converted_sale_id: string | null;
  notes: string | null; created_at: string;
};
export type QuoteItem = {
  id: string; organization_id: string; quote_id: string; product_id: string | null;
  name: string; quantity: number; unit_price: number; discount: number;
  tax_rate: number; total: number;
};
export type QuoteWithItems = Quote & { quote_items: QuoteItem[]; customers: { name: string } | null };

export function useQuotes(opts: number | { limit?: number; from?: string; to?: string } = 200) {
  const { limit = 200, from, to } = typeof opts === "number" ? { limit: opts } : opts;
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["quotes", organizationId, limit, from, to],
    enabled: !!organizationId,
    queryFn: async (): Promise<QuoteWithItems[]> => {
      let q = supabase.from("quotes")
        .select("*, quote_items(*), customers(name)")
        .eq("organization_id", organizationId!);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as QuoteWithItems[];
    },
  });
}

// Crée ou met à jour un devis + ses lignes (remplace toutes les lignes à
// chaque enregistrement — plus simple qu'un diff, acceptable vu le volume
// de lignes d'un devis). Éditer un devis existant nécessite un delete sur
// quote_items, réservé à owner/manager par la RLS — un cashier ne peut donc
// créer que de nouveaux devis, pas modifier les existants.
export function useUpsertQuote() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      reference?: string;
      customer_id?: string | null;
      valid_until?: string | null;
      notes?: string | null;
      status?: QuoteStatus;
      // Remise globale du devis (montant, en %/fixe déjà résolu côté appelant
      // — voir QuoteEditor) — prioritaire sur la somme des remises par
      // ligne si fournie, même principe que sales.discount pour une vente.
      discount?: number;
      items: { product_id: string | null; name: string; quantity: number; unit_price: number; discount?: number; tax_rate?: number }[];
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const items = input.items.map((it) => {
        const line = it.quantity * it.unit_price - (it.discount ?? 0);
        return { ...it, discount: it.discount ?? 0, tax_rate: it.tax_rate ?? 0, total: line };
      });
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const itemsDiscount = items.reduce((s, i) => s + (i.discount ?? 0), 0);
      const quoteDiscount = input.discount ?? itemsDiscount;
      const total = Math.max(0, subtotal - quoteDiscount);

      const payload = {
        organization_id: organizationId,
        reference: input.reference ?? newTicketRef("DEV"),
        customer_id: input.customer_id ?? null,
        status: input.status ?? "draft",
        subtotal, discount: quoteDiscount, tax: 0, total,
        valid_until: input.valid_until ?? null,
        notes: input.notes ?? null,
      };

      let quoteId = input.id;
      if (quoteId) {
        const { error } = await supabase.from("quotes").update(payload).eq("id", quoteId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("quote_items").delete().eq("quote_id", quoteId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("quotes").insert(payload).select().single();
        if (error) throw error;
        quoteId = data.id;
      }

      if (items.length) {
        const itemsPayload = items.map((it) => ({
          organization_id: organizationId, quote_id: quoteId,
          product_id: it.product_id, name: it.name,
          quantity: it.quantity, unit_price: it.unit_price,
          discount: it.discount, tax_rate: it.tax_rate, total: it.total,
        }));
        const { error } = await supabase.from("quote_items").insert(itemsPayload);
        if (error) throw error;
      }
      return quoteId!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", organizationId] }),
  });
}

export function useDeleteQuote() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", organizationId] }),
  });
}

// Marque un devis converti après création réussie de la vente (voir
// useCreateSale, réutilisé tel quel pour la conversion — pas de logique de
// vente dupliquée).
export function useMarkQuoteConverted() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, saleId }: { quoteId: string; saleId: string }) => {
      const { error } = await supabase.from("quotes")
        .update({ status: "converted" as QuoteStatus, converted_sale_id: saleId }).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", organizationId] }),
  });
}

// ============ ABONNEMENT ============
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type Subscription = {
  id: string; organization_id: string; plan: string; status: SubscriptionStatus;
  amount: number; currency: string; started_at: string;
  current_period_end: string | null; provider: string | null; provider_ref: string | null;
  created_at: string;
};

export function useSubscription() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["subscription", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase.from("subscriptions")
        .select("*").eq("organization_id", organizationId!)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
  });
}

export type SubscriptionPaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type SubscriptionPayment = {
  id: string; organization_id: string; subscription_id: string;
  amount: number; currency: string; method: string; status: SubscriptionPaymentStatus;
  provider: string | null; provider_ref: string | null;
  paid_at: string | null; created_at: string;
};

export function useSubscriptionPayments(limit = 50) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["subscription_payments", organizationId, limit],
    enabled: !!organizationId,
    queryFn: async (): Promise<SubscriptionPayment[]> => {
      const { data, error } = await supabase.from("subscription_payments")
        .select("*").eq("organization_id", organizationId!)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as SubscriptionPayment[];
    },
  });
}

// Suivi d'un paiement précis (page /souscription/confirmation, retour MoneyFusion).
// La RLS (has_shop_access) fait déjà office de contrôle d'accès : un id qui
// n'appartient pas à une boutique de l'utilisateur ne renverra simplement rien.
// Poll tant que le webhook n'a pas encore tranché (statut "pending").
export function useSubscriptionPayment(paymentId: string | null) {
  return useQuery({
    queryKey: ["subscription_payment", paymentId],
    enabled: !!paymentId,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
    queryFn: async (): Promise<SubscriptionPayment | null> => {
      const { data, error } = await supabase.from("subscription_payments")
        .select("*").eq("id", paymentId!).maybeSingle();
      if (error) throw error;
      return data as SubscriptionPayment | null;
    },
  });
}

// Vérification ACTIVE auprès de MoneyFusion (Edge Function
// check-subscription-payment), plutôt que d'attendre passivement un
// webhook qui n'est peut-être envoyé qu'une fois par MoneyFusion, jamais à
// la résolution — corrige le paiement qui reste bloqué "en attente"
// indéfiniment. Appelée en polling par la page de confirmation tant que le
// statut est "pending" ; useSubscriptionPayment (lecture DB) reflète le
// résultat dès que cette vérification écrit le nouveau statut.
export function useCheckSubscriptionPayment() {
  return useMutation({
    mutationFn: async (paymentId: string) =>
      invokeFn<{ status: string }>("check-subscription-payment", { payment_id: paymentId }),
  });
}

// Filet de sécurité contre le paiement qui reste "pending" indéfiniment
// (bug remonté : succès côté MoneyFusion mais aucune redirection/activation
// automatique) — le mécanisme existant (polling actif sur /souscription/
// confirmation, voir useSubscriptionPayment/useCheckSubscriptionPayment
// ci-dessus) dépend entièrement du client qui reste sur cette page ;
// si MoneyFusion ne redirige pas (flux Mobile Money résolu depuis le
// téléphone, onglet fermé avant la résolution...), rien ne relance jamais
// la vérification. Pas de pg_cron ici (infrastructure non confirmée
// disponible sur ce projet, voir migration 011) : réutilise la même Edge
// Function check-subscription-payment, déclenchée une seule fois par
// paiement en attente à chaque chargement de l'organisation dans l'app —
// n'importe quelle visite (pas seulement /app/abonnement) rattrape un
// paiement resté bloqué. doneRef évite de la redéclencher en boucle sur
// chaque re-render tant que l'organisation ne change pas.
export function useReconcilePendingSubscriptionPayments(organizationId: string | undefined, onResolved?: () => void) {
  const qc = useQueryClient();
  const doneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!organizationId || doneRef.current === organizationId) return;
    doneRef.current = organizationId;

    (async () => {
      const { data: pending } = await supabase.from("subscription_payments")
        .select("id").eq("organization_id", organizationId).eq("status", "pending")
        .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());
      if (!pending || pending.length === 0) return;

      let resolved = false;
      for (const p of pending) {
        try {
          const result = await invokeFn<{ status: string }>("check-subscription-payment", { payment_id: p.id });
          if (result.status === "paid") resolved = true;
        } catch {
          // Silencieux : simple tentative de rattrapage en arrière-plan, pas
          // une action déclenchée par l'utilisateur — le webhook ou la
          // prochaine visite pourra encore résoudre le paiement.
        }
      }
      qc.invalidateQueries({ queryKey: ["subscription_payments", organizationId] });
      qc.invalidateQueries({ queryKey: ["account_subscription"] });
      // organizations.plan/trial_ends_at (context OrganizationProvider, pas
      // React Query) doit être rafraîchi explicitement par l'appelant —
      // verifyAndApplyPayment les met à jour en base mais rien ne les relit
      // automatiquement côté client tant que le contexte n'est pas rechargé.
      if (resolved) onResolved?.();
    })();
  }, [organizationId, qc, onResolved]);
}

// Helper — generate a short unique ticket ref.
export function newTicketRef(prefix = "T") {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ============ PROFIL (utilisateur courant) ============
export type Profile = { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; address: string | null };

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useUpdateProfile() {
  const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, "full_name" | "phone" | "address" | "avatar_url">>) => {
      if (!user) throw new Error("Non authentifié");
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select().single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });
}

// Photo de profil (bucket "avatars", migration 018 — public en lecture,
// écriture restreinte au propriétaire). Un fichier par utilisateur (clé
// fixe "{user_id}/avatar", écrasé à chaque upload), même schéma que
// useUploadShopLogo — met aussi à jour profiles.avatar_url elle-même.
export function useUploadAvatar() {
  const { user } = useAuth(); const updateProfile = useUpdateProfile();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!user) throw new Error("Non authentifié");
      const path = `${user.id}/avatar`;
      const { error: upErr } = await supabase.storage.from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`; // casse le cache navigateur après remplacement
      await updateProfile.mutateAsync({ avatar_url: url });
      return url;
    },
  });
}

// ============ RÔLE de l'utilisateur courant dans la boutique active ============
// Fondation partagée par Profil, Équipe et les garde-fous UI par rôle.
export function useMyRole() {
  const organizationId = useOrganizationId();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_role", organizationId, user?.id],
    enabled: !!organizationId && !!user,
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase.from("organization_members")
        .select("role").eq("organization_id", organizationId!).eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole | undefined) ?? null;
    },
  });
}

// ============ ÉQUIPE (organization_members + profils) ============
// Pas de FK organization_members.user_id -> profiles.id (les deux référencent
// auth.users indépendamment), donc pas d'embed PostgREST possible : on
// fait deux requêtes et on fusionne côté client.
export type ShopMember = {
  id: string; organization_id: string; user_id: string; role: AppRole; created_at: string;
  custom_role_id: string | null;
  profile: { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
};

export function useShopMembers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["organization_members", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ShopMember[]> => {
      const { data: members, error } = await supabase.from("organization_members")
        .select("*").eq("organization_id", organizationId!).order("created_at");
      if (error) throw error;
      const userIds = (members ?? []).map((m: any) => m.user_id);
      let profiles: Record<string, { full_name: string | null; phone: string | null; avatar_url: string | null }> = {};
      if (userIds.length) {
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id, full_name, phone, avatar_url").in("id", userIds);
        if (profErr) throw profErr;
        profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }
      return (members ?? []).map((m: any) => ({ ...m, profile: profiles[m.user_id] ?? null }));
    },
  });
}

// Remplace l'ancien flux "la personne crée son propre compte via
// /rejoindre, puis le owner l'ajoute par email" : le owner crée directement
// le compte (Edge Function create-team-member, service role) — email,
// mot de passe, rôle, coordonnées. Si un compte existe déjà avec cet
// email, la fonction le rattache à la boutique sans mot de passe à définir.
export function useCreateTeamMember() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string; password?: string; full_name: string;
      phone?: string; address?: string; role: AppRole;
    }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      return invokeFn<{ user_id: string }>("create-team-member", { organization_id: organizationId, ...input });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_members", organizationId] }),
  });
}

export function useUpdateMemberRole() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: AppRole }) => {
      const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_members", organizationId] }),
  });
}

export function useRemoveMember() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_members", organizationId] }),
  });
}

export function useUpdateMemberCustomRole() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, customRoleId }: { memberId: string; customRoleId: string | null }) => {
      const { error } = await supabase.from("organization_members").update({ custom_role_id: customRoleId }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_members", organizationId] }),
  });
}

// ============ RÔLES PERSONNALISÉS (organization_roles + permissions par module) ============
// Le propriétaire peut créer ses propres rôles, avec des droits par module
// (view/create/manage) réellement vérifiés en RLS via has_module_permission()
// (migrations 063/064) — pas seulement un masquage côté UI. organization_members
// reste toujours géré owner-only (voir migration 063, risque d'escalade de
// privilèges), jamais via ce système.
export type PermissionModule = { key: string; app_module: string; label: string; open_view: boolean; sort_order: number };
export type OrganizationRole = { id: string; organization_id: string; key: string; name: string; created_at: string };
export type OrganizationRolePermission = { role_id: string; module_key: string; can_view: boolean; can_create: boolean; can_manage: boolean };
export type MyModulePermission = { module_key: string; can_view: boolean; can_create: boolean; can_manage: boolean };

export function usePermissionModules(appModule: string) {
  return useQuery({
    queryKey: ["permission_modules", appModule],
    queryFn: async (): Promise<PermissionModule[]> => {
      const { data, error } = await supabase.from("permission_modules")
        .select("*").eq("app_module", appModule).order("sort_order");
      if (error) throw error;
      return data as PermissionModule[];
    },
  });
}

export function useOrganizationRoles() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["organization_roles", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<OrganizationRole[]> => {
      const { data, error } = await supabase.from("organization_roles")
        .select("*").eq("organization_id", organizationId!).order("created_at");
      if (error) throw error;
      return data as OrganizationRole[];
    },
  });
}

export function useOrganizationRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: ["organization_role_permissions", roleId],
    enabled: !!roleId,
    queryFn: async (): Promise<OrganizationRolePermission[]> => {
      const { data, error } = await supabase.from("organization_role_permissions")
        .select("*").eq("role_id", roleId!);
      if (error) throw error;
      return data as OrganizationRolePermission[];
    },
  });
}

// slug simple à partir du nom saisi (organization_roles.key, unique par
// organisation) — suffixe aléatoire en cas de collision plutôt qu'une erreur
// opaque remontée à l'utilisateur.
function slugifyRoleKey(name: string) {
  const base = name.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "role") + "_" + Math.random().toString(36).slice(2, 6);
}

export function useUpsertOrganizationRole() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      if (input.id) {
        const { data, error } = await supabase.from("organization_roles")
          .update({ name: input.name }).eq("id", input.id).select().single();
        if (error) throw error;
        return data as OrganizationRole;
      }
      const { data, error } = await supabase.from("organization_roles")
        .insert({ organization_id: organizationId, name: input.name, key: slugifyRoleKey(input.name) })
        .select().single();
      if (error) throw error;
      return data as OrganizationRole;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_roles", organizationId] }),
  });
}

export function useDeleteOrganizationRole() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("organization_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization_roles", organizationId] });
      qc.invalidateQueries({ queryKey: ["organization_members", organizationId] });
    },
  });
}

export function useUpsertRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, rows }: { roleId: string; rows: Omit<OrganizationRolePermission, "role_id">[] }) => {
      const { error } = await supabase.from("organization_role_permissions")
        .upsert(rows.map((r) => ({ role_id: roleId, ...r })));
      if (error) throw error;
    },
    onSuccess: (_data, { roleId }) => qc.invalidateQueries({ queryKey: ["organization_role_permissions", roleId] }),
  });
}

// Permissions réelles (RLS) de l'utilisateur courant sur chaque module —
// utilisé pour le garde-fou de nav (masquer un module inaccessible), jamais
// comme source de vérité de sécurité (la RLS l'est déjà, ceci ne fait que la
// refléter côté UI pour éviter d'afficher des écrans vides/interdits).
export function useMyModulePermissions() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["my_module_permissions", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<MyModulePermission[]> => {
      const { data, error } = await supabase.rpc("my_module_permissions", { p_organization_id: organizationId! });
      if (error) throw error;
      return data as MyModulePermission[];
    },
    staleTime: 60_000,
  });
}

// ============ SHOP (identité + logo + ticket de caisse) ============
// Les champs sans colonne dédiée sur `organizations` (adresse, téléphone, RCCM/IFU,
// réseaux sociaux) vivent dans organization_settings.data (jsonb), pour éviter une
// migration de schéma supplémentaire.
export type TicketConfig = {
  showLogo?: boolean; showAddress?: boolean; showPhone?: boolean;
  showFiscal?: boolean; showCashier?: boolean; showQr?: boolean;
  thanks?: string;
};
// Comportement par défaut tant que la boutique n'a jamais enregistré sa
// config de ticket (organization_settings.data.ticket vide) — même valeurs pour
// l'aperçu (Paramètres) et le reçu réel (Caisse), une seule source de vérité.
export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  showLogo: true, showAddress: true, showPhone: true,
  showFiscal: true, showCashier: true, showQr: false,
  thanks: "Merci pour votre achat !",
};
export type TaxRate = { id: string; name: string; rate: number; active: boolean };
// Bascules de permissions ciblées (Bloc 15) : quelques réglages sensibles
// pour le rôle cashier, en plus du système de rôle existant — pas une
// refonte de la RLS (décision confirmée en amont de ce bloc). Ce sont des
// préférences UI/requête, pas une nouvelle frontière de sécurité : la RLS
// (table par table, par rôle) reste la seule vraie barrière, inchangée.
export type TeamPermissions = {
  cashier_can_discount: boolean;
  cashier_view_cost_margin: boolean;
  cashier_sees_only_own_sales: boolean;
};
export const DEFAULT_TEAM_PERMISSIONS: TeamPermissions = {
  cashier_can_discount: true,
  cashier_view_cost_margin: true,
  cashier_sees_only_own_sales: false,
};
export type ShopSettingsData = {
  phone?: string; email?: string; address?: string;
  rccm?: string; ifu?: string; facebook?: string; instagram?: string;
  ticket?: TicketConfig;
  expense_categories?: string[];
  tax_rates?: TaxRate[];
  permissions?: Partial<TeamPermissions>;
};
export type ShopSettings = {
  organization_id: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_logo_url: string | null;
  tax_included: boolean;
  data: ShopSettingsData;
};

const EMPTY_SHOP_SETTINGS: Omit<ShopSettings, "organization_id"> = {
  receipt_header: null, receipt_footer: null, receipt_logo_url: null,
  tax_included: true, data: {},
};

export function useShopSettings() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["organization_settings", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ShopSettings> => {
      const { data, error } = await supabase.from("organization_settings")
        .select("*").eq("organization_id", organizationId!).maybeSingle();
      if (error) throw error;
      return (data as ShopSettings | null) ?? { organization_id: organizationId!, ...EMPTY_SHOP_SETTINGS };
    },
  });
}

export function useUpdateShopSettings() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<ShopSettings, "organization_id">>) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("organization_settings")
        .upsert({ organization_id: organizationId, ...patch }).select().single();
      if (error) throw error;
      return data as ShopSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization_settings", organizationId] }),
  });
}

// Résout les bascules de permissions ciblées avec leurs valeurs par défaut
// (préserve le comportement actuel pour les boutiques qui n'ont jamais
// touché ce réglage — aucune régression silencieuse).
export function useTeamPermissions(): TeamPermissions {
  const { data: settings } = useShopSettings();
  return { ...DEFAULT_TEAM_PERMISSIONS, ...(settings?.data.permissions ?? {}) };
}

export function useUpdateShop() {
  const organizationId = useOrganizationId();
  const { refresh } = useOrganization();
  return useMutation({
    mutationFn: async (patch: { name?: string; logo_url?: string | null; currency?: string }) => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("organizations")
        .update(patch).eq("id", organizationId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => refresh(),
  });
}

// Crée une organisation pour une application ZegOS donnée ('pos' pour
// ZegCaisse aujourd'hui) — utilisé à la fois par l'onboarding (1ère
// organisation d'un compte fraîchement créé) et par "+ Ajouter une
// boutique" en Paramètres (organisations suivantes). Même RPC serveur pour
// les deux cas depuis la migration 020d (provision_organization) : la
// distinction 1ère/suivante et la vérification de plans.limits.shops sont
// gérées côté fonction, jamais côté UI. Clé JSON encore nommée "shops"
// dans plans.limits — pas renommée par 020a/020c/020d (donnée, pas schéma).
export function useProvisionOrganization() {
  const { refresh, setCurrentOrganizationId } = useOrganization();
  return useMutation({
    mutationFn: async (input: {
      app: string; name: string; country: string; currency: string;
      phone?: string; address?: string; ownerPhone?: string;
    }) => {
      const { data, error } = await supabase.rpc("provision_organization", {
        p_app: input.app, p_name: input.name, p_country: input.country, p_currency: input.currency,
        p_phone: input.phone ?? null, p_address: input.address ?? null, p_owner_phone: input.ownerPhone ?? null,
      });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: async (organization) => {
      await refresh();
      setCurrentOrganizationId(organization.id);
    },
  });
}

// Transfert de stock entre boutiques d'un même compte : les catalogues
// produits sont indépendants par boutique (organization_id), donc on fait
// correspondre les lignes par SKU (ou, à défaut, par nom exact) dans la
// boutique de destination. Si aucune correspondance n'existe, l'article est
// désormais créé automatiquement côté destination avec tous ses attributs
// (prix, coût, taxe, unité, image, seuil d'alerte, catégorie — recréée par
// nom si elle n'existe pas déjà là-bas) plutôt que d'être simplement
// signalé sans être transféré. Crée un mouvement 'transfer' (sortie) dans
// la boutique source et un mouvement 'in' (entrée) dans la boutique de
// destination, tous deux traçables via la même référence.
export function useTransferStock() {
  const organizationId = useOrganizationId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toOrganizationId: string;
      lines: { product_id: string; sku: string | null; name: string; quantity: number }[];
    }): Promise<{ transferred: number; created: string[] }> => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const linesToSend = input.lines.filter((l) => l.quantity > 0);
      if (linesToSend.length === 0) throw new Error("Aucune quantité à transférer.");

      const { data: sourceProducts, error: srcErr } = await supabase.from("products")
        .select("*, categories(name)").in("id", linesToSend.map((l) => l.product_id));
      if (srcErr) throw srcErr;
      const sourceById = new Map((sourceProducts ?? []).map((p: any) => [p.id, p]));

      const { data: destProducts, error: destErr } = await supabase.from("products")
        .select("id, sku, name").eq("organization_id", input.toOrganizationId) as {
          data: { id: string; sku: string | null; name: string }[] | null; error: any;
        };
      if (destErr) throw destErr;

      const bySku = new Map((destProducts ?? []).filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
      const byName = new Map((destProducts ?? []).map((p) => [p.name.toLowerCase(), p]));

      const { data: destCategories, error: catErr } = await supabase.from("categories")
        .select("id, name").eq("organization_id", input.toOrganizationId);
      if (catErr) throw catErr;
      const destCategoryByName = new Map((destCategories ?? []).map((c) => [c.name.toLowerCase(), c.id]));

      const reference = newTicketRef("TR");
      const outRows: any[] = []; const inRows: any[] = []; const created: string[] = [];
      for (const l of linesToSend) {
        let match: { id: string; sku: string | null; name: string } | undefined =
          (l.sku ? bySku.get(l.sku.toLowerCase()) : undefined) ?? byName.get(l.name.toLowerCase());

        if (!match) {
          const src = sourceById.get(l.product_id);
          if (!src) continue;

          let destCategoryId: string | null = null;
          const categoryName: string | undefined = src.categories?.name;
          if (categoryName) {
            destCategoryId = destCategoryByName.get(categoryName.toLowerCase()) ?? null;
            if (!destCategoryId) {
              const { data: newCat, error: catInsertErr } = await supabase.from("categories")
                .insert({ organization_id: input.toOrganizationId, name: categoryName }).select().single();
              if (catInsertErr) throw catInsertErr;
              destCategoryId = newCat.id;
              destCategoryByName.set(categoryName.toLowerCase(), newCat.id);
            }
          }

          const { data: newProduct, error: prodInsertErr } = await supabase.from("products").insert({
            organization_id: input.toOrganizationId, category_id: destCategoryId,
            sku: src.sku, barcode: src.barcode, name: src.name, description: src.description,
            price: src.price, cost: src.cost, tax_rate: src.tax_rate, unit: src.unit,
            image_url: src.image_url, is_active: src.is_active, low_stock_threshold: src.low_stock_threshold,
          }).select().single();
          if (prodInsertErr) throw prodInsertErr;

          match = { id: newProduct.id, sku: newProduct.sku, name: newProduct.name };
          if (match.sku) bySku.set(match.sku.toLowerCase(), match);
          byName.set(match.name.toLowerCase(), match);
          created.push(l.name);
        }

        outRows.push({
          organization_id: organizationId, product_id: l.product_id, type: "transfer", quantity: l.quantity,
          reason: `Transfert sortant (${reference})`, reference, created_by: user?.id,
        });
        inRows.push({
          organization_id: input.toOrganizationId, product_id: match.id, type: "in", quantity: l.quantity,
          reason: `Transfert entrant (${reference})`, reference, created_by: user?.id,
        });
      }
      if (outRows.length) {
        const { error: e1 } = await supabase.from("stock_movements").insert(outRows);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("stock_movements").insert(inRows);
        if (e2) throw e2;
      }
      return { transferred: outRows.length, created };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", organizationId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", organizationId] });
    },
  });
}

// Upload du logo vers le bucket Storage "shop-logos" (public en lecture,
// écriture owner/manager — voir db/migrations/003_...). Un seul fichier par
// boutique (clé fixe "{organization_id}/logo", écrasé à chaque upload) pour éviter
// d'accumuler des fichiers orphelins.
export function useUploadShopLogo() {
  const organizationId = useOrganizationId();
  const updateShop = useUpdateShop();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const path = `${organizationId}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("shop-logos").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`; // casse le cache navigateur après remplacement
      await updateShop.mutateAsync({ logo_url: url });
      return url;
    },
  });
}

// Image produit (bucket "product-images", migration 012 — public en
// lecture, écriture owner/manager/stock). Un fichier par produit (clé
// fixe "{organization_id}/{product_id}", écrasé à chaque upload). Ne met pas à
// jour products.image_url elle-même (contrairement au logo boutique) :
// le produit doit déjà exister (avoir un id) avant l'upload, donc
// l'appelant enchaîne lui-même avec useUpsertProduct une fois l'URL
// obtenue — cf. ProductForm.
export function useUploadProductImage() {
  const organizationId = useOrganizationId();
  return useMutation({
    mutationFn: async ({ productId, file }: { productId: string; file: File }): Promise<string> => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const path = `${organizationId}/${productId}`;
      const { error: upErr } = await supabase.storage.from("product-images")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    },
  });
}

// ============ NOTIFICATIONS ============
// Événements réels insérés par des triggers Postgres (migration 011) :
// vente importante, stock bas/rupture, nouveau membre. Table déjà en
// place depuis le schéma initial (RLS ouverte à tout membre de la
// boutique — voir permissionsMatrix.ts), seule l'écriture était morte.
export type AppNotification = {
  id: string; organization_id: string; user_id: string | null;
  title: string; body: string | null; kind: string | null;
  read_at: string | null; created_at: string;
};

export function useNotifications(limit = 50) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["notifications", organizationId, limit],
    enabled: !!organizationId,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase.from("notifications")
        .select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useMarkNotificationRead() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications")
        .update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
}

export function useMarkAllNotificationsRead() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Aucune boutique sélectionnée");
      const { error } = await supabase.from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("organization_id", organizationId).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
}

export function useDismissNotification() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
}
