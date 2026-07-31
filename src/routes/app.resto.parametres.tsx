import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { AddOrganizationDialog } from "@/components/app/AddOrganizationDialog";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useMyRole, useProvisionOrganization } from "@/lib/data/hooks";

export const Route = createFileRoute("/app/resto/parametres")({
  // ?openAdd=1 : ouvre directement le formulaire "Ajouter un restaurant" —
  // même mécanique que /app/parametres et /app/hotel/parametres, utilisée
  // par le raccourci du même nom dans ShopSelector.tsx en contexte ZegResto.
  validateSearch: (search: Record<string, unknown>): { openAdd?: boolean } => ({
    openAdd: search.openAdd === true || search.openAdd === "1" ? true : undefined,
  }),
  component: RestoParametresPage,
});

function RestoParametresPage() {
  const { openAdd } = Route.useSearch();
  const { organizations } = useOrganization();
  const { data: myRole } = useMyRole();
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useProvisionOrganization();

  useEffect(() => {
    if (openAdd) setShowAddShop(true);
  }, [openAdd]);

  // Seuls les restaurants ZegResto du compte — jamais les boutiques
  // ZegCaisse ni les établissements ZegHotel, même partageant le même
  // propriétaire (isolation, même pattern que app.hotel.parametres.tsx).
  const restoOrgs = organizations.filter((s) => s.app_module === "resto");

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration ZegResto de votre restaurant" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            <div className="flex w-full items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary">
              <UtensilsCrossed className="h-4 w-4" /> Restaurant
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <OrgIdentityTab heading="Informations du restaurant" />

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">Restaurants multiples</div>
              {myRole === "owner" && (
                <button onClick={() => setShowAddShop(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
              )}
            </div>
            <div className="space-y-2">
              {restoOrgs.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><UtensilsCrossed className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.country} · Plan {s.plan}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddShop && (
        <AddOrganizationDialog
          unitLabel="restaurant"
          onClose={() => setShowAddShop(false)}
          onCreate={async (input) => { await createShop.mutateAsync({ app: "resto", ...input }); setShowAddShop(false); }}
          pending={createShop.isPending}
        />
      )}
    </div>
  );
}
