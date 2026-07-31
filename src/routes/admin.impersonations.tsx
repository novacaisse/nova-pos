// Journal "Se connecter en tant que" (Phase 11, admin complet) —
// admin_impersonations est écrit à chaque impersonation (edge function
// admin-impersonate) mais n'avait jusqu'ici aucun écran de lecture :
// Emmanuel ne pouvait auditer "qui a impersonné qui, quand" sans accès SQL
// direct, malgré une table prévue précisément pour ça. Lecture seule,
// 200 dernières entrées.
import { createFileRoute } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAdminImpersonations } from "@/lib/data/adminHooks";

export const Route = createFileRoute("/admin/impersonations")({
  component: AdminImpersonations,
});

function AdminImpersonations() {
  const { data: rows = [], isLoading } = useAdminImpersonations();

  return (
    <div>
      <PageHeader title="Journal d'impersonation" subtitle="200 dernières connexions « en tant que » un utilisateur" />

      <div className="p-5 sm:p-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune impersonation enregistrée.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Super Admin</th>
                  <th className="px-4 py-3">Utilisateur ciblé</th>
                  <th className="px-4 py-3">Organisation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.admin_email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">{r.target_full_name ?? "—"}</span>
                        <span className="text-muted-foreground">{r.target_email ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.organization_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
