import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BrandLogo } from "@/components/app/BrandLogo";

export const Route = createFileRoute("/inscription")({
  head: () => ({ meta: [{ title: "Créer un compte — ZegOS" }] }),
  component: InscriptionPage,
});

// Inscription réduite à la création du compte utilisateur seul (email +
// mot de passe) — le choix d'application ZegOS (ZegCaisse, ZegHotel…) et
// la configuration spécifique à l'application choisie se font après
// connexion, sur /app, dès que le compte n'a encore aucune organisation.
// Voir OnboardingFlow.tsx.
function InscriptionPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const valid = form.name.trim() && form.email.trim() && form.password.length >= 6;

  const submit = async () => {
    if (!valid || loading) return;
    setError(null);
    setLoading(true);

    const { error: signErr } = await signUp(form.email.trim(), form.password, form.name.trim());
    if (signErr) { setError(signErr); setLoading(false); return; }

    navigate({ to: "/app" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto flex items-center">
          <BrandLogo className="h-10" />
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-border bg-card p-7 shadow-elegant">
          <h1 className="mb-1 font-display text-2xl font-bold">Créez votre compte</h1>
          <p className="mb-5 text-sm text-muted-foreground">3 jours d'essai gratuit, sans carte requise. Choisissez votre application juste après.</p>

          <div className="space-y-3">
            <Field label="Nom complet *" value={form.name} onChange={set("name")} />
            <Field label="Email *" type="email" value={form.email} onChange={set("email")} />
            <Field label="Mot de passe *" type="password" value={form.password} onChange={set("password")} placeholder="6 caractères minimum" />
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
            Déjà un compte ? <Link to="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
    </label>
  );
}
