// Supabase data hooks — multi-tenant, always filtered by current shop_id.
// RLS also enforces this server-side; the shop_id filter is belt + suspenders.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useShop } from "@/lib/auth/ShopProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppRole } from "@/lib/roles";

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
// Accepte soit une limite (rétrocompatible avec les appels existants), soit
// des options incluant un filtre de date — utilisé par Rapports pour filtrer
// côté requête plutôt que de tout charger et trier côté client.
export function useSales(opts: number | { limit?: number; from?: string; to?: string } = 200) {
  const { limit = 200, from, to } = typeof opts === "number" ? { limit: opts } : opts;
  const shopId = useShopId();
  return useQuery({
    queryKey: ["sales", shopId, limit, from, to],
    enabled: !!shopId,
    queryFn: async () => {
      let q = supabase.from("sales")
        .select("*, sale_items(*), customers(name)")
        .eq("shop_id", shopId!);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
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

// ============ DEVIS ============
export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "converted" | "expired";
export type Quote = {
  id: string; shop_id: string; reference: string;
  customer_id: string | null;
  status: QuoteStatus;
  subtotal: number; discount: number; tax: number; total: number;
  valid_until: string | null;
  converted_sale_id: string | null;
  notes: string | null; created_at: string;
};
export type QuoteItem = {
  id: string; shop_id: string; quote_id: string; product_id: string | null;
  name: string; quantity: number; unit_price: number; discount: number;
  tax_rate: number; total: number;
};
export type QuoteWithItems = Quote & { quote_items: QuoteItem[]; customers: { name: string } | null };

export function useQuotes(limit = 200) {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["quotes", shopId, limit],
    enabled: !!shopId,
    queryFn: async (): Promise<QuoteWithItems[]> => {
      const { data, error } = await supabase.from("quotes")
        .select("*, quote_items(*), customers(name)")
        .eq("shop_id", shopId!).order("created_at", { ascending: false }).limit(limit);
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
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      reference?: string;
      customer_id?: string | null;
      valid_until?: string | null;
      notes?: string | null;
      status?: QuoteStatus;
      items: { product_id: string | null; name: string; quantity: number; unit_price: number; discount?: number; tax_rate?: number }[];
    }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const items = input.items.map((it) => {
        const line = it.quantity * it.unit_price - (it.discount ?? 0);
        return { ...it, discount: it.discount ?? 0, tax_rate: it.tax_rate ?? 0, total: line };
      });
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const itemsDiscount = items.reduce((s, i) => s + (i.discount ?? 0), 0);
      const total = Math.max(0, subtotal - itemsDiscount);

      const payload = {
        shop_id: shopId,
        reference: input.reference ?? newTicketRef("DEV"),
        customer_id: input.customer_id ?? null,
        status: input.status ?? "draft",
        subtotal, discount: itemsDiscount, tax: 0, total,
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
          shop_id: shopId, quote_id: quoteId,
          product_id: it.product_id, name: it.name,
          quantity: it.quantity, unit_price: it.unit_price,
          discount: it.discount, tax_rate: it.tax_rate, total: it.total,
        }));
        const { error } = await supabase.from("quote_items").insert(itemsPayload);
        if (error) throw error;
      }
      return quoteId!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", shopId] }),
  });
}

export function useDeleteQuote() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", shopId] }),
  });
}

// Marque un devis converti après création réussie de la vente (voir
// useCreateSale, réutilisé tel quel pour la conversion — pas de logique de
// vente dupliquée).
export function useMarkQuoteConverted() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, saleId }: { quoteId: string; saleId: string }) => {
      const { error } = await supabase.from("quotes")
        .update({ status: "converted" as QuoteStatus, converted_sale_id: saleId }).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", shopId] }),
  });
}

// ============ ABONNEMENT ============
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type Subscription = {
  id: string; shop_id: string; plan: string; status: SubscriptionStatus;
  amount: number; currency: string; started_at: string;
  current_period_end: string | null; provider: string | null; provider_ref: string | null;
  created_at: string;
};

export function useSubscription() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["subscription", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase.from("subscriptions")
        .select("*").eq("shop_id", shopId!)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
  });
}

export type SubscriptionPaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type SubscriptionPayment = {
  id: string; shop_id: string; subscription_id: string;
  amount: number; currency: string; method: string; status: SubscriptionPaymentStatus;
  provider: string | null; provider_ref: string | null;
  paid_at: string | null; created_at: string;
};

export function useSubscriptionPayments(limit = 50) {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["subscription_payments", shopId, limit],
    enabled: !!shopId,
    queryFn: async (): Promise<SubscriptionPayment[]> => {
      const { data, error } = await supabase.from("subscription_payments")
        .select("*").eq("shop_id", shopId!)
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

// Helper — generate a short unique ticket ref.
export function newTicketRef(prefix = "T") {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ============ PROFIL (utilisateur courant) ============
export type Profile = { id: string; full_name: string | null; phone: string | null; avatar_url: string | null };

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
    mutationFn: async (patch: Partial<Pick<Profile, "full_name" | "phone">>) => {
      if (!user) throw new Error("Non authentifié");
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select().single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });
}

// ============ RÔLE de l'utilisateur courant dans la boutique active ============
// Fondation partagée par Profil, Équipe et les garde-fous UI par rôle.
export function useMyRole() {
  const shopId = useShopId();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_role", shopId, user?.id],
    enabled: !!shopId && !!user,
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase.from("shop_members")
        .select("role").eq("shop_id", shopId!).eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole | undefined) ?? null;
    },
  });
}

// ============ ÉQUIPE (shop_members + profils) ============
// Pas de FK shop_members.user_id -> profiles.id (les deux référencent
// auth.users indépendamment), donc pas d'embed PostgREST possible : on
// fait deux requêtes et on fusionne côté client.
export type ShopMember = {
  id: string; shop_id: string; user_id: string; role: AppRole; created_at: string;
  profile: { full_name: string | null; phone: string | null } | null;
};

export function useShopMembers() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["shop_members", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<ShopMember[]> => {
      const { data: members, error } = await supabase.from("shop_members")
        .select("*").eq("shop_id", shopId!).order("created_at");
      if (error) throw error;
      const userIds = (members ?? []).map((m: any) => m.user_id);
      let profiles: Record<string, { full_name: string | null; phone: string | null }> = {};
      if (userIds.length) {
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id, full_name, phone").in("id", userIds);
        if (profErr) throw profErr;
        profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }
      return (members ?? []).map((m: any) => ({ ...m, profile: profiles[m.user_id] ?? null }));
    },
  });
}

export function useInviteMember() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data: userId, error: rpcErr } = await supabase.rpc("find_user_id_by_email", { _email: email.trim() });
      if (rpcErr) throw rpcErr;
      if (!userId) throw new Error("Aucun compte trouvé avec cet email. La personne doit d'abord créer un compte via /rejoindre.");
      const { error } = await supabase.from("shop_members").insert({ shop_id: shopId, user_id: userId, role });
      if (error) {
        if ((error as any).code === "23505") throw new Error("Cette personne fait déjà partie de l'équipe.");
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_members", shopId] }),
  });
}

export function useUpdateMemberRole() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: AppRole }) => {
      const { error } = await supabase.from("shop_members").update({ role }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_members", shopId] }),
  });
}

export function useRemoveMember() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("shop_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_members", shopId] }),
  });
}

// ============ SHOP (identité + logo + ticket de caisse) ============
// Les champs sans colonne dédiée sur `shops` (adresse, téléphone, RCCM/IFU,
// réseaux sociaux) vivent dans shop_settings.data (jsonb), pour éviter une
// migration de schéma supplémentaire.
export type TicketConfig = {
  showLogo?: boolean; showAddress?: boolean; showPhone?: boolean;
  showFiscal?: boolean; showCashier?: boolean; showQr?: boolean;
  thanks?: string;
};
export type ShopSettingsData = {
  phone?: string; email?: string; address?: string;
  rccm?: string; ifu?: string; facebook?: string; instagram?: string;
  ticket?: TicketConfig;
};
export type ShopSettings = {
  shop_id: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_logo_url: string | null;
  tax_included: boolean;
  data: ShopSettingsData;
};

const EMPTY_SHOP_SETTINGS: Omit<ShopSettings, "shop_id"> = {
  receipt_header: null, receipt_footer: null, receipt_logo_url: null,
  tax_included: true, data: {},
};

export function useShopSettings() {
  const shopId = useShopId();
  return useQuery({
    queryKey: ["shop_settings", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<ShopSettings> => {
      const { data, error } = await supabase.from("shop_settings")
        .select("*").eq("shop_id", shopId!).maybeSingle();
      if (error) throw error;
      return (data as ShopSettings | null) ?? { shop_id: shopId!, ...EMPTY_SHOP_SETTINGS };
    },
  });
}

export function useUpdateShopSettings() {
  const shopId = useShopId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<ShopSettings, "shop_id">>) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("shop_settings")
        .upsert({ shop_id: shopId, ...patch }).select().single();
      if (error) throw error;
      return data as ShopSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_settings", shopId] }),
  });
}

export function useUpdateShop() {
  const shopId = useShopId();
  const { refresh } = useShop();
  return useMutation({
    mutationFn: async (patch: { name?: string; logo_url?: string | null }) => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const { data, error } = await supabase.from("shops")
        .update(patch).eq("id", shopId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => refresh(),
  });
}

// Upload du logo vers le bucket Storage "shop-logos" (public en lecture,
// écriture owner/manager — voir db/migrations/003_...). Un seul fichier par
// boutique (clé fixe "{shop_id}/logo", écrasé à chaque upload) pour éviter
// d'accumuler des fichiers orphelins.
export function useUploadShopLogo() {
  const shopId = useShopId();
  const updateShop = useUpdateShop();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!shopId) throw new Error("Aucune boutique sélectionnée");
      const path = `${shopId}/logo`;
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
