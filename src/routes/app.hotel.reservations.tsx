import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, User, LogIn, LogOut, Ban, CheckCircle2, Banknote, Printer, RotateCcw,
  Search, CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useMyRole, useFormatMoney, useShopSettings } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useReadOnlyMode } from "@/lib/auth/useReadOnlyMode";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import {
  useHotelReservations, useHotelRooms, useHotelRoomTypes, useHotelGuests, useUpsertHotelGuest,
  useCreateHotelReservation, useHotelReservation, useCheckInReservation, useCheckOutReservation,
  useCancelReservation, useUpdateHotelReservation, useHotelFolio, useAddFolioCharge, useAddFolioPayment,
  useCloseFolio, folioBalance, useHotelCorporateAccounts, useHotelRatePlans, useHotelSeasonalRates,
  useSearchHotelReservations,
  type HotelReservationRow, type ReservationStatus, type HotelRoom, type FolioChargeKind, type HotelPaymentMethod,
  type HotelFolioDetail, type HotelRoomType, type HotelSeasonalRate, type HotelRatePlan,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";
import { MoneyFusionPayButton } from "@/components/app/MoneyFusionPayButton";

// Aperçu du tarif définitif (migration 027) : tarif saisonnier (s'il y en a
// un qui s'applique cette nuit-là) remplace base_price, puis le % de la
// formule tarifaire s'applique sur le total du séjour — même règle que
// hotel_compute_room_rate() côté serveur, qui reste la source de vérité
// appliquée à la création si la réception ne saisit pas de prix manuel.
function estimateRoomRate(
  roomTypeId: string, checkIn: string, checkOut: string, ratePlanId: string,
  roomTypes: HotelRoomType[], seasonalRates: HotelSeasonalRate[], ratePlans: HotelRatePlan[],
) {
  const roomType = roomTypes.find((t) => t.id === roomTypeId);
  const base = roomType?.base_price ?? 0;
  const plan = ratePlanId ? ratePlans.find((p) => p.id === ratePlanId) : undefined;
  const adjustmentPct = plan?.price_adjustment_pct ?? 0;

  let total = 0;
  const day = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  while (day < end) {
    const iso = day.toISOString().slice(0, 10);
    const dow = day.getDay();
    const matching = seasonalRates.filter((s) =>
      s.room_type_id === roomTypeId && iso >= s.start_date && iso <= s.end_date
      && (!s.days_of_week || s.days_of_week.includes(dow)));
    const latest = matching.length ? matching.reduce((a, b) => (a.start_date > b.start_date ? a : b)) : undefined;
    total += latest?.price_override ?? base;
    day.setDate(day.getDate() + 1);
  }
  return Math.round(total * (1 + adjustmentPct / 100) * 100) / 100;
}

export const Route = createFileRoute("/app/hotel/reservations")({
  // ?openCreate=1 : ouvre directement le formulaire de nouvelle réservation
  // — utilisé par le raccourci "Nouvelle réservation" du header (app.tsx),
  // même mécanique que ?openAdd sur /app/parametres.
  validateSearch: (search: Record<string, unknown>): { openCreate?: boolean } => ({
    openCreate: search.openCreate === true || search.openCreate === "1" ? true : undefined,
  }),
  component: ReservationsPage,
});

const DAYS_WINDOW = 14;
const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "En attente", confirmed: "Confirmée", checked_in: "En séjour",
  checked_out: "Terminée", cancelled: "Annulée", no_show: "No-show",
};
// Palette élargie (mission "mise à jour ZegHotel", Phase 1, "plus de
// couleurs sur le calendrier afin de mieux se retrouver") — cancelled et
// no_show partageaient la même couleur jusqu'ici, impossible à distinguer
// d'un coup d'œil sur le planning ; cancelled devient neutre/barré (rien
// à faire, la case est libre) tandis que no_show reste un vrai signal
// d'alerte (client attendu qui n'est jamais venu, chambre bloquée pour
// rien) — accent distinct (accent/warning) pour ne jamais confondre les 6
// statuts entre eux.
const STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  confirmed: "bg-primary/20 text-primary border-primary/40",
  checked_in: "bg-success/20 text-success border-success/40",
  checked_out: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted/60 text-muted-foreground border-border line-through",
  no_show: "bg-destructive/20 text-destructive border-destructive/50",
};

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }

function ReservationsPage() {
  const { openCreate } = Route.useSearch();
  const { data: myRole } = useMyRole();
  const { readOnly } = useReadOnlyMode();
  // Essai expiré (audit ZegOS Phase 1, LOT C) : plus aucune création/action
  // d'écriture sur les réservations tant que l'organisation est en lecture
  // seule — le bandeau global (TrialBanner, app.tsx) explique la situation.
  const canWrite = (myRole === "owner" || myRole === "manager" || myRole === "front_desk") && !readOnly;
  const [rangeStart, setRangeStart] = useState(() => toISO(new Date()));
  const rangeEnd = addDays(rangeStart, DAYS_WINDOW);
  const days = useMemo(() => Array.from({ length: DAYS_WINDOW }, (_, i) => addDays(rangeStart, i)), [rangeStart]);

  const { data: rooms = [] } = useHotelRooms();
  const { data: reservations = [], isLoading } = useHotelReservations(rangeStart, rangeEnd);

  const [creating, setCreating] = useState<{ roomId?: string; date?: string } | null>(null);
  const [openReservationId, setOpenReservationId] = useState<string | null>(null);
  const [showTodayList, setShowTodayList] = useState(false);

  // Recherche rapide (Phase 1) : ouvre directement la fiche réservation
  // trouvée, indépendamment de la fenêtre de 14 jours affichée par le
  // calendrier — voir useSearchHotelReservations.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: searchResults = [] } = useSearchHotelReservations(searchQuery);

  useEffect(() => {
    if (openCreate && canWrite) setCreating({});
  }, [openCreate, canWrite]);

  // Réservations actives par chambre (cancelled/no_show ne bloquent plus le planning).
  // Horaire (check_in = check_out) : la case du jour ne s'affiche pas si on
  // compare directement les dates (même piège que la contrainte anti-
  // chevauchement en base, cf. schema.sql) — on étend "end" d'un jour pour
  // que la réservation occupe sa journée dans la grille, comme greatest()
  // côté SQL.
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, { start: string; end: string; status: ReservationStatus; reservationId: string; guestName: string; isHourly: boolean; checkInAt: string | null; checkOutAt: string | null }[]>();
    for (const res of reservations) {
      for (const rr of res.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        const isHourly = rr.billing_unit === "hour";
        const arr = map.get(rr.room_id) ?? [];
        arr.push({
          start: rr.check_in, end: isHourly ? addDays(rr.check_in, 1) : rr.check_out, status: rr.status,
          reservationId: res.id, guestName: res.guest?.full_name ?? "—", isHourly,
          checkInAt: rr.check_in_at, checkOutAt: rr.check_out_at,
        });
        map.set(rr.room_id, arr);
      }
    }
    return map;
  }, [reservations]);

  return (
    <div>
      <PageHeader title="Réservations" subtitle="Planning des chambres"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTodayList(true)}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <CalendarDays className="h-4 w-4" /> Réservations du jour
            </button>
            {canWrite && (
              <button onClick={() => setCreating({})}
                className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
                <Plus className="h-4 w-4" /> Nouvelle réservation
              </button>
            )}
          </div>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setRangeStart(addDays(rangeStart, -7))}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-[180px] text-center text-sm font-semibold">
              {new Date(rangeStart + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              {" → "}
              {new Date(addDays(rangeStart, DAYS_WINDOW - 1) + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <button onClick={() => setRangeStart(addDays(rangeStart, 7))}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>

          <Popover open={searchOpen && searchQuery.trim().length >= 2}>
            <PopoverAnchor asChild>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); setSearchOpen(false); } }}
                  placeholder="Rechercher client, téléphone, chambre…"
                  className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            </PopoverAnchor>
            <PopoverContent align="end" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()}
              className="max-h-80 w-[min(360px,90vw)] overflow-y-auto p-1.5">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Aucune réservation pour « {searchQuery} »</div>
              ) : (
                searchResults.map((r) => (
                  <button key={r.id} type="button"
                    onMouseDown={() => { setOpenReservationId(r.id); setSearchQuery(""); setSearchOpen(false); }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.guest?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.reservation_rooms.map((rr) => rr.room?.number).filter(Boolean).join(", ") || "—"} · {new Date(r.check_in).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span>
                  </button>
                ))
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(STATUS_LABEL) as ReservationStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full border", STATUS_COLOR[s])} />
              {STATUS_LABEL[s]}
            </span>
          ))}
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
      {showTodayList && (
        <TodayReservationsDialog onClose={() => setShowTodayList(false)} onOpenReservation={(id) => { setShowTodayList(false); setOpenReservationId(id); }} />
      )}
    </div>
  );
}

// Liste imprimable des réservations du jour (mission "mise à jour
// ZegHotel", Phase 1) — arrivées, départs et séjours en cours pour
// aujourd'hui, réutilise useHotelReservations (rangeStart=rangeEnd=
// aujourd'hui couvre déjà les trois cas grâce au filtre existant) et le
// même gabarit A4 que printHotelInvoice/printReservationConfirmation.
function TodayReservationsDialog({ onClose, onOpenReservation }: { onClose: () => void; onOpenReservation: (id: string) => void }) {
  const today = toISO(new Date());
  const { data: reservations = [], isLoading } = useHotelReservations(today, addDays(today, 1));
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();

  const printList = () => {
    const rows = reservations.map((r) => {
      const roomLabel = r.reservation_rooms.map((rr) => rr.room?.number).filter(Boolean).join(", ") || "—";
      return `<tr>
        <td>${r.guest?.full_name ?? "—"}</td>
        <td>${roomLabel}</td>
        <td>${new Date(r.check_in).toLocaleDateString("fr-FR")}</td>
        <td>${new Date(r.check_out).toLocaleDateString("fr-FR")}</td>
        <td>${STATUS_LABEL[r.status]}</td>
      </tr>`;
    }).join("");
    const bodyHtml = `
      <table class="doc-table">
        <thead><tr><th>Client</th><th>Chambre(s)</th><th>Arrivée</th><th>Départ</th><th>Statut</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">Aucune réservation aujourd'hui.</td></tr>`}</tbody>
      </table>`;
    const html = renderA4Document({
      docTitle: "Réservations du jour",
      docDate: new Date(today + "T00:00:00").toLocaleDateString("fr-FR"),
      shop: {
        shopName: currentOrganization?.name ?? "Organisation",
        logoUrl: currentOrganization?.logo_url,
        address: settings?.data.address, phone: settings?.data.phone, ifu: settings?.data.ifu,
      },
      bodyHtml,
      footerHtml: "Généré par ZegHotel.",
    });
    openPrintWindow(html, { width: 900, height: 700 });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-display text-lg font-bold">Réservations du jour</div>
            <div className="text-xs text-muted-foreground">{new Date(today + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={printList} disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
              <Printer className="h-3.5 w-3.5" /> PDF / Imprimer
            </button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : reservations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune réservation aujourd'hui.</div>
          ) : (
            <div className="space-y-1.5">
              {reservations.map((r) => (
                <button key={r.id} onClick={() => onOpenReservation(r.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border p-3 text-left text-sm hover:bg-muted">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.guest?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.reservation_rooms.map((rr) => rr.room?.number).filter(Boolean).join(", ") || "—"}
                      {" · "}{new Date(r.check_in).toLocaleDateString("fr-FR")} → {new Date(r.check_out).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RoomRow({ room, days, bookings, canWrite, onEmptyClick, onBookingClick }: {
  room: HotelRoom & { room_type?: any }; days: string[];
  bookings: { start: string; end: string; status: ReservationStatus; reservationId: string; guestName: string; isHourly: boolean; checkInAt: string | null; checkOutAt: string | null }[];
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
      const hourLabel = b.isHourly && b.checkInAt && b.checkOutAt
        ? `${new Date(b.checkInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}–${new Date(b.checkOutAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        : null;
      cells.push(
        <td key={days[i]} colSpan={span} className="border-b border-border/60 px-0.5 py-1">
          <button onClick={() => onBookingClick(b.reservationId)}
            className={cn("flex h-7 w-full items-center justify-center truncate rounded-md border px-1.5 text-[11px] font-semibold", STATUS_COLOR[b.status])}
            title={`${b.guestName} — ${STATUS_LABEL[b.status]}${hourLabel ? ` — ${hourLabel}` : ""}`}>
            {hourLabel ? `${hourLabel} · ${b.guestName}` : b.guestName}
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
  const { data: corporateAccounts = [] } = useHotelCorporateAccounts();
  const { data: ratePlans = [] } = useHotelRatePlans();
  const { data: seasonalRates = [] } = useHotelSeasonalRates();
  const [ratePlanId, setRatePlanId] = useState("");

  // Nuitée ET horaire (ZegHotel Phase 1) : billing_unit porté par la
  // formule tarifaire choisie — "Standard" (aucune formule) reste toujours
  // nuitée. Un seul jour calendaire pour une réservation horaire ;
  // checkOut n'est alors plus piloté par l'utilisateur (forcé = checkIn).
  const selectedRatePlan = ratePlans.find((p) => p.id === ratePlanId);
  const isHourly = selectedRatePlan?.billing_unit === "hour";
  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("16:00");
  useEffect(() => { if (isHourly && checkOut !== checkIn) setCheckOut(checkIn); }, [isHourly, checkIn, checkOut]);
  const checkInAt = isHourly ? `${checkIn}T${checkInTime}:00` : null;
  const checkOutAt = isHourly ? `${checkIn}T${checkOutTime}:00` : null;
  const hourlyHours = isHourly && checkOutAt && checkInAt
    ? Math.max(1, Math.ceil((new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 3_600_000))
    : 0;
  // Préréglages 1h/2h/5h (mission "Round 2 ZegHotel", item 2) : déplace
  // uniquement l'heure de départ, l'heure d'arrivée reste éditable
  // librement au-dessus — un simple raccourci sur checkOutTime.
  const applyHourlyPreset = (hours: number) => {
    const [h, m] = checkInTime.split(":").map(Number);
    const total = h * 60 + m + hours * 60;
    const outH = Math.floor(total / 60) % 24;
    const outM = total % 60;
    setCheckOutTime(`${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`);
  };

  // Fenêtre de recherche des chevauchements : pour une réservation horaire,
  // checkOut === checkIn (forcé ci-dessus), donc interroger avec cette même
  // borne raterait les réservations qui démarrent ce jour-là (cf. hotelHooks
  // useHotelReservations, filtre check_in < rangeEnd) — on étend d'un jour,
  // même trick que le greatest() de la contrainte SQL.
  const overlapRangeEnd = checkOut > checkIn ? checkOut : addDays(checkIn, 1);
  const { data: overlapping = [] } = useHotelReservations(checkIn, overlapRangeEnd);

  const bookedRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const res of overlapping) for (const rr of res.reservation_rooms) {
      if (rr.status === "cancelled" || rr.status === "no_show") continue;
      const rrEnd = rr.check_out > rr.check_in ? rr.check_out : addDays(rr.check_in, 1);
      const dateOverlap = checkIn < rrEnd && overlapRangeEnd > rr.check_in;
      if (!dateOverlap) continue;
      // Chevauchement date à date confirmé — si les deux réservations sont
      // horaires le même jour, encore falloir que les créneaux se croisent
      // (deux passages horaires dans la même journée peuvent coexister).
      if (isHourly && rr.billing_unit === "hour" && rr.check_in === checkIn && checkInAt && checkOutAt && rr.check_in_at && rr.check_out_at) {
        const timeOverlap = checkInAt < rr.check_out_at && checkOutAt > rr.check_in_at;
        if (!timeOverlap) continue;
      }
      set.add(rr.room_id);
    }
    return set;
  }, [overlapping, checkIn, overlapRangeEnd, isHourly, checkInAt, checkOutAt]);

  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(defaultRoomId ? [defaultRoomId] : []);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [selectedGuestName, setSelectedGuestName] = useState<string | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  // Champs complets (mission "mise à jour ZegHotel", Phase 2, point 2) —
  // avant ce correctif, la création rapide n'exposait que nom/téléphone/
  // email alors que hotel_guests a déjà toutes ces colonnes (CNI/ville via
  // adresse/date de naissance, migration 028) : la réception devait
  // rouvrir la fiche client depuis /app/hotel/clients après coup pour les
  // compléter. Repliés sous "Plus d'informations" pour ne pas alourdir le
  // cas courant (juste nom + téléphone).
  const [newGuestMore, setNewGuestMore] = useState(false);
  const [newGuestDocType, setNewGuestDocType] = useState("");
  const [newGuestDocNumber, setNewGuestDocNumber] = useState("");
  const [newGuestAddress, setNewGuestAddress] = useState("");
  const [newGuestDob, setNewGuestDob] = useState("");
  const [newGuestNationality, setNewGuestNationality] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [channel, setChannel] = useState("direct");
  const [corporateId, setCorporateId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: guestResults = [] } = useHotelGuests(guestSearch);
  const upsertGuest = useUpsertHotelGuest();
  const create = useCreateHotelReservation();

  const nights = Math.max(1, (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  const roomOf = (id: string) => rooms.find((r) => r.id === id);
  // Aperçu uniquement (tarif saisonnier + formule tarifaire, ou heures ×
  // tarif horaire) — le serveur recalcule et applique le tarif définitif à
  // la création (migrations 027/028) si la réception ne saisit pas de prix
  // manuel dans rateOverrides.
  // Priorité au tarif horaire du TYPE de chambre (mission "Round 2
  // ZegHotel", item 2, migration 087) : un tarif personnalisé pour ce
  // nombre d'heures exact (custom_hourly_rates) prime sur hourly_rate ×
  // heures, qui prime lui-même sur le tarif horaire de la formule
  // tarifaire org-wide (repli si le type de chambre n'a rien configuré).
  const rateFor = (id: string) => {
    const room = roomOf(id);
    const roomTypeId = room?.room_type_id;
    if (!roomTypeId) return 0;
    if (isHourly) {
      const rt = room?.room_type;
      const customMatch = rt?.custom_hourly_rates.find((c) => c.hours === hourlyHours);
      if (customMatch) return customMatch.price;
      const perHour = rt?.hourly_rate ?? selectedRatePlan?.hourly_rate ?? 0;
      return Math.round(hourlyHours * perHour * 100) / 100;
    }
    return estimateRoomRate(roomTypeId, checkIn, checkOut, ratePlanId, roomTypes, seasonalRates, ratePlans);
  };
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});

  const toggleRoom = (id: string) => setSelectedRoomIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  // Création immédiate (comme CustomerDialog côté ZegCaisse, app.caisse.tsx)
  // plutôt que différée à la soumission finale : la réception voit tout de
  // suite que le client est créé et peut vérifier son nom avant de
  // continuer, au lieu de découvrir une éventuelle erreur seulement au clic
  // sur "Créer la réservation".
  const createAndSelectGuest = async () => {
    setError(null);
    try {
      if (!newGuestName.trim()) throw new Error("Le nom du client est requis.");
      const g = await upsertGuest.mutateAsync({
        full_name: newGuestName.trim(),
        phone: newGuestPhone.trim() || undefined,
        email: newGuestEmail.trim() || undefined,
        id_document_type: newGuestDocType || undefined,
        id_document_number: newGuestDocNumber.trim() || undefined,
        address: newGuestAddress.trim() || undefined,
        date_of_birth: newGuestDob || undefined,
        nationality: newGuestNationality.trim() || undefined,
      });
      setGuestId(g.id); setSelectedGuestName(g.full_name);
      setAddingGuest(false); setNewGuestName(""); setNewGuestPhone(""); setNewGuestEmail(""); setGuestSearch("");
      setNewGuestMore(false); setNewGuestDocType(""); setNewGuestDocNumber(""); setNewGuestAddress(""); setNewGuestDob(""); setNewGuestNationality("");
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  const submit = async () => {
    setError(null);
    try {
      if (!guestId) throw new Error("Sélectionnez ou créez un client.");
      if (!selectedRoomIds.length) throw new Error("Sélectionnez au moins une chambre.");
      if (isHourly && checkInAt && checkOutAt && new Date(checkOutAt) <= new Date(checkInAt)) {
        throw new Error("L'heure de départ doit être après l'heure d'arrivée.");
      }
      const reservation = await create.mutateAsync({
        guest_id: guestId, check_in: checkIn, check_out: checkOut,
        rate_plan_id: ratePlanId || null, corporate_account_id: corporateId || null,
        channel, adults, children, notes: notes.trim() || undefined,
        // rate_amount = null quand la réception n'a pas touché le champ :
        // le serveur calcule alors le tarif définitif (migrations 027/028)
        // — sauf en horaire, où le calcul serveur ne connaît que le tarif
        // horaire de la formule tarifaire (hotel_rate_plans), pas encore le
        // tarif horaire par type de chambre (migration 087) ; on envoie donc
        // explicitement le montant déjà calculé côté client (rateFor) pour
        // que le tarif du type de chambre s'applique réellement, pas juste
        // à l'affichage.
        rooms: selectedRoomIds.map((id) => ({ room_id: id, rate_amount: rateOverrides[id] ?? (isHourly ? rateFor(id) : null) })),
        check_in_at: checkInAt, check_out_at: checkOutAt,
      });
      onCreated(reservation.id);
    } catch (e: any) {
      // 23P01 = exclusion_violation (contraintes hotel_resv_rooms_excl /
      // _hourly_excl, schema.sql) — la chambre a été réservée entre-temps
      // par quelqu'un d'autre sur ce créneau ; message clair plutôt que le
      // texte Postgres brut.
      const message = e?.code === "23P01"
        ? "Une des chambres sélectionnées vient d'être réservée sur ce créneau par quelqu'un d'autre. Rafraîchissez et réessayez."
        : e?.message ?? "Erreur inconnue";
      setError(message);
    }
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
            {isHourly ? (
              <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
                Formule horaire — départ le même jour, voir les heures ci-dessous.
              </div>
            ) : (
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Départ *</span>
                <input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className={inp} /></label>
            )}
          </div>

          {isHourly && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure d'arrivée *</span>
                <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className={inp} /></label>
              <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure de départ *</span>
                <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className={inp} /></label>
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Durée :</span>
                {[1, 2, 5].map((h) => (
                  <button key={h} type="button" onClick={() => applyHourlyPreset(h)}
                    className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold",
                      hourlyHours === h ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    {h} h
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client *</span>
            {guestId ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /> {selectedGuestName ?? "Client sélectionné"}</span>
                <button onClick={() => { setGuestId(null); setSelectedGuestName(null); }} className="text-xs text-muted-foreground hover:text-foreground">Changer</button>
              </div>
            ) : addingGuest ? (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <input value={newGuestName} autoFocus onChange={(e) => setNewGuestName(e.target.value)} placeholder="Nom *" className={inp} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={newGuestPhone} onChange={(e) => setNewGuestPhone(e.target.value)} placeholder="Téléphone" className={inp} />
                  <input value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} placeholder="Email" className={inp} />
                </div>
                {!newGuestMore ? (
                  <button onClick={() => setNewGuestMore(true)} className="text-xs font-semibold text-primary hover:underline">
                    + Plus d'informations (CNI, ville, date de naissance…)
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newGuestDocType} onChange={(e) => setNewGuestDocType(e.target.value)} className={inp}>
                      <option value="">Type de pièce</option>
                      <option value="CNI">CNI</option>
                      <option value="Passeport">Passeport</option>
                      <option value="Permis de conduire">Permis de conduire</option>
                      <option value="Autre">Autre</option>
                    </select>
                    <input value={newGuestDocNumber} onChange={(e) => setNewGuestDocNumber(e.target.value)} placeholder="N° de pièce" className={inp} />
                    <input value={newGuestAddress} onChange={(e) => setNewGuestAddress(e.target.value)} placeholder="Ville / Adresse" className={inp} />
                    <input type="date" value={newGuestDob} onChange={(e) => setNewGuestDob(e.target.value)} placeholder="Date de naissance" className={inp} />
                    <input value={newGuestNationality} onChange={(e) => setNewGuestNationality(e.target.value)} placeholder="Nationalité" className={cn(inp, "col-span-2")} />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setAddingGuest(false); setNewGuestName(""); setNewGuestPhone(""); setNewGuestEmail(""); setNewGuestMore(false); setNewGuestDocType(""); setNewGuestDocNumber(""); setNewGuestAddress(""); setNewGuestDob(""); setNewGuestNationality(""); }}
                    className="h-9 flex-1 rounded-xl border border-border bg-card text-xs font-semibold">Retour</button>
                  <button onClick={createAndSelectGuest} disabled={!newGuestName.trim() || upsertGuest.isPending}
                    className="flex h-9 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-40">
                    {upsertGuest.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Créer et sélectionner
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} placeholder="Rechercher un client existant…" className={inp} />
                {guestSearch.trim() && guestResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-xl border border-border">
                    {guestResults.map((g) => (
                      <button key={g.id} onClick={() => { setGuestId(g.id); setSelectedGuestName(g.full_name); setGuestSearch(""); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {g.full_name} {g.phone && <span className="text-xs text-muted-foreground">— {g.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setAddingGuest(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                  <User className="h-3.5 w-3.5" /> Nouveau client
                </button>
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chambres * ({isHourly ? `${hourlyHours} h — prix total` : `${nights} nuit${nights > 1 ? "s" : ""} — prix total du séjour`})
            </span>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {rooms.map((r) => {
                // Une chambre en maintenance (housekeeping_status =
                // out_of_service, mission "Round 2 ZegHotel", item 4) reste
                // exclue même si aucune réservation ne la chevauche — sans
                // ce garde-fou, une chambre en panne restait réservable tant
                // que personne n'y avait pensé manuellement.
                const outOfService = r.housekeeping_status === "out_of_service";
                const unavailable = (bookedRoomIds.has(r.id) && !selectedRoomIds.includes(r.id)) || (outOfService && !selectedRoomIds.includes(r.id));
                return (
                  <label key={r.id} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm", unavailable && "opacity-40")}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" disabled={unavailable} checked={selectedRoomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                      {r.number} — {r.room_type?.name}{" "}
                      {outOfService && <span className="text-xs text-destructive">(en maintenance)</span>}
                      {!outOfService && unavailable && <span className="text-xs text-destructive">(indisponible)</span>}
                    </span>
                    {selectedRoomIds.includes(r.id) && (
                      <input type="number" onFocus={selectOnFocus} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs"
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
              <input type="number" onFocus={selectOnFocus} min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className={inp} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enfants</span>
              <input type="number" onFocus={selectOnFocus} min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} className={inp} /></label>
          </div>
          {ratePlans.length > 0 && (
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tarif</span>
              <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className={inp}>
                <option value="">Standard (nuitée)</option>
                {ratePlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.billing_unit === "hour" ? "à l'heure" : "à la nuit"}</option>
                ))}
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
  // La chambre est facturée comme charge "room" du folio dès le check-in
  // (useCheckInReservation) — c'est la source de vérité une fois postée.
  // Avant check-in, le folio n'a encore aucune charge "room" : on affiche
  // alors un aperçu calculé depuis hotel_reservation_rooms (proforma), sans
  // jamais afficher les deux à la fois (double comptage).
  const nights = Math.max(1, (new Date(reservation.check_out).getTime() - new Date(reservation.check_in).getTime()) / 86400000);
  const hasPostedRoomCharge = folio.charges.some((c) => c.kind === "room");
  const roomRows = hasPostedRoomCharge ? "" : reservation.reservation_rooms
    .filter((rr) => rr.status !== "cancelled" && rr.status !== "no_show")
    .map((rr) => `<tr><td>Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""} (${nights} nuit${nights > 1 ? "s" : ""}) — proforma</td><td class="num">1</td><td class="num">${formatMoney(rr.rate_amount)}</td><td class="num">${formatMoney(rr.rate_amount)}</td></tr>`)
    .join("");
  const chargeRows = folio.charges
    .map((c) => `<tr><td>${c.description}</td><td class="num">${c.quantity}</td><td class="num">${formatMoney(c.amount)}</td><td class="num">${formatMoney(c.amount * c.quantity)}</td></tr>`)
    .join("");
  const roomTotal = hasPostedRoomCharge ? 0 : reservation.reservation_rooms
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

// Document de confirmation de réservation (mission "récupération +
// correctifs impact élevé", Partie 3) — généré à la création/depuis la
// fiche réservation, PAS à la facture au check-out : coordonnées client,
// dates, chambre(s)/type, tarif, acompte déjà versé le cas échéant, infos
// établissement. Même gabarit A4 que la facture SYSCOHADA
// (renderA4Document/openPrintWindow, src/lib/printDoc.ts) plutôt qu'une
// nouvelle librairie — aucun envoi automatique (email/SMS), hors scope
// (module Notifications, différé).
function printReservationConfirmation(
  reservation: HotelReservationRow, folio: HotelFolioDetail | null | undefined,
  org: { name: string; logo_url: string | null } | null,
  settings: { data: { address?: string; phone?: string; ifu?: string } } | null | undefined,
  formatMoney: (n: number) => string,
) {
  const nights = Math.max(1, Math.round((new Date(reservation.check_out).getTime() - new Date(reservation.check_in).getTime()) / 86400000));
  const activeRooms = reservation.reservation_rooms.filter((rr) => rr.status !== "cancelled" && rr.status !== "no_show");
  const roomRows = activeRooms
    .map((rr) => `<tr><td>Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""} (${nights} nuit${nights > 1 ? "s" : ""})</td><td class="num">1</td><td class="num">${formatMoney(rr.rate_amount)}</td><td class="num">${formatMoney(rr.rate_amount)}</td></tr>`)
    .join("");
  const roomTotal = activeRooms.reduce((s, rr) => s + rr.rate_amount, 0);
  const depositPaid = (folio?.payments ?? []).filter((p) => p.kind === "deposit").reduce((s, p) => s + p.amount, 0);
  const balanceDue = roomTotal - depositPaid;

  const bodyHtml = `
    <div class="doc-parties">
      <div class="block">
        <h2>Client</h2>
        <div class="name">${reservation.guest?.full_name ?? "—"}</div>
        ${reservation.guest?.phone ? `<div>${reservation.guest.phone}</div>` : ""}
        ${reservation.guest?.email ? `<div>${reservation.guest.email}</div>` : ""}
      </div>
      <div class="block" style="text-align:right">
        <h2>Séjour</h2>
        <div class="name">${new Date(reservation.check_in).toLocaleDateString("fr-FR")} → ${new Date(reservation.check_out).toLocaleDateString("fr-FR")}</div>
        <div>${nights} nuit${nights > 1 ? "s" : ""} · ${reservation.adults + reservation.children} personne${reservation.adults + reservation.children > 1 ? "s" : ""}</div>
      </div>
    </div>
    <table class="doc-table">
      <thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Montant</th></tr></thead>
      <tbody>${roomRows}</tbody>
    </table>
    <div class="doc-totals">
      <div class="row total"><span>Total séjour (hébergement)</span><span>${formatMoney(roomTotal)}</span></div>
      ${depositPaid > 0 ? `<div class="row"><span>Acompte versé</span><span>-${formatMoney(depositPaid)}</span></div>
      <div class="row total"><span>Solde restant dû à l'arrivée</span><span>${formatMoney(balanceDue)}</span></div>` : ""}
    </div>
    <p style="margin-top:16px;font-size:12px;color:#666">
      Ce document confirme votre réservation. Le montant définitif (taxes, extras, services) sera arrêté sur la facture émise au départ.
    </p>`;

  const html = renderA4Document({
    docTitle: "Confirmation de réservation",
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
    footerHtml: "Confirmation générée par ZegHotel.",
  });
  openPrintWindow(html, { width: 900, height: 700 });
}

// Reçu de caisse au check-in (mission "mise à jour ZegHotel", Phase 2,
// point 2 — dernier tiret) : même gabarit A4 que printReservationConfirmation
// ci-dessus, mais cadré comme un reçu d'enregistrement (chambre assignée +
// acompte déjà versé) plutôt qu'une confirmation de réservation.
function printCheckInReceipt(
  reservation: HotelReservationRow, folio: HotelFolioDetail | null | undefined,
  org: { name: string; logo_url: string | null } | null,
  settings: { data: { address?: string; phone?: string; ifu?: string } } | null | undefined,
  formatMoney: (n: number) => string,
) {
  const nights = Math.max(1, Math.round((new Date(reservation.check_out).getTime() - new Date(reservation.check_in).getTime()) / 86400000));
  const activeRooms = reservation.reservation_rooms.filter((rr) => rr.status !== "cancelled" && rr.status !== "no_show");
  const roomList = activeRooms.map((rr) => `Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""}`).join(", ");
  const roomTotal = activeRooms.reduce((s, rr) => s + rr.rate_amount, 0);
  const paidSoFar = (folio?.payments ?? []).filter((p) => p.kind !== "refund").reduce((s, p) => s + p.amount, 0)
    - (folio?.payments ?? []).filter((p) => p.kind === "refund").reduce((s, p) => s + p.amount, 0);
  const balanceDue = roomTotal - paidSoFar;

  const bodyHtml = `
    <div class="doc-parties">
      <div class="block">
        <h2>Client</h2>
        <div class="name">${reservation.guest?.full_name ?? "—"}</div>
        ${reservation.guest?.phone ? `<div>${reservation.guest.phone}</div>` : ""}
        ${reservation.guest?.id_document_type ? `<div>${reservation.guest.id_document_type}${reservation.guest.id_document_number ? ` — ${reservation.guest.id_document_number}` : ""}</div>` : ""}
      </div>
      <div class="block" style="text-align:right">
        <h2>Enregistrement</h2>
        <div class="name">${new Date(reservation.check_in).toLocaleDateString("fr-FR")} → ${new Date(reservation.check_out).toLocaleDateString("fr-FR")}</div>
        <div>${roomList}</div>
      </div>
    </div>
    <div class="doc-totals">
      <div class="row total"><span>Total séjour (hébergement, ${nights} nuit${nights > 1 ? "s" : ""})</span><span>${formatMoney(roomTotal)}</span></div>
      ${paidSoFar > 0 ? `<div class="row"><span>Déjà versé</span><span>-${formatMoney(paidSoFar)}</span></div>` : ""}
      <div class="row total"><span>Solde restant dû</span><span>${formatMoney(Math.max(0, balanceDue))}</span></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#666">
      Reçu remis au client à son enregistrement (check-in). Le solde restant dû sera réglé au départ, sauf paiement anticipé.
    </p>`;

  const html = renderA4Document({
    docTitle: "Reçu d'enregistrement",
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
    footerHtml: "Reçu généré par ZegHotel au check-in.",
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
  const [depositAmount, setDepositAmount] = useState(0);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState<HotelPaymentMethod>("cash");
  const [refundReason, setRefundReason] = useState("");

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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => printReservationConfirmation(reservation, folio, currentOrganization, settings, formatMoney)}
                    className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-muted">
                    <Printer className="h-3 w-3" /> Imprimer/Télécharger confirmation
                  </button>
                  {(reservation.status === "checked_in" || reservation.status === "checked_out") && (
                    <button onClick={() => printCheckInReceipt(reservation, folio, currentOrganization, settings, formatMoney)}
                      className="flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success hover:bg-success/20">
                      <Printer className="h-3 w-3" /> Reçu de check-in
                    </button>
                  )}
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
                    <button disabled={busy} onClick={() => run(() => checkIn.mutateAsync(reservation.id))}
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
                      {folio.billed_to_corporate && !folio.corporate_paid_at ? (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent-foreground">À facturer (entreprise)</span>
                      ) : (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px]", folio.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                          {folio.status === "open" ? "Ouverte" : "Clôturée"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {folio.charges.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{c.description}</span><span>{formatMoney(c.amount * c.quantity)}</span></div>
                    ))}
                    {folio.payments.map((p) => (
                      p.kind === "refund" ? (
                        <div key={p.id} className="flex items-center justify-between text-sm text-destructive">
                          <span>Remboursement ({p.method}){p.reference ? ` — ${p.reference}` : ""}</span><span>+ {formatMoney(p.amount)}</span>
                        </div>
                      ) : (
                        <div key={p.id} className="flex items-center justify-between text-sm text-success">
                          <span>Paiement ({p.method})</span><span>- {formatMoney(p.amount)}</span>
                        </div>
                      )
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
                        <input type="number" onFocus={selectOnFocus} value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))} className="w-24 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                        <button disabled={busy || !chargeDesc.trim() || !chargeAmount}
                          onClick={() => run(async () => { await addCharge.mutateAsync({ folio_id: folio.id, kind: chargeKind, description: chargeDesc.trim(), amount: chargeAmount }); setChargeDesc(""); setChargeAmount(0); })}
                          className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">Ajouter</button>
                      </div>
                      <div className="flex gap-2">
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as HotelPaymentMethod)}
                          className="rounded-xl border border-border bg-background px-2 py-2 text-xs">
                          <option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="card">Carte</option><option value="bank_transfer">Virement</option>
                        </select>
                        <input type="number" onFocus={selectOnFocus} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} placeholder="Montant" className="flex-1 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                        <button disabled={busy || !payAmount}
                          onClick={() => run(async () => { await addPayment.mutateAsync({ folio_id: folio.id, amount: payAmount, method: payMethod }); setPayAmount(0); })}
                          className="flex items-center gap-1 rounded-xl bg-success/10 px-3 text-xs font-semibold text-success disabled:opacity-40"><Banknote className="h-3.5 w-3.5" /> Encaisser (manuel)</button>
                      </div>
                      {/* Remboursement (mission "Onboarding + MoneyFusion +
                          permissions", Partie 3) : simple écriture au ledger
                          (kind="refund", déjà pris en compte par
                          folioBalance()) — aucun appel MoneyFusion, le
                          transfert d'argent réel se fait hors app (espèces,
                          virement...), ce champ n'enregistre que la trace. */}
                      {!refundOpen ? (
                        <button onClick={() => setRefundOpen(true)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5">
                          <RotateCcw className="h-3.5 w-3.5" /> Rembourser un acompte
                        </button>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                          <div className="flex gap-2">
                            <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as HotelPaymentMethod)}
                              className="rounded-xl border border-border bg-background px-2 py-2 text-xs">
                              <option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="card">Carte</option><option value="bank_transfer">Virement</option>
                            </select>
                            <input type="number" onFocus={selectOnFocus} value={refundAmount || ""} onChange={(e) => setRefundAmount(Number(e.target.value))}
                              placeholder="Montant remboursé" className="flex-1 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                          </div>
                          <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Motif / référence (ex : annulation réservation)"
                            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                          <div className="flex gap-2">
                            <button onClick={() => { setRefundOpen(false); setRefundAmount(0); setRefundReason(""); }}
                              className="h-9 flex-1 rounded-xl border border-border bg-card text-xs font-semibold">Annuler</button>
                            <button disabled={busy || !refundAmount}
                              onClick={() => run(async () => {
                                await addPayment.mutateAsync({ folio_id: folio.id, amount: refundAmount, method: refundMethod, kind: "refund", reference: refundReason.trim() || undefined });
                                setRefundOpen(false); setRefundAmount(0); setRefundReason("");
                              })}
                              className="flex h-9 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-destructive/10 text-xs font-bold text-destructive disabled:opacity-40">
                              <RotateCcw className="h-3.5 w-3.5" /> Confirmer le remboursement
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Lien de paiement Mobile Money réel — le montant du
                          solde est recalculé côté serveur (jamais celui
                          affiché ici), toujours exact au moment du clic. */}
                      {currentOrganization && folioBalance(folio) > 0 && (
                        <MoneyFusionPayButton organizationId={currentOrganization.id} appModule="hotel" targetId={folio.id}
                          kind="payment" label={`Payer le solde (${formatMoney(folioBalance(folio))}) via Mobile Money`}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10" />
                      )}
                      {reservation.status !== "checked_out" && reservation.status !== "cancelled" && (
                        <div className="flex gap-2">
                          <input type="number" onFocus={selectOnFocus} value={depositAmount || ""} placeholder="Montant de l'acompte"
                            onChange={(e) => setDepositAmount(Number(e.target.value))}
                            className="flex-1 rounded-xl border border-border bg-background px-2 py-2 text-xs" />
                          {currentOrganization && depositAmount > 0 && (
                            <MoneyFusionPayButton organizationId={currentOrganization.id} appModule="hotel" targetId={folio.id}
                              kind="deposit" amount={depositAmount} label="Acompte via Mobile Money" />
                          )}
                        </div>
                      )}
                      {reservation.status === "checked_out" && (
                        <div className="space-y-2">
                          <button disabled={busy} onClick={() => run(() => closeFolio.mutateAsync({ folioId: folio.id }))}
                            className="w-full rounded-xl border border-border bg-card py-2 text-xs font-semibold hover:bg-muted">Clôturer la note</button>
                          {/* Facturation différée (ZegHotel Phase 4) : uniquement si un
                              compte entreprise est rattaché et qu'un solde reste dû —
                              sinon "Clôturer la note" ci-dessus suffit. */}
                          {reservation.corporate_account_id && folioBalance(folio) > 0 && (
                            <button disabled={busy}
                              onClick={() => { if (confirm("Clôturer avec le solde restant à facturer à l'entreprise ?")) run(() => closeFolio.mutateAsync({ folioId: folio.id, billToCorporate: true })); }}
                              className="w-full rounded-xl border border-accent/40 bg-accent/10 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent/20">
                              Clôturer et facturer à l'entreprise
                            </button>
                          )}
                        </div>
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
