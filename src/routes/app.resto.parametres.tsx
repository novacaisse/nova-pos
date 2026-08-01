import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed, LayoutGrid, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { AddOrganizationDialog } from "@/components/app/AddOrganizationDialog";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useMyRole, useProvisionOrganization } from "@/lib/data/hooks";
import { useRestoZones, useUpsertRestoZone, useDeleteRestoZone } from "@/lib/data/restoHooks";
import { cn } from "@/lib/utils";

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
  const [tab, setTab] = useState<"restaurant" | "zones">("restaurant");
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useProvisionOrganization();

  useEffect(() => {
    if (openAdd) { setTab("restaurant"); setShowAddShop(true); }
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
            {([
              { k: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
              { k: "zones", label: "Zones", icon: LayoutGrid },
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
          {tab === "restaurant" && (
            <>
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
            </>
          )}
          {tab === "zones" && <ZonesTab />}
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

// Gestion des zones existe déjà en contexte (onglets du plan de salle,
// /app/resto/salle) — cette vue Paramètres est l'équivalent "liste admin"
// classique, plus adaptée pour renommer/réordonner sans manipuler le
// canvas. Les deux écrans lisent/écrivent la même table resto_zones.
function ZonesTab() {
  const { data: zones = [] } = useRestoZones();
  const upsert = useUpsertRestoZone();
  const remove = useDeleteRestoZone();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ nom: name.trim(), ordre: zones.length });
    setName("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 font-semibold">Zones de salle</div>
      <div className="mb-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ex. Terrasse, Salle principale…" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        <button onClick={add} disabled={!name.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      {zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune zone — le plan de salle en aura besoin pour placer des tables.</div>
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
              <span className="font-semibold">{z.nom}</span>
              <button onClick={() => { if (confirm(`Supprimer la zone ${z.nom} ?`)) remove.mutate(z.id); }} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
