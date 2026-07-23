import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Sparkles, Loader2 } from "lucide-react";
import { usePlans } from "@/lib/data/adminHooks";
import { formatMoney } from "@/lib/data/hooks";
import { BrandLogo } from "@/components/app/BrandLogo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tarifs")({
  head: () => ({
    meta: [
      { title: "Tarifs — NovaCaisse" },
      { name: "description", content: "Choisissez la formule NovaCaisse adaptée à votre commerce. Starter, Pro ou Business — mensuel ou annuel." },
    ],
  }),
  component: TarifsPage,
});

type Period = "mensuel" | "annuel";

const FAQ = [
  { q: "Puis-je essayer gratuitement ?", a: "Oui, 3 jours d'essai sur toutes les formules, sans carte bancaire." },
  { q: "Puis-je changer de formule ?", a: "Vous pouvez évoluer ou rétrograder à tout moment depuis votre espace Abonnement." },
  { q: "Puis-je payer en Mobile Money ?", a: "Oui — via MoneyFusion (Orange Money, MTN MoMo, Moov Money…)." },
  { q: "Comment résilier ?", a: "Depuis votre espace Abonnement. Aucun engagement, aucun frais caché." },
];

function TarifsPage() {
  const [period, setPeriod] = useState<Period>("annuel");
  const { data: plans = [], isLoading } = usePlans();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo className="h-10 w-10 shadow-glow" iconClassName="h-5 w-5" />
            <span className="font-display text-xl font-bold">NovaCaisse</span>
          </Link>
          <Link to="/connexion" className="text-sm font-medium text-muted-foreground hover:text-foreground">Connexion</Link>
        </div>
      </header>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Sans engagement
          </span>
          <h1 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-5xl">Des tarifs simples, sans surprise.</h1>
          <p className="mt-3 text-muted-foreground">3 jours d'essai gratuits sur toutes les formules.</p>

          <div className="mt-8 inline-flex rounded-2xl border border-border bg-card p-1">
            {(["mensuel", "annuel"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("relative rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors",
                  period === p ? "bg-primary text-primary-foreground shadow-elegant" : "text-muted-foreground hover:text-foreground")}>
                {p}
                {p === "annuel" && (
                  <span className="ml-1.5 rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold text-success">économisez</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
        <div className="mx-auto mt-12 grid max-w-6xl gap-5 px-5 md:grid-cols-3">
          {plans.map((plan) => {
            const amount = period === "mensuel" ? plan.price_month : plan.price_year;
            const suffix = period === "mensuel" ? "/ mois" : "/ an";
            return (
              <div key={plan.id}
                className={cn("relative rounded-3xl border p-7 transition-all",
                  plan.is_recommended ? "border-primary bg-card shadow-elegant lg:scale-105" : "border-border bg-card")}>
                {plan.is_recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-primary-glow px-3 py-1 text-[10px] font-bold uppercase text-primary-foreground shadow-glow">
                    Populaire
                  </span>
                )}
                <div className="font-display text-xl font-bold">{plan.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-4xl font-black">{formatMoney(amount, plan.currency)}</span>
                  <span className="text-xs text-muted-foreground">{suffix}</span>
                </div>
                {(plan.limits.max_users || plan.limits.ai_credits) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {plan.limits.max_users ? `${plan.limits.max_users} comptes` : "Comptes illimités"}
                    {" · "}
                    {plan.limits.ai_credits ? `${plan.limits.ai_credits} crédits IA/mois` : "Crédits IA illimités"}
                  </div>
                )}
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" /> {f}</li>
                  ))}
                </ul>
                <Link to="/inscription"
                  className={cn("mt-6 flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors",
                    plan.is_recommended
                      ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-elegant hover:opacity-90"
                      : "border border-border bg-background hover:bg-muted")}>
                  Choisir {plan.name} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground">Aucune formule disponible pour le moment.</div>
          )}
        </div>
        )}
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">Questions fréquentes</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-border bg-card p-5">
                <summary className="flex cursor-pointer items-center justify-between font-semibold">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
