import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/connexion")({
  head: () => ({ meta: [{ title: "Connexion — NovaCaisse" }] }),
  component: ConnexionPage,
});

function ConnexionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => navigate({ to: "/app/caisse" }), 900);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">NovaCaisse</span>
        </Link>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={onSubmit}
          className="mt-8 w-full rounded-3xl border border-border bg-card p-7 shadow-elegant"
        >
          <h1 className="font-display text-2xl font-black tracking-tight">Bon retour 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre espace boutique.</p>

          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="email" defaultValue="aicha@cotonoucentre.bj"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" defaultValue="••••••••"
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
