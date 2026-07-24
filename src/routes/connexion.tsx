import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BrandLogo } from "@/components/app/BrandLogo";

export const Route = createFileRoute("/connexion")({
  head: () => ({ meta: [{ title: "Connexion — ZegCaisse" }] }),
  component: ConnexionPage,
});

function ConnexionPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    navigate({ to: "/app" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo className="h-11 w-11 shadow-glow" textClassName="text-2xl" brand="zegcaisse" />
        </Link>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={onSubmit}
          className="mt-8 w-full rounded-3xl border border-border bg-card p-7 shadow-elegant"
        >
          <h1 className="font-display text-2xl font-black tracking-tight">Bon retour 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre espace boutique.</p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" minLength={6}
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </label>

          <div className="mt-4 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="rounded" /> Se souvenir</label>
            <a href="#" className="font-semibold text-primary hover:underline">Mot de passe oublié ?</a>
          </div>

          <button disabled={loading} type="submit"
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-sm font-bold text-primary-foreground shadow-elegant transition-opacity hover:opacity-90 disabled:opacity-60">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Connexion…</> : <>Se connecter <ArrowRight className="h-4 w-4" /></>}
          </button>

          <div className="mt-5 text-center text-xs text-muted-foreground">
            Pas encore de compte ? <Link to="/inscription" className="font-semibold text-primary hover:underline">Créez-en un</Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}

