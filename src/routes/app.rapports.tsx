import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Sparkles, Send, TrendingUp, Clock, BarChart3, Users, Package, Truck, FileSpreadsheet, FileText as FileIcon } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SALES } from "@/lib/mock/sales";
import { formatXOF } from "@/lib/mock/catalog";
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

const REPORTS = [
  { id: "sales", label: "Ventes", icon: BarChart3 },
  { id: "products", label: "Meilleurs produits", icon: Package },
  { id: "customers", label: "Meilleurs clients", icon: Users },
  { id: "suppliers", label: "Fournisseurs", icon: Truck },
  { id: "margin", label: "Marge réelle", icon: TrendingUp },
  { id: "peak", label: "Heures & jours de pointe", icon: Clock },
] as const;

const MOCK_AI = [
  "Ta meilleure journée cette semaine est jeudi (+34% vs moyenne).",
  "Le produit 'Coca-Cola 33cl' est ton best-seller. Commande 200 unités avant vendredi.",
  "Marge globale : 31,5% ce mois-ci, en baisse de 2 points. La catégorie Épicerie tire vers le bas.",
];

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function RapportsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [report, setReport] = useState<(typeof REPORTS)[number]["id"]>("sales");
  const [aiInput, setAiInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Bonjour ! Je suis Nova. Posez-moi une question sur vos ventes, votre stock ou vos clients." },
  ]);

  const ca = SALES.reduce((s, x) => s + x.total, 0);
  const peakHours = [12, 20, 35, 48, 62, 78, 55, 40, 45, 68, 82, 74, 45].map((v, i) => ({ h: `${8 + i}h`, v }));
  const maxPeak = Math.max(...peakHours.map((p) => p.v));
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";

  const exportCsv = () => {
    const rows = [
      ["Rapport", REPORTS.find((r) => r.id === report)?.label, periodLabel].join(","),
      "",
      ["Libellé", "Quantité", "CA", "Marge %"].join(","),
      ...Array.from({ length: 8 }).map((_, i) => [`Ligne ${i + 1}`, 15 + i * 7, 20000 + i * 8500, 28 + (i % 5)].join(",")),
    ].join("\n");
    downloadFile(`rapport-${report}-${period}.csv`, rows, "text/csv");
  };

  const exportPdf = () => {
    const html = `<html><head><title>Rapport ${report}</title>
      <style>body{font-family:sans-serif;padding:24px}h1{color:#0891b2}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f5f5f5}</style></head>
      <body><h1>NovaCaisse — ${REPORTS.find((r) => r.id === report)?.label}</h1>
      <p>Période : <b>${periodLabel}</b></p>
      <table><thead><tr><th>Libellé</th><th>Qté</th><th>CA</th><th>Marge</th></tr></thead>
      <tbody>${Array.from({ length: 8 }).map((_, i) => `<tr><td>Ligne ${i + 1}</td><td>${15 + i * 7}</td><td>${formatXOF(20000 + i * 8500)}</td><td>${28 + (i % 5)}%</td></tr>`).join("")}</tbody></table>
      <p style="margin-top:24px;color:#666;font-size:12px">Généré le ${new Date().toLocaleString("fr-FR")}</p></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
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

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={`CA · ${periodLabel}`} value={formatXOF(ca)} accent="primary" trend={{ value: "+12%", positive: true }} />
            <StatCard label="Marge réelle" value="31,5%" accent="success" trend={{ value: "-2 pts", positive: false }} />
            <StatCard label="Ticket moyen" value={formatXOF(Math.round(ca / SALES.length))} accent="accent" trend={{ value: "+3%", positive: true }} />
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
                {REPORTS.find((r) => r.id === report)?.label} · {periodLabel}
              </div>
            </div>
            {report === "peak" ? (
              <div className="flex h-64 items-end gap-2">
                {peakHours.map((p) => (
                  <div key={p.h} className="flex flex-1 flex-col items-center gap-1">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(p.v / maxPeak) * 100}%` }}
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/70 to-primary-glow" style={{ minHeight: 8 }} />
                    <div className="text-[10px] text-muted-foreground">{p.h}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Libellé</th><th className="px-3 py-2 text-right">Qté</th>
                      <th className="px-3 py-2 text-right">CA</th><th className="px-3 py-2 text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{report === "customers" ? `Client ${i + 1}` : report === "suppliers" ? `Fournisseur ${i + 1}` : `Ligne ${i + 1}`}</td>
                        <td className="tabular px-3 py-2 text-right">{15 + i * 7}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{formatXOF(20000 + i * 8500)}</td>
                        <td className="tabular px-3 py-2 text-right text-success">{28 + (i % 5)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent/10 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display text-sm font-bold">Nova · Analyste IA</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Réponses en langage naturel</div>
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
