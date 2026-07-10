import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Store, User, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inscription")({
  head: () => ({ meta: [{ title: "Créer un compte — NovaCaisse" }] }),
  component: InscriptionPage,
});

const SECTORS = ["Épicerie", "Superette", "Restaurant", "Boulangerie", "Mode", "Pharmacie", "Quincaillerie", "Beauté", "Autre"];
const COUNTRIES = ["Bénin", "Burkina Faso", "Côte d'Ivoire", "Mali", "Sénégal", "Togo", "Niger", "Guinée"];

function InscriptionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ shop: "", sector: SECTORS[0], country: COUNTRIES[0], city: "", name: "", phone: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold">NovaCaisse</span>
        </Link>

        <div className="mt-8 rounded-3xl border border-border bg-card p-7 shadow-elegant">
          <Progress step={step} />

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="mb-5 flex items-center gap-2">
                  <Store className="h-5 w-5 text-primary" />
                  <h1 className="font-display text-xl font-bold">Votre boutique</h1>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nom de la boutique" value={form.shop} onChange={set("shop")} placeholder="Ex : Chez Aïcha" required />
                  <SelectField label="Secteur" value={form.sector} onChange={set("sector")} options={SECTORS} />
                  <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
                  <Field label="Ville" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" required />
                </div>
                <button onClick={() => form.shop && form.city && setStep(2)}
                  className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90">
                  Continuer <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div key="2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="mb-5 flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  <h1 className="font-display text-xl font-bold">Vos infos</h1>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nom complet" value={form.name} onChange={set("name")} required />
                  <Field label="Téléphone" value={form.phone} onChange={set("phone")} placeholder="+229 …" required />
                  <Field label="Email" type="email" value={form.email} onChange={set("email")} required />
                  <Field label="Mot de passe" type="password" value={form.password} onChange={set("password")} required />
                </div>
                <div className="mt-6 flex gap-2">
                  <button onClick={() => setStep(1)}
                    className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted">
                    <ArrowLeft className="h-4 w-4" /> Retour
                  </button>
                  <button onClick={() => navigate({ to: "/souscription" })}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90">
                    Créer mon compte <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 text-center text-xs text-muted-foreground">
            Déjà un compte ? <Link to="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Progress({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {[1, 2].map((n, i) => (
        <div key={n} className="flex flex-1 items-center gap-3">
          <div className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors",
            step >= (n as 1 | 2) ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground")}>
            {step > n ? <Check className="h-4 w-4" /> : n}
          </div>
          {i === 0 && <div className={cn("h-1 flex-1 rounded-full transition-colors", step > 1 ? "bg-primary" : "bg-muted")} />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
    </label>
  );
}

function SelectField({ label, options, ...props }: { label: string; options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
