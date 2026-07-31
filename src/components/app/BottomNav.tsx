import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Receipt,
  MoreHorizontal,
  Users,
  Warehouse,
  Truck,
  Wallet,
  BarChart3,
  UsersRound,
  Settings,
  FileText,
  BedDouble,
  CalendarRange,
  DoorClosed,
  Sparkle,
  Wrench,
  X,
} from "lucide-react";
import { getModulesForApp } from "@/lib/data/adminHooks";
import { useCurrentPlanModules } from "@/lib/data/accountHooks";
import { useMyRole } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { AppSwitcher } from "@/components/app/AppSwitcher";
import { cn } from "@/lib/utils";

type Item = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY: Item[] = [
  { label: "Bord", to: "/app", icon: LayoutDashboard },
  { label: "Caisse", to: "/app/caisse", icon: ScanBarcode },
  { label: "Produits", to: "/app/produits", icon: Package },
  { label: "Ventes", to: "/app/ventes", icon: Receipt },
];

const MORE: Item[] = [
  { label: "Clients", to: "/app/clients", icon: Users },
  { label: "Stock", to: "/app/stock", icon: Warehouse },
  { label: "Fournisseurs", to: "/app/fournisseurs", icon: Truck },
  { label: "Devis", to: "/app/devis", icon: FileText },
  { label: "Dépenses", to: "/app/depenses", icon: Wallet },
  { label: "Rapports", to: "/app/rapports", icon: BarChart3 },
  { label: "Équipe", to: "/app/equipe", icon: UsersRound },
  { label: "Paramètres", to: "/app/parametres", icon: Settings },
];

// front_desk/housekeeping n'ont RLS-wise aucun accès aux tables ZegCaisse
// (cf. AppSidebar.tsx) — la nav mobile principale de ces rôles doit être
// celle de ZegHotel, pas celle héritée de ZegCaisse.
const HOTEL_PRIMARY: Item[] = [
  { label: "Bord", to: "/app/hotel", icon: BedDouble },
  { label: "Résa.", to: "/app/hotel/reservations", icon: CalendarRange },
  { label: "Chambres", to: "/app/hotel/rooms", icon: DoorClosed },
  { label: "Ménage", to: "/app/hotel/housekeeping", icon: Sparkle },
];
const HOTEL_MORE: Item[] = [
  { label: "Maintenance", to: "/app/hotel/maintenance", icon: Wrench },
  { label: "Clients", to: "/app/hotel/clients", icon: Users },
  { label: "Rapports", to: "/app/hotel/rapports", icon: BarChart3 },
  { label: "Équipe", to: "/app/hotel/equipe", icon: UsersRound },
  { label: "Paramètres", to: "/app/hotel/parametres", icon: Settings },
];
// Housekeeping n'a accès ni aux réservations ni aux rapports (020h/020g,
// données financières/clients hors de son périmètre) — mobile-first pour
// ce rôle : juste ses chambres et ses tâches du jour.
const HOUSEKEEPING_PRIMARY: Item[] = [
  { label: "Chambres", to: "/app/hotel/rooms", icon: DoorClosed },
  { label: "Ménage", to: "/app/hotel/housekeeping", icon: Sparkle },
];

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (to: string) => (to === "/app" ? pathname === "/app" : pathname === to || pathname.startsWith(to + "/"));

  const planModules = useCurrentPlanModules();
  const { data: myRole } = useMyRole();
  const { currentOrganization } = useOrganization();
  const activeApps = currentOrganization?.active_apps ?? ["pos"];
  // Phase 4 : catalogue par app_module (avant, PLAN_MODULES ZegCaisse était
  // vérifié même côté ZegHotel, où aucun raccourci n'était donc jamais bridé).
  const isGatableModule = (to: string) => getModulesForApp(currentOrganization?.app_module).some((m) => m.url === to);
  const included = (item: Item) => !planModules || !isGatableModule(item.to) || planModules.includes(item.to);

  // ZegCaisse et ZegHôtel sont deux activités distinctes : quand les deux
  // sont actives, on ne mélange jamais leurs raccourcis — le menu affiché
  // dépend du contexte courant (déduit de l'URL), au même titre que dans
  // AppSidebar. front_desk/housekeeping n'ont de toute façon accès qu'à
  // ZegHôtel (RLS), donc toujours ce menu pour eux.
  const isHotelOnlyRole = myRole === "housekeeping" || myRole === "front_desk";
  const bothAppsActive = activeApps.includes("pos") && activeApps.includes("hotel");
  const inHotelContext = pathname.startsWith("/app/hotel");
  const useHotelNav = isHotelOnlyRole
    || (activeApps.includes("hotel") && (!activeApps.includes("pos") || (bothAppsActive && inHotelContext)));

  // HOUSEKEEPING_PRIMARY reste toujours affiché tel quel pour ce rôle (ses
  // deux seuls écrans opérationnels, pas des modules "métier" bridables par
  // formule) — HOTEL_PRIMARY/HOTEL_MORE, eux, passent par `included` comme
  // PRIMARY/MORE côté ZegCaisse (oubli corrigé en Phase 4 : ces deux tableaux
  // n'étaient jusqu'ici jamais filtrés, donc jamais bridés par une formule).
  const primary = useHotelNav
    ? (myRole === "housekeeping" ? HOUSEKEEPING_PRIMARY : HOTEL_PRIMARY.filter(included))
    : PRIMARY.filter(included);
  const more = useHotelNav
    ? (myRole === "housekeeping"
        ? HOTEL_MORE.filter((m) => m.to !== "/app/hotel/rapports" && m.to !== "/app/hotel/clients")
        // Clients (ZegHotel Phase 1, migration 028) : accountant retiré de
        // hotel_guests_select (données d'identité restreintes à
        // owner/manager/front_desk) — masqué ici aussi.
        : myRole === "accountant"
          ? HOTEL_MORE.filter(included).filter((m) => m.to !== "/app/hotel/clients")
          : HOTEL_MORE.filter(included))
    : MORE.filter(included);
  // Le switcher n'a de sens que pour un rôle qui a accès aux deux mondes
  // (owner/manager/accountant) — front_desk/housekeeping n'ont RLS-wise
  // aucun accès à ZegCaisse, inutile de leur proposer de "basculer".
  const showSwitcher = bothAppsActive && !isHotelOnlyRole;

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to as never}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setOpen(true)}
              className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elegant animate-in slide-in-from-bottom"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-bold">Plus de modules</div>
                <div className="text-xs text-muted-foreground">Accès rapide</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {showSwitcher && (
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Application</div>
                <AppSwitcher variant="surface" />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {more.map((m) => {
                const Icon = m.icon;
                const active = isActive(m.to);
                return (
                  <Link
                    key={m.to}
                    to={m.to as never}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-background px-2 py-3 text-xs font-semibold",
                      active ? "border-primary/50 bg-primary/10 text-primary" : "text-foreground hover:border-primary/30",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {m.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
