import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, TrendingUp, Percent, Coins } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import { useHotelReservations, useHotelRooms } from "@/lib/data/hotelHooks";

export const Route = createFileRoute("/app/hotel/rapports")({
  component: HotelReportsPage,
});

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }

// Nuits occupées par jour dans [rangeStart, rangeEnd) — une réservation
// active (ni annulée ni no-show) compte une nuit par chambre par jour couvert.
function nightsInRange(reservations: ReturnType<typeof useHotelReservations>["data"], rangeStart: string, rangeEnd: string) {
  let nights = 0; let revenue = 0;
  for (const res of reservations ?? []) {
    for (const rr of res.reservation_rooms) {
      if (rr.status === "cancelled" || rr.status === "no_show") continue;
      const start = rr.check_in < rangeStart ? rangeStart : rr.check_in;
      const end = rr.check_out > rangeEnd ? rangeEnd : rr.check_out;
      const n = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86400000);
      if (n > 0) {
        nights += n;
        const totalNights = Math.max(1, (new Date(rr.check_out).getTime() - new Date(rr.check_in).getTime()) / 86400000);
        revenue += (rr.rate_amount / totalNights) * n;
      }
    }
  }
  return { nights, revenue };
}

function HotelReportsPage() {
  const formatMoney = useFormatMoney();
  const [period, setPeriod] = useState<7 | 30>(30);
  const rangeEnd = toISO(new Date());
  const rangeStart = addDays(rangeEnd, -period);

  const { data: rooms = [] } = useHotelRooms();
  const { data: reservations } = useHotelReservations(rangeStart, rangeEnd);

  // Prévision pickup : réservations déjà enregistrées pour les 7/30 prochains jours.
  const forecastEnd7 = addDays(rangeEnd, 7);
  const forecastEnd30 = addDays(rangeEnd, 30);
  const { data: forecast7 } = useHotelReservations(rangeEnd, forecastEnd7);
  const { data: forecast30 } = useHotelReservations(rangeEnd, forecastEnd30);

  const { nights, revenue } = useMemo(() => nightsInRange(reservations, rangeStart, rangeEnd), [reservations, rangeStart, rangeEnd]);
  const availableRoomNights = rooms.length * period;
  const occupancyPct = availableRoomNights ? Math.round((nights / availableRoomNights) * 100) : 0;
  const adr = nights ? revenue / nights : 0;
  const revpar = availableRoomNights ? revenue / availableRoomNights : 0;

  const pickup7 = useMemo(() => nightsInRange(forecast7, rangeEnd, forecastEnd7).nights, [forecast7, rangeEnd, forecastEnd7]);
  const pickup30 = useMemo(() => nightsInRange(forecast30, rangeEnd, forecastEnd30).nights, [forecast30, rangeEnd, forecastEnd30]);

  return (
    <div>
      <PageHeader title="Rapports" subtitle="Occupation, revenus et prévisions"
        actions={
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            {([7, 30] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {p} jours
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-5 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Taux d'occupation" value={`${occupancyPct}%`} hint={`${nights} nuits vendues`} icon={<Percent className="h-5 w-5" />} accent="primary" />
          <StatCard label="ADR (prix moyen/nuit)" value={formatMoney(adr)} icon={<Coins className="h-5 w-5" />} accent="accent" />
          <StatCard label="RevPAR" value={formatMoney(revpar)} hint="Revenu par chambre disponible" icon={<TrendingUp className="h-5 w-5" />} accent="success" />
          <StatCard label="Revenu hébergement" value={formatMoney(revenue)} icon={<BarChart3 className="h-5 w-5" />} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-1 text-sm font-semibold">Prévision pickup — 7 prochains jours</div>
            <p className="text-xs text-muted-foreground">Nuits déjà réservées à partir d'aujourd'hui.</p>
            <div className="mt-3 font-display text-2xl font-bold text-primary">{pickup7} <span className="text-sm font-normal text-muted-foreground">nuits</span></div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-1 text-sm font-semibold">Prévision pickup — 30 prochains jours</div>
            <p className="text-xs text-muted-foreground">Nuits déjà réservées à partir d'aujourd'hui.</p>
            <div className="mt-3 font-display text-2xl font-bold text-primary">{pickup30} <span className="text-sm font-normal text-muted-foreground">nuits</span></div>
          </div>
        </div>

        {rooms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Configurez vos chambres pour obtenir des statistiques d'occupation fiables.
          </div>
        )}
      </div>
    </div>
  );
}
