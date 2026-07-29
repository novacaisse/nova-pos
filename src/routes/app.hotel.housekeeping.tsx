import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkle, Wrench, Plus, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import {
  useHotelHousekeepingTasks, useGenerateHousekeepingTasks, useUpdateHousekeepingTaskStatus,
  useHotelMaintenanceTickets, useCreateMaintenanceTicket, useUpdateMaintenanceTicket, useHotelRooms,
  type HousekeepingTaskStatus, type MaintenancePriority, type MaintenanceStatus,
} from "@/lib/data/hotelHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/housekeeping")({
  component: HousekeepingPage,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }

const TASK_LABEL: Record<HousekeepingTaskStatus, string> = { pending: "À faire", in_progress: "En cours", done: "Terminé" };
const PRIORITY_COLOR: Record<MaintenancePriority, string> = {
  low: "bg-muted text-muted-foreground", normal: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning-foreground", urgent: "bg-destructive/10 text-destructive",
};

function HousekeepingPage() {
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "front_desk";
  const [tab, setTab] = useState<"tasks" | "maintenance">("tasks");
  const today = todayISO();

  const { data: tasks = [], isLoading: loadingTasks } = useHotelHousekeepingTasks(today);
  const generate = useGenerateHousekeepingTasks();
  const updateTask = useUpdateHousekeepingTaskStatus();

  const { data: tickets = [], isLoading: loadingTickets } = useHotelMaintenanceTickets();
  const [creatingTicket, setCreatingTicket] = useState(false);

  const pendingCount = tasks.filter((t) => t.status !== "done").length;
  const openTickets = tickets.filter((t) => t.status !== "resolved").length;

  return (
    <div>
      <PageHeader title="Housekeeping" subtitle="Tâches de ménage et maintenance"
        actions={canManage && tab === "tasks" && (
          <button onClick={() => generate.mutate(today)} disabled={generate.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-60">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />} Générer les tâches du jour
          </button>
        )}
      />

      <div className="space-y-4 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Tâches en attente" value={String(pendingCount)} icon={<Sparkle className="h-5 w-5" />} accent="accent" />
          <StatCard label="Tickets ouverts" value={String(openTickets)} icon={<Wrench className="h-5 w-5" />} accent="destructive" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["tasks", "maintenance"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "tasks" ? "Ménage du jour" : "Maintenance"}
            </button>
          ))}
        </div>

        {tab === "tasks" ? (
          loadingTasks ? (
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
          )
        ) : (
          <div className="space-y-3">
            {canManage && (
              <button onClick={() => setCreatingTicket(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-3 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary">
                <Plus className="h-4 w-4" /> Signaler un incident
              </button>
            )}
            {loadingTickets ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
            ) : tickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Aucun incident signalé.</div>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{t.title}</div>
                      <div className="text-xs text-muted-foreground">Chambre {t.room?.number ?? "—"}{t.description ? ` — ${t.description}` : ""}</div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", PRIORITY_COLOR[t.priority])}>{t.priority}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t.status === "open" ? "Ouvert" : t.status === "in_progress" ? "En cours" : "Résolu"}</span>
                    {t.status !== "resolved" && (
                      <MaintenanceActions id={t.id} status={t.status} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {creatingTicket && <MaintenanceTicketModal onClose={() => setCreatingTicket(false)} />}
    </div>
  );
}

function MaintenanceActions({ id, status }: { id: string; status: MaintenanceStatus }) {
  const update = useUpdateMaintenanceTicket();
  return (
    <div className="flex gap-2">
      {status === "open" && (
        <button onClick={() => update.mutate({ id, status: "in_progress" })}
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">Prendre en charge</button>
      )}
      <button onClick={() => update.mutate({ id, status: "resolved" })}
        className="rounded-xl bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/20">Résoudre</button>
    </div>
  );
}

function MaintenanceTicketModal({ onClose }: { onClose: () => void }) {
  const { data: rooms = [] } = useHotelRooms();
  const create = useCreateMaintenanceTicket();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>("normal");
  const [error, setError] = useState<string | null>(null);
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ room_id: roomId, title: title.trim(), description: description.trim() || undefined, priority });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Signaler un incident</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chambre *</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inp}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="Climatisation en panne" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Détails</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorité</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)} className={inp}>
              <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option>
            </select></label>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!roomId || !title.trim() || create.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Signaler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
