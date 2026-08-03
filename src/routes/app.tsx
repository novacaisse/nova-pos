import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Store, RotateCw, Mail, LogOut, ShoppingCart, CalendarPlus, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { ShopSelector } from "@/components/app/ShopSelector";
import { GlobalSearch } from "@/components/app/GlobalSearch";
import { HotelGlobalSearch } from "@/components/app/HotelGlobalSearch";
import { RestoGlobalSearch } from "@/components/app/RestoGlobalSearch";
import { AiBubble } from "@/components/app/AiBubble";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { UserMenu } from "@/components/app/UserMenu";
import { BottomNav } from "@/components/app/BottomNav";
import { PwaInstallBanner } from "@/components/app/PwaInstallBanner";
import { TrialBanner } from "@/components/app/TrialBanner";
import { OnboardingFlow } from "@/components/app/OnboardingFlow";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useMyRole, useReconcilePendingSubscriptionPayments } from "@/lib/data/hooks";

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
  const { organizations, currentOrganization, loading: shopLoading, error: shopError, refresh } = useOrganization();
  const { data: myRole } = useMyRole();

  // Filet de sécurité : rattrape un paiement d'abonnement resté "pending"
  // (voir useReconcilePendingSubscriptionPayments) à chaque chargement de
  // l'organisation, pas seulement si l'utilisateur reste sur /souscription/
  // confirmation — refresh() recharge organizations.plan/trial_ends_at dès
  // qu'un paiement se résout, pour que la bannière d'essai et le reste de
  // l'app cessent immédiatement de traiter l'organisation comme en essai.
  useReconcilePendingSubscriptionPayments(currentOrganization?.id, refresh);

  // Auth guard côté client (SPA)
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/connexion" });
  }, [loading, user, navigate]);

  // Essai expiré (audit ZegOS Phase 1, LOT C) : plus de redirection
  // automatique et sans issue vers /souscription — l'organisation passe en
  // lecture seule (bandeau TrialBanner + useReadOnlyMode bloque les actions
  // de création/vente/réservation aux points d'entrée concernés), mais
  // reste consultable et l'utilisateur garde toujours accès au sélecteur
  // d'organisation et à la déconnexion. Voir src/lib/auth/useReadOnlyMode.ts.

  // Le tableau de bord racine (/app) est celui de ZegCaisse — inutile (ou
  // vide côté RLS) pour une organisation hotel-only/resto-only ou un rôle
  // front_desk/housekeeping/server/cook (aucun accès ZegCaisse). On les
  // envoie directement sur leur propre tableau de bord.
  useEffect(() => {
    if (shopLoading || pathname !== "/app" || !currentOrganization) return;
    const activeApps = currentOrganization.active_apps ?? [];
    const hotelOnlyOrg = activeApps.includes("hotel") && !activeApps.includes("pos");
    const hotelOnlyRole = myRole === "front_desk" || myRole === "housekeeping";
    if (hotelOnlyOrg || hotelOnlyRole) { navigate({ to: "/app/hotel" }); return; }
    const restoOnlyOrg = activeApps.includes("resto") && !activeApps.includes("pos");
    const restoOnlyRole = myRole === "server" || myRole === "cook";
    if (restoOnlyOrg || restoOnlyRole) navigate({ to: "/app/resto" });
  }, [pathname, currentOrganization, shopLoading, myRole, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Un utilisateur authentifié sans aucune organisation ne doit jamais
  // atterrir silencieusement sur des écrans vides/désactivés. Deux cas :
  // une vraie erreur de récupération (réessayer/support), ou — le cas
  // normal depuis que l'inscription ne crée plus que le compte utilisateur
  // (voir inscription.tsx) — un compte tout juste créé qui doit encore
  // choisir son application ZegOS et la configurer (OnboardingFlow.tsx).
  if (!shopLoading && organizations.length === 0) {
    if (shopError) return <NoShopScreen onRetry={refresh} onSignOut={signOut} error={shopError} />;
    return <OnboardingFlow onSignOut={signOut} />;
  }

  // organizations.suspended (Super Admin, bouton "Suspendre") n'avait
  // jusqu'ici aucun effet réel — la colonne était mise à jour mais jamais
  // vérifiée côté application. Bloque l'accès comme le fait déjà
  // l'expiration d'essai ci-dessus.
  if (currentOrganization?.suspended) {
    return <SuspendedScreen onSignOut={signOut} />;
  }

  // ZegCaisse, ZegHôtel et ZegResto sont trois applications 100% autonomes
  // (audit isolation ZegOS, Partie A ; étendu à ZegResto) — la recherche
  // globale et le raccourci d'action rapide du header ne doivent jamais
  // montrer du contenu ou des routes d'une autre application selon le
  // contexte courant.
  const inHotelContext = pathname.startsWith("/app/hotel");
  const inRestoContext = pathname.startsWith("/app/resto");

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
                {inHotelContext ? <HotelGlobalSearch /> : inRestoContext ? <RestoGlobalSearch /> : <GlobalSearch />}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {inHotelContext ? (
                  <Link to="/app/hotel/reservations" search={{ openCreate: true }}
                    className="hidden h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:flex"
                    aria-label="Nouvelle réservation">
                    <CalendarPlus className="h-4 w-4" /> Nouvelle réservation
                  </Link>
                ) : inRestoContext ? (
                  <Link to="/app/resto/commandes"
                    className="hidden h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:flex"
                    aria-label="Nouvelle commande">
                    <UtensilsCrossed className="h-4 w-4" /> Nouvelle commande
                  </Link>
                ) : (
                  <Link to="/app/caisse"
                    className="hidden h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:flex"
                    aria-label="Aller à la caisse">
                    <ShoppingCart className="h-4 w-4" /> PDV
                  </Link>
                )}
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

// N'est plus affiché que sur une vraie erreur de récupération des
function SuspendedScreen({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const logout = async () => {
    await onSignOut();
    navigate({ to: "/connexion" });
  };
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Organisation suspendue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          L'accès à cette organisation a été suspendu par l'administration. Contactez le support si vous pensez
          qu'il s'agit d'une erreur.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <a href="mailto:contact@novacaisse.bj" className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90">
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

// organisations (shopError truthy) — le cas "compte sans organisation"
// normal (inscription tout juste terminée) passe par OnboardingFlow.
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
        <h1 className="mt-4 font-display text-xl font-bold">Impossible de récupérer vos organisations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La récupération de vos organisations a échoué ({error}) — ce n'est probablement pas lié à votre compte,
          réessayez ci-dessous.
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
