// Rapports ZegResto — V1 : CA, plats les plus vendus, ticket moyen, temps
// de service moyen. V2 (chantier 7) : répartition par serveur et par
// catégorie de menu, rotation des tables, heures de pointe, consommation
// d'ingrédients (liée aux recettes, comparée au stock actuel) et
// comparaison avec la période précédente de même durée. Sélecteur de
// période partagé avec ZegCaisse/ZegHotel (cf. PeriodSelector.tsx). Basé
// sur les commandes fermées (facturées et réglées) dont la fermeture
// tombe dans la période. Export PDF via le gabarit A4 partagé
// (src/lib/printDoc.ts), même format que les autres exports ZegOS
// (SYSCOHADA).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, TrendingUp, Receipt, Timer, Trophy, Users, Utensils, Clock3, Beef, ArrowUp, ArrowDown, Minus, FileDown } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney, useShopSettings } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useRestoReportData } from "@/lib/data/restoHooks";
import { renderA4Document, openPrintWindow, escapeHtml } from "@/lib/printDoc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/rapports")({
  component: RapportsPage,
});

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function TrendBadge({ current, previous, formatMoney }: { current: number; previous: number; formatMoney: (n: number) => string }) {
  const delta = pct(current, previous);
  if (delta === null) return null;
  const positive = delta >= 0;
  const Icon = Math.abs(delta) < 0.5 ? Minus : positive ? ArrowUp : ArrowDown;
  return (
    <div className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      Math.abs(delta) < 0.5 ? "bg-muted text-muted-foreground" : positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
      <Icon className="h-3 w-3" /> {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs période précédente ({formatMoney(previous)})
    </div>
  );
}

function RapportsPage() {
  const formatMoney = useFormatMoney();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);
  const { data, isLoading } = useRestoReportData(from, to);

  const exportPdf = () => {
    if (!data) return;
    const summaryRows = [
      ["Chiffre d'affaires", formatMoney(data.revenue)],
      ["Commandes réglées", String(data.orderCount)],
      ["Ticket moyen", formatMoney(data.avgTicket)],
      ["Temps de service moyen", data.avgServiceMin ? `${Math.round(data.avgServiceMin)} min` : "—"],
      ["Rotation des tables", `${data.tableTurnover.turnsTotal} passage(s) / ${data.tableTurnover.tablesCount} table(s) — ${data.tableTurnover.turnsPerTable.toFixed(1)}×/table`],
    ];
    const peakTop = [...data.peakHours].sort((a, b) => b.orderCount - a.orderCount).slice(0, 3).filter((h) => h.orderCount > 0);

    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Période</h2><div class="name">${escapeHtml(from.toLocaleDateString("fr-FR"))} — ${escapeHtml(to.toLocaleDateString("fr-FR"))}</div></div>
        <div class="block" style="text-align:right"><h2>Comparaison</h2><div class="name">${escapeHtml(formatMoney(data.previousPeriod.revenue))} période précédente</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Indicateur</th><th class="num">Valeur</th></tr></thead>
        <tbody>${summaryRows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${escapeHtml(v)}</td></tr>`).join("")}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Ventes par serveur</h3>
      <table class="doc-table">
        <thead><tr><th>Serveur</th><th class="num">Commandes</th><th class="num">CA</th></tr></thead>
        <tbody>${data.byServer.map((s) => `<tr><td>${escapeHtml(s.nom)}</td><td class="num">${s.orderCount}</td><td class="num">${escapeHtml(formatMoney(s.ca))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Ventes par catégorie</h3>
      <table class="doc-table">
        <thead><tr><th>Catégorie</th><th class="num">Quantité</th><th class="num">CA</th></tr></thead>
        <tbody>${data.byCategory.map((c) => `<tr><td>${escapeHtml(c.nom)}</td><td class="num">${c.quantite}</td><td class="num">${escapeHtml(formatMoney(c.ca))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Plats les plus vendus</h3>
      <table class="doc-table">
        <thead><tr><th>Plat</th><th class="num">Quantité</th><th class="num">CA</th></tr></thead>
        <tbody>${data.topItems.map((it) => `<tr><td>${escapeHtml(it.nom)}</td><td class="num">${it.quantite}</td><td class="num">${escapeHtml(formatMoney(it.ca))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Heures de pointe (top 3)</h3>
      <table class="doc-table">
        <thead><tr><th>Créneau</th><th class="num">Commandes</th></tr></thead>
        <tbody>${peakTop.map((h) => `<tr><td>${h.hour}h – ${h.hour + 1}h</td><td class="num">${h.orderCount}</td></tr>`).join("") || `<tr><td colspan="2">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Consommation d'ingrédients (recettes) vs stock actuel</h3>
      <table class="doc-table">
        <thead><tr><th>Ingrédient</th><th class="num">Consommé</th><th class="num">Stock actuel</th></tr></thead>
        <tbody>${data.ingredientConsumption.map((i) => `<tr><td>${escapeHtml(i.nom)}</td><td class="num">${i.consomme}${i.unite ? " " + escapeHtml(i.unite) : ""}</td><td class="num">${i.stockActuel}${i.unite ? " " + escapeHtml(i.unite) : ""}</td></tr>`).join("") || `<tr><td colspan="3">Aucune recette consommée sur la période</td></tr>`}</tbody>
      </table>
    `;
    const html = renderA4Document({
      docTitle: "Rapport ZegResto",
      docDate: new Date().toLocaleString("fr-FR"),
      shop: {
        shopName: currentOrganization?.name ?? "Restaurant",
        logoUrl: currentOrganization?.logo_url,
        address: settings?.data.address,
        phone: settings?.data.phone,
        ifu: settings?.data.ifu,
      },
      bodyHtml,
    });
    openPrintWindow(html);
  };

  return (
    <div>
      <PageHeader title="Rapports" subtitle="Performance du restaurant sur la période"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector period={period} onChange={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
            <button onClick={exportPdf} disabled={!data}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40">
              <FileDown className="h-4 w-4" /> Export PDF
            </button>
          </div>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        {isLoading || !data ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Chiffre d'affaires</div>
                <div className="tabular mt-1.5 font-display text-2xl font-bold tracking-tight">{formatMoney(data.revenue)}</div>
                <TrendBadge current={data.revenue} previous={data.previousPeriod.revenue} formatMoney={formatMoney} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Commandes réglées</div>
                <div className="tabular mt-1.5 font-display text-2xl font-bold tracking-tight">{data.orderCount}</div>
                <TrendBadge current={data.orderCount} previous={data.previousPeriod.orderCount} formatMoney={(n) => String(Math.round(n))} />
              </div>
              <StatCard label="Ticket moyen" value={formatMoney(data.avgTicket)} icon={<Trophy className="h-5 w-5" />} accent="accent" />
              <StatCard label="Temps de service moyen" value={data.avgServiceMin ? `${Math.round(data.avgServiceMin)} min` : "—"} icon={<Timer className="h-5 w-5" />} accent="primary" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Rotation des tables" value={`${data.tableTurnover.turnsPerTable.toFixed(1)}×`}
                hint={`${data.tableTurnover.turnsTotal} passage(s) sur ${data.tableTurnover.tablesCount} table(s)`}
                icon={<Utensils className="h-5 w-5" />} accent="accent" />
              <StatCard label="Ingrédients suivis" value={String(data.ingredientConsumption.length)}
                hint="Consommés via une recette sur la période" icon={<Beef className="h-5 w-5" />} accent="primary" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-4 w-4" /> Par serveur</div>
                {!data.byServer.length ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune vente sur cette période.</div>
                ) : (
                  <div className="space-y-2">
                    {data.byServer.map((s, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                        <span>{s.nom}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="tabular">{s.orderCount} commande{s.orderCount > 1 ? "s" : ""}</span>
                          <span className="tabular font-semibold text-foreground">{formatMoney(s.ca)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Utensils className="h-4 w-4" /> Par catégorie</div>
                {!data.byCategory.length ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune vente sur cette période.</div>
                ) : (
                  <div className="space-y-2">
                    {data.byCategory.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                        <span>{c.nom}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="tabular">{c.quantite} vendus</span>
                          <span className="tabular font-semibold text-foreground">{formatMoney(c.ca)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Trophy className="h-4 w-4" /> Plats les plus vendus</div>
              {!data.topItems.length ? (
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

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Clock3 className="h-4 w-4" /> Heures de pointe</div>
              <PeakHoursChart peakHours={data.peakHours} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground"><Beef className="h-4 w-4" /> Consommation d'ingrédients (recettes) vs stock actuel</div>
              {!data.ingredientConsumption.length ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune recette consommée sur cette période.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2">Ingrédient</th>
                        <th className="py-2 text-right">Consommé</th>
                        <th className="py-2 text-right">Stock actuel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ingredientConsumption.map((ing, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="py-2">{ing.nom}</td>
                          <td className="py-2 text-right tabular">{ing.consomme}{ing.unite ? ` ${ing.unite}` : ""}</td>
                          <td className={cn("py-2 text-right tabular font-semibold", ing.stockActuel <= 0 && "text-destructive")}>{ing.stockActuel}{ing.unite ? ` ${ing.unite}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeakHoursChart({ peakHours }: { peakHours: { hour: number; orderCount: number }[] }) {
  const max = Math.max(1, ...peakHours.map((h) => h.orderCount));
  const active = peakHours.filter((h) => h.orderCount > 0);
  if (!active.length) {
    return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune commande sur cette période.</div>;
  }
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
      {peakHours.map((h) => (
        <div key={h.hour} className="flex w-6 shrink-0 flex-col items-center gap-1" title={`${h.hour}h : ${h.orderCount} commande(s)`}>
          <div className="flex h-24 w-full items-end">
            <div className={cn("w-full rounded-t-sm", h.orderCount > 0 ? "bg-primary" : "bg-muted")} style={{ height: `${Math.max(2, (h.orderCount / max) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-muted-foreground">{h.hour}</span>
        </div>
      ))}
    </div>
  );
}
