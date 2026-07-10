import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Zap, ArrowRight, Check, X, Sparkles } from "lucide-react";
import { PLANS } from "@/lib/mock/subscription";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tarifs")({
  head: () => ({
    meta: [
      { title: "Tarifs — NovaCaisse" },
      { name: "description", content: "Choisissez la formule NovaCaisse adaptée à votre commerce. Starter, Pro ou Business — mensuel, annuel ou lifetime." },
    ],
  }),
  component: TarifsPage,
});

type Period = "mensuel" | "annuel" | "lifetime";

const FEATURE_MATRIX: { label: string; starter: boolean | string; pro: boolean | string; business: boolean | string }[] = [
  { label: "Caisses", starter: "1", pro: "3", business: "Illimité" },
  { label: "Boutiques", starter: "1", pro: "3", business: "Illimité" },
  { label: "Utilisateurs", starter: "2", pro: "10", business: "Illimité" },
  { label: "Produits", starter: "500", pro: "5 000", business: "Illimité" },
  { label: "Gestion de stock", starter: true, pro: true, business: true },
  { label: "Multi-boutique", starter: false, pro: true, business: true },
  { label: "Rapports avancés", starter: false, pro: true, business: true },
  { label: "Assistant IA Nova", starter: false, pro: "500 req/mois", business: "Illimité" },
  { label: "API & webhooks", starter: false, pro: false, business: true },
  { label: "Support", starter: "Email", pro: "Prioritaire", business: "Téléphone 7j/7" },
];

const FAQ = [
  { q: "Puis-je essayer gratuitement ?", a: "Oui, 14 jours d'essai sur toutes les formules, sans carte bancaire." },
  { q: "Puis-je changer de formule ?", a: "Vous pouvez évoluer ou rétrograder à tout moment depuis votre espace Abonnement." },
  { q: "Puis-je payer en Mobile Money ?", a: "Oui — Orange Money, MTN MoMo, Moov Money et Wave sont tous acceptés via MoneyFusion." },
  { q: "Comment résilier ?", a: "En un clic depuis votre espace Abonnement. Aucun engagement, aucun frais caché." },
];

function TarifsPage() {
  const [period, setPeriod] = useState<Period>("annuel");

  const priceFor = (monthly: number) => {
    if (period === "mensuel") return { amount: monthly, suffix: "/ mois" };
    if (period === "annuel") return { amount: Math.round(monthly * 12 * 0.8), suffix: "/ an" };
    return { amount: monthly * 24, suffix: "à vie" };
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
              <Zap className="h-5 w-5" strokeWidth={2.5} />
            </div>
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
          <p className="mt-3 text-muted-foreground">14 jours d'essai gratuits sur toutes les formules.</p>

          <div className="mt-8 inline-flex rounded-2xl border border-border bg-card p-1">
            {(["mensuel", "annuel", "lifetime"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("relative rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors",
                  period === p ? "bg-primary text-primary-foreground shadow-elegant" : "text-muted-foreground hover:text-foreground")}>
                {p}
                {p === "annuel" && (
                  <span className="ml-1.5 rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold text-success">-20%</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 px-5 md:grid-cols-3">
          {PLANS.map((plan) => {
            const price = priceFor(plan.price_month);
            return (
              <div key={plan.id}
                className={cn("relative rounded-3xl border p-7 transition-all",
                  plan.recommended ? "border-primary bg-card shadow-elegant lg:scale-105" : "border-border bg-card")}>
                {plan.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-primary-glow px-3 py-1 text-[10px] font-bold uppercase text-primary-foreground shadow-glow">
                    Populaire
                  </span>
                )}
                <div className="font-display text-xl font-bold">{plan.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-4xl font-black">{formatXOF(price.amount)}</span>
                  <span className="text-xs text-muted-foreground">{price.suffix}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" /> {f}</li>
                  ))}
                </ul>
                <Link to="/inscription"
                  className={cn("mt-6 flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors",
                    plan.recommended
                      ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-elegant hover:opacity-90"
                      : "border border-border bg-background hover:bg-muted")}>
                  Choisir {plan.name} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">Comparez en détail</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fonctionnalité</th>
                  <th className="px-4 py-3 text-center text-xs font-bold">Starter</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-primary">Pro</th>
                  <th className="px-4 py-3 text-center text-xs font-bold">Business</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.label} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    {(["starter", "pro", "business"] as const).map((k) => {
                      const v = row[k];
                      return (
                        <td key={k} className="px-4 py-3 text-center">
                          {v === true ? <Check className="mx-auto h-4 w-4 text-success" /> :
                            v === false ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> :
                              <span className="text-xs tabular font-semibold">{v}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
