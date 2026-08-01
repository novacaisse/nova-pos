// Rapports ZegResto (Phase 6) — CA, plats les plus vendus, ticket moyen,
// temps de service moyen, sur la période choisie (sélecteur partagé avec
// ZegCaisse/ZegHotel, cf. PeriodSelector.tsx). Basé sur les commandes
// fermées (facturées et réglées) dont la fermeture tombe dans la période.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, TrendingUp, Receipt, Timer, Trophy } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney } from "@/lib/data/hooks";
import { useRestoReportData } from "@/lib/data/restoHooks";

export const Route = createFileRoute("/app/resto/rapports")({
  component: RapportsPage,
});

function RapportsPage() {
  const formatMoney = useFormatMoney();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);
  const { data, isLoading } = useRestoReportData(from, to);

  return (
    <div>
      <PageHeader title="Rapports" subtitle="Performance du restaurant sur la période"
        actions={<PeriodSelector period={period} onChange={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />}
      />
      <div className="space-y-4 p-5 sm:p-8">
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Chiffre d'affaires" value={formatMoney(data?.revenue ?? 0)} icon={<TrendingUp className="h-5 w-5" />} accent="primary" />
              <StatCard label="Commandes réglées" value={String(data?.orderCount ?? 0)} icon={<Receipt className="h-5 w-5" />} accent="accent" />
              <StatCard label="Ticket moyen" value={formatMoney(data?.avgTicket ?? 0)} icon={<Trophy className="h-5 w-5" />} accent="accent" />
              <StatCard label="Temps de service moyen" value={data?.avgServiceMin ? `${Math.round(data.avgServiceMin)} min` : "—"} icon={<Timer className="h-5 w-5" />} accent="primary" />
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Trophy className="h-4 w-4" /> Plats les plus vendus</div>
              {!data?.topItems.length ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune vente sur cette période.</div>
              ) : (
                <div className="space-y-2">
                  {data.topItems.map((it, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2"><span className="w-5 text-center font-bold text-muted-foreground">{i + 1}</span> {it.nom}</span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="tabular">{it.quantite} vendus</span>
                        <span className="tabular font-semibold text-foreground">{formatMoney(it.ca)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
