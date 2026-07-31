import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store, Coins, LayoutGrid, Plus, BedDouble } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { HotelTarificationTab } from "@/components/app/HotelTarificationTab";
import { ApplicationsPanel } from "@/components/app/ApplicationsPanel";
import { AddOrganizationDialog } from "@/components/app/AddOrganizationDialog";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useMyRole, useProvisionOrganization } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/parametres")({
  // ?openAdd=1 : ouvre directement le formulaire "Ajouter un établissement"
  // — même mécanique que /app/parametres, utilisée par le raccourci du
  // même nom dans ShopSelector.tsx en contexte ZegHotel (audit isolation
  // ZegOS, Partie A : cette page avait jusqu'ici zéro gestion multi-
  // établissements, seul un lien y menait sans rien à afficher).
  validateSearch: (search: Record<string, unknown>): { openAdd?: boolean } => ({
    openAdd: search.openAdd === true || search.openAdd === "1" ? true : undefined,
  }),
  component: HotelParametresPage,
});

function HotelParametresPage() {
  const { openAdd } = Route.useSearch();
  const [tab, setTab] = useState<"etablissement" | "tarification" | "apps">("etablissement");
  const { organizations } = useOrganization();
  const { data: myRole } = useMyRole();
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useProvisionOrganization();

  useEffect(() => {
    if (openAdd) { setTab("etablissement"); setShowAddShop(true); }
  }, [openAdd]);

  // Seuls les établissements ZegHotel du compte — jamais les boutiques
  // ZegCaisse, même si elles partagent le même propriétaire (isolation).
  const hotelOrgs = organizations.filter((s) => (s.active_apps ?? []).includes("hotel"));

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration ZegHotel de votre établissement" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {([
              { k: "etablissement", label: "Établissement", icon: Store },
              { k: "tarification", label: "Tarification", icon: Coins },
              { k: "apps", label: "Applications", icon: LayoutGrid },
            ] as const).map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  tab === t.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {tab === "etablissement" && (
            <>
              <OrgIdentityTab heading="Informations de l'établissement" />

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Établissements multiples</div>
                  {myRole === "owner" && (
                    <button onClick={() => setShowAddShop(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                  )}
                </div>
                <div className="space-y-2">
                  {hotelOrgs.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><BedDouble className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.country} · Plan {s.plan}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === "tarification" && <HotelTarificationTab />}
          {tab === "apps" && <ApplicationsPanel />}
        </div>
      </div>

      {showAddShop && (
        <AddOrganizationDialog
          unitLabel="établissement"
          onClose={() => setShowAddShop(false)}
          onCreate={async (input) => { await createShop.mutateAsync({ app: "hotel", ...input }); setShowAddShop(false); }}
          pending={createShop.isPending}
        />
      )}
    </div>
  );
}
