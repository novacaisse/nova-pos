import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Store, Package, CreditCard, Receipt, LifeBuoy, Settings, UserCircle } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/app/BrandLogo";
import { cn } from "@/lib/utils";

const ITEMS = [
  { title: "Vue d'ensemble", url: "/admin", icon: LayoutDashboard },
  { title: "Organisations", url: "/admin/boutiques", icon: Store },
  { title: "Formules", url: "/admin/formules", icon: Package },
  { title: "Abonnements", url: "/admin/abonnements", icon: CreditCard },
  { title: "Facturation", url: "/admin/facturation", icon: Receipt },
  { title: "Support", url: "/admin/support", icon: LifeBuoy },
  { title: "Paramètres", url: "/admin/parametres", icon: Settings },
  { title: "Mon profil", url: "/admin/profil", icon: UserCircle },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border">
        <Link to="/admin" className="flex items-center gap-2.5 px-2 py-2">
          {collapsed ? (
            <BrandLogo className="h-9 w-9" variant="sidebar" compact />
          ) : (
            <div className="min-w-0">
              <BrandLogo className="h-6" variant="sidebar" />
              <div className="mt-1 truncate text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Back-office</div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Back-office</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.url} className={cn("flex items-center gap-2 rounded-lg", active && "bg-primary/10 font-semibold text-primary")}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
