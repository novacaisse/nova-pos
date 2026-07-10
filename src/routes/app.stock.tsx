import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Sliders, AlertTriangle, ArrowLeftRight, Plus, Search } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { STOCK_MOVES, type StockMoveType } from "@/lib/mock/stock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/stock")({
  component: StockPage,
});

const TYPE_META: Record<StockMoveType, { label: string; icon: typeof ArrowDownCircle; color: string }> = {
  entree: { label: "Entrée", icon: ArrowDownCircle, color: "text-success bg-success/15" },
  sortie: { label: "Sortie", icon: ArrowUpCircle, color: "text-primary bg-primary/15" },
  ajustement: { label: "Ajustement", icon: Sliders, color: "text-muted-foreground bg-muted" },
  perte: { label: "Perte", icon: AlertTriangle, color: "text-destructive bg-destructive/15" },
  transfert: { label: "Transfert", icon: ArrowLeftRight, color: "text-accent-foreground bg-accent/25" },
};

function StockPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | StockMoveType>("all");

  const stockValue = PRODUCTS.reduce((s, p) => s + p.stock * p.price * 0.68, 0);
  const lowCount = PRODUCTS.filter((p) => p.stock < 25).length;

  const moves = useMemo(
    () =>
      STOCK_MOVES.filter((m) => {
        if (typeFilter !== "all" && m.type !== typeFilter) return false;
        if (!query.trim()) return true;
        return m.product_name.toLowerCase().includes(query.toLowerCase());
      }),
    [query, typeFilter],
  );

  const outOfStock = PRODUCTS.filter((p) => p.stock < 25).sort((a, b) => a.stock - b.stock);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Suivi des mouvements et alertes"
        actions={
          <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau mouvement
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Valeur du stock" value={formatXOF(Math.round(stockValue))} accent="primary" />
          <StatCard label="Références" value={String(PRODUCTS.length)} accent="accent" />
          <StatCard label="Alertes basses" value={String(lowCount)} accent="destructive" />
          <StatCard label="Mouvements 7j" value={String(STOCK_MOVES.length)} accent="success" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | StockMoveType)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="all">Tous types</option>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Produit</th>
                    <th className="px-4 py-3">Motif</th>
                    <th className="px-4 py-3">Utilisateur</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Qté</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map((m) => {
                    const meta = TYPE_META[m.type];
                    const Icon = meta.icon;
                    return (
                      <tr key={m.id} className="border-t border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold", meta.color)}>
                            <Icon className="h-3.5 w-3.5" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{m.product_name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.reason}</td>
                        <td className="px-4 py-3 text-xs">{m.user}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className={cn("tabular px-4 py-3 text-right font-bold", m.qty > 0 ? "text-success" : "text-destructive")}>
                          {m.qty > 0 ? "+" : ""}{m.qty}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seuils d'alerte</div>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">{outOfStock.length}</span>
            </div>
            <div className="space-y-2">
              {outOfStock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-lg">{p.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">Seuil : 25</div>
                  </div>
                  <div className="tabular text-lg font-bold text-warning-foreground">{p.stock}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
