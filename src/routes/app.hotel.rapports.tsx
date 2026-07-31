import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, TrendingUp, Percent, Coins, Moon, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney, useMyRole } from "@/lib/data/hooks";
import { useHotelReservations, useHotelRooms, useRunNightAudit, nightsInRange } from "@/lib/data/hotelHooks";

export const Route = createFileRoute("/app/hotel/rapports")({
  component: HotelReportsPage,
});

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }

function HotelReportsPage() {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canRunAudit = myRole === "owner" || myRole === "manager";
  const nightAudit = useRunNightAudit();
  const [auditResult, setAuditResult] = useState<string | null>(null);

  // Sélecteur de période universel (ZegHotel Phase 6) — remplace le
  // toggle 7/30 jours par les préréglages partagés avec ZegCaisse
  // (Aujourd'hui, Hier, Cette semaine, Semaine dernière, Ce mois, Mois
  // dernier, Cette année, Année dernière, Personnalisé).
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from: fromDate, to: toDate } = periodRange(period, customFrom, customTo);
  const rangeStart = toISO(fromDate);
  const rangeEnd = toISO(toDate);
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));

  const { data: rooms = [] } = useHotelRooms();
  const { data: reservations } = useHotelReservations(rangeStart, rangeEnd);

  // Prévision pickup : réservations déjà enregistrées pour les 7/30 prochains jours
  // à partir d'aujourd'hui — reste fixe, indépendant de la période sélectionnée
  // (une prévision se lit toujours depuis "maintenant").
  const today = toISO(new Date());
  const forecastEnd7 = addDays(today, 7);
  const forecastEnd30 = addDays(today, 30);
  const { data: forecast7 } = useHotelReservations(today, forecastEnd7);
  const { data: forecast30 } = useHotelReservations(today, forecastEnd30);

  const { nights, revenue } = useMemo(() => nightsInRange(reservations, rangeStart, rangeEnd), [reservations, rangeStart, rangeEnd]);
  const availableRoomNights = rooms.length * periodDays;
  const occupancyPct = availableRoomNights ? Math.round((nights / availableRoomNights) * 100) : 0;
  const adr = nights ? revenue / nights : 0;
  const revpar = availableRoomNights ? revenue / availableRoomNights : 0;

  const pickup7 = useMemo(() => nightsInRange(forecast7, today, forecastEnd7).nights, [forecast7, today, forecastEnd7]);
  const pickup30 = useMemo(() => nightsInRange(forecast30, today, forecastEnd30).nights, [forecast30, today, forecastEnd30]);

  return (
    <div>
      <PageHeader title="Rapports" subtitle="Occupation, revenus et prévisions"
        actions={
          <PeriodSelector period={period} onChange={setPeriod}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
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

        {canRunAudit && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><Moon className="h-4 w-4 text-primary" /> Audit de nuit</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clôture la journée : les réservations attendues aujourd'hui et jamais arrivées passent en « no-show »,
                  libérant leur chambre.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!confirm("Clôturer la journée ? Les réservations en attente d'arrivée aujourd'hui non check-in passeront en no-show.")) return;
                  nightAudit.mutate(today, {
                    onSuccess: (r) => setAuditResult(r.noShowCount > 0 ? `${r.noShowCount} réservation(s) marquée(s) no-show.` : "Aucun no-show à traiter — journée clôturée."),
                    onError: (e: any) => setAuditResult(e?.message ?? "Erreur inconnue."),
                  });
                }}
                disabled={nightAudit.isPending}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                {nightAudit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />} Clôturer la journée
              </button>
            </div>
            {auditResult && <p className="mt-3 rounded-xl bg-muted p-3 text-xs">{auditResult}</p>}
          </div>
        )}

        {rooms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Configurez vos chambres pour obtenir des statistiques d'occupation fiables.
          </div>
        )}
      </div>
    </div>
  );
}
