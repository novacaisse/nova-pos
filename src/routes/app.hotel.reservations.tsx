import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, User, LogIn, LogOut, Ban, CheckCircle2, Banknote, Printer,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney, useShopSettings } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import {
  useHotelReservations, useHotelRooms, useHotelRoomTypes, useHotelGuests, useUpsertHotelGuest,
  useCreateHotelReservation, useHotelReservation, useCheckInReservation, useCheckOutReservation,
  useCancelReservation, useUpdateHotelReservation, useHotelFolio, useAddFolioCharge, useAddFolioPayment,
  useCloseFolio, folioBalance, useHotelCorporateAccounts, useHotelRatePlans,
  type HotelReservationRow, type ReservationStatus, type HotelRoom, type FolioChargeKind, type HotelPaymentMethod,
  type HotelFolioDetail,
} from "@/lib/data/hotelHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/reservations")({
  component: ReservationsPage,
});

const DAYS_WINDOW = 14;
const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "En attente", confirmed: "Confirmée", checked_in: "En séjour",
  checked_out: "Terminée", cancelled: "Annulée", no_show: "No-show",
};
const STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  confirmed: "bg-primary/20 text-primary border-primary/40",
  checked_in: "bg-success/20 text-success border-success/40",
  checked_out: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
};

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }

function ReservationsPage() {
  const { data: myRole } = useMyRole();
  const canWrite = myRole === "owner" || myRole === "manager" || myRole === "front_desk";
  const [rangeStart, setRangeStart] = useState(() => toISO(new Date()));
  const rangeEnd = addDays(rangeStart, DAYS_WINDOW);
  const days = useMemo(() => Array.from({ length: DAYS_WINDOW }, (_, i) => addDays(rangeStart, i)), [rangeStart]);

  const { data: rooms = [] } = useHotelRooms();
  const { data: reservations = [], isLoading } = useHotelReservations(rangeStart, rangeEnd);

  const [creating, setCreating] = useState<{ roomId?: string; date?: string } | null>(null);
  const [openReservationId, setOpenReservationId] = useState<string | null>(null);

  // Réservations actives par chambre (cancelled/no_show ne bloquent plus le planning).
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, { start: string; end: string; status: ReservationStatus; reservationId: string; guestName: string }[]>();
    for (const res of reservations) {
      for (const rr of res.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        const arr = map.get(rr.room_id) ?? [];
        arr.push({ start: rr.check_in, end: rr.check_out, status: rr.status, reservationId: res.id, guestName: res.guest?.full_name ?? "—" });
        map.set(rr.room_id, arr);
      }
    }
    return map;
  }, [reservations]);

  return (
    <div>
      <PageHeader title="Réservations" subtitle="Planning des chambres"
        actions={canWrite && (
          <button onClick={() => setCreating({})}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle réservation
          </button>
        )}
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setRangeStart(addDays(rangeStart, -7))}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <div className="text-sm font-semibold">
            {new Date(rangeStart + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            {" → "}
            {new Date(addDays(rangeStart, DAYS_WINDOW - 1) + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
          </div>
          <button onClick={() => setRangeStart(addDays(rangeStart, 7))}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucune chambre configurée. Rendez-vous dans « Chambres » pour en créer.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[130px] border-b border-r border-border bg-card px-3 py-2 text-left font-semibold">Chambre</th>
                  {days.map((d) => (
                    <th key={d} className="min-w-[64px] border-b border-border px-1 py-2 text-center font-medium text-muted-foreground">
                      {new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <RoomRow key={room.id} room={room} days={days} bookings={bookingsByRoom.get(room.id) ?? []}
                    canWrite={canWrite}
                    onEmptyClick={(date) => setCreating({ roomId: room.id, date })}
                    onBookingClick={(reservationId) => setOpenReservationId(reservationId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateReservationModal defaultRoomId={creating.roomId} defaultDate={creating.date ?? rangeStart}
          onClose={() => setCreating(null)} onCreated={(id) => { setCreating(null); setOpenReservationId(id); }} />
      )}
      {openReservationId && (
        <ReservationDrawer reservationId={openReservationId} canWrite={canWrite} onClose={() => setOpenReservationId(null)} />
      )}
    </div>
  );
}

function RoomRow({ room, days, bookings, canWrite, onEmptyClick, onBookingClick }: {
  room: HotelRoom & { room_type?: any }; days: string[];
  bookings: { start: string; end: string; status: ReservationStatus; reservationId: string; guestName: string }[];
  canWrite: boolean;
  onEmptyClick: (date: string) => void;
  onBookingClick: (reservationId: string) => void;
}) {
  const covers = (day: string) => bookings.find((b) => day >= b.start && day < b.end);

  const cells: React.ReactNode[] = [];
  let i = 0;
  while (i < days.length) {
    const b = covers(days[i]);
    if (!b) {
      const date = days[i];
      cells.push(
        <td key={date} className={cn("border-b border-border/60 px-0.5 py-1", canWrite && "cursor-pointer hover:bg-muted/60")}
          onClick={() => canWrite && onEmptyClick(date)}>
          <div className="h-7 rounded-md" />
        </td>,
      );
      i += 1;
    } else {
      let span = 1;
      while (i + span < days.length && covers(days[i + span])?.reservationId === b.reservationId) span++;
      cells.push(
        <td key={days[i]} colSpan={span} className="border-b border-border/60 px-0.5 py-1">
          <button onClick={() => onBookingClick(b.reservationId)}
            className={cn("flex h-7 w-full items-center justify-center truncate rounded-md border px-1.5 text-[11px] font-semibold", STATUS_COLOR[b.status])}
            title={`${b.guestName} — ${STATUS_LABEL[b.status]}`}>
            {b.guestName}
          </button>
        </td>,
      );
      i += span;
    }
  }

  return (
    <tr>
      <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 font-semibold">
        {room.number}
        <div className="text-[10px] font-normal text-muted-foreground">{room.room_type?.name ?? ""}</div>
      </td>
      {cells}
    </tr>
  );
}

// ============ CRÉATION ============
function CreateReservationModal({ defaultRoomId, defaultDate, onClose, onCreated }: {
  defaultRoomId?: string; defaultDate: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [checkIn, setCheckIn] = useState(defaultDate);
  const [checkOut, setCheckOut] = useState(addDays(defaultDate, 1));
  const { data: roomTypes = [] } = useHotelRoomTypes();
  const { data: rooms = [] } = useHotelRooms();
  const { data: overlapping = [] } = useHotelReservations(checkIn, checkOut);
  const { data: corporateAccounts = [] } = useHotelCorporateAccounts();
  const { data: ratePlans = [] } = useHotelRatePlans();

  const bookedRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const res of overlapping) for (const rr of res.reservation_rooms) {
      if (rr.status === "cancelled" || rr.status === "no_show") continue;
      if (checkIn < rr.check_out && checkOut > rr.check_in) set.add(rr.room_id);
    }
    return set;
  }, [overlapping, checkIn, checkOut]);

  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(defaultRoomId ? [defaultRoomId] : []);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [channel, setChannel] = useState("direct");
  const [ratePlanId, setRatePlanId] = useState("");
  const [corporateId, setCorporateId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: guestResults = [] } = useHotelGuests(guestSearch);
  const upsertGuest = useUpsertHotelGuest();
  const create = useCreateHotelReservation();

  const nights = Math.max(1, (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  const roomOf = (id: string) => rooms.find((r) => r.id === id);
  const rateFor = (id: string) => roomOf(id)?.room_type?.base_price ?? 0;
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});

  const toggleRoom = (id: string) => setSelectedRoomIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    setError(null);
    try {
      let gId = guestId;
      if (!gId) {
        if (!newGuestName.trim()) throw new Error("Sélectionnez ou créez un client.");
        const g = await upsertGuest.mutateAsync({ full_name: newGuestName.trim(), phone: newGuestPhone.trim() || undefined });
        gId = g.id;
      }
      if (!selectedRoomIds.length) throw new Error("Sélectionnez au moins une chambre.");
      const reservation = await create.mutateAsync({
        guest_id: gId, check_in: checkIn, check_out: checkOut,
        rate_plan_id: ratePlanId || null, corporate_account_id: corporateId || null,
        channel, adults, children, notes: notes.trim() || undefined,
        rooms: selectedRoomIds.map((id) => ({ room_id: id, rate_amount: (rateOverrides[id] ?? rateFor(id)) * nights })),
      });
      onCreated(reservation.id);
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Nouvelle réservation</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrivée *</span>
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inp} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Départ *</span>
              <input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className={inp} /></label>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client *</span>
            {guestId ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /> {guestResults.find((g) => g.id === guestId)?.full_name ?? "Client sélectionné"}</span>
                <button onClick={() => setGuestId(null)} className="text-xs text-muted-foreground hover:text-foreground">Changer</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} placeholder="Rechercher un client existant…" className={inp} />
                {guestSearch.trim() && guestResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-xl border border-border">
                    {guestResults.map((g) => (
                      <button key={g.id} onClick={() => { setGuestId(g.id); setGuestSearch(""); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {g.full_name} {g.phone && <span className="text-xs text-muted-foreground">— {g.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input value={newGuestName} onChange={(e) => setNewGuestName(e.target.value)} placeholder="Nouveau client : nom" className={inp} />
                  <input value={newGuestPhone} onChange={(e) => setNewGuestPhone(e.target.value)} placeholder="Téléphone" className={inp} />
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chambres * ({nights} nuit{nights > 1 ? "s" : ""})</span>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {rooms.map((r) => {
                const unavailable = bookedRoomIds.has(r.id) && !selectedRoomIds.includes(r.id);
                return (
                  <label key={r.id} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm", unavailable && "opacity-40")}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" disabled={unavailable} checked={selectedRoomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                      {r.number} — {r.room_type?.name} {unavailable && <span className="text-xs text-destructive">(indisponible)</span>}
                    </span>
                    {selectedRoomIds.includes(r.id) && (
                      <input type="number" className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={rateOverrides[r.id] ?? rateFor(r.id)}
                        onChange={(e) => setRateOverrides((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adultes</span>
              <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className={inp} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enfants</span>
              <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} className={inp} /></label>
          </div>
          {ratePlans.length > 0 && (
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tarif</span>
              <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className={inp}>
                <option value="">Standard</option>
                {ratePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          )}
          {corporateAccounts.length > 0 && (
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compte entreprise</span>
              <select value={corporateId} onChange={(e) => setCorporateId(e.target.value)} className={inp}>
                <option value="">Aucun</option>
                {corporateAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} /></label>

          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={create.isPending || upsertGuest.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {(create.isPending || upsertGuest.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Créer la réservation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ DÉTAIL / FOLIO ============
// Facture au format SYSCOHADA (zone OHADA) : désignation/quantité/PU/montant,
// mentions RCCM/IFU dans l'en-tête (renderA4Document), numérotée sur la
// référence de la réservation — même gabarit A4 que les devis ZegCaisse
// (src/lib/printDoc.ts), pas de format ad-hoc dédié à l'hôtel.
function printHotelInvoice(
  reservation: HotelReservationRow, folio: HotelFolioDetail,
  org: { name: string; logo_url: string | null } | null,
  settings: { data: { address?: string; phone?: string; ifu?: string } } | null | undefined,
  formatMoney: (n: number) => string,
) {
  const nights = Math.max(1, (new Date(reservation.check_out).getTime() - new Date(reservation.check_in).getTime()) / 86400000);
  const roomRows = reservation.reservation_rooms
    .filter((rr) => rr.status !== "cancelled" && rr.status !== "no_show")
    .map((rr) => `<tr><td>Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""} (${nights} nuit${nights > 1 ? "s" : ""})</td><td class="num">1</td><td class="num">${formatMoney(rr.rate_amount)}</td><td class="num">${formatMoney(rr.rate_amount)}</td></tr>`)
    .join("");
  const chargeRows = folio.charges
    .map((c) => `<tr><td>${c.description}</td><td class="num">${c.quantity}</td><td class="num">${formatMoney(c.amount)}</td><td class="num">${formatMoney(c.amount * c.quantity)}</td></tr>`)
    .join("");
  const roomTotal = reservation.reservation_rooms
    .filter((rr) => rr.status !== "cancelled" && rr.status !== "no_show")
    .reduce((s, rr) => s + rr.rate_amount, 0);
  const chargesTotal = folio.charges.reduce((s, c) => s + c.amount * c.quantity, 0);
  const grandTotal = roomTotal + chargesTotal;
  const paid = folio.payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const balance = grandTotal - paid;

  const bodyHtml = `
    <div class="doc-parties">
      <div class="block"><h2>Client</h2><div class="name">${reservation.guest?.full_name ?? "—"}</div></div>
      <div class="block" style="text-align:right"><h2>Séjour</h2><div class="name">${new Date(reservation.check_in).toLocaleDateString("fr-FR")} → ${new Date(reservation.check_out).toLocaleDateString("fr-FR")}</div></div>
    </div>
    <table class="doc-table">
      <thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Montant</th></tr></thead>
      <tbody>${roomRows}${chargeRows}</tbody>
    </table>
    <div class="doc-totals">
      <div class="row total"><span>Total facture</span><span>${formatMoney(grandTotal)}</span></div>
      ${paid > 0 ? `<div class="row"><span>Réglé</span><span>-${formatMoney(paid)}</span></div>` : ""}
      <div class="row total"><span>Solde dû</span><span>${formatMoney(balance)}</span></div>
    </div>`;

  const html = renderA4Document({
    docTitle: "Facture",
    docNumber: reservation.id.slice(0, 8).toUpperCase(),
    docDate: new Date().toLocaleDateString("fr-FR"),
    shop: {
      shopName: org?.name ?? "Organisation",
      logoUrl: org?.logo_url,
      address: settings?.data.address,
      phone: settings?.data.phone,
      ifu: settings?.data.ifu,
    },
    bodyHtml,
    footerHtml: "Facture générée par ZegHotel.",
  });
  openPrintWindow(html, { width: 900, height: 700 });
}

function ReservationDrawer({ reservationId, canWrite, onClose }: { reservationId: string; canWrite: boolean; onClose: () => void }) {
  const { data: reservation, isLoading } = useHotelReservation(reservationId);
  const formatMoney = useFormatMoney();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const checkIn = useCheckInReservation();
  const checkOut = useCheckOutReservation();
  const cancel = useCancelReservation();
  const update = useUpdateHotelReservation();
  const { data: folio } = useHotelFolio(reservationId);
  const addCharge = useAddFolioCharge();
  const addPayment = useAddFolioPayment();
  const closeFolio = useCloseFolio();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<any>) => {
    setError(null); setBusy(true);
    try { await fn(); } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); } finally { setBusy(false); }
  };

  const [chargeKind, setChargeKind] = useState<FolioChargeKind>("extra");
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState(0);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<HotelPaymentMethod>("cash");

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 24 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l border-border bg-card shadow-elegant">
        {isLoading || !reservation ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <header className="flex items-start justify-between border-b border-border p-5">
              <div>
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /><h2 className="font-display text-lg font-bold">{reservation.guest?.full_name ?? "—"}</h2></div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {new Date(reservation.check_in).toLocaleDateString("fr-FR")} → {new Date(reservation.check_out).toLocaleDateString("fr-FR")}
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[reservation.status])}>{STATUS_LABEL[reservation.status]}</span>
                </div>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-border hover:bg-muted"><X className="h-4 w-4" /></button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chambres</div>
                <div className="space-y-1.5">
                  {reservation.reservation_rooms.map((rr) => (
                    <div key={rr.id} className="flex items-center justify-between rounded-xl border border-border/60 p-2.5 text-sm">
                      <span>{rr.room?.number} — {rr.room?.room_type?.name ?? ""}</span>
                      <span className="font-semibold">{formatMoney(rr.rate_amount)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

              {canWrite && reservation.status !== "cancelled" && reservation.status !== "checked_out" && (
                <section className="grid grid-cols-2 gap-2">
                  {reservation.status === "pending" && (
                    <button disabled={busy} onClick={() => run(() => update.mutateAsync({ id: reservation.id, status: "confirmed" }))}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmer
                    </button>
                  )}
                  {(reservation.status === "pending" || reservation.status === "confirmed") && (
                    <button disabled={busy} onClick={() => run(() => checkIn(reservation.id))}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-3 py-2.5 text-xs font-semibold text-success hover:bg-success/20">
                      <LogIn className="h-3.5 w-3.5" /> Check-in
                    </button>
                  )}
                  {reservation.status === "checked_in" && (
                    <button disabled={busy} onClick={() => run(() => checkOut.mutateAsync(reservation.id))}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold hover:bg-muted">
                      <LogOut className="h-3.5 w-3.5" /> Check-out
                    </button>
                  )}
                  <button disabled={busy} onClick={() => { if (confirm("Annuler cette réservation ?")) run(() => cancel(reservation.id)); }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20">
                    <Ban className="h-3.5 w-3.5" /> Annuler
                  </button>
                </section>
              )}

              {folio && (
                <section>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Note (folio)</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => printHotelInvoice(reservation, folio, currentOrganization, settings, formatMoney)}
                        className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold normal-case text-foreground hover:bg-muted">
                        <Printer className="h-3 w-3" /> Facture PDF
                      </button>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", folio.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                        {folio.status === "open" ? "Ouverte" : "Clôturée"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {folio.charges.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{c.description}</span><span>{formatMoney(c.amount * c.quantity)}</span></div>
                    ))}
                    {folio.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm text-success"><span>Paiement ({p.method})</span><span>- {formatMoney(p.amount)}</span></div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
                    <span>Solde</span><span>{formatMoney(folioBalance(folio))}</span>
                  </div>

                  {canWrite && folio.status === "open" && (
                    <div className="mt-4 space-y-3">
                      <div className="flex gap-2">
                        <select value={chargeKind} onChange={(e) => setChargeKind(e.target.value as FolioChargeKind)}
                          className="rounded-xl border border-border bg-background px-2 py-2 text-xs">
                          <option value="extra">Extra</option><option value="penalty">Pénalité</option><option value="tax">Taxe</option><option value="discount">Remise</option>
                        </select>
                        <input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} placeholder="Description" className="flex-1 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                        <input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))} className="w-24 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                        <button disabled={busy || !chargeDesc.trim() || !chargeAmount}
                          onClick={() => run(async () => { await addCharge.mutateAsync({ folio_id: folio.id, kind: chargeKind, description: chargeDesc.trim(), amount: chargeAmount }); setChargeDesc(""); setChargeAmount(0); })}
                          className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">Ajouter</button>
                      </div>
                      <div className="flex gap-2">
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as HotelPaymentMethod)}
                          className="rounded-xl border border-border bg-background px-2 py-2 text-xs">
                          <option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="card">Carte</option><option value="bank_transfer">Virement</option>
                        </select>
                        <input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} placeholder="Montant" className="flex-1 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                        <button disabled={busy || !payAmount}
                          onClick={() => run(async () => { await addPayment.mutateAsync({ folio_id: folio.id, amount: payAmount, method: payMethod }); setPayAmount(0); })}
                          className="flex items-center gap-1 rounded-xl bg-success/10 px-3 text-xs font-semibold text-success disabled:opacity-40"><Banknote className="h-3.5 w-3.5" /> Encaisser</button>
                      </div>
                      {reservation.status === "checked_out" && (
                        <button disabled={busy} onClick={() => run(() => closeFolio.mutateAsync(folio.id))}
                          className="w-full rounded-xl border border-border bg-card py-2 text-xs font-semibold hover:bg-muted">Clôturer la note</button>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </motion.aside>
    </>
  );
}
