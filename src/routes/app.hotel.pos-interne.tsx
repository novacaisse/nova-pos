// Point de vente ZegHotel — même structure visuelle que le PDV ZegCaisse
// (grille produits + panier), avec deux façons d'encaisser propres à
// l'hôtel : facturer sur la note d'un client en séjour (post_hotel_pos_charge,
// Phase 7, migration 033) ou encaisser tout de suite un client de passage
// (create_hotel_pos_sale, migration 077) — piscine/bar/restaurant vendus
// comme n'importe quel autre article du catalogue, pas de module dédié.
// Le catalogue lui-même (upload photo, SKU, stock) vit désormais dans
// /app/hotel/produits (module Produits & Stock dédié) — l'onglet
// "Catalogue" qui vivait ici est retiré, superflu.
//
// Parité ZegCaisse (mission "mise à jour ZegHotel", item 6) : plein écran,
// scanner code-barres, remise, ventes récentes, vente du jour, reçu
// imprimable, quantité de stock affichée — mêmes composants/patterns que
// app.caisse.tsx, adaptés à hotel_pos_sales (pas de vente à crédit/partielle
// ici : create_hotel_pos_sale règle toujours paid = total, donc pas de
// "solder une vente non payée" côté ventes récentes, contrairement à
// ZegCaisse qui gère les ventes à crédit).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, Trash2, Receipt, Loader2, Coffee, X, Search,
  BedDouble, Banknote, Smartphone, CreditCard, Check, Settings2,
  Maximize2, Minimize2, ScanLine, History, CalendarRange, Printer, Percent, Download,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useFormatMoney, useCategories, useProducts, useShopSettings, type ProductWithStock } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import { BarcodeScannerDialog } from "@/components/app/BarcodeScannerDialog";
import {
  useHotelActiveFolios, usePostHotelPosCharge, useCreateHotelPosSale, useHotelPosSales,
  type HotelPosSale,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/pos-interne")({
  component: HotelPosPage,
});

type CartLine = { product: ProductWithStock; quantity: number };
type Mode = "chambre" | "immediat";
type DiscountMode = "pct" | "amount";
const PAYMENT_METHODS: { k: HotelPosSale["payment_method"]; label: string; icon: typeof Banknote }[] = [
  { k: "cash", label: "Espèces", icon: Banknote },
  { k: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { k: "card", label: "Carte", icon: CreditCard },
];

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function HotelPosPage() {
  const formatMoney = useFormatMoney();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
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
  const [fullscreen, setFullscreen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [showDailyExport, setShowDailyExport] = useState(false);
  const [discountMode, setDiscountMode] = useState<DiscountMode>("pct");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmountInput, setDiscountAmountInput] = useState(0);

  useEffect(() => {
    document.body.classList.toggle("pos-fullscreen", fullscreen);
    return () => document.body.classList.remove("pos-fullscreen");
  }, [fullscreen]);

  const activeProducts = useMemo(() => products.filter((p) => {
    if (!p.is_active) return false;
    if (categoryId && p.category_id !== categoryId) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
  }), [products, query, categoryId]);

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const discountAmt = Math.max(0, Math.min(subtotal, discountMode === "pct" ? Math.round((subtotal * discountPct) / 100) : Math.round(discountAmountInput)));
  const total = Math.round(subtotal - discountAmt);

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
  const clearCart = () => { setCart([]); setFolioId(""); setDiscountMode("pct"); setDiscountPct(0); setDiscountAmountInput(0); };

  const submit = async () => {
    setError(null);
    if (!cart.length) { setError("Le panier est vide."); return; }
    const items = cart.map((l) => ({ product_id: l.product.id, name: l.product.name, quantity: l.quantity, unit_price: l.product.price }));
    try {
      if (mode === "chambre") {
        if (!folioId) { setError("Sélectionnez un client en séjour."); return; }
        // La remise globale ne s'applique qu'au paiement immédiat — sur la
        // note, chaque article est posté à son prix plein (folio détaillé,
        // une remise éventuelle se gère alors comme charge "discount" sur
        // le folio directement, cf. ReservationDrawer).
        await postCharge.mutateAsync({ folioId, items });
        clearCart();
      } else {
        const sale = await createSale.mutateAsync({ items, discount: discountAmt, paymentMethod: payment, paid: total });
        setReceipt(sale);
        clearCart();
      }
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  const busy = postCharge.isPending || createSale.isPending;

  return (
    <div className={cn("flex flex-col", fullscreen ? "h-screen" : "h-[calc(100vh-4rem)]")}>
      <div className="pos-hide-in-fullscreen">
        <PageHeader title="Point de vente" subtitle="Restaurant, bar, piscine, room service — sur la note d'un client ou encaissé tout de suite"
          actions={
            <Link to="/app/hotel/produits" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Settings2 className="h-4 w-4" /> Gérer le catalogue
            </Link>
          }
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un article, scanner…"
                className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary">
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowScanner(true)} title="Scanner un code-barres"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15">
              <ScanLine className="h-5 w-5" />
            </button>
            <button onClick={() => setShowRecentSales(true)} title="Ventes récentes"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted">
              <History className="h-4 w-4" />
            </button>
            <button onClick={() => setShowDailyExport(true)} title="Vente du jour"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted">
              <CalendarRange className="h-4 w-4" />
            </button>
            <button onClick={() => setFullscreen((f) => !f)} title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted">
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
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
                  // track_stock (migration 088) : un article sans suivi de
                  // stock (plat, café...) n'affiche jamais "Rupture" — son
                  // stock n'a jamais de sens (toujours 0, aucun mouvement).
                  const outOfStock = p.track_stock && p.stock <= 0;
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all hover:shadow-elegant",
                        outOfStock ? "border-destructive/50" : "border-border hover:border-primary/40")}>
                      <div className="relative grid aspect-square place-items-center bg-gradient-to-br from-muted to-background text-4xl">
                        {p.image_url ? <img src={p.image_url} alt="" className={cn("h-full w-full object-cover", outOfStock && "opacity-50 grayscale")} /> : "📦"}
                        {outOfStock && (
                          <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">Rupture</span>
                        )}
                        {p.track_stock && !outOfStock && (
                          <span className="absolute right-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-bold text-muted-foreground shadow-sm">Stock {p.stock}</span>
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
        </div>

        <div className="flex h-fit max-h-full flex-col space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4">
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

          {/* Remise globale (mission "mise à jour ZegHotel", item 6) —
              paiement immédiat uniquement, cf. commentaire dans submit(). */}
          {mode === "immediat" && cart.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Percent className="h-3.5 w-3.5" /> Remise</span>
              <div className="flex items-center gap-1.5">
                <div className="flex overflow-hidden rounded-lg border border-border text-[10px] font-bold">
                  <button type="button" onClick={() => setDiscountMode("pct")} className={cn("px-1.5 py-0.5", discountMode === "pct" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>%</button>
                  <button type="button" onClick={() => setDiscountMode("amount")} className={cn("px-1.5 py-0.5", discountMode === "amount" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>F</button>
                </div>
                {discountMode === "pct" ? (
                  <input type="number" onFocus={selectOnFocus} min={0} max={100} value={discountPct}
                    onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs" />
                ) : (
                  <input type="number" onFocus={selectOnFocus} min={0} value={discountAmountInput}
                    onChange={(e) => setDiscountAmountInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs" />
                )}
              </div>
            </div>
          )}
          {mode === "immediat" && discountAmt > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Remise</span><span className="tabular">− {formatMoney(discountAmt)}</span></div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-bold">
            <span>Total</span><span>{formatMoney(mode === "immediat" ? total : subtotal)}</span>
          </div>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
          <button onClick={submit} disabled={busy || !cart.length || (mode === "chambre" && !folioId)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "chambre" ? <Receipt className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {mode === "chambre" ? "Facturer sur la note" : `Encaisser ${formatMoney(total)}`}
          </button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScannerDialog onClose={() => setShowScanner(false)} onDetect={(code) => {
          const p = products.find((x) => x.barcode === code || x.sku === code);
          if (p) addToCart(p); else setError(`Aucun article avec le code ${code}.`);
          setShowScanner(false);
        }} />
      )}
      {showRecentSales && <RecentSalesDialog onClose={() => setShowRecentSales(false)} />}
      {showDailyExport && <DailyExportDialog onClose={() => setShowDailyExport(false)} />}
      {receipt && (
        <ReceiptDialog sale={receipt} org={currentOrganization} settings={settings} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}

function ReceiptDialog({ sale, org, settings, onClose }: {
  sale: HotelPosSale; org: { name: string; logo_url: string | null } | null;
  settings: { data: { address?: string; phone?: string; ifu?: string } } | null | undefined; onClose: () => void;
}) {
  const formatMoney = useFormatMoney();

  const print = () => {
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Référence</h2><div class="name">${sale.reference}</div></div>
        <div class="block" style="text-align:right"><h2>Paiement</h2><div class="name">${PAYMENT_METHODS.find((m) => m.k === sale.payment_method)?.label ?? sale.payment_method}</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Montant</th></tr></thead>
        <tbody>${sale.items.map((it) => `<tr><td>${it.name}</td><td class="num">${it.quantity}</td><td class="num">${formatMoney(it.unit_price)}</td><td class="num">${formatMoney(it.quantity * it.unit_price)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="doc-totals">
        <div class="row"><span>Sous-total</span><span>${formatMoney(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div class="row"><span>Remise</span><span>-${formatMoney(sale.discount)}</span></div>` : ""}
        <div class="row total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
      </div>`;
    const html = renderA4Document({
      docTitle: "Reçu — Point de vente",
      docNumber: sale.reference,
      docDate: new Date(sale.created_at).toLocaleString("fr-FR"),
      shop: { shopName: org?.name ?? "Organisation", logoUrl: org?.logo_url, address: settings?.data.address, phone: settings?.data.phone, ifu: settings?.data.ifu },
      bodyHtml,
      footerHtml: "Reçu généré par ZegHotel.",
    });
    openPrintWindow(html, { width: 700, height: 700 });
  };

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
          {sale.discount > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Remise</span><span>-{formatMoney(sale.discount)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          <button onClick={print} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted">
            <Printer className="h-4 w-4" /> Imprimer le reçu
          </button>
          <button onClick={onClose} className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// Ventes récentes (mission "mise à jour ZegHotel", item 6) — lecture seule :
// contrairement à ZegCaisse, create_hotel_pos_sale règle toujours
// paid = total, il n'existe pas de vente partiellement payée à solder ici.
function RecentSalesDialog({ onClose }: { onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: sales = [], isLoading } = useHotelPosSales(40);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ventes récentes</div>
            <div className="font-display text-lg font-bold">{sales.length} vente{sales.length > 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {isLoading ? (
            <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : sales.length === 0 ? (
            <div className="grid place-items-center py-12 text-sm text-muted-foreground">Aucune vente pour l'instant.</div>
          ) : sales.map((s) => (
            <div key={s.id} className="mb-2 flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.reference}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">{PAYMENT_METHODS.find((m) => m.k === s.payment_method)?.label ?? s.payment_method}</span>
                </div>
              </div>
              <div className="tabular text-sm font-bold">{formatMoney(Number(s.total))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Vente du jour — impression/export (mission "mise à jour ZegHotel", item 6,
// même pattern que DailyExportDialog dans app.caisse.tsx).
function DailyExportDialog({ onClose }: { onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const range = { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` };
  const { data: sales = [], isLoading } = useHotelPosSales({ from: range.from, to: range.to, limit: 2000 });

  const lines = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; total: number }>();
    for (const s of sales) {
      for (const it of s.items) {
        const key = it.product_id ?? `manuel:${it.name}`;
        const cur = agg.get(key) ?? { name: it.name, qty: 0, total: 0 };
        cur.qty += it.quantity;
        cur.total += it.quantity * it.unit_price;
        agg.set(key, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.total - a.total);
  }, [sales]);
  const grandTotal = sales.reduce((s, x) => s + Number(x.total), 0);
  const periodLabel = from === to ? new Date(from).toLocaleDateString("fr-FR") : `${new Date(from).toLocaleDateString("fr-FR")} → ${new Date(to).toLocaleDateString("fr-FR")}`;

  const exportCsv = () => {
    const rows = [
      ["Vente de la période", periodLabel].join(","),
      "",
      ["Article", "Quantité", "Montant"].join(","),
      ...lines.map((l) => [l.name, l.qty, l.total].join(",")),
      "",
      ["Total", "", grandTotal].join(","),
    ].join("\n");
    downloadFile(`vente-pos-hotel-${from}-${to}.csv`, rows, "text/csv");
  };

  const printSummary = () => {
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Période</h2><div class="name">${periodLabel}</div></div>
        <div class="block" style="text-align:right"><h2>Ventes</h2><div class="name">${sales.length}</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">Montant</th></tr></thead>
        <tbody>${lines.map((l) => `<tr><td>${l.name}</td><td class="num">${l.qty}</td><td class="num">${formatMoney(l.total)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2"><strong>Total</strong></td><td class="num"><strong>${formatMoney(grandTotal)}</strong></td></tr></tfoot>
      </table>`;
    const html = renderA4Document({
      docTitle: `Vente POS — ${periodLabel}`,
      docDate: new Date().toLocaleString("fr-FR"),
      shop: { shopName: currentOrganization?.name ?? "Organisation", logoUrl: currentOrganization?.logo_url, address: settings?.data.address, phone: settings?.data.phone, ifu: settings?.data.ifu },
      bodyHtml,
    });
    openPrintWindow(html);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Vente de la période</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Du</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
            <span className="text-muted-foreground">au</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
            {isLoading ? (
              <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : lines.length === 0 ? (
              <div className="grid place-items-center py-10 text-sm text-muted-foreground">Aucune vente sur cette période.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Article</th><th className="px-3 py-2 text-right">Qté</th><th className="px-3 py-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="tabular px-3 py-2 text-right">{l.qty}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{formatMoney(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <span className="text-sm font-semibold">Montant total</span>
            <span className="tabular text-lg font-black">{formatMoney(grandTotal)}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={exportCsv} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted">
              <Download className="h-4 w-4" /> Excel
            </button>
            <button onClick={printSummary} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90">
              <Printer className="h-4 w-4" /> Imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
