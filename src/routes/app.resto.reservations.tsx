// Réservations ZegResto (Phase 3) — liste + confirmation des demandes
// publiques (formulaire /resto/reserver/$slug, statut initial "pending"),
// création manuelle par le staff (source "staff", déjà confirmée).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, X, Save, Trash2, Loader2, CalendarClock, Check, Ban, Users, Phone, Globe } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useRestoReservations, useUpsertRestoReservation, useDeleteRestoReservation, useRestoTables,
  type RestoReservation, type ReservationStatut,
} from "@/lib/data/restoHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/reservations")({
  component: ReservationsPage,
});

const STATUT_LABEL: Record<ReservationStatut, string> = { pending: "En attente", confirmee: "Confirmée", annulee: "Annulée", honoree: "Honorée" };
const STATUT_COLOR: Record<ReservationStatut, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  confirmee: "bg-success/15 text-success",
  annulee: "bg-muted text-muted-foreground",
  honoree: "bg-primary/15 text-primary",
};

function ReservationsPage() {
  const { data: reservations = [], isLoading } = useRestoReservations();
  const upsert = useUpsertRestoReservation();
  const remove = useDeleteRestoReservation();
  const [filter, setFilter] = useState<"a_venir" | "pending" | "toutes">("a_venir");
  const [edit, setEdit] = useState<Partial<RestoReservation> | null>(null);

  const pendingCount = reservations.filter((r) => r.statut === "pending").length;
  const filtered = useMemo(() => {
    const now = Date.now();
    if (filter === "pending") return reservations.filter((r) => r.statut === "pending");
    if (filter === "toutes") return reservations;
    return reservations.filter((r) => new Date(r.date_heure).getTime() >= now && r.statut !== "annulee");
  }, [reservations, filter]);

  const confirmReservation = (r: RestoReservation, table_id?: string | null) =>
    upsert.mutateAsync({ id: r.id, nom_client: r.nom_client, date_heure: r.date_heure, nombre_couverts: r.nombre_couverts, statut: "confirmee", table_id: table_id ?? r.table_id });
  const cancel = (r: RestoReservation) =>
    upsert.mutateAsync({ id: r.id, nom_client: r.nom_client, date_heure: r.date_heure, nombre_couverts: r.nombre_couverts, statut: "annulee" });
  const markHonoree = (r: RestoReservation) =>
    upsert.mutateAsync({ id: r.id, nom_client: r.nom_client, date_heure: r.date_heure, nombre_couverts: r.nombre_couverts, statut: "honoree" });

  return (
    <div>
      <PageHeader title="Réservations" subtitle="Demandes en ligne et réservations téléphoniques"
        actions={
          <button onClick={() => setEdit({ nom_client: "", date_heure: "", nombre_couverts: 2, statut: "confirmee", source: "staff" })}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle réservation
          </button>
        }
      />
      <div className="space-y-4 p-4 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="En attente de confirmation" value={String(pendingCount)} icon={<CalendarClock className="h-5 w-5" />} accent={pendingCount > 0 ? "destructive" : "primary"} />
          <StatCard label="Total réservations" value={String(reservations.length)} icon={<Users className="h-5 w-5" />} accent="accent" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {([["a_venir", "À venir"], ["pending", "En attente"], ["toutes", "Toutes"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucune réservation.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <ReservationRow key={r.id} reservation={r} onEdit={() => setEdit(r)} onConfirm={() => confirmReservation(r)}
                onCancel={() => cancel(r)} onHonoree={() => markHonoree(r)}
                onDelete={() => { if (window.confirm(`Supprimer la réservation de ${r.nom_client} ?`)) remove.mutate(r.id); }} busy={upsert.isPending} />
            ))}
          </div>
        )}
      </div>

      {edit && (
        <ReservationDialog initial={edit} onClose={() => setEdit(null)}
          onSave={async (r) => { await upsert.mutateAsync(r); setEdit(null); }} />
      )}
    </div>
  );
}

function ReservationRow({ reservation: r, onEdit, onConfirm, onCancel, onHonoree, onDelete, busy }: {
  reservation: RestoReservation; onEdit: () => void; onConfirm: () => void; onCancel: () => void; onHonoree: () => void; onDelete: () => void; busy: boolean;
}) {
  const dt = new Date(r.date_heure);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{r.nom_client}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUT_COLOR[r.statut])}>{STATUT_LABEL[r.statut]}</span>
          {r.source === "public" && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"><Globe className="h-2.5 w-2.5" /> En ligne</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{dt.toLocaleDateString("fr-FR")} à {dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.nombre_couverts}</span>
          {r.telephone_client && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.telephone_client}</span>}
          {r.table && <span>Table {r.table.numero}</span>}
        </div>
      </button>
      <div className="flex shrink-0 gap-1.5">
        {r.statut === "pending" && (
          <button onClick={onConfirm} disabled={busy} className="flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20 disabled:opacity-40">
            <Check className="h-3.5 w-3.5" /> Confirmer
          </button>
        )}
        {(r.statut === "pending" || r.statut === "confirmee") && (
          <button onClick={onCancel} disabled={busy} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-40"><Ban className="h-4 w-4" /></button>
        )}
        {r.statut === "confirmee" && new Date(r.date_heure) <= new Date() && (
          <button onClick={onHonoree} disabled={busy} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">Honorée</button>
        )}
        <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function ReservationDialog({ initial, onClose, onSave }: {
  initial: Partial<RestoReservation>; onClose: () => void;
  onSave: (r: Partial<RestoReservation> & { nom_client: string; date_heure: string; nombre_couverts: number }) => Promise<void>;
}) {
  const { data: tables = [] } = useRestoTables();
  const toLocalInput = (iso?: string) => iso ? new Date(iso).toISOString().slice(0, 16) : "";
  const [form, setForm] = useState<Partial<RestoReservation> & { dateHeureLocal?: string }>({
    ...initial, dateHeureLocal: toLocalInput(initial.date_heure),
  });
  const [saving, setSaving] = useState(false);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  const submit = async () => {
    if (!form.nom_client?.trim() || !form.dateHeureLocal) return;
    setSaving(true);
    try {
      await onSave({
        id: initial.id, nom_client: form.nom_client.trim(), telephone_client: form.telephone_client || null,
        date_heure: new Date(form.dateHeureLocal).toISOString(), nombre_couverts: form.nombre_couverts ?? 2,
        table_id: form.table_id || null, statut: form.statut ?? "confirmee", source: form.source ?? "staff", notes: form.notes || null,
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial.id ? "Modifier la réservation" : "Nouvelle réservation"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom du client *</div>
            <input value={form.nom_client ?? ""} onChange={(e) => setForm({ ...form, nom_client: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div>
            <input value={form.telephone_client ?? ""} onChange={(e) => setForm({ ...form, telephone_client: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Couverts</div>
            <input type="number" value={form.nombre_couverts ?? 2} onChange={(e) => setForm({ ...form, nombre_couverts: Number(e.target.value) })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Date et heure *</div>
            <input type="datetime-local" value={form.dateHeureLocal ?? ""} onChange={(e) => setForm({ ...form, dateHeureLocal: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Table (optionnel)</div>
            <select value={form.table_id ?? ""} onChange={(e) => setForm({ ...form, table_id: e.target.value || null })} className={inp}>
              <option value="">Non assignée</option>
              {tables.map((t) => <option key={t.id} value={t.id}>Table {t.numero}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div>
            <textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          <div className="flex gap-2 pt-1 sm:col-span-2">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button disabled={!form.nom_client?.trim() || !form.dateHeureLocal || saving} onClick={submit}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
