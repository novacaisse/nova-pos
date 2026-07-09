import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanBarcode } from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: AppHome,
});

function AppHome() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
          <ScanBarcode className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bloc à venir. Le module Caisse est prêt — validons-le avant de continuer.
        </p>
        <Link
          to="/app/caisse"
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90"
        >
          Ouvrir la caisse →
        </Link>
      </div>
    </div>
  );
}
