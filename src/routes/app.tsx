import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { ShopSelector } from "@/components/app/ShopSelector";
import { AiBubble } from "@/components/app/AiBubble";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { UserMenu } from "@/components/app/UserMenu";
import { BottomNav } from "@/components/app/BottomNav";
import { PwaInstallBanner } from "@/components/app/PwaInstallBanner";
import { TrialBanner } from "@/components/app/TrialBanner";
import { getTrialInfo } from "@/lib/trial";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShop } from "@/lib/auth/ShopProvider";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, loading } = useAuth();
  const { currentShop, loading: shopLoading } = useShop();

  // Auth guard côté client (SPA)
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/connexion" });
  }, [loading, user, navigate]);

  // Blocage automatique après expiration de l'essai gratuit — basé sur
  // shops.trial_ends_at (Supabase), pas sur un flag local contournable.
  useEffect(() => {
    if (shopLoading) return;
    const info = getTrialInfo(currentShop);
    if (info.onTrial && info.expired) navigate({ to: "/souscription" });
  }, [pathname, currentShop, shopLoading, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        {/* Sidebar masquée en mode plein écran POS */}
        <div className="pos-hide-in-fullscreen contents">
          <AppSidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="pos-hide-in-fullscreen">
            <TrialBanner />
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-5">
              <SidebarTrigger className="hidden h-10 w-10 rounded-xl md:inline-flex" />
              <div className="hidden sm:block"><ShopSelector /></div>
              <div className="relative ml-2 hidden max-w-md flex-1 md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input placeholder="Rechercher produit, client, ticket…"
                  className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-background" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
                <NotificationsBell />
                <UserMenu />
              </div>
            </header>
          </div>

          <main className="flex-1 min-w-0 pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>

        <AiBubble />
        <div className="pos-hide-in-fullscreen contents">
          <BottomNav />
        </div>
        <PwaInstallBanner />
      </div>
    </SidebarProvider>
  );
}
