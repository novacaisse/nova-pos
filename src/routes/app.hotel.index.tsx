import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BedDouble, CalendarRange, DoorClosed, LogIn, LogOut, Sparkle, Users, TrendingUp, Percent, Coins } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney } from "@/lib/data/hooks";
import { useHotelDashboardStats, useHotelRooms, useHotelReservations, nightsInRange } from "@/lib/data/hotelHooks";

export const Route = createFileRoute("/app/hotel/")({
  component: HotelDashboard,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function HotelDashboard() {
  const today = todayISO();
  const { data: stats, isLoading } = useHotelDashboardStats(today);
  const { data: rooms = [] } = useHotelRooms();
  const formatMoney = useFormatMoney();

  // Sélecteur de période universel (ZegHotel Phase 6) — les cartes
  // "Arrivées/Départs aujourd'hui" ci-dessous restent volontairement fixes
  // sur le jour courant (la réception a besoin de savoir qui arrive
  // AUJOURD'HUI, quelle que soit la période choisie pour l'analyse) ; ce
  // bloc-ci porte les indicateurs réellement période-dépendants (revenu,
  // occupation) — même préréglages que ZegCaisse et /app/hotel/rapports.
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from: fromDate, to: toDate } = periodRange(period, customFrom, customTo);
  const rangeStart = toISO(fromDate);
  const rangeEnd = toISO(toDate);
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
  const { data: periodReservations } = useHotelReservations(rangeStart, rangeEnd);
  const { nights: periodNights, revenue: periodRevenue } = useMemo(
    () => nightsInRange(periodReservations, rangeStart, rangeEnd), [periodReservations, rangeStart, rangeEnd]);
  const periodOccupancyPct = rooms.length ? Math.round((periodNights / (rooms.length * periodDays)) * 100) : 0;

  if (!isLoading && rooms.length === 0) {
    return (
      <div>
        <PageHeader title="ZegHotel" subtitle="Tableau de bord" />
        <div className="p-5 sm:p-8">
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BedDouble className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">Configurez d'abord vos chambres</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Créez vos types de chambres et vos chambres pour commencer à recevoir des réservations.
            </p>
            <Link to="/app/hotel/rooms"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90">
              <DoorClosed className="h-4 w-4" /> Configurer les chambres
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="ZegHotel" subtitle="Tableau de bord" />
      <div className="space-y-5 p-5 sm:p-8">
        {/* Raccourcis en haut (mission "mise à jour ZegHotel", Phase 1) —
            accès direct aux 3 écrans les plus utilisés avant même les
            statistiques, pour ne pas avoir à défiler. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/app/hotel/reservations" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40">
            <CalendarRange className="h-5 w-5 text-primary" /> <span className="text-sm font-semibold">Planning des réservations</span>
          </Link>
          <Link to="/app/hotel/rooms" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40">
            <DoorClosed className="h-5 w-5 text-primary" /> <span className="text-sm font-semibold">Chambres & types</span>
          </Link>
          <Link to="/app/hotel/housekeeping" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40">
            <Sparkle className="h-5 w-5 text-primary" /> <span className="text-sm font-semibold">Housekeeping</span>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Taux d'occupation" value={`${stats?.occupancyPct ?? 0}%`}
            hint={`${stats?.occupied ?? 0} / ${stats?.totalRooms ?? 0} chambres`}
            icon={<BedDouble className="h-5 w-5" />} accent="primary" />
          <StatCard label="Arrivées aujourd'hui" value={String(stats?.arrivals.length ?? 0)}
            icon={<LogIn className="h-5 w-5" />} accent="accent" />
          <StatCard label="Départs aujourd'hui" value={String(stats?.departures.length ?? 0)}
            icon={<LogOut className="h-5 w-5" />} accent="success" />
          <StatCard label="Chambres" value={String(stats?.totalRooms ?? 0)}
            icon={<DoorClosed className="h-5 w-5" />} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Indicateurs de la période</div>
            <PeriodSelector period={period} onChange={setPeriod}
              customFrom={customFrom} customTo={customTo}
              onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Revenu hébergement" value={formatMoney(periodRevenue)} icon={<Coins className="h-5 w-5" />} accent="accent" />
            <StatCard label="Nuits vendues" value={String(periodNights)} icon={<TrendingUp className="h-5 w-5" />} />
            <StatCard label="Taux d'occupation (période)" value={`${periodOccupancyPct}%`} icon={<Percent className="h-5 w-5" />} accent="primary" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><LogIn className="h-4 w-4 text-primary" /> Arrivées du jour</div>
            {!stats?.arrivals.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune arrivée prévue aujourd'hui.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {stats.arrivals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" /> {r.guest?.full_name ?? "—"}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{r.adults + r.children} pers.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><LogOut className="h-4 w-4 text-primary" /> Départs du jour</div>
            {!stats?.departures.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun départ prévu aujourd'hui.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {stats.departures.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" /> {r.guest?.full_name ?? "—"}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{r.adults + r.children} pers.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
