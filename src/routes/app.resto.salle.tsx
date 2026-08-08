// Plan de salle ZegResto (Phase 1) — zones + tables positionnées
// librement (position_x/position_y en % du canvas, glisser-déposer pour
// owner/manager). Le statut de table (libre/occupée/réservée/nettoyage)
// est modifiable par server + owner/manager (RLS resto_tables_update) —
// cook n'a accès qu'en lecture (KDS, pas plan de salle).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Save, Trash2, Loader2, LayoutGrid, Users, CalendarPlus, History, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import {
  useRestoZones, useUpsertRestoZone, useDeleteRestoZone,
  useRestoTables, useUpsertRestoTable, useUpdateRestoTableStatut, useDeleteRestoTable,
  useUpsertRestoReservation, useRestoOrders,
  type RestoTable, type TableStatut,
} from "@/lib/data/restoHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/salle")({
  component: SallePage,
});

// #13 (Round 3 Phase C) : 3 statuts ajoutés aux 4 d'origine, tous
// sélectionnables directement depuis la fiche table (ALL_STATUSES). Au
// passage : la grille de statuts appelait auparavant cycleStatut(), qui
// calculait le statut SUIVANT celui du bouton cliqué au lieu d'appliquer
// le statut du bouton lui-même (ex. cliquer "Réservée" appliquait
// "Nettoyage") — corrigé ici en un simple setTableStatut() direct.
const STATUT_LABEL: Record<TableStatut, string> = {
  libre: "Libre", occupee: "Occupée", reservee: "Réservée", nettoyage: "Nettoyage",
  arrivee: "Arrivée", en_cours: "En cours", addition_demandee: "Addition demandée",
};
const STATUT_COLOR: Record<TableStatut, string> = {
  libre: "border-success/50 bg-success/10 text-success",
  occupee: "border-destructive/50 bg-destructive/10 text-destructive",
  reservee: "border-warning/50 bg-warning/10 text-warning-foreground",
  nettoyage: "border-muted-foreground/40 bg-muted text-muted-foreground",
  arrivee: "border-accent/50 bg-accent/10 text-accent-foreground",
  en_cours: "border-primary/50 bg-primary/10 text-primary",
  addition_demandee: "border-warning/60 bg-warning/15 text-warning-foreground",
};
const ALL_STATUSES: TableStatut[] = ["libre", "arrivee", "occupee", "en_cours", "addition_demandee", "reservee", "nettoyage"];

// #12 minuterie visuelle : "occupée depuis Xmin" a du sens pour les
// statuts de service actif, pas pour libre/nettoyage/réservée.
const TIMED_STATUSES: TableStatut[] = ["occupee", "arrivee", "en_cours", "addition_demandee"];
function elapsedMinutesSalle(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

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

  const setTableStatut = (t: RestoTable, statut: TableStatut) => {
    updateStatut.mutate({ id: t.id, statut });
    setOpenTable((o) => (o && o.id === t.id ? { ...o, statut } : o));
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
          {ALL_STATUSES.map((s) => (
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
                {TIMED_STATUSES.includes(t.statut) && <TableTimer since={t.statut_changed_at} />}
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
            <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
              <div className="text-xs text-muted-foreground">
                {openTable.capacite} couverts · statut actuel : <b>{STATUT_LABEL[openTable.statut]}</b>
                {TIMED_STATUSES.includes(openTable.statut) && <> · <TableTimer since={openTable.statut_changed_at} inline /></>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STATUSES.map((s) => (
                  <button key={s} onClick={() => setTableStatut(openTable, s)}
                    className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", openTable.statut === s ? STATUT_COLOR[s] : "border-border text-muted-foreground hover:bg-muted")}>
                    {STATUT_LABEL[s]}
                  </button>
                ))}
              </div>

              {/* #15 réservation depuis le plan de salle : formulaire
                 rapide, pré-rempli avec cette table — resto_reservations.table_id
                 existait déjà, seul le raccourci frontend manquait. */}
              <QuickReserveSection table={openTable} />

              {/* #16 historique de fréquentation par table. */}
              <TableFrequencySection tableId={openTable.id} />

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

// #12 minuterie visuelle : re-rendu chaque minute, pas de dépendance à un
// fetch réseau supplémentaire (la donnée statut_changed_at est déjà là).
function TableTimer({ since, inline }: { since: string; inline?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = elapsedMinutesSalle(since);
  const label = mins < 1 ? "à l'instant" : `${mins} min`;
  if (inline) return <span className="inline-flex items-center gap-1 font-semibold"><Clock3 className="h-3 w-3" /> depuis {label}</span>;
  return (
    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground shadow-sm">
      <Clock3 className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

// #15 réservation depuis le plan de salle — formulaire minimal, pré-rempli
// avec la table ouverte. resto_reservations.table_id existait déjà
// (migration 039) ; il ne manquait que ce raccourci.
function QuickReserveSection({ table }: { table: RestoTable }) {
  const upsertReservation = useUpsertRestoReservation();
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [dateHeure, setDateHeure] = useState("");
  const [couverts, setCouverts] = useState(table.capacite);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
        <CalendarPlus className="h-4 w-4" /> Réserver cette table
      </button>
    );
  }
  if (done) {
    return <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center text-sm font-semibold text-success">Réservation créée.</div>;
  }

  const submit = async () => {
    setError(null);
    if (!nom.trim() || !dateHeure) { setError("Nom et date/heure requis."); return; }
    try {
      await upsertReservation.mutateAsync({
        table_id: table.id, nom_client: nom.trim(), telephone_client: telephone.trim() || undefined,
        date_heure: new Date(dateHeure).toISOString(), nombre_couverts: couverts, statut: "confirmee", source: "staff",
      });
      setDone(true);
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du client" className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
      <div className="grid grid-cols-2 gap-2">
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
        <input type="number" min={1} value={couverts} onChange={(e) => setCouverts(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
      </div>
      <input type="datetime-local" value={dateHeure} onChange={(e) => setDateHeure(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold">Annuler</button>
        <button onClick={submit} disabled={upsertReservation.isPending} className="flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40">
          {upsertReservation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmer"}
        </button>
      </div>
    </div>
  );
}

// #16 historique de fréquentation par table — dérivé de resto_orders
// (déjà chargées pour toute l'organisation par la page Commandes ; ici on
// réutilise le même hook, filtré côté client par table).
function TableFrequencySection({ tableId }: { tableId: string }) {
  const { data: orders = [] } = useRestoOrders(true);
  const tableOrders = orders.filter((o) => o.table_id === tableId || o.table_ids_extra.includes(tableId));
  const last30 = tableOrders.filter((o) => Date.now() - new Date(o.created_at).getTime() < 30 * 86400000);
  const lastVisit = tableOrders[0]?.created_at;

  return (
    <div className="rounded-xl border border-border p-3 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" /> Fréquentation</div>
      <div className="flex justify-between"><span className="text-muted-foreground">Commandes (30 derniers jours)</span><span className="font-semibold">{last30.length}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Dernier passage</span><span className="font-semibold">{lastVisit ? new Date(lastVisit).toLocaleDateString("fr-FR") : "—"}</span></div>
    </div>
  );
}
