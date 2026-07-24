import { useMemo, useState } from "react";
import {
  useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDismissNotification,
  useQuotes,
} from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { getTrialInfo } from "@/lib/trial";

export type NotificationKind = "big_sale" | "stock_low" | "stock_out" | "new_member" | "quote_expiring" | "trial_expiring";

export type NotificationItem = {
  id: string; kind: NotificationKind; title: string; body: string; created_at: string;
  read: boolean; virtual: boolean;
};

// Fusionne les notifications réelles (table notifications, migration 011)
// avec 2 conditions "temps qui passe" calculées à la volée côté client
// (devis bientôt expiré, essai qui expire) — voir migration 011 pour le
// détail de cette décision. Partagé entre NotificationsBell (popover) et
// /app/notifications (page complète) pour n'avoir cette logique qu'à un
// seul endroit.
export function useAppNotifications() {
  const [dismissedVirtual, setDismissedVirtual] = useState<Set<string>>(new Set());

  const { data: real = [], isLoading } = useNotifications();
  const { data: quotes = [] } = useQuotes(200);
  const { currentOrganization } = useOrganization();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const dismissReal = useDismissNotification();

  const virtualItems = useMemo(() => {
    const items: NotificationItem[] = [];
    const in2Days = Date.now() + 2 * 86400000;

    quotes.forEach((q) => {
      if (!q.valid_until) return;
      if (q.status !== "draft" && q.status !== "sent") return;
      const t = new Date(q.valid_until).getTime();
      if (t > Date.now() && t <= in2Days) {
        items.push({
          id: `virtual-quote-${q.id}`, kind: "quote_expiring",
          title: "Devis bientôt expiré",
          body: `${q.reference} (${q.customers?.name ?? "client"}) expire le ${new Date(q.valid_until).toLocaleDateString("fr-FR")}.`,
          created_at: q.valid_until, read: false, virtual: true,
        });
      }
    });

    const trial = getTrialInfo(currentOrganization);
    if (trial.onTrial && !trial.expired && trial.daysLeft <= 1) {
      items.push({
        id: "virtual-trial", kind: "trial_expiring",
        title: "Essai gratuit qui expire",
        body: trial.daysLeft === 0 ? "Votre essai se termine aujourd'hui." : "Votre essai se termine demain.",
        created_at: new Date().toISOString(), read: false, virtual: true,
      });
    }

    return items.filter((it) => !dismissedVirtual.has(it.id));
  }, [quotes, currentOrganization, dismissedVirtual]);

  const items: NotificationItem[] = useMemo(() => [
    ...real.map((n): NotificationItem => ({
      id: n.id, kind: (n.kind as NotificationKind) ?? "big_sale", title: n.title, body: n.body ?? "",
      created_at: n.created_at, read: !!n.read_at, virtual: false,
    })),
    ...virtualItems,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [real, virtualItems]);

  const unread = items.filter((n) => !n.read).length;

  const markOneRead = (it: NotificationItem) => {
    if (it.virtual) setDismissedVirtual((s) => new Set(s).add(it.id));
    else markRead.mutate(it.id);
  };
  const dismiss = (it: NotificationItem) => {
    if (it.virtual) setDismissedVirtual((s) => new Set(s).add(it.id));
    else dismissReal.mutate(it.id);
  };
  const markAllAsRead = () => {
    markAllRead.mutate();
    setDismissedVirtual((s) => { const next = new Set(s); virtualItems.forEach((v) => next.add(v.id)); return next; });
  };

  return { items, unread, isLoading, markOneRead, dismiss, markAllAsRead };
}
