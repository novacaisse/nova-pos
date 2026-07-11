// Supabase data hooks — multi-tenant, always filtered by current shop_id.
// RLS also enforces this server-side; the shop_id filter is belt + suspenders.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useShop } from "@/lib/auth/ShopProvider";
import { useAuth } from "@/lib/auth/AuthProvider";

// ============ TYPES (Supabase shape) ============
export type Category = { id: string; shop_id: string; name: string; color: string | null };
export type Product = {
  id: string; shop_id: string; category_id: string | null;
  sku: string | null; barcode: string | null; name: string; description: string | null;
  price: number; cost: number; tax_rate: number; unit: string | null;
  image_url: string | null; is_active: boolean; low_stock_threshold: number;
};
export type ProductWithStock = Product & { stock: number };

export type Customer = {
  id: string; shop_id: string; name: string;
  email: string | null; phone: string | null; address: string | null;
  loyalty_points: number; credit_balance: number; notes: string | null;
  created_at: string;
};
export type Supplier = {
  id: string; shop_id: string; name: string;
  contact: string | null; email: string | null; phone: string | null;
  address: string | null; notes: string | null; created_at: string;
};
export type Expense = {
  id: string; shop_id: string; category: string | null; label: string;
  amount: number; paid_at: string; method: string | null; notes: string | null;
  created_at: string;
};
export type Promotion = {
  id: string; shop_id: string; name: string; kind: string;
  value: number; product_id: string | null;
  starts_at: string | null; ends_at: string | null; is_active: boolean;
};
export type StockMovement = {
  id: string; shop_id: string; product_id: string;
  type: "in" | "out" | "adjustment" | "transfer" | "sale" | "return";
  quantity: number; unit_cost: number | null; reason: string | null;
  reference: string | null; created_by: string | null; created_at: string;
};
export type Sale = {
  id: string; shop_id: string; reference: string;
  customer_id: string | null; cashier_id: string | null;
  status: "draft" | "completed" | "refunded" | "partially_refunded" | "cancelled";
  subtotal: number; discount: number; tax: number; total: number;
  paid: number; change_due: number;
  payment_method: "cash" | "mobile_money" | "card" | "credit" | "mixed";
  notes: string | null; created_at: string;
};
export type SaleItem = {
  id: string; shop_id: string; sale_id: string; product_id: string | null;
  name: string; quantity: number; unit_price: number; discount: number;
  tax_rate: number; total: number;
};

// ============ HELPERS ============
export function formatXOF(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " F";
}

function useShopId() {
  const { currentShop } = useShop();
  return currentShop?.id ?? null;
}

// ============ CATEGORIES ============
export function useCategories() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["categories", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories")
        .select("*").eq("shop_id", shopId!).order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
}
export function useUpsertCategory() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<Category> & { name: string }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const payload = { ...c, shop_id: shopId };
      const { data, error } = await supabase.from("categories")
        .upsert(payload).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", shopId] }),
  });
}
export function useDeleteCategory() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", shopId] }),
  });
}

// ============ PRODUCTS (with stock) ============
export function useProducts() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["products", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<ProductWithStock[]> => {
      const { data, error } = await supabase.from("products")
        .select("*, stock_levels(quantity)")
        .eq("shop_id", shopId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        stock: Number(p.stock_levels?.[0]?.quantity ?? 0),
      }));
    },
  });
}
export function useUpsertProduct() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<Product> & { name: string; price: number }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { stock, ...rest } = p as any;
      const payload: any = { ...rest, shop_id: shopId };
      const { data, error } = await supabase.from("products").upsert(payload).select().single();
      if (error) throw error;
      // Optional initial stock (only on create)
      if (!p.id && typeof stock === "number" && stock > 0) {
        await supabase.from("stock_movements").insert({
          shop_id: shopId, product_id: data.id, type: "in",
          quantity: stock, reason: "Stock initial",
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", shopId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", shopId] });
    },
  });
}
export function useDeleteProduct() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products", shopId] }),
  });
}

// ============ CUSTOMERS ============
export function useCustomers() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["customers", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from("customers")
        .select("*").eq("shop_id", shopId!).order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}
export function useUpsertCustomer() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<Customer> & { name: string }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("customers")
        .upsert({ ...c, shop_id: shopId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers", shopId] }),
  });
}
export function useDeleteCustomer() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers", shopId] }),
  });
}

// ============ SUPPLIERS ============
export function useSuppliers() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["suppliers", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from("suppliers")
        .select("*").eq("shop_id", shopId!).order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}
export function useUpsertSupplier() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<Supplier> & { name: string }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("suppliers")
        .upsert({ ...s, shop_id: shopId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", shopId] }),
  });
}
export function useDeleteSupplier() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", shopId] }),
  });
}

// ============ EXPENSES ============
export function useExpenses() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["expenses", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase.from("expenses")
        .select("*").eq("shop_id", shopId!).order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });
}
export function useUpsertExpense() {
  const shopId = useShopId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Partial<Expense> & { label: string; amount: number }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const payload: any = { ...e, shop_id: shopId };
      if (!e.id) payload.created_by = user?.id;
      const { data, error } = await supabase.from("expenses").upsert(payload).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", shopId] }),
  });
}
export function useDeleteExpense() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", shopId] }),
  });
}

// ============ PROMOTIONS ============
export function usePromotions() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["promotions", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Promotion[]> => {
      const { data, error } = await supabase.from("promotions")
        .select("*").eq("shop_id", shopId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Promotion[];
    },
  });
}
export function useUpsertPromotion() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<Promotion> & { name: string; kind: string }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("promotions")
        .upsert({ ...p, shop_id: shopId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions", shopId] }),
  });
}
export function useDeletePromotion() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions", shopId] }),
  });
}

// ============ STOCK MOVEMENTS ============
export function useStockMovements(limit = 100) {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["stock_movements", shopId, limit],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("*, products(name)")
        .eq("shop_id", shopId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({ ...m, product_name: m.products?.name ?? "—" }));
    },
  });
}
export function useCreateStockMovement() {
  const shopId = useShopId(); const { user } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      product_id: string; type: StockMovement["type"];
      quantity: number; reason?: string; reference?: string; unit_cost?: number;
    }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { error } = await supabase.from("stock_movements").insert({
        shop_id: shopId, created_by: user?.id, ...m,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_movements", shopId] });
      qc.invalidateQueries({ queryKey: ["products", shopId] });
    },
  });
}

// ============ SALES ============
export function useSales(limit = 200) {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["sales", shopId, limit],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("*, sale_items(*), customers(name)")
        .eq("shop_id", shopId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as (Sale & { sale_items: SaleItem[]; customers: { name: string } | null })[];
    },
  });
}

// createSale: inserts sale + items + payment + sale-type stock movements atomically enough.
export function useCreateSale() {
  const shopId = useShopId(); const { user } = useAuth(); const qc = useQueryClient();
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
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const items = input.items.map((it) => {
        const line = it.quantity * it.unit_price - (it.discount ?? 0);
        return { ...it, discount: it.discount ?? 0, tax_rate: it.tax_rate ?? 0, total: line };
      });
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const itemsDiscount = items.reduce((s, i) => s + (i.discount ?? 0), 0);
      const discount = (input.discount ?? 0) + itemsDiscount;
      const total = Math.max(0, subtotal - discount);
      const change_due = Math.max(0, input.paid - total);

      const { data: sale, error: e1 } = await supabase.from("sales").insert({
        shop_id: shopId,
        reference: input.reference,
        customer_id: input.customer_id ?? null,
        cashier_id: user?.id,
        status: input.status ?? "completed",
        subtotal, discount, tax: 0, total,
        paid: input.paid, change_due,
        payment_method: input.payment_method,
        notes: input.notes ?? null,
      }).select().single();
      if (e1) throw e1;

      const itemsPayload = items.map((it) => ({
        shop_id: shopId, sale_id: sale.id,
        product_id: it.product_id, name: it.name,
        quantity: it.quantity, unit_price: it.unit_price,
        discount: it.discount, tax_rate: it.tax_rate, total: it.total,
      }));
      const { error: e2 } = await supabase.from("sale_items").insert(itemsPayload);
      if (e2) throw e2;

      if (input.paid > 0) {
        await supabase.from("payments").insert({
          shop_id: shopId, sale_id: sale.id,
          method: input.payment_method === "mixed" ? "cash" : input.payment_method,
          amount: input.paid,
        });
      }

      // stock movements for real products
      const stockRows = items
        .filter((it) => it.product_id)
        .map((it) => ({
          shop_id: shopId, product_id: it.product_id!,
          type: "sale" as const, quantity: it.quantity,
          reason: `Vente ${input.reference}`, reference: input.reference,
          created_by: user?.id,
        }));
      if (stockRows.length) {
        await supabase.from("stock_movements").insert(stockRows);
      }
      return sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", shopId] });
      qc.invalidateQueries({ queryKey: ["products", shopId] });
      qc.invalidateQueries({ queryKey: ["stock_movements", shopId] });
    },
  });
}

// Helper — generate a short unique ticket ref.
export function newTicketRef(prefix = "T") {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
