import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, X, Loader2, Pencil, Trash2, BedDouble, DoorClosed, Search, History, CalendarRange, Clock, Wrench } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { useFormatMoney } from "@/lib/data/hooks";
import {
  useHotelRoomTypes, useUpsertHotelRoomType, useDeleteHotelRoomType,
  useHotelRooms, useUpsertHotelRoom, useDeleteHotelRoom, useSetRoomHousekeepingStatus,
  useRoomReservationHistory,
  type HotelRoomType, type HotelRoom, type HousekeepingStatus, type CustomHourlyRate,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

const RESV_STATUS_LABEL: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmée", checked_in: "En cours", checked_out: "Terminée",
  cancelled: "Annulée", no_show: "No-show",
};

// Équipements pré-suggérés (mission "mise à jour ZegHotel", item 3) — liste
// courte de suggestions courantes, filtrées par la barre de recherche ;
// libre à l'établissement d'ajouter n'importe quel équipement non listé ici
// (texte libre, hotel_room_types.amenities déjà en place avant cette phase).
const EQUIPMENT_PRESETS = [
  "Climatisation", "Ventilateur", "Chauffage", "Wifi", "Télévision", "Mini-bar",
  "Coffre-fort", "Sèche-cheveux", "Balcon", "Vue mer", "Baignoire", "Douche",
  "Bureau", "Machine à café", "Room service",
];

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
  const [historyRoom, setHistoryRoom] = useState<HotelRoom | null>(null);
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
                  {(t.hourly_rate || t.custom_hourly_rates.length > 0) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.hourly_rate ? `${formatMoney(t.hourly_rate)} / heure` : ""}
                      {t.hourly_rate && t.custom_hourly_rates.length > 0 ? " · " : ""}
                      {t.custom_hourly_rates.map((r) => `${r.label} : ${formatMoney(r.price)}`).join(", ")}
                    </p>
                  )}
                  {t.amenities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.amenities.slice(0, 4).map((a) => (
                        <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{a}</span>
                      ))}
                      {t.amenities.length > 4 && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">+{t.amenities.length - 4}</span>}
                    </div>
                  )}
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
                      <td className="px-4 py-3 font-semibold">
                        <button onClick={() => setHistoryRoom(r)} className="flex items-center gap-1.5 hover:text-primary hover:underline">
                          {r.number} <History className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
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
      {historyRoom && <RoomHistoryModal room={historyRoom} onClose={() => setHistoryRoom(null)} />}
    </div>
  );
}

// Historique des réservations d'une chambre (mission "mise à jour
// ZegHotel", Phase 2, point 3) — clic sur le numéro de chambre.
function RoomHistoryModal({ room, onClose }: { room: HotelRoom; onClose: () => void }) {
  const { data: history = [], isLoading } = useRoomReservationHistory(room.id);
  const formatMoney = useFormatMoney();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 font-display text-lg font-bold"><History className="h-5 w-5 text-primary" /> Historique — Chambre {room.number}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune réservation pour cette chambre.</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-xl border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold"><CalendarRange className="h-3.5 w-3.5 text-muted-foreground" /> {h.reservation.guest?.full_name ?? "—"}</span>
                  <span className="tabular font-bold">{formatMoney(h.rate_amount)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(h.reservation.check_in).toLocaleDateString("fr-FR")} → {new Date(h.reservation.check_out).toLocaleDateString("fr-FR")}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{RESV_STATUS_LABEL[h.reservation.status] ?? h.reservation.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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
  // Tarifs heure / heure personnalisée (mission "mise à jour ZegHotel",
  // migration 087 — à exécuter manuellement avant que ces champs persistent
  // réellement, cf. commentaire de la migration).
  const [hourlyRate, setHourlyRate] = useState(roomType?.hourly_rate ?? 0);
  const [customRates, setCustomRates] = useState<CustomHourlyRate[]>(roomType?.custom_hourly_rates ?? []);
  const [equipment, setEquipment] = useState<string[]>(roomType?.amenities ?? []);
  const [equipQuery, setEquipQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const filteredPresets = EQUIPMENT_PRESETS.filter((e) => !equipment.includes(e) && e.toLowerCase().includes(equipQuery.trim().toLowerCase()));
  const addEquipment = (label: string) => {
    const v = label.trim();
    if (!v || equipment.includes(v)) return;
    setEquipment((eq) => [...eq, v]);
    setEquipQuery("");
  };

  const addCustomRate = () => setCustomRates((r) => [...r, { label: "", hours: 1, price: 0 }]);
  const updateCustomRate = (i: number, patch: Partial<CustomHourlyRate>) =>
    setCustomRates((r) => r.map((row, j) => j === i ? { ...row, ...patch } : row));
  const removeCustomRate = (i: number) => setCustomRates((r) => r.filter((_, j) => j !== i));

  const submit = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        id: roomType?.id, name: name.trim(), description: description.trim() || null,
        capacity_adults: capacityAdults, capacity_children: capacityChildren, base_price: basePrice,
        hourly_rate: hourlyRate || null,
        custom_hourly_rates: customRates.filter((r) => r.label.trim() && r.price > 0),
        amenities: equipment,
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
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
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

          {/* Tarifs — nuitée (existant) + heure + heure personnalisée
              (mission "mise à jour ZegHotel", item 3, migration 087). */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Tarifs</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Prix / nuit *</span>
                <input type="number" onFocus={selectOnFocus} min={0} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} className={inp} /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Prix / heure</span>
                <input type="number" onFocus={selectOnFocus} min={0} value={hourlyRate || ""} onChange={(e) => setHourlyRate(Number(e.target.value))} className={inp} placeholder="Optionnel" /></label>
            </div>
            <div className="mt-2 space-y-1.5">
              <span className="block text-xs text-muted-foreground">Tarifs personnalisés (ex : forfait 2h, week-end…)</span>
              {customRates.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={r.label} onChange={(e) => updateCustomRate(i, { label: e.target.value })} placeholder="Libellé"
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                  <input type="number" onFocus={selectOnFocus} min={0} value={r.hours} onChange={(e) => updateCustomRate(i, { hours: Number(e.target.value) })}
                    placeholder="h" className="h-9 w-14 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                  <input type="number" onFocus={selectOnFocus} min={0} value={r.price} onChange={(e) => updateCustomRate(i, { price: Number(e.target.value) })}
                    placeholder="Prix" className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                  <button onClick={() => removeCustomRate(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button onClick={addCustomRate} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                <Plus className="h-3.5 w-3.5" /> Ajouter un tarif personnalisé
              </button>
            </div>
          </div>

          {/* Équipements — hotel_room_types.amenities existait déjà en base,
              seule l'interface manquait (mission "mise à jour ZegHotel"). */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Équipements</div>
            {equipment.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {equipment.map((e) => (
                  <span key={e} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {e} <button onClick={() => setEquipment((eq) => eq.filter((x) => x !== e))} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={equipQuery} onChange={(e) => setEquipQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && equipQuery.trim()) addEquipment(equipQuery); }}
                placeholder="Rechercher ou ajouter un équipement…" className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
            </div>
            {equipQuery.trim() && (
              <div className="mt-1.5 max-h-28 overflow-y-auto rounded-lg border border-border">
                {filteredPresets.map((p) => (
                  <button key={p} onClick={() => addEquipment(p)} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted">{p}</button>
                ))}
                {!EQUIPMENT_PRESETS.some((p) => p.toLowerCase() === equipQuery.trim().toLowerCase()) && (
                  <button onClick={() => addEquipment(equipQuery)} className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-primary hover:bg-muted">
                    + Ajouter « {equipQuery.trim()} »
                  </button>
                )}
              </div>
            )}
          </div>

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
