// Bascule entre les applications ZegOS actives sur l'organisation courante
// (ZegCaisse / ZegHôtel) — deux activités distinctes, deux menus distincts :
// ce composant ne fait qu'indiquer/laisser choisir le contexte courant, le
// reste (AppSidebar, BottomNav) s'appuie sur l'URL (/app/hotel/* vs le
// reste) pour savoir quel menu afficher. Ne s'affiche que si l'organisation
// a au moins deux applications actives — inutile sinon.
import { Link, useRouterState } from "@tanstack/react-router";
import { Store, BedDouble, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { cn } from "@/lib/utils";

type AppKey = "pos" | "hotel" | "resto";
const APP_META: Record<AppKey, { label: string; icon: LucideIcon; homeUrl: string }> = {
  pos: { label: "ZegCaisse", icon: Store, homeUrl: "/app" },
  hotel: { label: "ZegHôtel", icon: BedDouble, homeUrl: "/app/hotel" },
  resto: { label: "ZegResto", icon: UtensilsCrossed, homeUrl: "/app/resto" },
};
const ORDER: AppKey[] = ["pos", "hotel", "resto"];

export function AppSwitcher({ variant = "surface", compact = false }: { variant?: "sidebar" | "surface"; compact?: boolean }) {
  const { currentOrganization } = useOrganization();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const activeApps = (currentOrganization?.active_apps ?? []) as string[];
  const relevant = ORDER.filter((k) => activeApps.includes(k));
  if (relevant.length < 2) return null;

  const current: AppKey = pathname.startsWith("/app/hotel") ? "hotel" : pathname.startsWith("/app/resto") ? "resto" : "pos";

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-2">
        {relevant.map((k) => {
          const meta = APP_META[k];
          const Icon = meta.icon;
          const active = current === k;
          return (
            <Link key={k} to={meta.homeUrl as never} title={meta.label}
              className={cn("grid h-9 w-9 place-items-center rounded-xl transition-colors",
                active ? "bg-sidebar-primary/20 text-sidebar-primary" : "text-sidebar-foreground/60 hover:bg-sidebar-accent")}>
              <Icon className="h-4 w-4" />
            </Link>
          );
        })}
      </div>
    );
  }

  const track = variant === "sidebar" ? "border-sidebar-border bg-sidebar-accent/40" : "border-border bg-muted/50";
  const activeClass = variant === "sidebar" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground";
  const inactiveClass = variant === "sidebar" ? "text-sidebar-foreground/70 hover:bg-sidebar-accent" : "text-muted-foreground hover:bg-background";

  return (
    <div className={cn("flex gap-1 rounded-xl border p-1", track)}>
      {relevant.map((k) => {
        const meta = APP_META[k];
        const Icon = meta.icon;
        const active = current === k;
        return (
          <Link key={k} to={meta.homeUrl as never}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", active ? activeClass : inactiveClass)}>
            <Icon className="h-3.5 w-3.5" /> {meta.label}
          </Link>
        );
      })}
    </div>
  );
}
