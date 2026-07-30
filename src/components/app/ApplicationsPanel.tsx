// Panneau "Applications" — inclus comme onglet dans les Paramètres de
// CHAQUE application ZegOS (ZegCaisse et ZegHotel ont chacun leur propre
// onglet Applications, aucun composant central partagé au niveau nav) :
// active/désactive les modules ZegOS sur l'organisation courante et permet
// de basculer directement vers l'un d'eux. Écrit organizations.active_apps
// (RLS shops_update autorise déjà owner/manager — restreint à owner ici
// côté UI puisque c'est une décision qui change ce que voit toute l'équipe).
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Store, BedDouble, Boxes, Check, Loader2, ArrowUpRight, Lock } from "lucide-react";
import { useMyRole } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AppDef = { key: string; name: string; desc: string; icon: typeof Store; available: boolean; homeUrl: string };

// "available" = module réellement construit (peut être activé aujourd'hui),
// pas "actif sur cette organisation" (voir activeApps plus bas).
const APPS: AppDef[] = [
  { key: "pos", name: "ZegCaisse", desc: "Caisse, stock, ventes et facturation", icon: Store, available: true, homeUrl: "/app" },
  { key: "hotel", name: "ZegHotel", desc: "Réservations, chambres, housekeeping et facturation hôtelière", icon: BedDouble, available: true, homeUrl: "/app/hotel" },
  { key: "erp", name: "ZegERP", desc: "Gestion d'entreprise étendue", icon: Boxes, available: false, homeUrl: "" },
];

export function ApplicationsPanel() {
  const { data: myRole } = useMyRole();
  const isOwner = myRole === "owner";
  const { currentOrganization, refresh } = useOrganization();
  const activeApps = currentOrganization?.active_apps ?? [];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setActive = async (key: string, activate: boolean) => {
    if (!currentOrganization) return;
    setError(null);
    const next = activate ? Array.from(new Set([...activeApps, key])) : activeApps.filter((a) => a !== key);
    if (!activate && next.length === 0) {
      setError("Au moins une application doit rester active sur l'organisation.");
      return;
    }
    setBusyKey(key);
    try {
      const { error: updErr } = await supabase.from("organizations").update({ active_apps: next }).eq("id", currentOrganization.id);
      if (updErr) throw updErr;
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Impossible de mettre à jour les applications actives.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {!isOwner && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Seul le propriétaire de l'organisation peut activer ou désactiver une application.
        </div>
      )}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => {
          const active = activeApps.includes(app.key);
          const busy = busyKey === app.key;
          return (
            <div key={app.key} className={cn("flex flex-col rounded-2xl border p-5", active ? "border-primary/40 bg-primary/5" : "border-border bg-card")}>
              <div className="flex items-start justify-between gap-2">
                <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <app.icon className="h-6 w-6" />
                </div>
                {active ? (
                  <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success"><Check className="h-3 w-3" /> Actif</span>
                ) : !app.available ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Bientôt</span>
                ) : null}
              </div>
              <div className="mt-3 font-display text-lg font-bold">{app.name}</div>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{app.desc}</p>

              <div className="mt-4 flex gap-2">
                {active ? (
                  <>
                    <Link to={app.homeUrl as never}
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90">
                      Ouvrir <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    {isOwner && (
                      <button onClick={() => setActive(app.key, false)} disabled={busy}
                        className="flex h-10 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Désactiver"}
                      </button>
                    )}
                  </>
                ) : app.available ? (
                  isOwner ? (
                    <button onClick={() => setActive(app.key, true)} disabled={busy}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activer"}
                    </button>
                  ) : (
                    <div className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" /> Réservé au propriétaire
                    </div>
                  )
                ) : (
                  <div className="flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground">
                    Pas encore disponible
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
