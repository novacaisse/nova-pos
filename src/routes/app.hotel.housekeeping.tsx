// Maintenance sortie en module propre (ZegHotel Phase 3, /app/hotel/maintenance) —
// cet écran ne gère plus que les tâches de ménage du jour.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkle, Loader2, CheckCircle2, UserCircle2, ChevronLeft, ChevronRight, History } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useMyRole, useShopMembers } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { playKdsSound } from "@/lib/kdsSound";
import { cn } from "@/lib/utils";
import {
  useHotelHousekeepingTasks, useGenerateHousekeepingTasks, useUpdateHousekeepingTaskStatus,
  useAssignHousekeepingTask, type HousekeepingTaskStatus,
} from "@/lib/data/hotelHooks";

export const Route = createFileRoute("/app/hotel/housekeeping")({
  component: HousekeepingPage,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const TASK_LABEL: Record<HousekeepingTaskStatus, string> = { pending: "À faire", in_progress: "En cours", done: "Terminé" };

function HousekeepingPage() {
  const { user } = useAuth();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "front_desk";
  const today = todayISO();

  // Historique (mission "mise à jour ZegHotel", Phase 1) : navigation
  // jour par jour, y compris dans le passé — la date affichée n'est plus
  // figée sur "aujourd'hui". Écriture (assignation, changement de statut)
  // désactivée hors du jour courant : une tâche d'un jour passé est un
  // historique consultable, pas un brouillon à corriger après coup.
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;

  const { data: tasks = [], isLoading: loadingTasks } = useHotelHousekeepingTasks(selectedDate);
  const { data: members = [] } = useShopMembers();
  const generate = useGenerateHousekeepingTasks();
  const updateTask = useUpdateHousekeepingTaskStatus();
  const assignTask = useAssignHousekeepingTask();

  // Équipe de ménage assignable — rôle dédié "housekeeping" (Gouvernante).
  // Un membre avec un accès élargi via la matrice de permissions (Partie 4)
  // mais un autre rôle de base reste assignable s'il est déjà affecté à une
  // tâche (voir memberName ci-dessous), simplement absent de cette liste de
  // sélection tant qu'il n'a jamais été assigné.
  const housekeepers = useMemo(() => members.filter((m) => m.role === "housekeeping"), [members]);
  const memberName = (userId: string | null) => userId ? (members.find((m) => m.user_id === userId)?.profile?.full_name ?? "Membre") : null;

  const [onlyMine, setOnlyMine] = useState(false);
  const visibleTasks = onlyMine ? tasks.filter((t) => t.assigned_to === user?.id) : tasks;

  const pendingCount = tasks.filter((t) => t.status !== "done").length;

  const knownTaskIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loadingTasks || !isToday) return;
    const ids = new Set(tasks.map((t) => t.id));
    if (knownTaskIds.current && [...ids].some((id) => !knownTaskIds.current!.has(id))) {
      playKdsSound("chime", 0.5);
    }
    knownTaskIds.current = ids;
  }, [tasks, loadingTasks, isToday]);

  return (
    <div>
      <PageHeader title="Housekeeping"
        subtitle={isToday ? "Tâches de ménage du jour — se rafraîchit automatiquement chaque minute" : "Historique — lecture seule"}
        actions={canManage && isToday && (
          <button onClick={() => generate.mutate(today)} disabled={generate.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-60">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />} Regénérer (filet de sécurité)
          </button>
        )}
      />

      <div className="space-y-4 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedDate((d) => addDaysISO(d, -1))}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-[150px] text-center text-sm font-semibold">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
              {!isToday && <History className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <button onClick={() => setSelectedDate((d) => addDaysISO(d, 1))} disabled={selectedDate >= today}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            {!isToday && (
              <button onClick={() => setSelectedDate(today)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted">Aujourd'hui</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatCard label="Tâches en attente" value={String(pendingCount)} icon={<Sparkle className="h-5 w-5" />} accent="accent" />
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 accent-primary" />
              Mes tâches uniquement
            </label>
          </div>
        </div>

        {loadingTasks ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {onlyMine ? "Aucune tâche qui vous est assignée aujourd'hui." : "Aucune tâche pour aujourd'hui."}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTasks.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <div className="font-semibold">Chambre {t.room?.number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{t.kind === "cleaning" ? "Nettoyage" : t.kind === "turnover" ? "Recouche" : "Inspection"}</div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className={cn("flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs", !isToday && "opacity-70")}>
                    <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {isToday ? (
                      <select value={t.assigned_to ?? ""} onChange={(e) => assignTask.mutate({ id: t.id, assigned_to: e.target.value || null })}
                        className="max-w-[9rem] truncate bg-transparent outline-none">
                        <option value="">Non assigné</option>
                        {t.assigned_to && !housekeepers.some((m) => m.user_id === t.assigned_to) && (
                          <option value={t.assigned_to}>{memberName(t.assigned_to)}</option>
                        )}
                        {housekeepers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || "—"}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="max-w-[9rem] truncate">{memberName(t.assigned_to) ?? "Non assigné"}</span>
                    )}
                  </div>
                  {t.status === "done" ? (
                    <span className="flex items-center gap-1 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Terminé</span>
                  ) : !isToday ? (
                    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{TASK_LABEL[t.status]}</span>
                  ) : (
                    <div className="flex gap-2">
                      {t.status === "pending" && (
                        <button onClick={() => updateTask.mutate({ id: t.id, status: "in_progress" })}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted">Démarrer</button>
                      )}
                      <button onClick={() => updateTask.mutate({ id: t.id, status: "done" })}
                        className="rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success hover:bg-success/20">Terminer</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
