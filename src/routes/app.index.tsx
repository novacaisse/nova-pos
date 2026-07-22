import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, Wallet, ShoppingBag, Receipt, AlertTriangle,
  Package, Users, Calendar, ArrowRight,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useSales, useProducts, useCustomers, formatXOF } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

type Period = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui", yesterday: "Hier", week: "Cette semaine", last_week: "Semaine dernière",
  month: "Ce mois", last_month: "Mois dernier", year: "Cette année", custom: "Personnalisé",
};

function periodRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const d = (base: Date, days: number) => { const x = new Date(base); x.setDate(x.getDate() + days); return x; };
  switch (period) {
    case "today": return { from: start, to: end };
    case "yesterday": return { from: d(start, -1), to: d(end, -1) };
    case "week": { const from = d(start, -((start.getDay() + 6) % 7)); return { from, to: end }; }
    case "last_week": { const from = d(start, -((start.getDay() + 6) % 7) - 7); return { from, to: d(from, 6) }; }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end };
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to };
    }
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: end };
    case "custom": {
      const from = customFrom ? new Date(customFrom) : start;
      const to = customTo ? new Date(customTo + "T23:59:59") : end;
      return { from, to };
    }
  }
}

function DashboardPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: sales = [] } = useSales(500);
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();

  const { from, to } = periodRange(period, customFrom, customTo);
  const prevRange = useMemo(() => {
    const span = to.getTime() - from.getTime();
    return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
  }, [from, to]);

  const inRange = sales.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= from.getTime() && t <= to.getTime() && s.status !== "cancelled";
  });
  const inPrev = sales.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= prevRange.from.getTime() && t <= prevRange.to.getTime() && s.status !== "cancelled";
  });

  const revenue = inRange.reduce((s, x) => s + Number(x.total || 0), 0);
  const prevRevenue = inPrev.reduce((s, x) => s + Number(x.total || 0), 0);
  const diff = prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
  const count = inRange.length;
  const avg = count ? Math.round(revenue / count) : 0;

  // Estimate profit via product cost when items available
  const profit = inRange.reduce((sum, s: any) => {
    const items = s.sale_items ?? [];
    return sum + items.reduce((ls: number, it: any) => {
      const p = products.find((x) => x.id === it.product_id);
      const margin = p ? (Number(it.unit_price) - Number(p.cost)) * Number(it.quantity) : Number(it.total) * 0.3;
      return ls + margin;
    }, 0);
  }, 0);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    inRange.forEach((s: any) => {
      (s.sale_items ?? []).forEach((l: any) => {
        const key = l.product_id ?? l.name;
        const cur = map.get(key) ?? { name: l.name, qty: 0, value: 0 };
        cur.qty += Number(l.quantity);
        cur.value += Number(l.total);
        map.set(key, cur);
      });
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  }, [inRange]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>();
    inRange.forEach((s: any) => {
      if (!s.customer_id) return;
      const name = s.customers?.name ?? "—";
      const cur = map.get(s.customer_id) ?? { id: s.customer_id, name, total: 0, count: 0 };
      cur.total += Number(s.total); cur.count += 1;
      map.set(s.customer_id, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [inRange]);

  const lowStock = products.filter((p) => p.stock <= p.low_stock_threshold).sort((a, b) => a.stock - b.stock).slice(0, 6);

  const chartData = useMemo(() => {
    const points = 12;
    const span = to.getTime() - from.getTime();
    const step = span / points;
    const buckets = Array(points).fill(0);
    inRange.forEach((s) => {
      const t = new Date(s.created_at).getTime() - from.getTime();
      const idx = Math.max(0, Math.min(points - 1, Math.floor(t / step)));
      buckets[idx] += Number(s.total);
    });
    return buckets;
  }, [inRange, from, to]);
  const chartMax = Math.max(1, ...chartData);

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle={customers.length ? `${customers.length} clients · ${products.length} produits` : "Vue d'ensemble de votre boutique"}
        actions={
          <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:w-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(Object.keys(PERIOD_LABEL) as Period[]).filter((p) => p !== "custom").map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {PERIOD_LABEL[p]}
              </button>
            ))}
            <button onClick={() => setPeriod("custom")}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                period === "custom" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Calendar className="h-3.5 w-3.5" /> Personnalisé
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-5 sm:p-8">
        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Du</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Au</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Chiffre d'affaires" value={formatXOF(revenue)} icon={<Wallet className="h-5 w-5" />}
            trend={{ value: `${diff >= 0 ? "+" : ""}${diff}% vs période précédente`, positive: diff >= 0 }} accent="primary" />
          <StatCard label="Bénéfice estimé" value={formatXOF(Math.round(profit))} hint="Basé sur coût produit" icon={<TrendingUp className="h-5 w-5" />} accent="success" />
          <StatCard label="Panier moyen" value={formatXOF(avg)} icon={<ShoppingBag className="h-5 w-5" />} accent="accent" />
          <StatCard label="Nombre de ventes" value={String(count)} icon={<Receipt className="h-5 w-5" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Évolution des ventes</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tabular font-display text-2xl font-bold">{formatXOF(revenue)}</span>
                  <span className={cn("text-xs font-semibold", diff >= 0 ? "text-success" : "text-destructive")}>{diff >= 0 ? "+" : ""}{diff}%</span>
                </div>
              </div>
            </div>
            <div className="flex h-56 items-end gap-1.5">
              {chartData.map((v, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${(v / chartMax) * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.02 }}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-primary/60 to-primary-glow" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alertes stock</div>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">{lowStock.length}</span>
            </div>
            <div className="space-y-2">
              {lowStock.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Tous les stocks sont OK ✅</div>}
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-lg">📦</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.sku ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className={cn("h-3.5 w-3.5", p.stock <= 0 ? "text-destructive" : "text-warning")} />
                    <span className="tabular text-sm font-bold">{p.stock}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Package className="h-4 w-4" /></div>
              <div className="text-sm font-semibold">Top produits</div>
              <a href="/app/produits" className="ml-auto text-xs font-medium text-primary hover:underline">Voir tout <ArrowRight className="ml-0.5 inline h-3 w-3" /></a>
            </div>
            {topProducts.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Aucune vente sur la période.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">Produit</th><th className="pb-2 text-right">Qté</th><th className="pb-2 text-right">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.name} className="border-t border-border/60">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="tabular py-2 text-right">{p.qty}</td>
                      <td className="tabular py-2 text-right font-semibold">{formatXOF(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20 text-accent-foreground"><Users className="h-4 w-4" /></div>
              <div className="text-sm font-semibold">Top clients</div>
              <a href="/app/clients" className="ml-auto text-xs font-medium text-primary hover:underline">Voir tout <ArrowRight className="ml-0.5 inline h-3 w-3" /></a>
            </div>
            {topCustomers.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Aucun client sur la période.</div>
            ) : (
              <div className="space-y-2">
                {topCustomers.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.count} visite{c.count > 1 ? "s" : ""}</div>
                    </div>
                    <div className="tabular text-sm font-bold">{formatXOF(c.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
