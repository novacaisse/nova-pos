import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, Wallet, ShoppingBag, Receipt, AlertTriangle,
  Package, Users, Calendar, ArrowRight,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SALES } from "@/lib/mock/sales";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { CUSTOMERS } from "@/lib/mock/customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

type Period = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "last_year" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  week: "Cette semaine",
  last_week: "Semaine dernière",
  month: "Ce mois",
  last_month: "Mois dernier",
  year: "Cette année",
  last_year: "Année dernière",
  custom: "Personnalisé",
};

function DashboardPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Mock: pseudo-agrège selon la période
  const stats = useMemo(() => {
    const factor: Record<Period, number> = {
      today: 1, yesterday: 0.92, week: 6.4, last_week: 5.9,
      month: 24.8, last_month: 22.1, year: 285, last_year: 248, custom: 3.2,
    };
    const base = SALES.slice(0, 6).reduce((s, x) => s + x.total, 0);
    const revenue = Math.round(base * factor[period]);
    const prev = Math.round(base * factor[period] * 0.89);
    const count = Math.max(1, Math.round(6 * factor[period]));
    const margin = 0.32;
    return {
      revenue,
      profit: Math.round(revenue * margin),
      count,
      avg: Math.round(revenue / count),
      prev,
      diff: prev ? Math.round(((revenue - prev) / prev) * 100) : 0,
    };
  }, [period]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    SALES.forEach((s) =>
      s.lines.forEach((l) => {
        const cur = map.get(l.product_id) ?? { name: l.name, qty: 0, value: 0 };
        cur.qty += l.qty;
        cur.value += l.qty * l.unit_price;
        map.set(l.product_id, cur);
      }),
    );
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  }, []);

  const topCustomers = [...CUSTOMERS].sort((a, b) => b.total_spent - a.total_spent).slice(0, 5);
  const lowStock = PRODUCTS.filter((p) => p.stock < 25).sort((a, b) => a.stock - b.stock).slice(0, 6);

  // Chart data mockée pour l'évolution
  const chartData = useMemo(() => {
    const points = period === "today" || period === "yesterday" ? 12 : period.includes("week") ? 7 : period.includes("month") ? 30 : 12;
    return Array.from({ length: points }).map((_, i) => {
      const v = 40 + Math.sin(i / 1.7) * 25 + Math.cos(i / 3) * 15 + (i % 5) * 4;
      return Math.max(15, Math.round(v));
    });
  }, [period]);

  const chartMax = Math.max(...chartData);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de votre boutique en temps réel"
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
              {(Object.keys(PERIOD_LABEL) as Period[]).filter((p) => p !== "custom").map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
              <button
                onClick={() => setPeriod("custom")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                  period === "custom" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Calendar className="h-3.5 w-3.5" /> Personnalisé
              </button>
            </div>
          </>
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
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Appliquer</button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Chiffre d'affaires" value={formatXOF(stats.revenue)} icon={<Wallet className="h-5 w-5" />}
            trend={{ value: `${stats.diff >= 0 ? "+" : ""}${stats.diff}% vs ${PERIOD_LABEL[period].toLowerCase()} précédent`, positive: stats.diff >= 0 }} accent="primary" />
          <StatCard label="Bénéfice net" value={formatXOF(stats.profit)} hint="Marge estimée 32%" icon={<TrendingUp className="h-5 w-5" />}
            trend={{ value: "+8%", positive: true }} accent="success" />
          <StatCard label="Panier moyen" value={formatXOF(stats.avg)} icon={<ShoppingBag className="h-5 w-5" />}
            trend={{ value: "+3%", positive: true }} accent="accent" />
          <StatCard label="Nombre de ventes" value={String(stats.count)} icon={<Receipt className="h-5 w-5" />}
            trend={{ value: `+${Math.max(1, Math.round(stats.diff / 2))}%`, positive: stats.diff >= 0 }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Évolution des ventes</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tabular font-display text-2xl font-bold">{formatXOF(stats.revenue)}</span>
                  <span className={cn("text-xs font-semibold", stats.diff >= 0 ? "text-success" : "text-destructive")}>
                    {stats.diff >= 0 ? "+" : ""}{stats.diff}%
                  </span>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" /> Période</div>
                <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" /> Précédent</div>
              </div>
            </div>

            <div className="flex h-56 items-end gap-1.5">
              {chartData.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${(v / chartMax) * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.02 }}
                  className="group relative flex-1 rounded-t-md bg-gradient-to-t from-primary/60 to-primary-glow"
                >
                  <div className="absolute inset-x-0 -top-1 h-1 rounded-t-md bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alertes stock</div>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                {lowStock.length}
              </span>
            </div>
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-lg">{p.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className={cn("h-3.5 w-3.5", p.stock < 15 ? "text-destructive" : "text-warning")} />
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
              <button className="ml-auto text-xs font-medium text-primary hover:underline">Voir tout <ArrowRight className="ml-0.5 inline h-3 w-3" /></button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2">Produit</th>
                  <th className="pb-2 text-right">Qté</th>
                  <th className="pb-2 text-right">Valeur</th>
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
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20 text-accent-foreground"><Users className="h-4 w-4" /></div>
              <div className="text-sm font-semibold">Top clients</div>
              <button className="ml-auto text-xs font-medium text-primary hover:underline">Voir tout <ArrowRight className="ml-0.5 inline h-3 w-3" /></button>
            </div>
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
                    {String(i + 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.visits} visites · {c.city}</div>
                  </div>
                  <div className="tabular text-sm font-bold">{formatXOF(c.total_spent)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
