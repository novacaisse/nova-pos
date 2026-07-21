import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/rejoindre")({
  head: () => ({ meta: [{ title: "Rejoindre une équipe — NovaCaisse" }] }),
  component: RejoindrePage,
});

function RejoindrePage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const valid = form.name && form.email && form.password.length >= 6;

  const submit = async () => {
    if (!valid || loading) return;
    setError(null);
    setLoading(true);
    const { error: signErr } = await signUp(form.email.trim(), form.password, form.name);
    setLoading(false);
    if (signErr) { setError(signErr); return; }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold">NovaCaisse</span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-border bg-card p-7 shadow-elegant">
          {done ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="font-display text-xl font-bold">Compte créé</h1>
              <p className="text-sm text-muted-foreground">
                Communiquez votre email (<strong>{form.email}</strong>) à votre gérant ou propriétaire de boutique :
                c'est lui qui vous ajoutera à son équipe avec le bon rôle depuis NovaCaisse.
              </p>
              <Link to="/connexion" className="inline-block font-semibold text-primary hover:underline">Aller à la connexion</Link>
            </div>
          ) : (
            <>
              <h1 className="mb-1 font-display text-2xl font-bold">Rejoindre une équipe</h1>
              <p className="mb-5 text-sm text-muted-foreground">
                Créez votre compte NovaCaisse — vous serez ajouté(e) à une boutique existante par son gérant.
              </p>

              <div className="space-y-3">
                <Field label="Nom complet *" value={form.name} onChange={set("name")} />
                <Field label="Email *" type="email" value={form.email} onChange={set("email")} />
                <Field label="Mot de passe *" type="password" value={form.password} onChange={set("password")} />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button onClick={submit} disabled={!valid || loading}
                className={cn(
                  "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
                  valid && !loading ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
                )}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Créer mon compte <ArrowRight className="h-4 w-4" /></>}
              </button>

              <div className="mt-4 text-center text-xs text-muted-foreground">
                Vous voulez plutôt créer votre propre boutique ?{" "}
                <Link to="/inscription" className="font-semibold text-primary hover:underline">Démarrer l'essai gratuit</Link>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...props }: {
  label: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={onChange} {...props}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
    </label>
  );
}
