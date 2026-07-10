import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { TENANTS } from "@/lib/mock/tenants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

const TICKETS = [
  { id: "T-2481", tenant_id: "t1", subject: "Impression ticket ne fonctionne pas", status: "ouvert", priority: "haute", created_at: "2026-07-10T09:12:00Z" },
  { id: "T-2480", tenant_id: "t4", subject: "Import produits Excel — colonne manquante", status: "en_cours", priority: "moyenne", created_at: "2026-07-09T14:33:00Z" },
  { id: "T-2479", tenant_id: "t7", subject: "Question sur le renouvellement annuel", status: "resolu", priority: "basse", created_at: "2026-07-08T11:05:00Z" },
  { id: "T-2478", tenant_id: "t2", subject: "Mobile Money MTN — paiement refusé", status: "ouvert", priority: "haute", created_at: "2026-07-08T08:47:00Z" },
  { id: "T-2477", tenant_id: "t9", subject: "Ajout d'une 4e boutique", status: "en_cours", priority: "moyenne", created_at: "2026-07-07T16:22:00Z" },
  { id: "T-2476", tenant_id: "t10", subject: "Export rapport CA au format PDF", status: "resolu", priority: "basse", created_at: "2026-07-06T10:01:00Z" },
];

const STATUS = {
  ouvert: { label: "Ouvert", color: "bg-destructive/15 text-destructive" },
  en_cours: { label: "En cours", color: "bg-accent/25 text-accent-foreground" },
  resolu: { label: "Résolu", color: "bg-success/15 text-success" },
} as const;

const PRIO = {
  haute: "bg-destructive/15 text-destructive",
  moyenne: "bg-warning/15 text-warning-foreground",
  basse: "bg-muted text-muted-foreground",
} as const;

function AdminSupport() {
  const open = TICKETS.filter((t) => t.status === "ouvert").length;
  const inProgress = TICKETS.filter((t) => t.status === "en_cours").length;
  const solved = TICKETS.filter((t) => t.status === "resolu").length;

  return (
    <div>
      <PageHeader title="Support" subtitle="Tickets et demandes des boutiques" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Ouverts" value={String(open)} icon={<MessageSquare className="h-5 w-5" />} accent="destructive" />
          <StatCard label="En cours" value={String(inProgress)} icon={<Clock className="h-5 w-5" />} accent="accent" />
          <StatCard label="Résolus (7j)" value={String(solved)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Sujet</th>
                <th className="px-4 py-3">Priorité</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {TICKETS.map((t) => {
                const tenant = TENANTS.find((x) => x.id === t.tenant_id);
                const s = STATUS[t.status as keyof typeof STATUS];
                return (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="tabular px-4 py-3 font-mono text-xs">{t.id}</td>
                    <td className="px-4 py-3 font-semibold">{tenant?.shop_name ?? "—"}</td>
                    <td className="px-4 py-3">{t.subject}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", PRIO[t.priority as keyof typeof PRIO])}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", s.color)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
