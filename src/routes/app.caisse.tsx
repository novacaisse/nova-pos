import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Plus, Minus, Trash2, Percent, Pause, Banknote, Smartphone, CreditCard,
  UserPlus, ScanLine, X, Maximize2, Minimize2, RotateCcw, Printer, Wallet, Check,
} from "lucide-react";
import { CATEGORIES, PRODUCTS, formatXOF, type CartLine, type Product } from "@/lib/mock/catalog";
import { CUSTOMERS, type Customer } from "@/lib/mock/customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/caisse")({
  component: CaissePage,
});

type PaymentMethod = "cash" | "mobile" | "card";
type PaymentType = "total" | "avance" | "acompte";

type Line = CartLine & { discount_pct?: number };

type HoldTicket = {
  id: string;
  createdAt: string;
  lines: Line[];
  discountPct: number;
  customer?: Customer;
};

type Receipt = {
  ticket: string;
  at: Date;
  lines: Line[];
  subtotal: number;
  discountAmt: number;
  total: number;
  received: number;
  paidNow: number;
  due: number;
  method: PaymentMethod;
  type: PaymentType;
  customer?: Customer;
};

function CaissePage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [cart, setCart] = useState<Line[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [showPay, setShowPay] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [holds, setHolds] = useState<HoldTicket[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const [customer, setCustomer] = useState<Customer | undefined>();
  const [showCustomer, setShowCustomer] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // fullscreen toggles a body class read by the app layout
  useEffect(() => {
    document.body.classList.toggle("pos-fullscreen", fullscreen);
    return () => document.body.classList.remove("pos-fullscreen");
  }, [fullscreen]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    });
  }, [query, categoryId]);

  const subtotal = cart.reduce((s, l) => {
    const d = l.discount_pct ?? 0;
    return s + l.unit_price * l.quantity * (1 - d / 100);
  }, 0);
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const total = Math.round(subtotal - discountAmt);
  const itemsCount = cart.reduce((s, l) => s + l.quantity, 0);

  function addProduct(p: Product) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...c, { product_id: p.id, name: p.name, unit_price: p.price, quantity: 1 }];
    });
  }
  const updateQty = (id: string, delta: number) =>
    setCart((c) => c.map((l) => (l.product_id === id ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  const setLineDiscount = (id: string, pct: number) =>
    setCart((c) => c.map((l) => (l.product_id === id ? { ...l, discount_pct: Math.max(0, Math.min(100, pct)) } : l)));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.product_id !== id));
  const clearCart = () => { setCart([]); setDiscountPct(0); setCustomer(undefined); };

  const holdCurrent = () => {
    if (cart.length === 0) return;
    setHolds((h) => [
      { id: `H-${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString(), lines: cart, discountPct, customer },
      ...h,
    ]);
    clearCart();
  };
  const resumeHold = (id: string) => {
    const t = holds.find((h) => h.id === id);
    if (!t) return;
    setCart(t.lines);
    setDiscountPct(t.discountPct);
    setCustomer(t.customer);
    setHolds((h) => h.filter((x) => x.id !== id));
    setShowHolds(false);
  };

  return (
    <div className={cn("grid gap-0", "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]", fullscreen ? "h-screen" : "h-[calc(100vh-4rem)]")}>
      {/* LEFT — catalogue */}
      <section className="flex min-w-0 flex-col overflow-hidden border-r border-border">
        <div className="border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un produit, un SKU, scanner…"
                className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15" aria-label="Scanner">
              <ScanLine className="h-5 w-5" />
            </button>
            <button
              onClick={() => setFullscreen((f) => !f)}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-card hover:bg-muted"
              aria-label={fullscreen ? "Quitter plein écran" : "Plein écran"}
              title={fullscreen ? "Quitter plein écran" : "Plein écran"}
            >
              {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <CategoryPill active={categoryId === "all"} onClick={() => setCategoryId("all")} label="Tout" count={PRODUCTS.length} />
            {CATEGORIES.map((c) => (
              <CategoryPill key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} label={c.name}
                count={PRODUCTS.filter((p) => p.category_id === c.id).length} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {products.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Aucun résultat pour « {query} »</div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {products.map((p) => <ProductCard key={p.id} product={p} onAdd={() => addProduct(p)} />)}
            </div>
          )}
        </div>
      </section>

      {/* RIGHT — ticket */}
      <aside className="flex min-w-0 flex-col overflow-hidden bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ticket en cours</div>
            <div className="truncate font-display text-lg font-bold">
              {customer ? customer.name : `${itemsCount} article${itemsCount > 1 ? "s" : ""}`}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconBtn label="Tickets en attente" onClick={() => setShowHolds(true)}>
              <div className="relative">
                <Pause className="h-4 w-4" />
                {holds.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {holds.length}
                  </span>
                )}
              </div>
            </IconBtn>
            <IconBtn label="Ajouter client" onClick={() => setShowCustomer(true)}><UserPlus className="h-4 w-4" /></IconBtn>
            <IconBtn label="Mettre en attente" onClick={holdCurrent}><RotateCcw className="h-4 w-4" /></IconBtn>
            <IconBtn label="Vider" onClick={clearCart} tone="destructive"><Trash2 className="h-4 w-4" /></IconBtn>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {cart.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-muted text-3xl">🛒</div>
                <p className="mt-3 text-sm font-medium">Ticket vide</p>
                <p className="mt-1 text-xs text-muted-foreground">Touchez un produit à gauche ou scannez un code-barres.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {cart.map((l) => {
                  const dp = l.discount_pct ?? 0;
                  const lineTotal = l.unit_price * l.quantity * (1 - dp / 100);
                  return (
                    <motion.li key={l.product_id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.15 }}
                      className="group rounded-xl border border-transparent px-2.5 py-2 hover:border-border hover:bg-muted/40">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{l.name}</div>
                          <div className="tabular text-xs text-muted-foreground">{formatXOF(l.unit_price)} × {l.quantity}{dp ? ` · -${dp}%` : ""}</div>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                          <button onClick={() => updateQty(l.product_id, -1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-background" aria-label="−"><Minus className="h-3.5 w-3.5" /></button>
                          <span className="tabular w-6 text-center text-sm font-bold">{l.quantity}</span>
                          <button onClick={() => updateQty(l.product_id, 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-background" aria-label="+"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="tabular w-20 text-right text-sm font-bold">{formatXOF(Math.round(lineTotal))}</div>
                        <button onClick={() => removeLine(l.product_id)}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label="Supprimer"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-1">
                        <Percent className="h-3 w-3 text-muted-foreground" />
                        <input type="number" min={0} max={100} value={dp || ""} placeholder="Remise ligne"
                          onChange={(e) => setLineDiscount(l.product_id, Number(e.target.value) || 0)}
                          className="tabular h-6 w-20 rounded-md border border-border bg-card px-2 text-right text-[11px]" />
                        <span className="text-[10px] text-muted-foreground">% sur la ligne</span>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-background/40 p-4 sm:p-5">
          <div className="space-y-1.5 text-sm">
            <Row label="Sous-total" value={formatXOF(Math.round(subtotal))} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Percent className="h-3.5 w-3.5" />
                <span>Remise globale</span>
                <input type="number" min={0} max={100} value={discountPct}
                  onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="tabular h-7 w-14 rounded-md border border-border bg-card px-2 text-right text-xs" />
                <span className="text-xs">%</span>
              </div>
              <span className="tabular font-medium">− {formatXOF(discountAmt)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between border-t border-dashed border-border pt-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total</div>
              <div className="font-display tabular text-3xl font-black leading-none">{formatXOF(total)}</div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {customer ? customer.name : "Comptoir"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <PayPill active={payment === "cash"} onClick={() => setPayment("cash")} icon={<Banknote className="h-4 w-4" />} label="Espèces" />
            <PayPill active={payment === "mobile"} onClick={() => setPayment("mobile")} icon={<Smartphone className="h-4 w-4" />} label="Mobile" />
            <PayPill active={payment === "card"} onClick={() => setPayment("card")} icon={<CreditCard className="h-4 w-4" />} label="Carte" />
          </div>

          <motion.button whileTap={{ scale: 0.98 }} disabled={cart.length === 0} onClick={() => setShowPay(true)}
            className="mt-3 h-14 w-full rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display text-base font-bold text-primary-foreground shadow-elegant transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
            Encaisser · {formatXOF(total)}
          </motion.button>
        </div>
      </aside>

      <AnimatePresence>
        {showPay && (
          <PaymentDialog
            total={total} method={payment} customer={customer}
            onClose={() => setShowPay(false)}
            onConfirm={(r) => { setShowPay(false); setReceipt(r); }}
            lines={cart} subtotal={subtotal} discountAmt={discountAmt}
          />
        )}
        {showHolds && (
          <HoldsDialog holds={holds} onClose={() => setShowHolds(false)} onResume={resumeHold}
            onRemove={(id) => setHolds((h) => h.filter((x) => x.id !== id))} />
        )}
        {showCustomer && (
          <CustomerDialog onClose={() => setShowCustomer(false)} onPick={(c) => { setCustomer(c); setShowCustomer(false); }} />
        )}
        {receipt && (
          <ReceiptDialog receipt={receipt} onClose={() => { setReceipt(null); clearCart(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============ sub components ============ */

function CategoryPill({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button onClick={onClick}
      className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40 hover:text-primary")}>
      {label}
      <span className={cn("tabular rounded-full px-1.5 text-[10px] font-bold", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const low = product.stock <= 20;
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-elegant">
      <div className="relative grid aspect-square place-items-center bg-gradient-to-br from-muted to-background text-5xl sm:text-6xl">
        <span>{product.emoji}</span>
        {low && <span className="absolute right-2 top-2 rounded-full bg-warning/90 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">Stock {product.stock}</span>}
        <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-elegant transition-opacity group-hover:opacity-100">
          <Plus className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0 px-3 py-2.5">
        <div className="truncate text-sm font-semibold">{product.name}</div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="tabular text-sm font-bold text-primary">{formatXOF(product.price)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{product.sku}</span>
        </div>
      </div>
    </motion.button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-muted-foreground"><span>{label}</span><span className="tabular font-medium text-foreground">{value}</span></div>;
}

function IconBtn({ children, label, onClick, tone }: { children: React.ReactNode; label: string; onClick?: () => void; tone?: "destructive" }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={cn("grid h-9 w-9 place-items-center rounded-lg border border-border bg-card hover:bg-muted",
        tone === "destructive" && "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive")}>
      {children}
    </button>
  );
}

function PayPill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground")}>
      {icon}{label}
    </button>
  );
}

function DialogShell({ children, onClose, maxWidth = "max-w-md" }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", maxWidth)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function PaymentDialog({
  total, method, customer, lines, subtotal, discountAmt, onClose, onConfirm,
}: {
  total: number; method: PaymentMethod; customer?: Customer;
  lines: Line[]; subtotal: number; discountAmt: number;
  onClose: () => void; onConfirm: (r: Receipt) => void;
}) {
  const [type, setType] = useState<PaymentType>("total");
  const [received, setReceived] = useState<string>(String(total));
  const rec = Number(received) || 0;

  const targetPaid = type === "total" ? total : Math.min(rec, total);
  const change = type === "total" ? Math.max(0, rec - total) : 0;
  const due = type === "total" ? 0 : Math.max(0, total - rec);
  const enough = type === "total" ? rec >= total : rec > 0;

  const label = method === "cash" ? "Espèces" : method === "mobile" ? "Mobile Money" : "Carte bancaire";

  return (
    <DialogShell onClose={onClose}>
      <div className="bg-gradient-to-br from-primary to-primary-glow px-6 py-5 text-primary-foreground">
        <div className="text-[11px] font-semibold uppercase tracking-widest opacity-80">À encaisser · {label}</div>
        <div className="font-display tabular mt-1 text-4xl font-black">{formatXOF(total)}</div>
      </div>

      <div className="space-y-4 p-6">
        <div className="grid grid-cols-3 gap-2">
          {(["total", "avance", "acompte"] as PaymentType[]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={cn("rounded-xl border py-2 text-xs font-semibold",
                type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {t === "total" ? "Total" : t === "avance" ? "Avance" : "Acompte"}
            </button>
          ))}
        </div>

        <label className="block">
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
            {type === "total" ? "Montant reçu" : "Montant partiel"}
          </div>
          <input type="number" value={received} autoFocus onChange={(e) => setReceived(e.target.value)}
            className="tabular h-14 w-full rounded-xl border border-border bg-background px-4 text-2xl font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </label>

        {method === "cash" && (
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2000, 5000, 10000].map((n) => (
              <button key={n} onClick={() => setReceived(String(rec + n))}
                className="tabular rounded-lg border border-border bg-card py-2 text-xs font-semibold hover:border-primary hover:text-primary">
                +{formatXOF(n)}
              </button>
            ))}
            <button onClick={() => setReceived(String(total))} className="rounded-lg border border-border bg-card py-2 text-xs font-semibold hover:border-primary hover:text-primary">
              Appoint
            </button>
          </div>
        )}

        <div className="rounded-xl bg-muted p-3">
          {type === "total" ? (
            <Row2 label="Monnaie à rendre" value={formatXOF(change)} accent={change > 0 ? "text-success" : ""} />
          ) : (
            <>
              <Row2 label="Payé maintenant" value={formatXOF(targetPaid)} />
              <Row2 label="Solde dû" value={formatXOF(due)} accent="text-destructive" />
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="h-12 flex-1 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted">Annuler</button>
          <button disabled={!enough} onClick={() => onConfirm({
            ticket: `T-${String(Date.now()).slice(-4)}`, at: new Date(), lines, subtotal, discountAmt, total,
            received: rec, paidNow: targetPaid, due, method, type, customer,
          })}
            className="h-12 flex-[2] rounded-xl bg-gradient-to-r from-success to-primary-glow text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
            Valider {type !== "total" ? `(${type})` : ""}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function Row2({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular text-lg font-bold", accent)}>{value}</span>
    </div>
  );
}

function HoldsDialog({ holds, onClose, onResume, onRemove }: {
  holds: HoldTicket[]; onClose: () => void; onResume: (id: string) => void; onRemove: (id: string) => void;
}) {
  return (
    <DialogShell onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Tickets en attente</div>
          <div className="font-display text-lg font-bold">{holds.length} ticket{holds.length > 1 ? "s" : ""}</div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-3">
        {holds.length === 0 ? (
          <div className="grid place-items-center py-12 text-sm text-muted-foreground">Aucun ticket en attente</div>
        ) : holds.map((h) => {
          const t = h.lines.reduce((s, l) => s + l.unit_price * l.quantity * (1 - (l.discount_pct ?? 0) / 100), 0);
          return (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border p-3 mb-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Pause className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{h.customer?.name ?? "Comptoir"} · {h.id}</div>
                <div className="text-xs text-muted-foreground">
                  {h.lines.length} article{h.lines.length > 1 ? "s" : ""} · {new Date(h.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="tabular text-sm font-bold">{formatXOF(Math.round(t))}</div>
              <button onClick={() => onResume(h.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
                Reprendre
              </button>
              <button onClick={() => onRemove(h.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </DialogShell>
  );
}

function CustomerDialog({ onClose, onPick }: { onClose: () => void; onPick: (c: Customer) => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const list = useMemo(() => CUSTOMERS.filter((c) =>
    !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  ), [q]);

  return (
    <DialogShell onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{creating ? "Nouveau client" : "Sélectionner un client"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      {creating ? (
        <div className="space-y-3 p-5">
          <label className="block">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Nom *</div>
            <input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Téléphone *</div>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+229 …" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setCreating(false)} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Retour</button>
            <button disabled={!form.name || !form.phone} onClick={() => onPick({
              id: `cu-${Date.now()}`, name: form.name, phone: form.phone, city: "—",
              total_spent: 0, visits: 0, loyalty_points: 0, credit_balance: 0,
              last_visit: new Date().toISOString(), tags: ["Nouveau"],
            })} className="h-11 flex-[2] rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              Créer et sélectionner
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou téléphone…"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {list.map((c) => (
              <button key={c.id} onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-muted">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone} · {c.city}</div>
                </div>
                {c.credit_balance > 0 && (
                  <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">Créance</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <button onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
              <UserPlus className="h-4 w-4" /> Créer un nouveau client
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
}

function ReceiptDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const shopName = (typeof window !== "undefined" && localStorage.getItem("nc_shop_name")) || "Boutique Cotonou Centre";
  const shopAddr = (typeof window !== "undefined" && localStorage.getItem("nc_shop_address")) || "Rue 12.345, Cotonou";
  const shopPhone = (typeof window !== "undefined" && localStorage.getItem("nc_shop_phone")) || "+229 21 30 40 50";
  const logo = typeof window !== "undefined" ? localStorage.getItem("nc_shop_logo") : null;
  const thanks = (typeof window !== "undefined" && localStorage.getItem("nc_ticket_thanks")) || "Merci pour votre achat !";

  const print = () => {
    if (!ref.current) return;
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>${receipt.ticket}</title>
      <style>body{font-family:-apple-system,sans-serif;font-size:12px;padding:12px;color:#000}
      h1{font-size:14px;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}img{max-width:80px;display:block;margin:0 auto 6px}
      .center{text-align:center}.b{font-weight:700}</style></head><body>${ref.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 200);
  };

  return (
    <DialogShell onClose={onClose} maxWidth="max-w-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-success">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-success/15"><Check className="h-4 w-4" /></div>
          <div className="font-display text-sm font-bold">Encaissement validé</div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div ref={ref} className="max-h-[60vh] overflow-y-auto bg-white p-5 text-black">
        {logo && <img src={logo} alt="Logo" className="mx-auto mb-2 h-16 w-16 object-contain" />}
        <div className="center text-center">
          <div className="b text-base font-bold">{shopName}</div>
          <div className="text-xs">{shopAddr}</div>
          <div className="text-xs">{shopPhone}</div>
        </div>
        <hr className="my-2 border-dashed" />
        <div className="row flex justify-between text-xs"><span>Ticket</span><span className="b font-bold">{receipt.ticket}</span></div>
        <div className="row flex justify-between text-xs"><span>Date</span><span>{receipt.at.toLocaleString("fr-FR")}</span></div>
        {receipt.customer && <div className="row flex justify-between text-xs"><span>Client</span><span>{receipt.customer.name}</span></div>}
        <hr className="my-2 border-dashed" />
        {receipt.lines.map((l) => (
          <div key={l.product_id} className="mb-1 text-xs">
            <div className="flex justify-between"><span>{l.name}</span><span>{formatXOF(Math.round(l.unit_price * l.quantity * (1 - (l.discount_pct ?? 0) / 100)))}</span></div>
            <div className="text-[10px] text-gray-600">{l.quantity} × {formatXOF(l.unit_price)}{l.discount_pct ? ` (-${l.discount_pct}%)` : ""}</div>
          </div>
        ))}
        <hr className="my-2 border-dashed" />
        <div className="row flex justify-between text-xs"><span>Sous-total</span><span>{formatXOF(Math.round(receipt.subtotal))}</span></div>
        {receipt.discountAmt > 0 && <div className="row flex justify-between text-xs"><span>Remise</span><span>-{formatXOF(receipt.discountAmt)}</span></div>}
        <div className="row flex justify-between text-sm b font-bold"><span>TOTAL</span><span>{formatXOF(receipt.total)}</span></div>
        <div className="row flex justify-between text-xs"><span>Payé ({receipt.type})</span><span>{formatXOF(receipt.paidNow)}</span></div>
        {receipt.due > 0 && <div className="row flex justify-between text-xs" style={{color:"#b91c1c"}}><span>Solde dû</span><span>{formatXOF(receipt.due)}</span></div>}
        <hr className="my-2 border-dashed" />
        <div className="center mt-2 text-center text-xs italic">{thanks}</div>
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Fermer</button>
        <button onClick={print} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90">
          <Printer className="h-4 w-4" /> Imprimer le reçu
        </button>
      </div>
    </DialogShell>
  );
}
