import { Link, useRouterState } from "@tanstack/react-router";
import { useMyRole } from "@/lib/data/hooks";
import { getModulesForApp } from "@/lib/data/adminHooks";
import { useCurrentPlanModules } from "@/lib/data/accountHooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import type { AppRole } from "@/lib/roles";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Warehouse,
  Receipt,
  Users,
  Truck,
  Wallet,
  BarChart3,
  UsersRound,
  Tag,
  Settings,
  FileText,
  Sparkles,
  X,
  BedDouble,
  CalendarRange,
  DoorClosed,
  Sparkle,
  Wrench,
  Building2,
  Coffee,
  Radio,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/app/BrandLogo";
import { AppSwitcher } from "@/components/app/AppSwitcher";
import { cn } from "@/lib/utils";

const ICONS = {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Warehouse,
  Receipt,
  Users,
  Truck,
  Wallet,
  BarChart3,
  UsersRound,
  Tag,
  Settings,
  FileText,
  Sparkles,
  BedDouble,
  CalendarRange,
  DoorClosed,
  Sparkle,
  Wrench,
  Building2,
  Coffee,
  Radio,
} as const;

type NavItem = {
  title: string;
  url: string;
  icon: keyof typeof ICONS;
  badge?: string;
};

// "Tableau de bord" en premier. Profil / Abonnement / Notifications retirés
// (ils vivent désormais dans le menu utilisateur et la cloche du header).
const NAV: Record<string, NavItem[]> = {
  pilotage: [
    { title: "Tableau de bord", url: "/app", icon: "LayoutDashboard" },
    { title: "Nova IA", url: "/app/nova", icon: "Sparkles" },
    { title: "Rapports", url: "/app/rapports", icon: "BarChart3" },
    { title: "Dépenses", url: "/app/depenses", icon: "Wallet" },
  ],
  operation: [
    { title: "Point de vente", url: "/app/caisse", icon: "ScanBarcode", badge: "F1" },
    { title: "Ventes", url: "/app/ventes", icon: "Receipt" },
    { title: "Devis", url: "/app/devis", icon: "FileText" },
    { title: "Clients", url: "/app/clients", icon: "Users" },
  ],
  catalogue: [
    { title: "Produits", url: "/app/produits", icon: "Package" },
    { title: "Stock", url: "/app/stock", icon: "Warehouse" },
    { title: "Fournisseurs", url: "/app/fournisseurs", icon: "Truck" },
  ],
  hotel: [
    { title: "Tableau de bord", url: "/app/hotel", icon: "BedDouble" },
    { title: "Réservations", url: "/app/hotel/reservations", icon: "CalendarRange" },
    { title: "Chambres", url: "/app/hotel/rooms", icon: "DoorClosed" },
    { title: "Housekeeping", url: "/app/hotel/housekeeping", icon: "Sparkle" },
    { title: "Maintenance", url: "/app/hotel/maintenance", icon: "Wrench" },
    { title: "Clients", url: "/app/hotel/clients", icon: "Users" },
    { title: "Comptes entreprise", url: "/app/hotel/corporate", icon: "Building2" },
    { title: "Point de vente interne", url: "/app/hotel/pos-interne", icon: "Coffee" },
    { title: "Rapports", url: "/app/hotel/rapports", icon: "BarChart3" },
    { title: "Canaux de distribution", url: "/app/hotel/canaux", icon: "Radio" },
  ],
  // ZegCaisse et ZegHôtel ont chacun leur propre Équipe/Paramètres — rien
  // de commun dans la nav entre les deux applications (le paramètre
  // "Applications" pour activer/désactiver/basculer vit maintenant comme
  // onglet DANS chacune de ces deux pages Paramètres, plus de nav item dédié).
  adminPos: [
    { title: "Équipe", url: "/app/equipe", icon: "UsersRound" },
    { title: "Paramètres", url: "/app/parametres", icon: "Settings" },
  ],
  adminHotel: [
    { title: "Équipe", url: "/app/hotel/equipe", icon: "UsersRound" },
    { title: "Paramètres", url: "/app/hotel/parametres", icon: "Settings" },
  ],
};

// Masque les liens vers un écran où le rôle courant n'a aucun droit de
// lecture côté RLS (migration 002) — évite un écran vide/en erreur plutôt
// qu'une restriction de sécurité (la RLS reste la seule barrière réelle).
// front_desk/housekeeping (ZegHotel) n'ont RLS-wise aucun accès aux tables
// ZegCaisse (policies antérieures à leur création, jamais mises à jour) —
// masqué partout ici plutôt que de dupliquer la liste sur chaque ligne.
const HIDDEN_FOR: Partial<Record<string, AppRole[]>> = {
  "/app/caisse": ["stock", "front_desk", "housekeeping"],
  "/app/ventes": ["stock", "front_desk", "housekeeping"],
  "/app/devis": ["stock", "front_desk", "housekeeping"],
  "/app/clients": ["stock", "front_desk", "housekeeping"],
  "/app/produits": ["front_desk", "housekeeping"],
  "/app/stock": ["front_desk", "housekeeping"],
  "/app/fournisseurs": ["cashier", "front_desk", "housekeeping"],
  "/app/depenses": ["cashier", "stock", "front_desk", "housekeeping"],
  "/app/rapports": ["front_desk", "housekeeping"],
  // Hôtel : housekeeping n'a RLS-wise aucun accès aux réservations/clients
  // (données financières/personnelles hors de son périmètre, cf. 020h/020g) ;
  // accountant n'a pas accès aux tâches de ménage (020j). Clients (ZegHotel
  // Phase 1, migration 028) : accountant retiré de hotel_guests_select
  // (données d'identité restreintes à owner/manager/front_desk) — masqué
  // ici aussi, sinon écran vide plutôt qu'une vraie restriction visible.
  "/app/hotel": ["housekeeping"],
  "/app/hotel/reservations": ["housekeeping"],
  "/app/hotel/rapports": ["housekeeping"],
  "/app/hotel/housekeeping": ["accountant"],
  "/app/hotel/clients": ["housekeeping", "accountant"],
  // Comptes entreprise (ZegHotel Phase 4, migration 031) : housekeeping
  // n'a RLS-wise aucun accès (données financières hors de son périmètre).
  "/app/hotel/corporate": ["housekeeping"],
  // Point de vente interne (ZegHotel Phase 7, migration 033) :
  // post_hotel_pos_charge() n'accorde la vente qu'à owner/manager/
  // front_desk — housekeeping/accountant masqués ici en cohérence.
  "/app/hotel/pos-interne": ["housekeeping", "accountant"],
  // Canaux de distribution (ZegHotel Phase 8, migration 034) : hotel_channels_all
  // n'accorde qu'owner/manager (table existante depuis 020g) — masqué pour
  // les autres rôles hôtel en cohérence.
  "/app/hotel/canaux": ["housekeeping", "accountant", "front_desk"],
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: myRole } = useMyRole();
  const planModules = useCurrentPlanModules();
  const { currentOrganization } = useOrganization();
  const activeApps = currentOrganization?.active_apps ?? ["pos"];
  // ZegCaisse et ZegHôtel sont deux applications 100% autonomes : si les
  // deux sont actives sur l'organisation, on n'affiche jamais leurs menus
  // empilés — seul celui du contexte courant (déduit de l'URL) est montré,
  // Administration (Équipe/Paramètres) inclus, on bascule via <AppSwitcher />.
  const bothAppsActive = activeApps.includes("pos") && activeApps.includes("hotel");
  const inHotelContext = pathname.startsWith("/app/hotel");
  const showPos = activeApps.includes("pos") && (!bothAppsActive || !inHotelContext);
  const showHotel = activeApps.includes("hotel") && (!bothAppsActive || inHotelContext);

  const isActive = (url: string) =>
    url === "/app" ? pathname === "/app" : pathname === url || pathname.startsWith(url + "/");

  // Phase 4 : le catalogue bridable dépend de l'app_module de l'établissement
  // courant — avant ce correctif, PLAN_MODULES (ZegCaisse uniquement) était
  // vérifié même côté ZegHotel, où aucun module n'était donc jamais bridé.
  const isGatableModule = (url: string) => getModulesForApp(currentOrganization?.app_module).some((m) => m.url === url);
  const visible = (item: NavItem) =>
    (!myRole || !HIDDEN_FOR[item.url]?.includes(myRole))
    && (!planModules || !isGatableModule(item.url) || planModules.includes(item.url));

  // Ferme automatiquement la sidebar sur mobile après un clic.
  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const renderGroup = (label: string, items: NavItem[]) => {
    const shown = items.filter(visible);
    if (shown.length === 0) return null;
    return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {shown.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="h-11 rounded-xl data-[active=true]:bg-sidebar-primary/15 data-[active=true]:text-sidebar-primary data-[active=true]:font-semibold"
                >
                  <Link to={item.url as never} onClick={handleNavClick} className="flex items-center gap-3">
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto rounded-md bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-mono text-sidebar-primary">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <Link to="/app" onClick={handleNavClick} className="flex min-w-0 flex-1 items-center gap-2.5">
            {collapsed ? (
              <BrandLogo className="h-9 w-9" variant="sidebar" compact />
            ) : (
              <div className="min-w-0 leading-tight">
                <BrandLogo className="h-7" variant="sidebar" />
                <div className="mt-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                  Espace organisation
                </div>
              </div>
            )}
          </Link>
          {isMobile && (
            <button
              onClick={() => setOpenMobile(false)}
              aria-label="Fermer le menu"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarHeader>

      {bothAppsActive && (
        <div className={cn("border-b border-sidebar-border", collapsed ? "py-1" : "px-2 py-2")}>
          <AppSwitcher variant="sidebar" compact={collapsed} />
        </div>
      )}

      <SidebarContent className="gap-1 px-2 py-3">
        {showPos && renderGroup("Pilotage", NAV.pilotage)}
        {showPos && renderGroup("Opération", NAV.operation)}
        {showPos && renderGroup("Catalogue", NAV.catalogue)}
        {showHotel && renderGroup("Hôtel", NAV.hotel)}
        {showPos && renderGroup("Administration", NAV.adminPos)}
        {showHotel && renderGroup("Administration", NAV.adminHotel)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed ? (
          <div className="rounded-xl bg-sidebar-accent/60 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-success" /> En ligne
            </div>
            <p className="mt-1 text-[11px] text-sidebar-foreground/60">Ventes synchronisées</p>
          </div>
        ) : (
          <div className="grid place-items-center py-1">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
