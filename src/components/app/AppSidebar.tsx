import { Link, useRouterState } from "@tanstack/react-router";
import { useMyRole } from "@/lib/data/hooks";
import { useCurrentPlanModules, PLAN_MODULES } from "@/lib/data/adminHooks";
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
  admin: [
    { title: "Équipe", url: "/app/equipe", icon: "UsersRound" },
    { title: "Paramètres", url: "/app/parametres", icon: "Settings" },
  ],
};

// Masque les liens vers un écran où le rôle courant n'a aucun droit de
// lecture côté RLS (migration 002) — évite un écran vide/en erreur plutôt
// qu'une restriction de sécurité (la RLS reste la seule barrière réelle).
const HIDDEN_FOR: Partial<Record<string, AppRole[]>> = {
  "/app/caisse": ["stock"],
  "/app/ventes": ["stock"],
  "/app/devis": ["stock"],
  "/app/clients": ["stock"],
  "/app/fournisseurs": ["cashier"],
  "/app/depenses": ["cashier", "stock"],
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: myRole } = useMyRole();
  const planModules = useCurrentPlanModules();

  const isActive = (url: string) =>
    url === "/app" ? pathname === "/app" : pathname === url || pathname.startsWith(url + "/");

  const isGatableModule = (url: string) => PLAN_MODULES.some((m) => m.url === url);
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
            <BrandLogo className="h-9 w-9 shadow-glow" iconClassName="h-4.5 w-4.5" variant="sidebar" />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="font-display text-base font-bold tracking-tight text-sidebar-foreground">
                  NovaCaisse
                </div>
                <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                  Espace boutique
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

      <SidebarContent className="gap-1 px-2 py-3">
        {renderGroup("Pilotage", NAV.pilotage)}
        {renderGroup("Opération", NAV.operation)}
        {renderGroup("Catalogue", NAV.catalogue)}
        {renderGroup("Administration", NAV.admin)}
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
