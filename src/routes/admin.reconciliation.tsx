// Écran "Réconciliation" (Phase 11 partie 2, admin complet) — depuis la
// Phase 1, chaque établissement garde son ancien état (organizations.plan)
// en parallèle du nouvel état réel par compte (account_subscriptions).
// Les deux peuvent diverger sans que personne ne le remarque ; cet écran
// liste les établissements où c'est le cas, pour repérer une dérive avant
// qu'elle ne cause un problème de facturation. Lecture seule.
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useAdminReconciliation, type ReconciliationRow } from "@/lib/data/adminHooks";

export const Route = createFileRoute("/admin/reconciliation")({
  component: AdminReconciliation,
});

function AdminReconciliation() {
  const { data: rows = [], isLoading } = useAdminReconciliation();

  return (
    <div>
      <PageHeader title="Réconciliation" subtitle="Établissements où l'ancien état (par établissement) diverge du nouvel état réel (par compte)" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Écarts détectés" value={String(rows.length)} icon={<AlertTriangle className="h-5 w-5" />} accent={rows.length ? "destructive" : "primary"} />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" /> Aucun écart — tous les établissements sont cohérents avec leur abonnement de compte.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => <ReconciliationCard key={r.organization_id} row={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReconciliationCard({ row }: { row: ReconciliationRow }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-base font-bold">{row.organization_name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Compte : {row.account_name ?? "—"} {row.app_module && `· ${row.app_module === "pos" ? "ZegCaisse" : "ZegHotel"}`}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-card px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {row.issue}
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">Établissement (ancien état)</div>
          <div className="mt-1">Formule : {row.org_plan}</div>
          <div className="text-muted-foreground">Fin d'essai : {row.org_trial_ends_at ? new Date(row.org_trial_ends_at).toLocaleDateString("fr-FR") : "—"}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">Compte (account_subscriptions)</div>
          <div className="mt-1">Formule : {row.sub_plan_id ?? "—"} {row.sub_status && `· ${row.sub_status}`}</div>
          <div className="text-muted-foreground">Fin d'essai : {row.sub_trial_ends_at ? new Date(row.sub_trial_ends_at).toLocaleDateString("fr-FR") : "—"}</div>
        </div>
      </div>
    </div>
  );
}
