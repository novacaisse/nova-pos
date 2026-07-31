import { createFileRoute } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";

// Tableau de bord ZegResto — construit en détail à la Phase 6 (couverts du
// jour, CA, tables occupées en temps réel). Ce stub existe dès la Phase 0
// pour que /app/resto (racine de la mise en page, app.resto.tsx) et les
// redirections (app.tsx, rôles server/cook et organisation resto-only)
// aient une page réelle à afficher pendant que les phases suivantes
// construisent Salle/Menu/Commandes/etc.
export const Route = createFileRoute("/app/resto/")({
  component: RestoDashboardStub,
});

function RestoDashboardStub() {
  return (
    <div>
      <PageHeader title="ZegResto" subtitle="Tableau de bord" />
      <div className="p-5 sm:p-8">
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Le tableau de bord ZegResto arrive au fil des prochaines phases de ce chantier.
        </div>
      </div>
    </div>
  );
}
