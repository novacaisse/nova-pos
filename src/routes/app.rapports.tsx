import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Sparkles, Send, TrendingUp, Clock, BarChart3, Users, Package, Truck, FileSpreadsheet, FileText as FileIcon, Loader2 } from "lucide-react";
import {
  startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subMonths, subYears,
} from "date-fns";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useSales, useProducts, useSuppliers, useShopSettings, useFormatMoney, isRevenueSale } from "@/lib/data/hooks";
import { useShop } from "@/lib/auth/ShopProvider";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/rapports")({
  component: RapportsPage,
});

const PERIODS = [
  { id: "today", label: "Aujourd'hui" },
  { id: "yesterday", label: "Hier" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "last_month", label: "Mois dernier" },
  { id: "year", label: "Cette année" },
  { id: "last_year", label: "Année dernière" },
  { id: "custom", label: "Personnalisé" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

const REPORTS = [
  { id: "sales", label: "Ventes", icon: BarChart3 },
  { id: "products", label: "Meilleurs produits", icon: Package },
  { id: "customers", label: "Meilleurs clients", icon: Users },
  { id: "suppliers", label: "Fournisseurs", icon: Truck },
  { id: "margin", label: "Marge réelle", icon: TrendingUp },
  { id: "peak", label: "Heures & jours de pointe", icon: Clock },
] as const;
type ReportId = (typeof REPORTS)[number]["id"];

const MOCK_AI = [
  "Ta meilleure journée cette semaine est jeudi (+34% vs moyenne).",
  "Le produit le plus vendu ce mois-ci mérite une commande de réassort.",
  "Regarde l'onglet Marge réelle pour repérer les produits qui tirent ta rentabilité vers le bas.",
];

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function periodRange(period: PeriodId, from: string, to: string): { from: string; to: string; label: string } {
  const now = new Date();
  switch (period) {
    case "today": return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString(), label: "Aujourd'hui" };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString(), label: "Hier" };
    }
    case "week": return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfDay(now).toISOString(), label: "Cette semaine" };
    case "month": return { from: startOfMonth(now).toISOString(), to: endOfDay(now).toISOString(), label: "Ce mois" };
    case "last_month": {
      const m = subMonths(now, 1);
      return { from: startOfMonth(m).toISOString(), to: endOfMonth(m).toISOString(), label: "Mois dernier" };
    }
    case "year": return { from: startOfYear(now).toISOString(), to: endOfDay(now).toISOString(), label: "Cette année" };
    case "last_year": {
      const y = subYears(now, 1);
      return { from: startOfYear(y).toISOString(), to: endOfYear(y).toISOString(), label: "Année dernière" };
    }
    case "custom":
      return {
        from: from ? startOfDay(new Date(from)).toISOString() : startOfMonth(now).toISOString(),
        to: to ? endOfDay(new Date(to)).toISOString() : endOfDay(now).toISOString(),
        label: "Personnalisé",
      };
  }
}

function RapportsPage() {
  const formatXOF = useFormatMoney();
  const { currentShop } = useShop();
  const { data: settings } = useShopSettings();
  const [period, setPeriod] = useState<PeriodId>("month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [report, setReport] = useState<ReportId>("sales");
  const [aiInput, setAiInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Bonjour ! Je suis Nova. Posez-moi une question sur vos ventes, votre stock ou vos clients." },
  ]);

  const range = periodRange(period, from, to);
  // Limite de sécurité côté requête : au-delà de ce volume sur la période
  // choisie, ce rapport sous-estimera le total (pas de pagination ici).
  const { data: allSales = [], isLoading } = useSales({ from: range.from, to: range.to, limit: 2000 });
  // Tous les calculs de ce rapport (CA, marge, top produits/clients/
  // fournisseurs, heures de pointe) ne doivent compter que les ventes
  // réellement encaissées — pas les brouillons ni les ventes annulées/
  // remboursées, qui gonflaient auparavant le CA affiché.
  const sales = useMemo(() => allSales.filter(isRevenueSale), [allSales]);
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();

  const costById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.cost])), [products]);
  const supplierByProductId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.supplier_id])), [products]);
  const supplierNameById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const ca = sales.reduce((s, x) => s + x.total, 0);
  const ticketMoyen = sales.length ? ca / sales.length : 0;
  const totalCost = sales.reduce((sum, sale) =>
    sum + sale.sale_items.reduce((s, it) => s + (it.product_id ? (costById[it.product_id] ?? 0) * it.quantity : 0), 0), 0);
  const marginPct = ca > 0 ? ((ca - totalCost) / ca) * 100 : 0;

  const topProducts = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; ca: number; cost: number }>();
    for (const sale of sales) {
      for (const it of sale.sale_items) {
        const key = it.product_id ?? `manuel:${it.name}`;
        const cur = agg.get(key) ?? { name: it.name, qty: 0, ca: 0, cost: 0 };
        cur.qty += it.quantity;
        cur.ca += it.total;
        cur.cost += it.product_id ? (costById[it.product_id] ?? 0) * it.quantity : 0;
        agg.set(key, cur);
      }
    }
    return [...agg.values()].map((p) => ({ ...p, marginPct: p.ca > 0 ? ((p.ca - p.cost) / p.ca) * 100 : 0 }));
  }, [sales, costById]);

  const topProductsByCa = useMemo(() => [...topProducts].sort((a, b) => b.ca - a.ca).slice(0, 8), [topProducts]);
  const worstMarginProducts = useMemo(() => [...topProducts].sort((a, b) => a.marginPct - b.marginPct).slice(0, 8), [topProducts]);

  // CA généré sur la période par les produits de chaque fournisseur (via
  // products.supplier_id) — pas les bons de commande eux-mêmes, qui ne
  // reflètent qu'un coût d'achat, pas une performance de vente.
  const topSuppliers = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; ca: number; cost: number }>();
    for (const sale of sales) {
      for (const it of sale.sale_items) {
        const supplierId = it.product_id ? supplierByProductId[it.product_id] : null;
        if (!supplierId) continue;
        const name = supplierNameById[supplierId] ?? "Fournisseur inconnu";
        const cur = agg.get(supplierId) ?? { name, qty: 0, ca: 0, cost: 0 };
        cur.qty += it.quantity;
        cur.ca += it.total;
        cur.cost += it.product_id ? (costById[it.product_id] ?? 0) * it.quantity : 0;
        agg.set(supplierId, cur);
      }
    }
    return [...agg.values()]
      .map((s) => ({ ...s, marginPct: s.ca > 0 ? ((s.ca - s.cost) / s.ca) * 100 : 0 }))
      .sort((a, b) => b.ca - a.ca).slice(0, 8);
  }, [sales, supplierByProductId, supplierNameById, costById]);

  const topCustomers = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; ca: number }>();
    for (const sale of sales) {
      const key = sale.customer_id ?? "__none__";
      const name = sale.customers?.name ?? "Client de passage";
      const cur = agg.get(key) ?? { name, qty: 0, ca: 0 };
      cur.qty += 1;
      cur.ca += sale.total;
      agg.set(key, cur);
    }
    return [...agg.values()].sort((a, b) => b.ca - a.ca).slice(0, 8);
  }, [sales]);

  const peakHours = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => 0);
    for (const sale of sales) counts[new Date(sale.created_at).getHours()]++;
    return counts.map((v, h) => ({ h: `${h}h`, v })).filter((p, i) => i >= 6 && i <= 22);
  }, [sales]);
  const maxPeak = Math.max(1, ...peakHours.map((p) => p.v));

  const salesByDay = useMemo(() => {
    const agg = new Map<string, { date: string; qty: number; ca: number }>();
    for (const sale of sales) {
      const day = sale.created_at.slice(0, 10);
      const cur = agg.get(day) ?? { date: day, qty: 0, ca: 0 };
      cur.qty += 1; cur.ca += sale.total;
      agg.set(day, cur);
    }
    return [...agg.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31);
  }, [sales]);

  const currentRows: { label: string; qty: number; ca: number; margin: string }[] = useMemo(() => {
    if (report === "products") return topProductsByCa.map((p) => ({ label: p.name, qty: p.qty, ca: p.ca, margin: `${p.marginPct.toFixed(0)}%` }));
    if (report === "margin") return worstMarginProducts.map((p) => ({ label: p.name, qty: p.qty, ca: p.ca, margin: `${p.marginPct.toFixed(0)}%` }));
    if (report === "customers") return topCustomers.map((c) => ({ label: c.name, qty: c.qty, ca: c.ca, margin: "—" }));
    if (report === "suppliers") return topSuppliers.map((s) => ({ label: s.name, qty: s.qty, ca: s.ca, margin: `${s.marginPct.toFixed(0)}%` }));
    if (report === "sales") return salesByDay.map((d) => ({ label: new Date(d.date).toLocaleDateString("fr-FR"), qty: d.qty, ca: d.ca, margin: "—" }));
    return [];
  }, [report, topProductsByCa, worstMarginProducts, topCustomers, topSuppliers, salesByDay]);

  const exportCsv = () => {
    const rows = [
      ["Rapport", REPORTS.find((r) => r.id === report)?.label, range.label].join(","),
      "",
      ["Libellé", "Qté", "CA", "Marge"].join(","),
      ...currentRows.map((r) => [r.label, r.qty, r.ca, r.margin].join(",")),
    ].join("\n");
    downloadFile(`rapport-${report}-${period}.csv`, rows, "text/csv");
  };

  const exportPdf = () => {
    const reportLabel = REPORTS.find((r) => r.id === report)?.label ?? "";
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Période</h2><div class="name">${range.label}</div></div>
        <div class="block" style="text-align:right"><h2>Lignes</h2><div class="name">${currentRows.length}</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Libellé</th><th class="num">Qté</th><th class="num">CA</th><th class="num">Marge</th></tr></thead>
        <tbody>${currentRows.map((r) => `<tr><td>${r.label}</td><td class="num">${r.qty}</td><td class="num">${formatXOF(r.ca)}</td><td class="num">${r.margin}</td></tr>`).join("")}</tbody>
      </table>`;
    const html = renderA4Document({
      docTitle: `Rapport — ${reportLabel}`,
      docDate: new Date().toLocaleString("fr-FR"),
      shop: {
        shopName: currentShop?.name ?? "Boutique",
        logoUrl: currentShop?.logo_url,
        address: settings?.data.address,
        phone: settings?.data.phone,
        ifu: settings?.data.ifu,
      },
      bodyHtml,
    });
    openPrintWindow(html);
  };

  const send = () => {
    if (!aiInput.trim()) return;
    const q = aiInput; setAiInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setTimeout(() => setMessages((m) => [...m, { role: "ai", text: MOCK_AI[Math.floor(Math.random() * MOCK_AI.length)] }]), 700);
  };

  return (
    <div>
      <PageHeader title="Rapports avancés" subtitle="Analyses détaillées et assistant IA"
        actions={
          <>
            <button onClick={exportPdf} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><FileIcon className="h-4 w-4" /> PDF</button>
            <button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            <button onClick={exportCsv} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Download className="h-4 w-4" /> Exporter</button>
          </>
        }
      />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", period === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {p.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
              <span className="text-muted-foreground">Du</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
              <span className="text-muted-foreground">au</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label={`CA · ${range.label}`} value={formatXOF(ca)} accent="primary" />
                <StatCard label="Marge réelle (coût actuel)" value={`${marginPct.toFixed(1)}%`} accent="success" />
                <StatCard label="Ticket moyen" value={formatXOF(Math.round(ticketMoyen))} accent="accent" />
              </div>

              <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
                {REPORTS.map((r) => {
                  const Icon = r.icon;
                  return (
                    <button key={r.id} onClick={() => setReport(r.id)}
                      className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium", report === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <Icon className="h-3.5 w-3.5" /> {r.label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {REPORTS.find((r) => r.id === report)?.label} · {range.label}
                  </div>
                </div>
                {report === "peak" ? (
                  peakHours.every((p) => p.v === 0) ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Aucune vente sur cette période.</div>
                  ) : (
                    <div className="flex h-64 items-end gap-2">
                      {peakHours.map((p) => (
                        <div key={p.h} className="flex flex-1 flex-col items-center gap-1">
                          <motion.div initial={{ height: 0 }} animate={{ height: `${(p.v / maxPeak) * 100}%` }}
                            className="w-full rounded-t-md bg-gradient-to-t from-primary/70 to-primary-glow" style={{ minHeight: 4 }} />
                          <div className="text-[10px] text-muted-foreground">{p.h}</div>
                        </div>
                      ))}
                    </div>
                  )
                ) : currentRows.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2">{report === "sales" ? "Jour" : report === "customers" ? "Client" : report === "suppliers" ? "Fournisseur" : "Produit"}</th>
                          <th className="px-3 py-2 text-right">{report === "customers" ? "Achats" : "Qté"}</th>
                          <th className="px-3 py-2 text-right">CA</th>
                          <th className="px-3 py-2 text-right">Marge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentRows.map((r, i) => (
                          <tr key={i} className="border-t border-border/60">
                            <td className="px-3 py-2 font-medium">{r.label}</td>
                            <td className="tabular px-3 py-2 text-right">{r.qty}</td>
                            <td className="tabular px-3 py-2 text-right font-semibold">{formatXOF(r.ca)}</td>
                            <td className="tabular px-3 py-2 text-right text-success">{r.margin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent/10 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display text-sm font-bold">Nova · Analyste IA</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Réponses en langage naturel (démo)</div>
            </div>
          </div>

          <div className="flex h-[400px] flex-col rounded-2xl border border-border bg-card">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="border-t border-border p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {["CA de la semaine", "Top vendeur", "Prévoir stock"].map((s) => (
                  <button key={s} onClick={() => setAiInput(s)} className="rounded-full border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary">{s}</button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Posez votre question…"
                  className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"><Send className="h-4 w-4" /></button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
