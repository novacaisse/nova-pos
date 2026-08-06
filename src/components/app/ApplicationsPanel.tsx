// Profil > Applications — bascule facile entre les organisations du
// compte, tous app_module confondus (le sélecteur d'établissement du
// header, ShopSelector, filtre volontairement à l'app courante seule) et
// active un nouveau Zeg* sans repasser par l'écran "aucune organisation"
// (réutilise les mêmes formulaires que OnboardingFlow, exportés pour ça).
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { APPS, type AppKey, PosSetupForm, HotelSetupForm, RestoSetupForm, ErpSetupForm } from "@/components/app/OnboardingFlow";
import { cn } from "@/lib/utils";

const APP_HOME: Record<AppKey, string> = { pos: "/app/caisse", hotel: "/app/hotel", resto: "/app/resto", erp: "/app/erp" };

export function ApplicationsPanel() {
  const { organizations, currentOrganization, setCurrentOrganizationId } = useOrganization();
  const navigate = useNavigate();
  const [activating, setActivating] = useState<AppKey | null>(null);

  const openOrganization = (id: string, appModule: AppKey) => {
    setCurrentOrganizationId(id);
    navigate({ to: APP_HOME[appModule] as never });
  };

  if (activating) {
    // Les formulaires de configuration (OnboardingFlow) sont conçus pour
    // prendre tout l'écran (organizations.length === 0) — repris tels
    // quels ici en overlay plein écran plutôt qu'imbriqués dans la mise en
    // page de Profil, où leur min-h-screen casserait la mise en page.
    const Form = activating === "pos" ? PosSetupForm : activating === "hotel" ? HotelSetupForm : activating === "resto" ? RestoSetupForm : ErpSetupForm;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <Form onBack={() => setActivating(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg font-bold">Applications</h2>
      {APPS.map((app) => {
        const orgs = organizations.filter((o) => o.app_module === app.key);
        return (
          <div key={app.key}>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><app.icon className="h-4 w-4" /></div>
              <div className="text-sm font-semibold">{app.name}</div>
              <div className="text-xs text-muted-foreground">— {app.desc}</div>
            </div>
            {orgs.length === 0 ? (
              <button onClick={() => setActivating(app.key)}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                <Plus className="h-4 w-4" /> Activer {app.name}
              </button>
            ) : (
              <div className="space-y-1.5">
                {orgs.map((o) => {
                  const isCurrent = o.id === currentOrganization?.id;
                  return (
                    <button key={o.id} onClick={() => openOrganization(o.id, app.key)}
                      className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                        isCurrent ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                      <span className="font-medium">{o.name}</span>
                      {isCurrent ? <Check className="h-4 w-4 text-primary" /> : <span className="text-xs text-muted-foreground">Ouvrir</span>}
                    </button>
                  );
                })}
                <button onClick={() => setActivating(app.key)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Ajouter {orgs.length > 0 ? "une autre organisation" : ""}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
