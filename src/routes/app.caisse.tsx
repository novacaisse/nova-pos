import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Percent,
  Pause,
  Banknote,
  Smartphone,
  CreditCard,
  UserPlus,
  ScanLine,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  PRODUCTS,
  formatXOF,
  type CartLine,
  type Product,
} from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/caisse")({
  component: CaissePage,
});

type PaymentMethod = "cash" | "mobile" | "card";

function CaissePage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [showPay, setShowPay] = useState(false);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [query, categoryId]);

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountAmt;
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

  function updateQty(id: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => (l.product_id === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(id: string) {
    setCart((c) => c.filter((l) => l.product_id !== id));
  }

  function clearCart() {
    setCart([]);
    setDiscountPct(0);
  }

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* ============ LEFT — Catalogue ============ */}
      <section className="flex min-w-0 flex-col overflow-hidden border-r border-border">
        {/* Search + scanner */}
        <div className="border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un produit, un SKU, scanner…"
                className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15"
              aria-label="Scanner code-barres"
            >
              <ScanLine className="h-5 w-5" />
            </button>
          </div>

          {/* Categories */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <CategoryPill
              active={categoryId === "all"}
              onClick={() => setCategoryId("all")}
              label="Tout"
              count={PRODUCTS.length}
            />
            {CATEGORIES.map((c) => (
              <CategoryPill
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                label={c.name}
                count={PRODUCTS.filter((p) => p.category_id === c.id).length}
              />
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {products.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Aucun produit ne correspond à « {query} »
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={() => addProduct(p)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ RIGHT — Ticket ============ */}
      <aside className="flex min-w-0 flex-col overflow-hidden bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Ticket en cours
            </div>
            <div className="font-display text-lg font-bold">
              {itemsCount} article{itemsCount > 1 ? "s" : ""}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconBtn label="Mettre en attente"><Pause className="h-4 w-4" /></IconBtn>
            <IconBtn label="Nouveau client"><UserPlus className="h-4 w-4" /></IconBtn>
            <IconBtn label="Vider" onClick={clearCart} tone="destructive">
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {cart.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-muted text-3xl">🛒</div>
                <p className="mt-3 text-sm font-medium text-foreground">Ticket vide</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Touchez un produit à gauche ou scannez un code-barres.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {cart.map((l) => (
                  <motion.li
                    key={l.product_id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 hover:border-border hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{l.name}</div>
                      <div className="tabular text-xs text-muted-foreground">
                        {formatXOF(l.unit_price)} × {l.quantity}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                      <button
                        onClick={() => updateQty(l.product_id, -1)}
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-background"
                        aria-label="Réduire"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="tabular w-6 text-center text-sm font-bold">{l.quantity}</span>
                      <button
                        onClick={() => updateQty(l.product_id, 1)}
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-background"
                        aria-label="Augmenter"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="tabular w-20 text-right text-sm font-bold">
                      {formatXOF(l.unit_price * l.quantity)}
                    </div>

                    <button
                      onClick={() => removeLine(l.product_id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Supprimer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* Totals + pay */}
        <div className="border-t border-border bg-background/40 p-4 sm:p-5">
          <div className="space-y-1.5 text-sm">
            <Row label="Sous-total" value={formatXOF(subtotal)} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Percent className="h-3.5 w-3.5" />
                <span>Remise</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="tabular h-7 w-14 rounded-md border border-border bg-card px-2 text-right text-xs"
                />
                <span className="text-xs">%</span>
              </div>
              <span className="tabular font-medium text-foreground">− {formatXOF(discountAmt)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between border-t border-dashed border-border pt-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total</div>
              <div className="font-display tabular text-3xl font-black leading-none text-foreground">
                {formatXOF(total)}
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {itemsCount} article{itemsCount > 1 ? "s" : ""}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <PayPill active={payment === "cash"} onClick={() => setPayment("cash")} icon={<Banknote className="h-4 w-4" />} label="Espèces" />
            <PayPill active={payment === "mobile"} onClick={() => setPayment("mobile")} icon={<Smartphone className="h-4 w-4" />} label="Mobile" />
            <PayPill active={payment === "card"} onClick={() => setPayment("card")} icon={<CreditCard className="h-4 w-4" />} label="Carte" />
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={cart.length === 0}
            onClick={() => setShowPay(true)}
            className="mt-3 h-14 w-full rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display text-base font-bold text-primary-foreground shadow-elegant transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Encaisser · {formatXOF(total)}
          </motion.button>
        </div>
      </aside>

      <AnimatePresence>
        {showPay && (
          <PaymentDialog
            total={total}
            method={payment}
            onClose={() => setShowPay(false)}
            onConfirm={() => {
              setShowPay(false);
              clearCart();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============ subcomponents ============ */

function CategoryPill({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary",
      )}
    >
      {label}
      <span className={cn("tabular rounded-full px-1.5 text-[10px] font-bold", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const low = product.stock <= 20;
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-elegant"
    >
      <div className="relative grid aspect-square place-items-center bg-gradient-to-br from-muted to-background text-5xl sm:text-6xl">
        <span>{product.emoji}</span>
        {low && (
          <span className="absolute right-2 top-2 rounded-full bg-warning/90 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
            Stock {product.stock}
          </span>
        )}
        <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-elegant transition-opacity group-hover:opacity-100">
          <Plus className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0 px-3 py-2.5">
        <div className="truncate text-sm font-semibold text-foreground">{product.name}</div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="tabular text-sm font-bold text-primary">{formatXOF(product.price)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{product.sku}</span>
        </div>
      </div>
    </motion.button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular font-medium text-foreground">{value}</span>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: "destructive";
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg border border-border bg-card hover:bg-muted",
        tone === "destructive" && "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function PayPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PaymentDialog({
  total,
  method,
  onClose,
  onConfirm,
}: {
  total: number;
  method: PaymentMethod;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [received, setReceived] = useState<string>(String(total));
  const rec = Number(received) || 0;
  const change = Math.max(0, rec - total);
  const enough = rec >= total;

  const label = method === "cash" ? "Espèces" : method === "mobile" ? "Mobile Money" : "Carte bancaire";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant"
      >
        <div className="bg-gradient-to-br from-primary to-primary-glow px-6 py-5 text-primary-foreground">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-80">À encaisser · {label}</div>
          <div className="font-display tabular mt-1 text-4xl font-black">{formatXOF(total)}</div>
        </div>

        <div className="space-y-4 p-6">
          <label className="block">
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Montant reçu</div>
            <input
              type="number"
              value={received}
              autoFocus
              onChange={(e) => setReceived(e.target.value)}
              className="tabular h-14 w-full rounded-xl border border-border bg-background px-4 text-2xl font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {method === "cash" && (
            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 2000, 5000, 10000].map((n) => (
                <button
                  key={n}
                  onClick={() => setReceived(String(rec + n))}
                  className="tabular rounded-lg border border-border bg-card py-2 text-xs font-semibold hover:border-primary hover:text-primary"
                >
                  +{formatXOF(n)}
                </button>
              ))}
              <button
                onClick={() => setReceived(String(total))}
                className="rounded-lg border border-border bg-card py-2 text-xs font-semibold hover:border-primary hover:text-primary"
              >
                Appoint
              </button>
            </div>
          )}

          <div className="rounded-xl bg-muted p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monnaie à rendre</span>
              <span className={cn("tabular text-lg font-bold", change > 0 ? "text-success" : "text-foreground")}>
                {formatXOF(change)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-12 flex-1 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted"
            >
              Annuler
            </button>
            <button
              disabled={!enough}
              onClick={onConfirm}
              className="h-12 flex-[2] rounded-xl bg-gradient-to-r from-success to-primary-glow text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Valider le paiement
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
