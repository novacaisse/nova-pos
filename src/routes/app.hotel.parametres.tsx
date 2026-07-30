import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store, Coins, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { HotelTarificationTab } from "@/components/app/HotelTarificationTab";
import { ApplicationsPanel } from "@/components/app/ApplicationsPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/parametres")({
  component: HotelParametresPage,
});

function HotelParametresPage() {
  const [tab, setTab] = useState<"etablissement" | "tarification" | "apps">("etablissement");

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
          {tab === "etablissement" && <OrgIdentityTab heading="Informations de l'établissement" />}
          {tab === "tarification" && <HotelTarificationTab />}
          {tab === "apps" && <ApplicationsPanel />}
        </div>
      </div>
    </div>
  );
}
