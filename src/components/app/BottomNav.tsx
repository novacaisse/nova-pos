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
  Building2,
  Coffee,
  UtensilsCrossed,
  LayoutGrid,
  BookOpen,
  ChefHat,
  Calculator,
  Briefcase,
  FolderOpen,
  Wallet2,
  Landmark,
  X,
} from "lucide-react";
import { getModulesForApp } from "@/lib/data/adminHooks";
import { useCurrentPlanModules } from "@/lib/data/accountHooks";
import { useMyRole, useMyModulePermissions } from "@/lib/data/hooks";
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
  { label: "Réservations", to: "/app/reservations", icon: CalendarRange },
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
// Complété (bug remonté : "tout les modules ne s'affiche pas sur le
// mobile") — Paiements/Dépenses/Fournisseurs/Finance/Paie existaient déjà
// côté desktop (AppSidebar.tsx, NAV.hotelPilotage/hotelCatalogue) mais
// n'avaient jamais été ajoutés ici : ce tableau n'est mis à jour par
// aucun mécanisme automatique, chaque nouveau module ZegHotel doit y être
// répliqué à la main.
const HOTEL_MORE: Item[] = [
  { label: "Maintenance", to: "/app/hotel/maintenance", icon: Wrench },
  { label: "Clients", to: "/app/hotel/clients", icon: Users },
  { label: "Entreprises", to: "/app/hotel/corporate", icon: Building2 },
  { label: "POS", to: "/app/hotel/pos-interne", icon: Coffee },
  { label: "Produits", to: "/app/hotel/produits", icon: Package },
  { label: "Fournisseurs", to: "/app/hotel/fournisseurs", icon: Truck },
  { label: "Paiements", to: "/app/hotel/paiements", icon: Wallet2 },
  { label: "Dépenses", to: "/app/hotel/depenses", icon: Wallet },
  { label: "Finance", to: "/app/hotel/finance", icon: Landmark },
  { label: "Paie", to: "/app/hotel/paie", icon: Briefcase },
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

// server/cook n'ont RLS-wise aucun accès aux tables ZegCaisse/ZegHotel —
// même logique que front_desk/housekeeping ci-dessus, pour ZegResto.
const RESTO_PRIMARY: Item[] = [
  { label: "Bord", to: "/app/resto", icon: UtensilsCrossed },
  { label: "Salle", to: "/app/resto/salle", icon: LayoutGrid },
  { label: "Commandes", to: "/app/resto/commandes", icon: Receipt },
  { label: "Résa.", to: "/app/resto/reservations", icon: CalendarRange },
];
const RESTO_MORE: Item[] = [
  { label: "Cuisine", to: "/app/resto/cuisine", icon: ChefHat },
  { label: "Menu", to: "/app/resto/menu", icon: BookOpen },
  { label: "Rapports", to: "/app/resto/rapports", icon: BarChart3 },
  { label: "Équipe", to: "/app/resto/equipe", icon: UsersRound },
  { label: "Paramètres", to: "/app/resto/parametres", icon: Settings },
];
// cook n'a qu'un seul écran opérationnel (le KDS) — même traitement que
// HOUSEKEEPING_PRIMARY côté ZegHotel : jamais filtré par formule, toujours
// affiché tel quel pour ce rôle.
const COOK_PRIMARY: Item[] = [
  { label: "Cuisine", to: "/app/resto/cuisine", icon: ChefHat },
];

// Même logique incrémentale que RESTO_PRIMARY/RESTO_MORE en son temps —
// construit module par module au fil des phases du chantier frontend ZegERP.
const ERP_PRIMARY: Item[] = [
  { label: "Bord", to: "/app/erp", icon: LayoutDashboard },
  { label: "POS", to: "/app/erp/pos", icon: ScanBarcode },
  { label: "Ventes", to: "/app/erp/ventes", icon: Receipt },
  { label: "Stock", to: "/app/erp/stock", icon: Warehouse },
];
const ERP_MORE: Item[] = [
  { label: "Produits", to: "/app/erp/produits", icon: Package },
  { label: "Achats", to: "/app/erp/achats", icon: Truck },
  { label: "Finance", to: "/app/erp/finance", icon: Wallet },
  { label: "Comptabilité", to: "/app/erp/comptabilite", icon: Calculator },
  { label: "RH", to: "/app/erp/rh", icon: Briefcase },
  { label: "Documents", to: "/app/erp/documents", icon: FolderOpen },
  { label: "Rapports", to: "/app/erp/rapports", icon: BarChart3 },
  { label: "Équipe", to: "/app/erp/equipe", icon: UsersRound },
  { label: "Paramètres", to: "/app/erp/parametres", icon: Settings },
];

// Rôles personnalisés (Équipe Phase B, migrations 063/064) — ZegCaisse
// uniquement pour l'instant (cf. même carte dans AppSidebar.tsx).
const POS_MODULE_FOR_URL: Record<string, string> = {
  "/app/produits": "produits",
  "/app/stock": "stock",
  "/app/fournisseurs": "fournisseurs",
  "/app/clients": "clients",
  "/app/caisse": "ventes",
  "/app/ventes": "ventes",
  "/app/devis": "devis",
  "/app/reservations": "reservations",
  "/app/depenses": "depenses",
  "/app/rapports": "rapports",
  "/app/parametres": "parametres",
};
// Idem ZegHotel (Équipe Phase D-1, migrations 066/067).
const HOTEL_MODULE_FOR_URL: Record<string, string> = {
  "/app/hotel/reservations": "hotel_reservations",
  "/app/hotel/rooms": "hotel_rooms",
  "/app/hotel/housekeeping": "hotel_housekeeping",
  "/app/hotel/maintenance": "hotel_maintenance",
  "/app/hotel/clients": "hotel_clients",
  "/app/hotel/corporate": "hotel_corporate",
  "/app/hotel/pos-interne": "hotel_pos_interne",
  "/app/hotel/produits": "produits",
  "/app/hotel/rapports": "hotel_rapports",
  "/app/hotel/parametres": "hotel_parametres",
  // Finance/Paie (Round 2, migrations 090/091) — clés correctement seedées
  // pour app_module='hotel' dès leur création (cf. AppSidebar.tsx) : à la
  // différence de fournisseurs/paiements/depenses ci-dessous, elles peuvent
  // être branchées ici, hasModulePermission() les filtrera correctement
  // par rôle (owner/manager toujours, accountant Finance seulement, jamais
  // front_desk/housekeeping).
  "/app/hotel/finance": "hotel_finance",
  "/app/hotel/paie": "hotel_payroll",
};
// Idem ZegResto (Équipe Phase D-2, migrations 068/069).
const RESTO_MODULE_FOR_URL: Record<string, string> = {
  "/app/resto/salle": "resto_salle",
  "/app/resto/commandes": "resto_commandes",
  "/app/resto/cuisine": "resto_cuisine",
  "/app/resto/menu": "resto_menu",
  "/app/resto/reservations": "resto_reservations",
  "/app/resto/rapports": "resto_rapports",
  "/app/resto/parametres": "resto_parametres",
};
// Idem ZegERP (Équipe Phase D-3, migrations 070/071) — cf. même carte dans
// AppSidebar.tsx pour le détail des pages composites (Achats/Ventes/Documents).
const ERP_MODULE_FOR_URL: Record<string, string | string[]> = {
  "/app/erp/produits": "erp_produits",
  "/app/erp/stock": "erp_stock",
  "/app/erp/achats": ["erp_achats", "erp_factures_fournisseurs", "erp_receptions"],
  "/app/erp/ventes": ["erp_ventes", "erp_facturation_ventes", "erp_retours_clients"],
  "/app/erp/pos": "erp_pos",
  "/app/erp/finance": "erp_finance",
  "/app/erp/comptabilite": "erp_comptabilite",
  "/app/erp/rh": "erp_rh",
  "/app/erp/documents": ["erp_documents", "erp_achats", "erp_ventes", "erp_rh"],
  "/app/erp/rapports": "erp_rapports",
  "/app/erp/parametres": "erp_parametres",
};
const MODULE_FOR_URL: Record<string, string | string[]> = { ...POS_MODULE_FOR_URL, ...HOTEL_MODULE_FOR_URL, ...RESTO_MODULE_FOR_URL, ...ERP_MODULE_FOR_URL };

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (to: string) => (to === "/app" ? pathname === "/app" : pathname === to || pathname.startsWith(to + "/"));

  const planModules = useCurrentPlanModules();
  const { data: myRole } = useMyRole();
  const { data: myModulePerms } = useMyModulePermissions();
  const { currentOrganization } = useOrganization();
  const activeApps = currentOrganization?.active_apps ?? ["pos"];
  // Phase 4 : catalogue par app_module (avant, PLAN_MODULES ZegCaisse était
  // vérifié même côté ZegHotel, où aucun raccourci n'était donc jamais bridé).
  const isGatableModule = (to: string) => getModulesForApp(currentOrganization?.app_module).some((m) => m.url === to);
  // Tant que myModulePerms n'a pas encore chargé, on ne masque rien ici.
  const hasModulePermission = (to: string) => {
    const key = MODULE_FOR_URL[to];
    if (!key || !myModulePerms) return true;
    const keys = Array.isArray(key) ? key : [key];
    return keys.some((k) => myModulePerms.find((p) => p.module_key === k)?.can_view);
  };
  const included = (item: Item) =>
    (!planModules || !isGatableModule(item.to) || planModules.includes(item.to)) && hasModulePermission(item.to);

  // ZegCaisse et ZegHôtel sont deux activités distinctes : quand les deux
  // sont actives, on ne mélange jamais leurs raccourcis — le menu affiché
  // dépend du contexte courant (déduit de l'URL), au même titre que dans
  // AppSidebar. front_desk/housekeeping n'ont de toute façon accès qu'à
  // ZegHôtel (RLS), donc toujours ce menu pour eux.
  const isHotelOnlyRole = myRole === "housekeeping" || myRole === "front_desk";
  const isRestoOnlyRole = myRole === "server" || myRole === "cook";
  const bothAppsActive = activeApps.includes("pos") && activeApps.includes("hotel");
  const inHotelContext = pathname.startsWith("/app/hotel");
  const inRestoContext = pathname.startsWith("/app/resto");
  const inErpContext = pathname.startsWith("/app/erp");
  const useHotelNav = !isRestoOnlyRole && !inErpContext && (isHotelOnlyRole
    || (activeApps.includes("hotel") && (!activeApps.includes("pos") || (bothAppsActive && inHotelContext))));
  const useRestoNav = !inErpContext && (isRestoOnlyRole || (!useHotelNav && (activeApps.includes("resto") || inRestoContext)));
  const useErpNav = activeApps.includes("erp") || inErpContext;

  // HOUSEKEEPING_PRIMARY reste toujours affiché tel quel pour ce rôle (ses
  // deux seuls écrans opérationnels, pas des modules "métier" bridables par
  // formule) — HOTEL_PRIMARY/HOTEL_MORE, eux, passent par `included` comme
  // PRIMARY/MORE côté ZegCaisse (oubli corrigé en Phase 4 : ces deux tableaux
  // n'étaient jusqu'ici jamais filtrés, donc jamais bridés par une formule).
  const primary = useErpNav
    ? ERP_PRIMARY.filter(included)
    : useHotelNav
      ? (myRole === "housekeeping" ? HOUSEKEEPING_PRIMARY : HOTEL_PRIMARY.filter(included))
      : useRestoNav
        ? (myRole === "cook" ? COOK_PRIMARY : RESTO_PRIMARY.filter(included))
        : PRIMARY.filter(included);
  const more = useErpNav
    ? ERP_MORE.filter(included)
    : useHotelNav
    ? (myRole === "housekeeping"
        // Même périmètre que HIDDEN_FOR côté AppSidebar.tsx : housekeeping
        // n'a RLS-wise aucun accès aux données financières/clients/
        // opérationnelles hors ménage/maintenance.
        ? HOTEL_MORE.filter((m) => !["/app/hotel/rapports", "/app/hotel/clients", "/app/hotel/corporate", "/app/hotel/pos-interne", "/app/hotel/produits", "/app/hotel/fournisseurs", "/app/hotel/paiements", "/app/hotel/depenses", "/app/hotel/finance", "/app/hotel/paie"].includes(m.to))
        // Clients (ZegHotel Phase 1, migration 028) : accountant retiré de
        // hotel_guests_select (données d'identité restreintes à
        // owner/manager/front_desk). POS interne (Phase 7, migration 033) :
        // post_hotel_pos_charge() n'accorde la vente qu'à owner/manager/
        // front_desk. Paie (migration 091) : accountant n'a pas la
        // permission hotel_payroll, déjà filtré par included() ci-dessous.
        : myRole === "accountant"
          ? HOTEL_MORE.filter(included).filter((m) => !["/app/hotel/clients", "/app/hotel/pos-interne"].includes(m.to))
          : HOTEL_MORE.filter(included))
    : useRestoNav
      // server : pas d'accès cuisine/menu/paramètres (décision produit
      // ZegResto — le statut du ticket reste visible depuis Commandes).
      // cook : COOK_PRIMARY couvre déjà son seul écran (Cuisine), rien de
      // plus dans "Plus".
      ? (myRole === "server" || myRole === "cook" ? [] : RESTO_MORE.filter(included))
      : MORE.filter(included);
  // Le switcher n'a de sens que pour un rôle qui a accès à plusieurs mondes
  // (owner/manager/accountant) — front_desk/housekeeping/server/cook n'ont
  // RLS-wise aucun accès aux autres applications, inutile de leur proposer
  // de "basculer".
  const showSwitcher = bothAppsActive && !isHotelOnlyRole && !isRestoOnlyRole;

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
