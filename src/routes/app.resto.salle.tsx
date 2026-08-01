// Plan de salle ZegResto (Phase 1) — zones + tables positionnées
// librement (position_x/position_y en % du canvas, glisser-déposer pour
// owner/manager). Le statut de table (libre/occupée/réservée/nettoyage)
// est modifiable par server + owner/manager (RLS resto_tables_update) —
// cook n'a accès qu'en lecture (KDS, pas plan de salle).
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, X, Save, Trash2, Loader2, LayoutGrid, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import {
  useRestoZones, useUpsertRestoZone, useDeleteRestoZone,
  useRestoTables, useUpsertRestoTable, useUpdateRestoTableStatut, useDeleteRestoTable,
  type RestoTable, type TableStatut,
} from "@/lib/data/restoHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/salle")({
  component: SallePage,
});

const STATUT_LABEL: Record<TableStatut, string> = { libre: "Libre", occupee: "Occupée", reservee: "Réservée", nettoyage: "Nettoyage" };
const STATUT_COLOR: Record<TableStatut, string> = {
  libre: "border-success/50 bg-success/10 text-success",
  occupee: "border-destructive/50 bg-destructive/10 text-destructive",
  reservee: "border-warning/50 bg-warning/10 text-warning-foreground",
  nettoyage: "border-muted-foreground/40 bg-muted text-muted-foreground",
};
const STATUS_CYCLE: TableStatut[] = ["libre", "occupee", "reservee", "nettoyage"];

function SallePage() {
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const { data: zones = [], isLoading: loadingZones } = useRestoZones();
  const { data: tables = [], isLoading: loadingTables } = useRestoTables();
  const upsertZone = useUpsertRestoZone();
  const deleteZone = useDeleteRestoZone();
  const upsertTable = useUpsertRestoTable();
  const updateStatut = useUpdateRestoTableStatut();
  const deleteTable = useDeleteRestoTable();

  const [zoneId, setZoneId] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState("");
  const [addingZone, setAddingZone] = useState(false);
  const [editTable, setEditTable] = useState<Partial<RestoTable> | null>(null);
  const [openTable, setOpenTable] = useState<RestoTable | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const activeZoneId = zoneId ?? zones[0]?.id ?? null;
  const zoneTables = tables.filter((t) => (activeZoneId ? t.zone_id === activeZoneId : !t.zone_id));

  const addZone = async () => {
    if (!newZoneName.trim()) return;
    const z = await upsertZone.mutateAsync({ nom: newZoneName.trim(), ordre: zones.length });
    setNewZoneName(""); setAddingZone(false);
    setZoneId((z as any).id);
  };

  const onPointerDown = (tableId: string) => (e: React.PointerEvent) => {
    if (!canManage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(tableId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(96, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(92, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    // Retour visuel immédiat par manipulation DOM directe (pas de setState
    // à chaque pixel) — la position réelle n'est persistée qu'au pointerUp.
    const el = document.getElementById(`resto-table-${dragId}`);
    if (el) { el.style.left = `${x}%`; el.style.top = `${y}%`; }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragId || !canvasRef.current) { setDragId(null); return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(96, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(92, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    const t = tables.find((tt) => tt.id === dragId);
    if (t) upsertTable.mutate({ id: t.id, numero: t.numero, capacite: t.capacite, zone_id: t.zone_id, statut: t.statut, position_x: x, position_y: y });
    setDragId(null);
  };

  const cycleStatut = (t: RestoTable) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.statut) + 1) % STATUS_CYCLE.length];
    updateStatut.mutate({ id: t.id, statut: next });
    setOpenTable((o) => (o && o.id === t.id ? { ...o, statut: next } : o));
  };

  return (
    <div>
      <PageHeader title="Salle" subtitle="Plan de salle interactif — statuts en temps réel"
        actions={canManage && (
          <button onClick={() => setEditTable({ numero: "", capacite: 2, zone_id: activeZoneId, position_x: 40, position_y: 40, statut: "libre" })}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle table
          </button>
        )}
      />

      <div className="p-4 sm:p-8">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {zones.map((z) => (
            <button key={z.id} onClick={() => setZoneId(z.id)}
              className={cn("rounded-xl border px-3 py-1.5 text-sm font-medium",
                activeZoneId === z.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {z.nom}
              {canManage && activeZoneId === z.id && (
                <span onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer la zone ${z.nom} ?`)) deleteZone.mutate(z.id); }}
                  className="ml-1.5 text-destructive/70 hover:text-destructive"><Trash2 className="inline h-3 w-3" /></span>
              )}
            </button>
          ))}
          {canManage && (addingZone ? (
            <div className="flex items-center gap-1">
              <input autoFocus value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addZone()}
                placeholder="Nom de la zone" className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
              <button onClick={addZone} className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Save className="h-3.5 w-3.5" /></button>
              <button onClick={() => setAddingZone(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingZone(true)} className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> Zone
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {STATUS_CYCLE.map((s) => (
            <span key={s} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full border", STATUT_COLOR[s])} /> {STATUT_LABEL[s]}</span>
          ))}
        </div>

        {loadingZones || loadingTables ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : zones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <LayoutGrid className="mx-auto mb-2 h-8 w-8 opacity-40" />
            {canManage ? "Créez une première zone pour commencer à placer des tables." : "Aucune zone configurée pour l'instant."}
          </div>
        ) : (
          <div ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            className="relative h-[60vh] min-h-[420px] w-full touch-none rounded-2xl border border-dashed border-border bg-card/60 bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:24px_24px]">
            {zoneTables.length === 0 && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Aucune table dans cette zone.</div>
            )}
            {zoneTables.map((t) => (
              <button key={t.id} id={`resto-table-${t.id}`} onPointerDown={onPointerDown(t.id)}
                onClick={() => { if (dragId) return; setOpenTable(t); }}
                style={{ left: `${t.position_x}%`, top: `${t.position_y}%` }}
                className={cn("absolute grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border-2 text-center shadow-sm",
                  canManage && "cursor-grab active:cursor-grabbing", STATUT_COLOR[t.statut])}>
                <span className="text-sm font-bold">{t.numero}</span>
                <span className="flex items-center gap-0.5 text-[10px]"><Users className="h-2.5 w-2.5" />{t.capacite}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {openTable && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={() => setOpenTable(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="font-display text-lg font-bold">Table {openTable.numero}</div>
              <button onClick={() => setOpenTable(null)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-5">
              <div className="text-xs text-muted-foreground">{openTable.capacite} couverts · statut actuel : <b>{STATUT_LABEL[openTable.statut]}</b></div>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_CYCLE.map((s) => (
                  <button key={s} onClick={() => cycleStatut({ ...openTable, statut: s })}
                    className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", openTable.statut === s ? STATUT_COLOR[s] : "border-border text-muted-foreground hover:bg-muted")}>
                    {STATUT_LABEL[s]}
                  </button>
                ))}
              </div>
              {canManage && (
                <div className="flex gap-2 border-t border-border pt-3">
                  <button onClick={() => { setEditTable(openTable); setOpenTable(null); }} className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold hover:bg-muted">Modifier</button>
                  <button onClick={() => { if (confirm(`Supprimer la table ${openTable.numero} ?`)) { deleteTable.mutate(openTable.id); setOpenTable(null); } }}
                    className="flex-1 rounded-xl border border-destructive/40 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Supprimer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editTable && (
        <TableDialog initial={editTable} zoneId={activeZoneId} onClose={() => setEditTable(null)}
          onSave={async (t) => { await upsertTable.mutateAsync(t); setEditTable(null); }} />
      )}
    </div>
  );
}

function TableDialog({ initial, zoneId, onClose, onSave }: {
  initial: Partial<RestoTable>; zoneId: string | null; onClose: () => void;
  onSave: (t: Partial<RestoTable> & { numero: string }) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<RestoTable>>({ zone_id: zoneId, ...initial });
  const [saving, setSaving] = useState(false);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial.id ? "Modifier la table" : "Nouvelle table"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 p-5">
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Numéro *</div>
            <input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Capacité (couverts)</div>
            <input type="number" onFocus={selectOnFocus} value={form.capacite ?? 2} onChange={(e) => setForm({ ...form, capacite: Number(e.target.value) })} className={inp} /></label>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button disabled={!form.numero?.trim() || saving}
              onClick={async () => { setSaving(true); try { await onSave(form as Partial<RestoTable> & { numero: string }); } finally { setSaving(false); } }}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
