import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shield, Lock, Mail, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admins")({
  head: () => ({ meta: [{ title: "Administration — NovaCaisse" }] }),
  component: AdminsLogin,
});

function AdminsLogin() {
  const navigate = useNavigate();
  const { signIn, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signErr } = await signIn(email.trim(), password);
    if (signErr) {
      setError(signErr);
      setLoading(false);
      return;
    }

    // Vérifie explicitement les droits ici plutôt que de laisser admin.tsx
    // rediriger silencieusement vers /app : un formulaire dédié doit
    // rejeter clairement un compte non-admin, pas atterrir ailleurs sans
    // explication.
    const { data: isSuperAdmin, error: checkErr } = await supabase.rpc("is_super_admin");
    if (checkErr || !isSuperAdmin) {
      await signOut();
      setError("Ce compte n'a pas les droits d'administration.");
      setLoading(false);
      return;
    }

    navigate({ to: "/admin" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-foreground/5">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-foreground to-foreground/70 text-background shadow-elegant">
            <Shield className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold">NovaCaisse</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Back-office</div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 w-full rounded-3xl border border-border bg-card p-7 shadow-elegant"
        >
          <h1 className="font-display text-2xl font-black tracking-tight">Espace Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Réservé aux comptes Super Admin.</p>

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
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-foreground" />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" minLength={6}
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-foreground" />
            </div>
          </label>

          <button disabled={loading} type="submit"
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-foreground to-foreground/80 text-sm font-bold text-background shadow-elegant transition-opacity hover:opacity-90 disabled:opacity-60">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Connexion…</> : <>Se connecter <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
