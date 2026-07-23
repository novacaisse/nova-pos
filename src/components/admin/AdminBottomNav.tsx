import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Store, CreditCard, LifeBuoy, MoreHorizontal,
  Receipt, Settings, UserCircle, LogOut, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";

// Même pattern que BottomNav (espace boutique, Bloc 26) : 4 sections
// principales + un tiroir "Plus" pour le reste, plutôt que de laisser le
// panneau latéral comme seul accès sur mobile.
type Item = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY: Item[] = [
  { label: "Bord", to: "/admin", icon: LayoutDashboard },
  { label: "Boutiques", to: "/admin/boutiques", icon: Store },
  { label: "Abonnés", to: "/admin/abonnements", icon: CreditCard },
  { label: "Support", to: "/admin/support", icon: LifeBuoy },
];

const MORE: Item[] = [
  { label: "Facturation", to: "/admin/facturation", icon: Receipt },
  { label: "Paramètres", to: "/admin/parametres", icon: Settings },
  { label: "Profil", to: "/admin/profil", icon: UserCircle },
];

export function AdminBottomNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (to: string) => (to === "/admin" ? pathname === "/admin" : pathname === to || pathname.startsWith(to + "/"));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admins" });
  };

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-5">
          {PRIMARY.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to as never}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setOpen(true)}
              className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elegant animate-in slide-in-from-bottom"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-bold">Plus</div>
                <div className="text-xs text-muted-foreground">Accès rapide</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MORE.map((m) => {
                const Icon = m.icon;
                const active = isActive(m.to);
                return (
                  <Link
                    key={m.to}
                    to={m.to as never}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-background px-2 py-3 text-xs font-semibold",
                      active ? "border-primary/50 bg-primary/10 text-primary" : "text-foreground hover:border-primary/30",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {m.label}
                  </Link>
                );
              })}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-destructive/30 bg-background px-2 py-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
