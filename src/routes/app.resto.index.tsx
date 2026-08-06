// Tableau de bord ZegResto (Phase 6) — couverts/CA du jour, tables
// occupées, commandes en cours, réservations en attente. Mis à jour en
// temps réel (resto_orders) avec un filet refetchInterval, même pattern
// que les autres écrans temps réel de ce module (Commandes/Cuisine).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, UtensilsCrossed, Receipt, DoorClosed, CalendarClock, TrendingUp, Coins } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney } from "@/lib/data/hooks";
import { useRestoDashboardStats, useRestoPeriodStats } from "@/lib/data/restoHooks";

export const Route = createFileRoute("/app/resto/")({
  component: RestoDashboard,
});

function RestoDashboard() {
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useRestoDashboardStats();

  // Sélecteur de période universel (même pattern que ZegHotel Phase 6) —
  // "Commandes en cours"/"Tables occupées" ci-dessous restent volontairement
  // fixes sur l'instant présent (état réel de la salle maintenant, quelle
  // que soit la période choisie pour l'analyse) ; le bloc "Indicateurs de la
  // période" plus bas porte les indicateurs réellement période-dépendants.
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);
  const { data: periodStats } = useRestoPeriodStats(from, to);

  return (
    <div>
      <PageHeader title="ZegResto" subtitle="Tableau de bord" />
      <div className="space-y-5 p-5 sm:p-8">
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Commandes en cours" value={String(data?.openOrders ?? 0)} icon={<UtensilsCrossed className="h-5 w-5" />} accent="accent" />
              <StatCard label="Tables occupées" value={`${data?.tablesOccupied ?? 0} / ${data?.tablesTotal ?? 0}`} icon={<DoorClosed className="h-5 w-5" />} accent="primary" />
              <StatCard label="Réservations en attente" value={String(data?.pendingReservations ?? 0)} icon={<CalendarClock className="h-5 w-5" />}
                accent={(data?.pendingReservations ?? 0) > 0 ? "destructive" : "primary"} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Indicateurs de la période</div>
                <PeriodSelector period={period} onChange={setPeriod}
                  customFrom={customFrom} customTo={customTo}
                  onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="CA de la période" value={formatMoney(periodStats?.revenue ?? 0)} icon={<Coins className="h-5 w-5" />} accent="primary" />
                <StatCard label="Commandes réglées" value={String(periodStats?.orderCount ?? 0)} icon={<Receipt className="h-5 w-5" />} accent="accent" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Link to="/app/resto/salle" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-primary/40 hover:shadow-elegant">Voir le plan de salle →</Link>
              <Link to="/app/resto/commandes" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-primary/40 hover:shadow-elegant">Gérer les commandes →</Link>
              <Link to="/app/resto/reservations" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-primary/40 hover:shadow-elegant">Voir les réservations →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
