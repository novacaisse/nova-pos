import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Sliders, AlertTriangle, ArrowLeftRight, Plus, Search, X, Save, Edit3 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useProducts, useUpsertProduct,
  useStockMovements, useCreateStockMovement, useMyRole,
  formatXOF, type ProductWithStock,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/stock")({
  component: StockPage,
});

type LocalKind = "entree" | "sortie" | "ajustement" | "perte" | "transfert";
const KIND_META: Record<LocalKind, { label: string; icon: typeof ArrowDownCircle; color: string; dbType: "in" | "out" | "adjustment" | "transfer" }> = {
  entree:     { label: "Entrée",     icon: ArrowDownCircle,  color: "text-success bg-success/15",              dbType: "in" },
  sortie:     { label: "Sortie",     icon: ArrowUpCircle,    color: "text-primary bg-primary/15",              dbType: "out" },
  ajustement: { label: "Ajustement", icon: Sliders,          color: "text-muted-foreground bg-muted",          dbType: "adjustment" },
  perte:      { label: "Perte",      icon: AlertTriangle,    color: "text-destructive bg-destructive/15",      dbType: "out" },
  transfert:  { label: "Transfert",  icon: ArrowLeftRight,   color: "text-accent-foreground bg-accent/25",     dbType: "transfer" },
};

function StockPage() {
  const { data: products = [], isLoading } = useProducts();
  const { data: moves = [] } = useStockMovements(200);
  const createMove = useCreateStockMovement();
  const upsertProduct = useUpsertProduct();
  const { data: myRole } = useMyRole();
  // cashier ne génère un mouvement que via l'encaissement (déjà couvert par
  // la RLS côté caisse) ; jamais manuellement. accountant : lecture seule.
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "stock";

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out" | "adjustment" | "transfer" | "sale" | "return">("all");
  const [tab, setTab] = useState<"moves" | "products">("moves");
  const [showAdjust, setShowAdjust] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<ProductWithStock | null>(null);

  const stockValue = products.reduce((s, p) => s + p.stock * Number(p.cost || p.price || 0), 0);
  const lowCount = products.filter((p) => p.stock < p.low_stock_threshold).length;

  const filteredMoves = useMemo(() => moves.filter((m: any) => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (!query.trim()) return true;
    return (m.product_name ?? "").toLowerCase().includes(query.toLowerCase());
  }), [moves, typeFilter, query]);

  const outOfStock = products.filter((p) => p.stock < p.low_stock_threshold).sort((a, b) => a.stock - b.stock);

  return (
    <div>
      <PageHeader title="Stock" subtitle="Suivi des mouvements et alertes"
        actions={canManage && (
          <button onClick={() => setShowAdjust(true)} disabled={products.length === 0} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-40"><Plus className="h-4 w-4" /> Nouveau mouvement</button>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Valeur du stock" value={formatXOF(Math.round(stockValue))} accent="primary" />
          <StatCard label="Références" value={String(products.length)} accent="accent" />
          <StatCard label="Alertes basses" value={String(lowCount)} accent="destructive" />
          <StatCard label="Mouvements" value={String(moves.length)} accent="success" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["moves", "products"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "moves" ? "Historique des mouvements" : "Stock par produit"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {tab === "moves" ? (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…"
                      className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                  </div>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="all">Tous types</option>
                    <option value="in">Entrée</option>
                    <option value="out">Sortie</option>
                    <option value="adjustment">Ajustement</option>
                    <option value="transfer">Transfert</option>
                    <option value="sale">Vente</option>
                    <option value="return">Retour</option>
                  </select>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                  {isLoading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
                  ) : filteredMoves.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Aucun mouvement pour l'instant.</div>
                  ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Type</th><th className="px-4 py-3">Produit</th>
                        <th className="px-4 py-3">Motif</th>
                        <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Qté</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMoves.map((m: any) => {
                        const isPositive = m.type === "in" || m.type === "return" || (m.type === "adjustment" && Number(m.quantity) >= 0);
                        return (
                          <tr key={m.id} className="border-t border-border/60 hover:bg-muted/40">
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold",
                                m.type === "in" ? "text-success bg-success/15"
                                : m.type === "out" ? "text-primary bg-primary/15"
                                : m.type === "adjustment" ? "text-muted-foreground bg-muted"
                                : m.type === "sale" ? "text-primary bg-primary/15"
                                : m.type === "return" ? "text-success bg-success/15"
                                : "text-accent-foreground bg-accent/25")}>
                                {m.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">{m.product_name}</td>
                            <td className="px-4 py-3 text-xs">{m.reason ?? "—"}{m.reference && <span className="ml-1 rounded bg-muted px-1.5 text-[10px] font-mono">{m.reference}</span>}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td className={cn("tabular px-4 py-3 text-right font-bold", isPositive ? "text-success" : "text-destructive")}>
                              {isPositive ? "+" : "-"}{Math.abs(Number(m.quantity))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
              </>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                {products.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Ajoutez d'abord des produits.</div>
                ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Produit</th><th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Seuil</th><th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const low = p.stock < p.low_stock_threshold;
                      return (
                        <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2"><span className="text-lg">📦</span><span className="font-medium">{p.name}</span></div>
                          </td>
                          <td className={cn("tabular px-4 py-3 text-right font-bold", low && "text-warning-foreground")}>{p.stock}</td>
                          <td className="tabular px-4 py-3 text-right text-muted-foreground">{p.low_stock_threshold}</td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", low ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
                              {low ? "Bas" : "OK"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canManage && (
                              <button onClick={() => setEditingThreshold(p)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div className="font-display text-sm font-bold">Alertes stock bas</div>
            </div>
            <div className="space-y-1">
              {outOfStock.length === 0 && <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Aucune alerte 🎉</div>}
              {outOfStock.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <span className="text-lg">📦</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">Seuil {p.low_stock_threshold}</div>
                  </div>
                  <span className="tabular text-sm font-bold text-destructive">{p.stock}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAdjust && products.length > 0 && (
          <AdjustDialog products={products} onClose={() => setShowAdjust(false)}
            onSave={async (payload) => { await createMove.mutateAsync(payload); setShowAdjust(false); }} />
        )}
        {editingThreshold && (
          <ThresholdDialog product={editingThreshold} onClose={() => setEditingThreshold(null)}
            onSave={async (v) => { await upsertProduct.mutateAsync({ id: editingThreshold.id, name: editingThreshold.name, price: editingThreshold.price, low_stock_threshold: v }); setEditingThreshold(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-md" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function AdjustDialog({ products, onClose, onSave }: { products: ProductWithStock[]; onClose: () => void; onSave: (m: { product_id: string; type: any; quantity: number; reason?: string }) => Promise<void> }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [kind, setKind] = useState<LocalKind>("entree");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  const p = products.find((x) => x.id === productId);
  if (!p) return null;

  const delta = kind === "entree" ? +Math.abs(qty)
    : kind === "sortie" || kind === "perte" || kind === "transfert" ? -Math.abs(qty)
    : qty; // ajustement signé
  const newStock = Math.max(0, p.stock + delta);

  const submit = async () => {
    if (!qty || !reason.trim()) return;
    await onSave({
      product_id: p.id,
      type: KIND_META[kind].dbType,
      quantity: Math.abs(qty),
      reason: `${KIND_META[kind].label} — ${reason}`,
    });
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Nouveau mouvement de stock</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Produit</div>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inp}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock : {p.stock})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(KIND_META) as LocalKind[]).map((t) => (
            <button key={t} onClick={() => setKind(t)}
              className={cn("rounded-lg border py-2 text-[11px] font-semibold", kind === t ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {KIND_META[t].label}
            </button>
          ))}
        </div>
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Quantité</div>
          <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className={inp} />
        </label>
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Motif</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex : Inventaire mensuel" className={inp} />
        </label>
        <div className="rounded-xl bg-muted p-3 text-xs">
          Impact : <b className={delta >= 0 ? "text-success" : "text-destructive"}>{delta > 0 ? "+" : ""}{delta}</b> · Nouveau stock : <b>{newStock}</b>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={submit} disabled={!qty || !reason.trim()} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ThresholdDialog({ product, onClose, onSave }: { product: ProductWithStock; onClose: () => void; onSave: (v: number) => Promise<void> }) {
  const [v, setV] = useState(product.low_stock_threshold);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose} w="max-w-sm">
      <div className="p-5">
        <div className="font-display text-lg font-bold">Seuil d'alerte</div>
        <p className="mt-1 text-xs text-muted-foreground">{product.name} · stock actuel : <b>{product.stock}</b></p>
        <label className="mt-4 block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Seuil minimum</div>
          <input type="number" min={0} value={v} onChange={(e) => setV(Math.max(0, Number(e.target.value) || 0))} className={inp} />
        </label>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={() => onSave(v)} className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground">Enregistrer</button>
        </div>
      </div>
    </Overlay>
  );
}
