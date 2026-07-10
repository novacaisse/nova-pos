import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Sparkles, Send, TrendingUp, Clock, BarChart3, Users, Package } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SALES } from "@/lib/mock/sales";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/rapports")({
  component: RapportsPage,
});

const REPORTS = [
  { id: "period", label: "Par période", icon: BarChart3 },
  { id: "product", label: "Par produit", icon: Package },
  { id: "category", label: "Par catégorie", icon: Package },
  { id: "seller", label: "Par vendeur", icon: Users },
  { id: "margin", label: "Marge réelle", icon: TrendingUp },
  { id: "peak", label: "Heures & jours de pointe", icon: Clock },
];

const MOCK_AI = [
  "Ta meilleure journée cette semaine est jeudi (+34% vs moyenne). Les boissons représentent 42% du CA.",
  "Le produit 'Coca-Cola 33cl' est ton best-seller. Considère une commande fournisseur de 200 unités avant vendredi.",
  "Ta marge globale est de 31,5% ce mois-ci, en baisse de 2 points vs mois dernier. La catégorie 'Épicerie' tire la marge vers le bas.",
];

function RapportsPage() {
  const [active, setActive] = useState("period");
  const [aiInput, setAiInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Bonjour ! Je suis Nova, votre analyste. Posez-moi une question sur vos ventes, votre stock ou vos clients." },
  ]);

  const ca = SALES.reduce((s, x) => s + x.total, 0);
  const peakHours = [
    { h: "8h", v: 12 }, { h: "9h", v: 20 }, { h: "10h", v: 35 }, { h: "11h", v: 48 },
    { h: "12h", v: 62 }, { h: "13h", v: 78 }, { h: "14h", v: 55 }, { h: "15h", v: 40 },
    { h: "16h", v: 45 }, { h: "17h", v: 68 }, { h: "18h", v: 82 }, { h: "19h", v: 74 }, { h: "20h", v: 45 },
  ];
  const maxPeak = Math.max(...peakHours.map((p) => p.v));

  const send = () => {
    if (!aiInput.trim()) return;
    const q = aiInput;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setAiInput("");
    setTimeout(() => {
      const reply = MOCK_AI[Math.floor(Math.random() * MOCK_AI.length)];
      setMessages((m) => [...m, { role: "ai", text: reply }]);
    }, 700);
  };

  return (
    <div>
      <PageHeader
        title="Rapports avancés"
        subtitle="Analyses détaillées et assistant IA"
        actions={
          <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            <Download className="h-4 w-4" /> Exporter PDF
          </button>
        }
      />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="CA du mois" value={formatXOF(ca)} accent="primary" trend={{ value: "+12%", positive: true }} />
            <StatCard label="Marge réelle" value="31,5%" accent="success" trend={{ value: "-2 pts", positive: false }} />
            <StatCard label="Ticket moyen" value={formatXOF(Math.round(ca / SALES.length))} accent="accent" trend={{ value: "+3%", positive: true }} />
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              return (
                <button key={r.id} onClick={() => setActive(r.id)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
                    active === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" /> {r.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {REPORTS.find((r) => r.id === active)?.label}
            </div>
            {active === "peak" ? (
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
                      <th className="px-3 py-2">Libellé</th>
                      <th className="px-3 py-2 text-right">Qté</th>
                      <th className="px-3 py-2 text-right">CA</th>
                      <th className="px-3 py-2 text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">Ligne {i + 1}</td>
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
                  <button key={s} onClick={() => setAiInput(s)} className="rounded-full border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Posez votre question…"
                  className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
