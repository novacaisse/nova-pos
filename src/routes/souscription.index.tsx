import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, Loader2, Smartphone, ArrowRight, AlertTriangle } from "lucide-react";
import { invokeFn } from "@/lib/data/invokeFn";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShop } from "@/lib/auth/ShopProvider";
import { useProfile } from "@/lib/data/hooks";
import { usePlans } from "@/lib/data/adminHooks";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

type SouscriptionSearch = { plan?: string };

export const Route = createFileRoute("/souscription/")({
  head: () => ({ meta: [{ title: "Souscription — NovaCaisse" }] }),
  validateSearch: (search: Record<string, unknown>): SouscriptionSearch => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
  }),
  component: SouscriptionPage,
});

type Period = "mensuel" | "annuel";
type Step = "recap" | "paiement";

function SouscriptionPage() {
  const navigate = useNavigate();
  const { plan: planFromUrl } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const { currentShop, loading: shopLoading } = useShop();
  const { data: profile } = useProfile();
  const { data: plans = [], isLoading: plansLoading } = usePlans();

  const [step, setStep] = useState<Step>("recap");
  const [planId, setPlanId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("annuel");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/connexion" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if (profile?.phone) setPhone(profile.phone);
  }, [profile]);

  useEffect(() => {
    if (planId || plans.length === 0) return;
    const preselected = planFromUrl && plans.find((p) => p.id === planFromUrl);
    setPlanId(preselected ? preselected.id : (plans.find((p) => p.is_recommended) ?? plans[0]).id);
  }, [plans, planFromUrl, planId]);

  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const total = plan ? (period === "mensuel" ? plan.price_month : plan.price_year) : 0;

  const launchPayment = async () => {
    if (!currentShop || !plan || !phone.trim() || !fullName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await invokeFn<{ url?: string }>("create-subscription-payment", {
        shop_id: currentShop.id,
        plan_id: plan.id,
        period: period === "mensuel" ? "month" : "year",
        phone: phone.trim(),
        full_name: fullName.trim(),
      });
      if (!data.url) throw new Error("Réponse invalide du serveur de paiement.");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? "Impossible de démarrer le paiement. Réessayez.");
      setSubmitting(false);
    }
  };

  if (authLoading || shopLoading || plansLoading || !plan) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentShop) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5 text-center">
        <div>
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm text-muted-foreground">Aucune boutique associée à votre compte.</p>
          <Link to="/app" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Retour à l'application</Link>
        </div>
      </div>
    );
  }

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
                <p className="mt-1 text-sm text-muted-foreground">Confirmez votre formule et la périodicité pour {currentShop.name}.</p>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formule</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {plans.map((p) => (
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["mensuel", "annuel"] as const).map((p) => (
                      <button key={p} onClick={() => setPeriod(p)}
                        className={cn("rounded-xl border p-3 text-sm font-semibold capitalize transition-colors",
                          period === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                        {p}
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
                <p className="mt-2 text-sm text-muted-foreground">
                  Vous choisirez votre opérateur (Orange Money, MTN MoMo, Moov Money…) sur la page sécurisée MoneyFusion suivante.
                </p>

                <label className="mt-5 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom complet</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Numéro de téléphone Mobile Money</span>
                  <div className="relative">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 XX XX XX XX"
                      className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                  </div>
                </label>

                <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Montant</span>
                    <span className="tabular font-display font-bold text-primary">{formatXOF(total)}</span>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </div>
                )}

                <button onClick={launchPayment} disabled={submitting || !phone.trim() || !fullName.trim()}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display font-bold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? "Redirection…" : `Payer ${formatXOF(total)}`}
                </button>
                <button onClick={() => setStep("recap")} disabled={submitting} className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                  Modifier la formule
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
