import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, X, Loader2, Pencil, Trash2, BedDouble, DoorClosed, Search } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { useFormatMoney } from "@/lib/data/hooks";
import {
  useHotelRoomTypes, useUpsertHotelRoomType, useDeleteHotelRoomType,
  useHotelRooms, useUpsertHotelRoom, useDeleteHotelRoom, useSetRoomHousekeepingStatus,
  type HotelRoomType, type HotelRoom, type HousekeepingStatus,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/rooms")({
  component: RoomsPage,
});

const HK_LABEL: Record<HousekeepingStatus, string> = {
  clean: "Propre", dirty: "À nettoyer", inspected: "Inspectée", out_of_service: "Hors service",
};
const HK_COLOR: Record<HousekeepingStatus, string> = {
  clean: "bg-success/10 text-success", dirty: "bg-warning/10 text-warning-foreground",
  inspected: "bg-primary/10 text-primary", out_of_service: "bg-destructive/10 text-destructive",
};

function RoomsPage() {
  const { data: myRole } = useMyRole();
  const canEdit = myRole === "owner" || myRole === "manager";
  const canChangeHk = canEdit || myRole === "housekeeping";
  const formatMoney = useFormatMoney();

  const { data: roomTypes = [], isLoading: loadingTypes } = useHotelRoomTypes();
  const { data: rooms = [], isLoading: loadingRooms } = useHotelRooms();
  const setHk = useSetRoomHousekeepingStatus();

  const [editingType, setEditingType] = useState<HotelRoomType | "new" | null>(null);
  const [editingRoom, setEditingRoom] = useState<HotelRoom | "new" | null>(null);
  const deleteType = useDeleteHotelRoomType();
  const deleteRoom = useDeleteHotelRoom();

  const [roomQuery, setRoomQuery] = useState("");
  const filteredRooms = useMemo(() => {
    const q = roomQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) =>
      r.number.toLowerCase().includes(q) || (r.floor ?? "").toLowerCase().includes(q) || (r.room_type?.name ?? "").toLowerCase().includes(q));
  }, [rooms, roomQuery]);

  const counts = {
    clean: rooms.filter((r) => r.housekeeping_status === "clean").length,
    dirty: rooms.filter((r) => r.housekeeping_status === "dirty").length,
    out_of_service: rooms.filter((r) => r.housekeeping_status === "out_of_service").length,
  };

  return (
    <div>
      <PageHeader title="Chambres" subtitle="Types de chambres, inventaire et statut ménage"
        actions={canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditingType("new")}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
              <Plus className="h-4 w-4" /> Type de chambre
            </button>
            <button onClick={() => setEditingRoom("new")} disabled={!roomTypes.length}
              title={!roomTypes.length ? "Créez d'abord un type de chambre" : undefined}
              className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              <Plus className="h-4 w-4" /> Chambre
            </button>
          </div>
        )}
      />

      <div className="space-y-5 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Chambres propres" value={String(counts.clean)} icon={<DoorClosed className="h-5 w-5" />} accent="success" />
          <StatCard label="À nettoyer" value={String(counts.dirty)} icon={<DoorClosed className="h-5 w-5" />} accent="accent" />
          <StatCard label="Hors service" value={String(counts.out_of_service)} icon={<DoorClosed className="h-5 w-5" />} accent="destructive" />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Types de chambres</h2>
          {loadingTypes ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : roomTypes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aucun type de chambre. {canEdit && "Créez-en un pour commencer."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roomTypes.map((t) => (
                <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold"><BedDouble className="h-4 w-4 text-primary" /> {t.name}</div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditingType(t)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { if (confirm(`Supprimer le type "${t.name}" ?`)) deleteType.mutate(t.id); }}
                          className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.capacity_adults} adulte(s) · {t.capacity_children} enfant(s)</p>
                  <p className="mt-2 font-display text-lg font-bold text-primary">{formatMoney(t.base_price)} <span className="text-xs font-normal text-muted-foreground">/ nuit</span></p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Chambres</h2>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)} placeholder="Numéro, étage, type…"
                className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
            </div>
          </div>
          {loadingRooms ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aucune chambre. {canEdit && "Ajoutez-en une pour commencer."}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aucune chambre ne correspond à « {roomQuery} ».
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">N°</th><th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Étage</th><th className="px-4 py-3">Statut ménage</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-3 font-semibold">{r.number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.room_type?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.floor || "—"}</td>
                      <td className="px-4 py-3">
                        {canChangeHk ? (
                          <select value={r.housekeeping_status}
                            onChange={(e) => setHk.mutate({ id: r.id, status: e.target.value as HousekeepingStatus })}
                            className={cn("rounded-lg border-0 px-2 py-1 text-xs font-semibold", HK_COLOR[r.housekeeping_status])}>
                            {(Object.keys(HK_LABEL) as HousekeepingStatus[]).map((s) => <option key={s} value={s}>{HK_LABEL[s]}</option>)}
                          </select>
                        ) : (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", HK_COLOR[r.housekeeping_status])}>{HK_LABEL[r.housekeeping_status]}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditingRoom(r)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => { if (confirm(`Supprimer la chambre ${r.number} ?`)) deleteRoom.mutate(r.id); }}
                              className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editingType && <RoomTypeModal roomType={editingType === "new" ? null : editingType} onClose={() => setEditingType(null)} />}
      {editingRoom && <RoomModal room={editingRoom === "new" ? null : editingRoom} roomTypes={roomTypes} onClose={() => setEditingRoom(null)} />}
    </div>
  );
}

function RoomTypeModal({ roomType, onClose }: { roomType: HotelRoomType | null; onClose: () => void }) {
  const upsert = useUpsertHotelRoomType();
  const [name, setName] = useState(roomType?.name ?? "");
  const [description, setDescription] = useState(roomType?.description ?? "");
  const [capacityAdults, setCapacityAdults] = useState(roomType?.capacity_adults ?? 2);
  const [capacityChildren, setCapacityChildren] = useState(roomType?.capacity_children ?? 0);
  const [basePrice, setBasePrice] = useState(roomType?.base_price ?? 0);
  const [error, setError] = useState<string | null>(null);
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        id: roomType?.id, name: name.trim(), description: description.trim() || null,
        capacity_adults: capacityAdults, capacity_children: capacityChildren, base_price: basePrice,
      });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{roomType ? "Modifier le type" : "Nouveau type de chambre"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Chambre Standard" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adultes</span>
              <input type="number" onFocus={selectOnFocus} min={1} value={capacityAdults} onChange={(e) => setCapacityAdults(Number(e.target.value))} className={inp} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enfants</span>
              <input type="number" onFocus={selectOnFocus} min={0} value={capacityChildren} onChange={(e) => setCapacityChildren(Number(e.target.value))} className={inp} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix de base / nuit *</span>
            <input type="number" onFocus={selectOnFocus} min={0} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} className={inp} /></label>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!name.trim() || !basePrice || upsert.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomModal({ room, roomTypes, onClose }: { room: HotelRoom | null; roomTypes: HotelRoomType[]; onClose: () => void }) {
  const upsert = useUpsertHotelRoom();
  const [number, setNumber] = useState(room?.number ?? "");
  const [floor, setFloor] = useState(room?.floor ?? "");
  const [roomTypeId, setRoomTypeId] = useState(room?.room_type_id ?? roomTypes[0]?.id ?? "");
  const [notes, setNotes] = useState(room?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({ id: room?.id, number: number.trim(), floor: floor.trim() || null, room_type_id: roomTypeId, notes: notes.trim() || null });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{room ? "Modifier la chambre" : "Nouvelle chambre"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Numéro *</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} className={inp} placeholder="101" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type de chambre *</span>
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={inp}>
              {roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Étage</span>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!number.trim() || !roomTypeId || upsert.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
