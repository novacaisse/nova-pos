import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { ShopSelector } from "@/components/app/ShopSelector";
import { AiBubble } from "@/components/app/AiBubble";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { CURRENT_USER } from "@/lib/mock/session";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-5">
            <SidebarTrigger className="h-10 w-10 rounded-xl" />

            <div className="hidden sm:block">
              <ShopSelector />
            </div>

            <div className="relative ml-2 hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Rechercher produit, client, ticket…"
                className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <button
                aria-label="Notifications"
                className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
              </button>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pl-1 pr-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
                  {CURRENT_USER.avatar_initials}
                </div>
                <div className="hidden leading-tight sm:block">
                  <div className="text-xs font-semibold">{CURRENT_USER.full_name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {CURRENT_USER.role}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>

        <AiBubble />
      </div>
    </SidebarProvider>
  );
}
