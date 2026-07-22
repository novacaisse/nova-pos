import { createFileRoute } from "@tanstack/react-router";
import { Bell, TrendingUp, AlertTriangle, UserPlus, FileClock, Clock } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAppNotifications, type NotificationKind } from "@/lib/data/useAppNotifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  component: NotificationsPage,
});

const ICONS: Record<NotificationKind, typeof Bell> = {
  big_sale: TrendingUp, stock_low: AlertTriangle, stock_out: AlertTriangle,
  new_member: UserPlus, quote_expiring: FileClock, trial_expiring: Clock,
};
const ICON_COLOR: Record<NotificationKind, string> = {
  big_sale: "text-success bg-success/15",
  stock_low: "text-warning-foreground bg-warning/20",
  stock_out: "text-destructive bg-destructive/15",
  new_member: "text-accent-foreground bg-accent/25",
  quote_expiring: "text-primary bg-primary/15",
  trial_expiring: "text-primary bg-primary/15",
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

function NotificationsPage() {
  const { items, unread, markOneRead, markAllAsRead } = useAppNotifications();

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} non lue${unread > 1 ? "s" : ""}`}
        actions={
          <button onClick={markAllAsRead} disabled={unread === 0}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            Tout marquer lu
          </button>
        }
      />
      <div className="p-5 sm:p-8">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-2">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune notification pour l'instant.</div>
          )}
          {items.map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <button key={n.id} onClick={() => markOneRead(n)}
                className={cn("flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50", !n.read && "bg-primary/5")}>
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", ICON_COLOR[n.kind])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{n.title}</div>
                    {!n.read && <span className="inline-block h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div className="text-sm text-muted-foreground">{n.body}</div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
