// Point de vente ZegHotel — même structure visuelle que le PDV ZegCaisse
// (grille produits + panier), avec deux façons d'encaisser propres à
// l'hôtel : facturer sur la note d'un client en séjour (post_hotel_pos_charge,
// Phase 7, migration 033) ou encaisser tout de suite un client de passage
// (create_hotel_pos_sale, migration 077) — piscine/bar/restaurant vendus
// comme n'importe quel autre article du catalogue, pas de module dédié.
// Le catalogue lui-même (upload photo, SKU, stock) vit désormais dans
// /app/hotel/produits (module Produits & Stock dédié) — l'onglet
// "Catalogue" qui vivait ici est retiré, superflu.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, Trash2, Receipt, Loader2, Coffee, X, Search,
  BedDouble, Banknote, Smartphone, CreditCard, Check, Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useFormatMoney, useCategories, useProducts, type ProductWithStock } from "@/lib/data/hooks";
import { useHotelActiveFolios, usePostHotelPosCharge, useCreateHotelPosSale, type HotelPosSale } from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/pos-interne")({
  component: HotelPosPage,
});

type CartLine = { product: ProductWithStock; quantity: number };
type Mode = "chambre" | "immediat";
const PAYMENT_METHODS: { k: HotelPosSale["payment_method"]; label: string; icon: typeof Banknote }[] = [
  { k: "cash", label: "Espèces", icon: Banknote },
  { k: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { k: "card", label: "Carte", icon: CreditCard },
];

function HotelPosPage() {
  const formatMoney = useFormatMoney();
  const { data: folios = [], isLoading: loadingFolios } = useHotelActiveFolios();
  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const postCharge = usePostHotelPosCharge();
  const createSale = useCreateHotelPosSale();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<Mode>("chambre");
  const [folioId, setFolioId] = useState("");
  const [payment, setPayment] = useState<HotelPosSale["payment_method"]>("cash");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<HotelPosSale | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (categoryId && p.category_id !== categoryId) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
  }), [products, query, categoryId]);

  const total = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);

  const addToCart = (product: ProductWithStock) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product, quantity: 1 }];
    });
  };
  const setQty = (productId: string, quantity: number) => {
    setCart((prev) => quantity <= 0
      ? prev.filter((l) => l.product.id !== productId)
      : prev.map((l) => l.product.id === productId ? { ...l, quantity } : l));
  };
  const clearCart = () => { setCart([]); setFolioId(""); };

  const submit = async () => {
    setError(null);
    if (!cart.length) { setError("Le panier est vide."); return; }
    const items = cart.map((l) => ({ product_id: l.product.id, name: l.product.name, quantity: l.quantity, unit_price: l.product.price }));
    try {
      if (mode === "chambre") {
        if (!folioId) { setError("Sélectionnez un client en séjour."); return; }
        await postCharge.mutateAsync({ folioId, items });
        clearCart();
      } else {
        const sale = await createSale.mutateAsync({ items, discount: 0, paymentMethod: payment, paid: total });
        setReceipt(sale);
        clearCart();
      }
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  const busy = postCharge.isPending || createSale.isPending;

  return (
    <div>
      <PageHeader title="Point de vente" subtitle="Restaurant, bar, piscine, room service — sur la note d'un client ou encaissé tout de suite"
        actions={
          <Link to="/app/hotel/produits" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            <Settings2 className="h-4 w-4" /> Gérer le catalogue
          </Link>
        }
      />
      <div className="grid gap-4 p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un article…"
                className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary">
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {loadingProducts ? (
            <div className="grid place-items-center rounded-2xl border border-border bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : activeProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              <Coffee className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Aucun article dans le catalogue. <Link to="/app/hotel/produits" className="font-semibold text-primary hover:underline">Ajouter un article</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {activeProducts.map((p) => {
                const outOfStock = p.stock <= 0;
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all hover:shadow-elegant",
                      outOfStock ? "border-destructive/50" : "border-border hover:border-primary/40")}>
                    <div className="relative grid aspect-square place-items-center bg-gradient-to-br from-muted to-background text-4xl">
                      {p.image_url ? <img src={p.image_url} alt="" className={cn("h-full w-full object-cover", outOfStock && "opacity-50 grayscale")} /> : "📦"}
                      {outOfStock && (
                        <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">Rupture</span>
                      )}
                    </div>
                    <div className="min-w-0 px-2.5 py-2">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <span className="tabular text-sm font-bold text-primary">{formatMoney(p.price)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-fit space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex gap-1 rounded-xl border border-border bg-background p-1">
            <button onClick={() => setMode("chambre")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold", mode === "chambre" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <BedDouble className="h-3.5 w-3.5" /> Sur la note
            </button>
            <button onClick={() => setMode("immediat")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold", mode === "immediat" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <Receipt className="h-3.5 w-3.5" /> Paiement immédiat
            </button>
          </div>

          {mode === "chambre" ? (
            <select value={folioId} onChange={(e) => setFolioId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              <option value="">{loadingFolios ? "Chargement…" : "Sélectionner un client en séjour…"}</option>
              {folios.map((f) => (
                <option key={f.folio_id} value={f.folio_id}>{f.guest_name} — Ch. {f.room_numbers || "—"}</option>
              ))}
            </select>
          ) : (
            <div className="flex gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.k} onClick={() => setPayment(m.k)}
                  className={cn("flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-semibold", payment === m.k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  <m.icon className="h-4 w-4" /> {m.label}
                </button>
              ))}
            </div>
          )}

          {mode === "chambre" && !folios.length && !loadingFolios && (
            <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Aucun client actuellement en séjour (check-in effectué).
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-3 text-sm font-bold"><ShoppingCart className="h-4 w-4 text-primary" /> Panier</div>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun article sélectionné.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {cart.map((l) => (
                <div key={l.product.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.product.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border hover:bg-muted"><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center tabular">{l.quantity}</span>
                    <button onClick={() => setQty(l.product.id, l.quantity + 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  </div>
                  <span className="w-16 shrink-0 text-right tabular font-semibold">{formatMoney(l.product.price * l.quantity)}</span>
                  <button onClick={() => setQty(l.product.id, 0)} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-bold">
            <span>Total</span><span>{formatMoney(total)}</span>
          </div>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
          <button onClick={submit} disabled={busy || !cart.length || (mode === "chambre" && !folioId)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "chambre" ? <Receipt className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {mode === "chambre" ? "Facturer sur la note" : `Encaisser ${formatMoney(total)}`}
          </button>
        </div>
      </div>

      {receipt && <ReceiptDialog sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function ReceiptDialog({ sale, onClose }: { sale: HotelPosSale; onClose: () => void }) {
  const formatMoney = useFormatMoney();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 text-success">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-success/15"><Check className="h-4 w-4" /></div>
            <div className="font-display text-sm font-bold">Encaissement validé</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 p-5 text-sm">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Référence</span><span className="font-mono">{sale.reference}</span></div>
          <div className="space-y-1 rounded-xl border border-border p-3">
            {sale.items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{it.name} × {it.quantity}</span><span className="font-semibold">{formatMoney(it.quantity * it.unit_price)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
        </div>
        <div className="border-t border-border p-3">
          <button onClick={onClose} className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90">Fermer</button>
        </div>
      </div>
    </div>
  );
}
