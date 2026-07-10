import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, Sparkles, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PLANS, CURRENT_PLAN_ID, INVOICES } from "@/lib/mock/subscription";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/abonnement")({
  component: AbonnementPage,
});

function AbonnementPage() {
  const current = PLANS.find((p) => p.id === CURRENT_PLAN_ID)!;

  return (
    <div>
      <PageHeader title="Abonnement" subtitle="Formule, facturation et paiement" />

      <div className="space-y-6 p-5 sm:p-8">
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formule actuelle</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">{current.name}</span>
                <span className="tabular text-sm text-muted-foreground">{formatXOF(current.price_month)} / mois</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-block h-2 w-2 rounded-full bg-success" />
                <span className="font-semibold text-success">Actif</span>
                <span className="text-muted-foreground">· Prochain prélèvement le 01/08/2026</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">Gérer le paiement</button>
              <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Résilier</button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Changer de formule</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {PLANS.map((p) => {
              const isCurrent = p.id === CURRENT_PLAN_ID;
              return (
                <div key={p.id} className={cn(
                  "relative flex flex-col rounded-2xl border p-5 transition-shadow",
                  p.recommended ? "border-primary/60 bg-card shadow-elegant" : "border-border bg-card",
                )}>
                  {p.recommended && (
                    <span className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground shadow-glow">
                      <Sparkles className="mr-1 inline h-3 w-3" /> Recommandé
                    </span>
                  )}
                  <div className="font-display text-xl font-bold">{p.name}</div>
                  <div className="tabular mt-1 font-display text-3xl font-bold">
                    {formatXOF(p.price_month)}<span className="text-sm text-muted-foreground"> /mois</span>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}</li>
                    ))}
                  </ul>
                  <button disabled={isCurrent} className={cn(
                    "mt-5 rounded-xl py-2.5 text-sm font-semibold",
                    isCurrent ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90",
                  )}>
                    {isCurrent ? "Formule actuelle" : "Passer à " + p.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Historique de facturation</h2>
            <button className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <Download className="h-4 w-4" /> Tout télécharger
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Méthode</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((i) => (
                  <tr key={i.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{i.ref}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i.date}</td>
                    <td className="px-4 py-3 text-xs"><CreditCard className="mr-1 inline h-3.5 w-3.5" /> {i.method}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">{i.status}</span></td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(i.amount)}</td>
                    <td className="px-4 py-3 text-right"><button className="text-xs font-medium text-primary hover:underline">PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
