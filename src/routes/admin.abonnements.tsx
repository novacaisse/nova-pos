import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CreditCard, CheckCircle2, XCircle, Clock, RefreshCcw, Receipt, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useAdminPayments } from "@/lib/data/adminHooks";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/abonnements")({
  component: AdminAbonnements,
});

const STATUS_META = {
  paid: { label: "Payé", color: "bg-success/15 text-success", icon: CheckCircle2 },
  failed: { label: "Échoué", color: "bg-destructive/15 text-destructive", icon: XCircle },
  pending: { label: "En attente", color: "bg-accent/25 text-accent-foreground", icon: Clock },
  refunded: { label: "Remboursé", color: "bg-muted text-muted-foreground", icon: RefreshCcw },
} as const;

const PERIOD_DAYS: Record<string, number | null> = { "7j": 7, "30j": 30, "90j": 90, all: null };

function AdminAbonnements() {
  const { data: payments = [], isLoading } = useAdminPayments();
  const [status, setStatus] = useState<"all" | keyof typeof STATUS_META>("all");
  const [period, setPeriod] = useState<keyof typeof PERIOD_DAYS>("30j");

  const rows = useMemo(() => {
    const days = PERIOD_DAYS[period];
    const cutoff = days ? Date.now() - days * 86400000 : null;
    return payments.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (cutoff && new Date(p.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [payments, status, period]);

  const total = payments.reduce((s, p) => s + (p.status === "paid" ? Number(p.amount) : 0), 0);
  const success = payments.filter((p) => p.status === "paid").length;
  const failed = payments.filter((p) => p.status === "failed").length;
  const pending = payments.filter((p) => p.status === "pending").length;

  return (
    <div>
      <PageHeader title="Abonnements" subtitle="Transactions MoneyFusion" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Encaissé" value={formatXOF(total)} icon={<CreditCard className="h-5 w-5" />} accent="primary" />
          <StatCard label="Payés" value={String(success)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
          <StatCard label="Échoués" value={String(failed)} icon={<XCircle className="h-5 w-5" />} accent="destructive" />
          <StatCard label="En attente" value={String(pending)} icon={<Clock className="h-5 w-5" />} accent="accent" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="7j">7 derniers jours</option>
            <option value="30j">30 derniers jours</option>
            <option value="90j">90 derniers jours</option>
            <option value="all">Tout l'historique</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Réf</th>
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Méthode</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const meta = STATUS_META[p.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="tabular px-4 py-3 text-xs font-mono">{p.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-semibold">{p.organizations?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{(p.metadata?.moyen as string | undefined) ?? p.method}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", meta.color)}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(Number(p.amount))}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button disabled title="Bientôt disponible" className="grid h-8 w-8 cursor-not-allowed place-items-center rounded-lg border border-border opacity-40"><RefreshCcw className="h-3.5 w-3.5" /></button>
                        <button disabled title="Bientôt disponible" className="grid h-8 w-8 cursor-not-allowed place-items-center rounded-lg border border-border opacity-40"><Receipt className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucune transaction sur cette période</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
