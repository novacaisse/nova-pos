import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">NovaCaisse</span>
        </div>
        <Link
          to="/app/caisse"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Ouvrir l'app <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Landing en construction
        </span>
        <h1 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-6xl">
          La caisse moderne <br />
          pour les commerçants.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Point de vente, stock, ventes et rapports — dans une seule application tactile,
          pensée pour tablette.
        </p>
        <Link
          to="/app/caisse"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 font-display font-bold text-primary-foreground shadow-elegant"
        >
          Essayer la caisse <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
    </div>
  );
}
