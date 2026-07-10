import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CreditCard, CheckCircle2, XCircle, Clock, RefreshCcw, Receipt } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PAYMENTS, TENANTS } from "@/lib/mock/tenants";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/abonnements")({
  component: AdminAbonnements,
});

const STATUS_META = {
  reussi: { label: "Réussi", color: "bg-success/15 text-success", icon: CheckCircle2 },
  echoue: { label: "Échoué", color: "bg-destructive/15 text-destructive", icon: XCircle },
  en_attente: { label: "En attente", color: "bg-accent/25 text-accent-foreground", icon: Clock },
};

function AdminAbonnements() {
  const [status, setStatus] = useState<"all" | keyof typeof STATUS_META>("all");
  const [period, setPeriod] = useState<"7j" | "30j" | "90j" | "all">("30j");

  const rows = useMemo(() => PAYMENTS.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    return true;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at)), [status]);

  const total = PAYMENTS.reduce((s, p) => s + (p.status === "reussi" ? p.amount : 0), 0);
  const success = PAYMENTS.filter((p) => p.status === "reussi").length;
  const failed = PAYMENTS.filter((p) => p.status === "echoue").length;
  const pending = PAYMENTS.filter((p) => p.status === "en_attente").length;

  return (
    <div>
      <PageHeader title="Abonnements" subtitle="Transactions MoneyFusion" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Encaissé" value={formatXOF(total)} icon={<CreditCard className="h-5 w-5" />} accent="primary" />
          <StatCard label="Réussis" value={String(success)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
          <StatCard label="Échoués" value={String(failed)} icon={<XCircle className="h-5 w-5" />} accent="destructive" />
          <StatCard label="En attente" value={String(pending)} icon={<Clock className="h-5 w-5" />} accent="accent" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | keyof typeof STATUS_META)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as "7j" | "30j" | "90j" | "all")} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="7j">7 derniers jours</option>
            <option value="30j">30 derniers jours</option>
            <option value="90j">90 derniers jours</option>
            <option value="all">Tout l'historique</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
                const tenant = TENANTS.find((t) => t.id === p.tenant_id);
                const meta = STATUS_META[p.status];
                const Icon = meta.icon;
                return (
                  <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="tabular px-4 py-3 text-xs font-mono">{p.ref}</td>
                    <td className="px-4 py-3 font-semibold">{tenant?.shop_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{p.method}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", meta.color)}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(p.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Rembourser" className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"><RefreshCcw className="h-3.5 w-3.5" /></button>
                        <button title="Renvoyer facture" className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"><Receipt className="h-3.5 w-3.5" /></button>
                      </div>
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
