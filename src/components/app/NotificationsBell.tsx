import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell, Check, X, TrendingUp, AlertTriangle, UserPlus, FileClock, Clock,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppNotifications, type NotificationItem, type NotificationKind } from "@/lib/data/useAppNotifications";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  big_sale: TrendingUp, stock_low: AlertTriangle, stock_out: AlertTriangle,
  new_member: UserPlus, quote_expiring: FileClock, trial_expiring: Clock,
};
const KIND_LABEL: Record<NotificationKind, string> = {
  big_sale: "Vente", stock_low: "Stock", stock_out: "Stock",
  new_member: "Équipe", quote_expiring: "Devis", trial_expiring: "Abonnement",
};
const KIND_CTA: Record<NotificationKind, { href: string; label: string }> = {
  big_sale: { href: "/app/ventes", label: "Voir les ventes" },
  stock_low: { href: "/app/stock", label: "Voir le stock" },
  stock_out: { href: "/app/stock", label: "Voir le stock" },
  new_member: { href: "/app/equipe", label: "Voir l'équipe" },
  quote_expiring: { href: "/app/devis", label: "Voir le devis" },
  trial_expiring: { href: "/app/abonnement", label: "Souscrire" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, markOneRead, dismiss, markAllAsRead } = useAppNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}
          className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-elegant">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(92vw,380px)] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-display text-sm font-bold">Notifications</div>
            <div className="text-[11px] text-muted-foreground">Événements de votre boutique</div>
          </div>
          {unread > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
            >
              <Check className="h-3 w-3" /> Tout marquer lu
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="grid place-items-center px-6 py-10 text-center text-xs text-muted-foreground">
              Aucune notification.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n: NotificationItem) => {
                const Icon = ICONS[n.kind];
                const cta = KIND_CTA[n.kind];
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {KIND_LABEL[n.kind]}
                        </span>
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        {cta && (
                          <Link
                            to={cta.href as never}
                            onClick={() => { markOneRead(n); setOpen(false); }}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            {cta.label} →
                          </Link>
                        )}
                      </div>
                    </div>
                    <button
                      aria-label="Ignorer"
                      onClick={() => dismiss(n)}
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
