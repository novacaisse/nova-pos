import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles, CreditCard, Loader2, Clock } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useShop } from "@/lib/auth/ShopProvider";
import { useSubscription, useSubscriptionPayments, formatXOF } from "@/lib/data/hooks";
import { getTrialInfo } from "@/lib/trial";
import { usePlans } from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/abonnement")({
  component: AbonnementPage,
});

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "En attente", paid: "Payé", failed: "Échoué", refunded: "Remboursé",
};

function AbonnementPage() {
  const { currentShop } = useShop();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: payments = [], isLoading: paymentsLoading } = useSubscriptionPayments();
  const { data: plans = [] } = usePlans();
  const trial = getTrialInfo(currentShop);

  const currentPlan = plans.find((p) => p.id === subscription?.plan);

  return (
    <div>
      <PageHeader title="Abonnement" subtitle="Formule, facturation et paiement" />

      <div className="space-y-6 p-5 sm:p-8">
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-5">
          {subLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formule actuelle</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold">{currentPlan?.name ?? "Essai gratuit"}</span>
                  {currentPlan && <span className="tabular text-sm text-muted-foreground">{formatXOF(currentPlan.price_month)} / mois</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {trial.onTrial ? (
                    <>
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold text-primary">
                        {trial.expired ? "Essai terminé" : `Essai gratuit · ${trial.daysLeft} jour${trial.daysLeft > 1 ? "s" : ""} restant${trial.daysLeft > 1 ? "s" : ""}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block h-2 w-2 rounded-full bg-success" />
                      <span className="font-semibold text-success">
                        {subscription?.status === "active" ? "Actif" : subscription?.status === "past_due" ? "Paiement en retard" : subscription?.status ?? "—"}
                      </span>
                      {subscription?.current_period_end && (
                        <span className="text-muted-foreground">· Prochaine échéance le {new Date(subscription.current_period_end).toLocaleDateString("fr-FR")}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled title="Bientôt disponible" className="cursor-not-allowed rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground opacity-60">
                  Gérer le paiement
                </button>
                <button disabled title="Bientôt disponible" className="cursor-not-allowed rounded-xl bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground opacity-60">
                  Résilier
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-1 font-display text-lg font-bold">Changer de formule</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Le paiement en ligne (MoneyFusion) arrive bientôt — le changement de formule n'est pas encore disponible.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = p.id === subscription?.plan;
              return (
                <div key={p.id} className={cn(
                  "relative flex flex-col rounded-2xl border p-5 transition-shadow",
                  p.is_recommended ? "border-primary/60 bg-card shadow-elegant" : "border-border bg-card",
                )}>
                  {p.is_recommended && (
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
                  <button disabled title="Bientôt disponible" className={cn(
                    "mt-5 cursor-not-allowed rounded-xl py-2.5 text-sm font-semibold opacity-60",
                    isCurrent ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
                  )}>
                    {isCurrent ? "Formule actuelle" : "Passer à " + p.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Historique de facturation</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {paymentsLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
            ) : payments.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun paiement pour l'instant — l'intégration MoneyFusion arrive bientôt.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Méthode</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3 text-xs"><CreditCard className="mr-1 inline h-3.5 w-3.5" /> {p.method}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          p.status === "paid" && "bg-success/15 text-success",
                          p.status === "pending" && "bg-muted text-muted-foreground",
                          (p.status === "failed" || p.status === "refunded") && "bg-destructive/15 text-destructive",
                        )}>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                      </td>
                      <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
