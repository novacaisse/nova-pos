// Maintenance sortie en module propre (ZegHotel Phase 3, /app/hotel/maintenance) —
// cet écran ne gère plus que les tâches de ménage du jour.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Sparkle, Loader2, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { playKdsSound } from "@/lib/kdsSound";
import {
  useHotelHousekeepingTasks, useGenerateHousekeepingTasks, useUpdateHousekeepingTaskStatus,
  type HousekeepingTaskStatus,
} from "@/lib/data/hotelHooks";

export const Route = createFileRoute("/app/hotel/housekeeping")({
  component: HousekeepingPage,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }

const TASK_LABEL: Record<HousekeepingTaskStatus, string> = { pending: "À faire", in_progress: "En cours", done: "Terminé" };

function HousekeepingPage() {
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "front_desk";
  const today = todayISO();

  const { data: tasks = [], isLoading: loadingTasks } = useHotelHousekeepingTasks(today);
  const generate = useGenerateHousekeepingTasks();
  const updateTask = useUpdateHousekeepingTaskStatus();

  const pendingCount = tasks.filter((t) => t.status !== "done").length;

  const knownTaskIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loadingTasks) return;
    const ids = new Set(tasks.map((t) => t.id));
    if (knownTaskIds.current && [...ids].some((id) => !knownTaskIds.current!.has(id))) {
      playKdsSound("chime", 0.5);
    }
    knownTaskIds.current = ids;
  }, [tasks, loadingTasks]);

  return (
    <div>
      <PageHeader title="Housekeeping" subtitle="Tâches de ménage du jour — se rafraîchit automatiquement chaque minute"
        actions={canManage && (
          <button onClick={() => generate.mutate(today)} disabled={generate.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-60">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />} Regénérer (filet de sécurité)
          </button>
        )}
      />

      <div className="space-y-4 p-4 sm:p-8">
        <StatCard label="Tâches en attente" value={String(pendingCount)} icon={<Sparkle className="h-5 w-5" />} accent="accent" />

        {loadingTasks ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucune tâche pour aujourd'hui.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <div className="font-semibold">Chambre {t.room?.number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{t.kind === "cleaning" ? "Nettoyage" : t.kind === "turnover" ? "Recouche" : "Inspection"}</div>
                </div>
                {t.status === "done" ? (
                  <span className="flex items-center gap-1 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Terminé</span>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    {t.status === "pending" && (
                      <button onClick={() => updateTask.mutate({ id: t.id, status: "in_progress" })}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted">Démarrer</button>
                    )}
                    <button onClick={() => updateTask.mutate({ id: t.id, status: "done" })}
                      className="rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success hover:bg-success/20">Terminer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
