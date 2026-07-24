import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Store, RotateCw, Mail, LogOut, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { ShopSelector } from "@/components/app/ShopSelector";
import { GlobalSearch } from "@/components/app/GlobalSearch";
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
  // Sans ce head() dédié, /app/* hérite du titre par défaut de __root.tsx
  // ("NovaCaisse — La caisse moderne…"), volontairement inchangé pour les
  // pages publiques (landing) — l'espace connecté a besoin du sien.
  head: () => ({ meta: [{ title: "ZegCaisse" }] }),
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, loading, signOut } = useAuth();
  const { shops, currentShop, loading: shopLoading, error: shopError, refresh } = useShop();

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

  // Garde-fou : un utilisateur authentifié sans aucune boutique (ex.
  // inscription interrompue avant la création de shops/shop_members) ne
  // doit jamais atterrir silencieusement sur des écrans vides/désactivés —
  // un état clair vaut mieux qu'un silence déroutant.
  if (!shopLoading && shops.length === 0) {
    return <NoShopScreen onRetry={refresh} onSignOut={signOut} error={shopError} />;
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
              <div className="ml-2 hidden max-w-md flex-1 md:block">
                <GlobalSearch />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Link to="/app/caisse"
                  className="hidden h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:flex"
                  aria-label="Aller à la caisse">
                  <ShoppingCart className="h-4 w-4" /> PDV
                </Link>
                <ThemeToggle />
                <NotificationsBell />
                <AiBubble />
                <UserMenu />
              </div>
            </header>
          </div>

          <main className="flex-1 min-w-0 pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>

        <div className="pos-hide-in-fullscreen contents">
          <BottomNav />
        </div>
        <PwaInstallBanner />
      </div>
    </SidebarProvider>
  );
}

function NoShopScreen({ onRetry, onSignOut, error }: { onRetry: () => Promise<void>; onSignOut: () => Promise<void>; error: string | null }) {
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
        {error ? (
          <p className="mt-2 text-sm text-muted-foreground">
            La récupération de vos boutiques a échoué ({error}) — ce n'est probablement pas lié à votre compte,
            réessayez ci-dessous.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Deux cas possibles : si vous venez de créer votre compte pour <b>rejoindre une équipe existante</b>,
            c'est normal — communiquez votre email au propriétaire ou gérant de la boutique, il doit vous ajouter
            depuis l'écran Équipe. Si vous venez de <b>créer votre propre boutique</b> et vous attendiez à la
            retrouver ici, quelque chose s'est mal passé pendant l'inscription.
          </p>
        )}

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
