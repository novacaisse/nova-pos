import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Store, BedDouble, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

// Mécanique commune (changer d'établissement) mais contenu/libellés
// adaptés à l'application courante — "Boutique" côté ZegCaisse, "Hôtel"
// côté ZegHotel (audit isolation ZegOS, Partie A). La liste elle-même ne
// montre que les organisations pertinentes pour l'app courante (filtrage
// par active_apps) — sinon un compte avec boutique + hôtel verrait l'une
// dans le sélecteur de l'autre, contraire au principe d'isolation.
export function ShopSelector() {
  const [open, setOpen] = useState(false);
  const { organizations, currentOrganization, setCurrentOrganizationId, loading } = useOrganization();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const inHotelContext = pathname.startsWith("/app/hotel");
  const appKey = inHotelContext ? "hotel" : "pos";
  const Icon = inHotelContext ? BedDouble : Store;
  const unitLabel = inHotelContext ? "Établissement" : "Boutique";
  const listLabel = inHotelContext ? "Vos établissements" : "Vos boutiques";
  const addLabel = inHotelContext ? "+ Ajouter un établissement" : "+ Ajouter une boutique";
  const addTo = inHotelContext ? "/app/hotel/parametres" : "/app/parametres";

  if (loading && !currentOrganization) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!currentOrganization) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> Aucun{inHotelContext ? "" : "e"} {unitLabel.toLowerCase()}
      </div>
    );
  }

  const sameAppOrgs = organizations.filter((s) => (s.active_apps ?? []).includes(appKey));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60"
          aria-label={`Changer de ${unitLabel.toLowerCase()}`}
        >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{unitLabel}</div>
            <div className="truncate text-sm font-semibold text-foreground">{currentOrganization.name}</div>
          </div>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {listLabel}
        </div>
        {sameAppOrgs.map((s) => {
          const isActive = s.id === currentOrganization.id;
          return (
            <button
              key={s.id}
              onClick={() => { setCurrentOrganizationId(s.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                isActive ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.country} · Plan {s.plan}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
        <div className="mt-1 border-t pt-1">
          <Link to={addTo} search={{ openAdd: true }} onClick={() => setOpen(false)}
            className="block w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-primary hover:bg-primary/5">
            {addLabel}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
