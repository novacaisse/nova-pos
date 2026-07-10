import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, Loader2, Smartphone, ArrowRight, CircleCheck } from "lucide-react";
import { PLANS, type Plan } from "@/lib/mock/subscription";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/souscription")({
  head: () => ({ meta: [{ title: "Souscription — NovaCaisse" }] }),
  component: SouscriptionPage,
});

type Period = "mensuel" | "annuel" | "lifetime";
type Op = "Orange Money" | "MTN MoMo" | "Moov Money" | "Wave";
type Step = "recap" | "paiement" | "confirmation" | "succes";

const OPERATORS: { key: Op; color: string }[] = [
  { key: "Orange Money", color: "#FF7900" },
  { key: "MTN MoMo", color: "#FFCC00" },
  { key: "Moov Money", color: "#0068B3" },
  { key: "Wave", color: "#1DC8F6" },
];

function SouscriptionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("recap");
  const [planId, setPlanId] = useState<Plan["id"]>("pro");
  const [period, setPeriod] = useState<Period>("annuel");
  const [operator, setOperator] = useState<Op>("Orange Money");
  const [phone, setPhone] = useState("+229 ");

  const plan = PLANS.find((p) => p.id === planId)!;
  const total =
    period === "mensuel" ? plan.price_month :
    period === "annuel" ? Math.round(plan.price_month * 12 * 0.8) :
    plan.price_month * 24;

  const launchPayment = () => {
    setStep("confirmation");
    setTimeout(() => setStep("succes"), 2400);
    setTimeout(() => navigate({ to: "/app/caisse" }), 4400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        <Link to="/" className="mx-auto flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold">NovaCaisse</span>
        </Link>

        <div className="mt-8 flex-1">
          <AnimatePresence mode="wait">
            {step === "recap" && (
              <motion.div key="recap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="rounded-3xl border border-border bg-card p-7 shadow-elegant">
                <h1 className="font-display text-2xl font-black">Récapitulatif</h1>
                <p className="mt-1 text-sm text-muted-foreground">Confirmez votre formule et la périodicité.</p>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formule</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {PLANS.map((p) => (
                      <button key={p.id} onClick={() => setPlanId(p.id)}
                        className={cn("rounded-2xl border p-4 text-left transition-all",
                          planId === p.id ? "border-primary bg-primary/5 shadow-elegant" : "border-border hover:bg-muted")}>
                        <div className="font-display font-bold">{p.name}</div>
                        <div className="tabular text-xs text-muted-foreground">{formatXOF(p.price_month)} / mois</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Périodicité</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["mensuel", "annuel", "lifetime"] as const).map((p) => (
                      <button key={p} onClick={() => setPeriod(p)}
                        className={cn("rounded-xl border p-3 text-sm font-semibold capitalize transition-colors",
                          period === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                        {p}
                        {p === "annuel" && <span className="ml-1 text-[10px] opacity-80">-20%</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-muted/60 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{plan.name} · {period}</span>
                    <span className="tabular font-semibold">{formatXOF(total)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 font-display text-lg font-bold">
                    <span>Total à payer</span>
                    <span className="tabular text-primary">{formatXOF(total)}</span>
                  </div>
                </div>

                <button onClick={() => setStep("paiement")}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display font-bold text-primary-foreground shadow-elegant hover:opacity-90">
                  Procéder au paiement <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            )}

            {step === "paiement" && (
              <motion.div key="pay" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="rounded-3xl border border-border bg-card p-7 shadow-elegant">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-primary-glow text-[10px] text-primary-foreground">MF</div>
                  Paiement sécurisé via MoneyFusion
                </div>
                <h1 className="font-display text-2xl font-black">Payer par Mobile Money</h1>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opérateur</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {OPERATORS.map((o) => (
                      <button key={o.key} onClick={() => setOperator(o.key)}
                        className={cn("flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all",
                          operator === o.key ? "border-primary bg-primary/5 shadow-elegant" : "border-border hover:bg-muted")}>
                        <div className="grid h-10 w-10 place-items-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: o.color }}>
                          {o.key.split(" ")[0].slice(0, 3).toUpperCase()}
                        </div>
                        <span className="text-[11px] font-semibold text-center leading-tight">{o.key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mt-5 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Numéro de téléphone</span>
                  <div className="relative">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                  </div>
                </label>

                <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Montant</span>
                    <span className="tabular font-display font-bold text-primary">{formatXOF(total)}</span>
                  </div>
                </div>

                <button onClick={launchPayment}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display font-bold text-primary-foreground shadow-elegant hover:opacity-90">
                  Payer {formatXOF(total)}
                </button>
                <button onClick={() => setStep("recap")} className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground">Modifier la formule</button>
              </motion.div>
            )}

            {step === "confirmation" && (
              <motion.div key="conf" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-3xl border border-border bg-card p-10 text-center shadow-elegant">
                <Loader2 className="mx-auto h-14 w-14 animate-spin text-primary" />
                <h2 className="mt-5 font-display text-xl font-bold">En attente de confirmation…</h2>
                <p className="mt-2 text-sm text-muted-foreground">Validez la transaction sur votre téléphone {operator}.</p>
                <div className="mx-auto mt-6 max-w-sm rounded-xl bg-muted/60 p-4 text-xs text-muted-foreground">
                  <div className="tabular">Réf : MF-{Math.random().toString(36).slice(2, 8).toUpperCase()}</div>
                </div>
              </motion.div>
            )}

            {step === "succes" && (
              <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-3xl border border-border bg-card p-10 text-center shadow-elegant">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }}
                  className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
                  <CircleCheck className="h-12 w-12" />
                </motion.div>
                <h2 className="mt-5 font-display text-2xl font-black">Paiement confirmé !</h2>
                <p className="mt-2 text-sm text-muted-foreground">Bienvenue chez NovaCaisse. Votre boutique est prête.</p>
                <div className="mt-6 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" /> Redirection vers votre caisse…
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
