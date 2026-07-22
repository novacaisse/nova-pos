import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Loader2, Store, RotateCw, Mail, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const { user, loading, signOut } = useAuth();
  const { shops, currentShop, loading: shopLoading, refresh } = useShop();

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

  // Garde-fou : un utilisateur authentifié sans aucune boutique (ex. inscription
  // interrompue avant la création de shops/shop_members, ou compte créé via
  // /rejoindre en attente d'être ajouté à une équipe) ne doit jamais atterrir
  // silencieusement sur des écrans vides/désactivés — un état clair vaut mieux
  // qu'un silence déroutant.
  if (!shopLoading && shops.length === 0) {
    return <NoShopScreen onRetry={refresh} onSignOut={signOut} />;
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

function NoShopScreen({ onRetry, onSignOut }: { onRetry: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  };

  const logout = async () => {
    await onSignOut();
    navigate({ to: "/connexion" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Aucune boutique associée à votre compte</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Deux cas possibles : si vous venez de créer votre compte pour <b>rejoindre une équipe existante</b>,
          c'est normal — communiquez votre email au propriétaire ou gérant de la boutique, il doit vous ajouter
          depuis l'écran Équipe. Si vous venez de <b>créer votre propre boutique</b> et vous attendiez à la
          retrouver ici, quelque chose s'est mal passé pendant l'inscription.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button onClick={retry} disabled={retrying}
            className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-60">
            <RotateCw className={cn("h-4 w-4", retrying && "animate-spin")} /> Réessayer
          </button>
          <a href="mailto:contact@novacaisse.bj" className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            <Mail className="h-4 w-4" /> Contacter le support
          </a>
          <button onClick={logout} className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
