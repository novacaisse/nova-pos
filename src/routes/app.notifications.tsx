import { createFileRoute } from "@tanstack/react-router";
import { Bell, AlertTriangle, PackageCheck, Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  component: NotificationsPage,
});

type Notif = { id: string; icon: typeof Bell; color: string; title: string; body: string; at: string; read: boolean };

const NOTIFS: Notif[] = [
  { id: "n1", icon: AlertTriangle, color: "text-destructive bg-destructive/15", title: "Stock critique", body: "Papier toilette x4 — 15 unités restantes", at: "Il y a 12 min", read: false },
  { id: "n2", icon: PackageCheck, color: "text-success bg-success/15", title: "Commande reçue", body: "BC-2026-041 · GrossMart Import (22 articles)", at: "Il y a 1 h", read: false },
  { id: "n3", icon: Sparkles, color: "text-primary bg-primary/15", title: "Insight IA", body: "Ta marge du mois est en baisse de 2 pts. Voir l'analyse.", at: "Il y a 3 h", read: false },
  { id: "n4", icon: Users, color: "text-accent-foreground bg-accent/25", title: "Nouveau client", body: "Restaurant Sika a atteint le palier Or", at: "Hier", read: true },
  { id: "n5", icon: Bell, color: "text-muted-foreground bg-muted", title: "Rappel abonnement", body: "Prochain prélèvement le 01/08/2026", at: "Il y a 2 j", read: true },
];

function NotificationsPage() {
  const unread = NOTIFS.filter((n) => !n.read).length;
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} non lue${unread > 1 ? "s" : ""}`}
        actions={
          <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">Tout marquer lu</button>
        }
      />
      <div className="p-5 sm:p-8">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-2">
          {NOTIFS.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.id} className={cn("flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted/50", !n.read && "bg-primary/5")}>
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", n.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{n.title}</div>
                    {!n.read && <span className="inline-block h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div className="text-sm text-muted-foreground">{n.body}</div>
                </div>
                <div className="text-xs text-muted-foreground">{n.at}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
