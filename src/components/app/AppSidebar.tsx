import { Link, useRouterState } from "@tanstack/react-router";
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
  Bell,
  Settings,
  Zap,
} from "lucide-react";
import { CreditCard, UserCircle } from "lucide-react";
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
  Bell,
  Settings,
  CreditCard,
  UserCircle,
} as const;

type NavItem = {
  title: string;
  url: string;
  icon: keyof typeof ICONS;
  badge?: string;
};

const NAV: Record<string, NavItem[]> = {
  operation: [
    { title: "Point de vente", url: "/app/caisse", icon: "ScanBarcode", badge: "F1" },
    { title: "Ventes", url: "/app/ventes", icon: "Receipt" },
    { title: "Clients", url: "/app/clients", icon: "Users" },
  ],
  catalogue: [
    { title: "Produits", url: "/app/produits", icon: "Package" },
    { title: "Stock", url: "/app/stock", icon: "Warehouse" },
    { title: "Fournisseurs", url: "/app/fournisseurs", icon: "Truck" },
    { title: "Promotions", url: "/app/promotions", icon: "Tag" },
  ],
  pilotage: [
    { title: "Tableau de bord", url: "/app", icon: "LayoutDashboard" },
    { title: "Rapports", url: "/app/rapports", icon: "BarChart3" },
    { title: "Dépenses", url: "/app/depenses", icon: "Wallet" },
  ],
  admin: [
    { title: "Équipe", url: "/app/equipe", icon: "UsersRound" },
    { title: "Notifications", url: "/app/notifications", icon: "Bell" },
    { title: "Paramètres", url: "/app/parametres", icon: "Settings" },
  ],
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (url: string) =>
    url === "/app" ? pathname === "/app" : pathname === url || pathname.startsWith(url + "/");

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={active} className="h-11 rounded-xl data-[active=true]:bg-sidebar-primary/15 data-[active=true]:text-sidebar-primary data-[active=true]:font-semibold">
                  <Link to={item.url as never} className="flex items-center gap-3">
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

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/app/caisse" className="flex items-center gap-2.5 px-2 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sidebar-primary to-primary-glow shadow-glow">
            <Zap className="h-4.5 w-4.5 text-sidebar-primary-foreground" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="font-display text-base font-bold tracking-tight text-sidebar-foreground">NovaCaisse</div>
              <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Espace boutique</div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 py-3">
        {renderGroup("Opération", NAV.operation)}
        {renderGroup("Catalogue", NAV.catalogue)}
        {renderGroup("Pilotage", NAV.pilotage)}
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
