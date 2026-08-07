import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart3, TrendingUp, Percent, Coins, Moon, Loader2, FileDown, ArrowUp, ArrowDown, Minus,
  BedDouble, Wallet, Ban, UserX, CalendarDays, Trophy,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney, useMyRole, useShopSettings } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { renderA4Document, openPrintWindow, escapeHtml } from "@/lib/printDoc";
import {
  useHotelReservations, useHotelRooms, useRunNightAudit, nightsInRange,
  useHotelPaymentsInRange, useHotelFolioExtrasInRange, type HotelPaymentMethod,
} from "@/lib/data/hotelHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/rapports")({
  component: HotelReportsPage,
});

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }

const PAYMENT_LABEL: Record<HotelPaymentMethod, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", bank_transfer: "Virement",
};
const CHARGE_KIND_LABEL: Record<string, string> = {
  extra: "Extra", penalty: "Pénalité", tax: "Taxe", discount: "Remise",
};

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const delta = pct(current, previous);
  if (delta === null) return null;
  const positive = delta >= 0;
  const Icon = Math.abs(delta) < 0.5 ? Minus : positive ? ArrowUp : ArrowDown;
  return (
    <div className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      Math.abs(delta) < 0.5 ? "bg-muted text-muted-foreground" : positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
      <Icon className="h-3 w-3" /> {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs période précédente
    </div>
  );
}

function HotelReportsPage() {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canRunAudit = myRole === "owner" || myRole === "manager";
  const nightAudit = useRunNightAudit();
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();

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

  // Période précédente de même durée, pour la comparaison (même principe
  // que ZegResto/ZegERP — cf. app.resto.rapports.tsx).
  const prevRangeEnd = rangeStart;
  const prevRangeStart = addDays(rangeStart, -periodDays);

  const { data: rooms = [] } = useHotelRooms();
  const { data: reservations, isLoading: loadingReservations } = useHotelReservations(rangeStart, rangeEnd);
  const { data: prevReservations } = useHotelReservations(prevRangeStart, prevRangeEnd);
  const { data: payments = [], isLoading: loadingPayments } = useHotelPaymentsInRange(rangeStart, rangeEnd);
  const { data: extras = [], isLoading: loadingExtras } = useHotelFolioExtrasInRange(rangeStart, rangeEnd);

  // Prévision pickup : réservations déjà enregistrées pour les 7/30 prochains jours
  // à partir d'aujourd'hui — reste fixe, indépendant de la période sélectionnée
  // (une prévision se lit toujours depuis "maintenant").
  const today = toISO(new Date());
  const forecastEnd7 = addDays(today, 7);
  const forecastEnd30 = addDays(today, 30);
  const { data: forecast7 } = useHotelReservations(today, forecastEnd7);
  const { data: forecast30 } = useHotelReservations(today, forecastEnd30);

  const { nights, revenue } = useMemo(() => nightsInRange(reservations, rangeStart, rangeEnd), [reservations, rangeStart, rangeEnd]);
  const { nights: prevNights, revenue: prevRevenue } = useMemo(
    () => nightsInRange(prevReservations, prevRangeStart, prevRangeEnd), [prevReservations, prevRangeStart, prevRangeEnd]);
  const availableRoomNights = rooms.length * periodDays;
  const occupancyPct = availableRoomNights ? Math.round((nights / availableRoomNights) * 100) : 0;
  const prevOccupancyPct = availableRoomNights ? Math.round((prevNights / availableRoomNights) * 100) : 0;
  const adr = nights ? revenue / nights : 0;
  const revpar = availableRoomNights ? revenue / availableRoomNights : 0;

  const pickup7 = useMemo(() => nightsInRange(forecast7, today, forecastEnd7).nights, [forecast7, today, forecastEnd7]);
  const pickup30 = useMemo(() => nightsInRange(forecast30, today, forecastEnd30).nights, [forecast30, today, forecastEnd30]);

  // Répartition par type de chambre et par canal — calculées côté client à
  // partir des données déjà chargées (reservations + rooms, qui embarque
  // room_type), sans requête supplémentaire.
  const roomTypeById = useMemo(() => new Map(rooms.map((r) => [r.id, r.room_type?.name ?? "—"])), [rooms]);
  const { byRoomType, byChannel, noShowCount, cancelledCount } = useMemo(() => {
    const roomTypeMap = new Map<string, { nights: number; revenue: number }>();
    const channelMap = new Map<string, { count: number; revenue: number }>();
    let noShow = 0; let cancelled = 0;
    for (const res of reservations ?? []) {
      if (res.status === "no_show") noShow++;
      if (res.status === "cancelled") cancelled++;
      const channelKey = res.channel || "direct";
      for (const rr of res.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        const effectiveCheckOut = rr.check_out > rr.check_in ? rr.check_out : addDays(rr.check_in, 1);
        const start = rr.check_in < rangeStart ? rangeStart : rr.check_in;
        const end = effectiveCheckOut > rangeEnd ? rangeEnd : effectiveCheckOut;
        const n = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86400000);
        if (n <= 0) continue;
        const totalNights = Math.max(1, (new Date(effectiveCheckOut).getTime() - new Date(rr.check_in).getTime()) / 86400000);
        const rev = (rr.rate_amount / totalNights) * n;

        const typeName = roomTypeById.get(rr.room_id) ?? "—";
        const typeEntry = roomTypeMap.get(typeName) ?? { nights: 0, revenue: 0 };
        typeEntry.nights += n; typeEntry.revenue += rev;
        roomTypeMap.set(typeName, typeEntry);

        const chEntry = channelMap.get(channelKey) ?? { count: 0, revenue: 0 };
        chEntry.count += 1; chEntry.revenue += rev;
        channelMap.set(channelKey, chEntry);
      }
    }
    return {
      byRoomType: [...roomTypeMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue),
      byChannel: [...channelMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue),
      noShowCount: noShow, cancelledCount: cancelled,
    };
  }, [reservations, roomTypeById, rangeStart, rangeEnd]);

  const byPaymentMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (p.kind === "refund") continue;
      map.set(p.method, (map.get(p.method) ?? 0) + p.amount);
    }
    return [...map.entries()].map(([method, amount]) => ({ method: method as HotelPaymentMethod, amount })).sort((a, b) => b.amount - a.amount);
  }, [payments]);
  const totalCollected = byPaymentMethod.reduce((s, p) => s + p.amount, 0);

  const extrasByKind = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of extras) map.set(c.kind, (map.get(c.kind) ?? 0) + c.amount * c.quantity);
    return [...map.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount);
  }, [extras]);
  const extrasTotal = extrasByKind.reduce((s, e) => s + e.amount, 0);

  // Durée moyenne de séjour + top clients (mission "mise à jour ZegHotel",
  // Phase 2, point 7 — "rapports plus détaillés") : calculés côté client à
  // partir de `reservations`, déjà chargé pour byRoomType/byChannel
  // ci-dessus — pas de requête supplémentaire.
  const { alos, topGuests } = useMemo(() => {
    const arrivedStays = (reservations ?? []).filter((r) => r.status === "checked_in" || r.status === "checked_out");
    const totalStayNights = arrivedStays.reduce((s, r) =>
      s + Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000)), 0);
    const guestMap = new Map<string, { name: string; revenue: number; stays: number }>();
    for (const r of reservations ?? []) {
      if (r.status === "cancelled" || r.status === "no_show") continue;
      const guestId = r.guest_id;
      const entry = guestMap.get(guestId) ?? { name: r.guest?.full_name ?? "—", revenue: 0, stays: 0 };
      entry.stays += 1;
      for (const rr of r.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        entry.revenue += rr.rate_amount;
      }
      guestMap.set(guestId, entry);
    }
    return {
      alos: arrivedStays.length ? totalStayNights / arrivedStays.length : 0,
      topGuests: [...guestMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    };
  }, [reservations]);

  const isLoading = loadingReservations || loadingPayments || loadingExtras;

  const exportPdf = () => {
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Période</h2><div class="name">${escapeHtml(fromDate.toLocaleDateString("fr-FR"))} — ${escapeHtml(toDate.toLocaleDateString("fr-FR"))}</div></div>
        <div class="block" style="text-align:right"><h2>Comparaison</h2><div class="name">${escapeHtml(formatMoney(prevRevenue))} période précédente</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Indicateur</th><th class="num">Valeur</th></tr></thead>
        <tbody>
          <tr><td>Taux d'occupation</td><td class="num">${occupancyPct}%</td></tr>
          <tr><td>Nuits vendues</td><td class="num">${nights}</td></tr>
          <tr><td>ADR (prix moyen/nuit)</td><td class="num">${escapeHtml(formatMoney(adr))}</td></tr>
          <tr><td>RevPAR</td><td class="num">${escapeHtml(formatMoney(revpar))}</td></tr>
          <tr><td>Revenu hébergement</td><td class="num">${escapeHtml(formatMoney(revenue))}</td></tr>
          <tr><td>Revenu extras (hors chambre)</td><td class="num">${escapeHtml(formatMoney(extrasTotal))}</td></tr>
          <tr><td>Durée moyenne de séjour</td><td class="num">${alos.toFixed(1)} nuit${alos >= 2 ? "s" : ""}</td></tr>
          <tr><td>Annulations</td><td class="num">${cancelledCount}</td></tr>
          <tr><td>No-show</td><td class="num">${noShowCount}</td></tr>
        </tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Top clients (revenu)</h3>
      <table class="doc-table">
        <thead><tr><th>Client</th><th class="num">Séjours</th><th class="num">Revenu</th></tr></thead>
        <tbody>${topGuests.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td class="num">${g.stays}</td><td class="num">${escapeHtml(formatMoney(g.revenue))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Revenu par type de chambre</h3>
      <table class="doc-table">
        <thead><tr><th>Type</th><th class="num">Nuits</th><th class="num">Revenu</th></tr></thead>
        <tbody>${byRoomType.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td class="num">${t.nights.toFixed(1)}</td><td class="num">${escapeHtml(formatMoney(t.revenue))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Revenu par canal</h3>
      <table class="doc-table">
        <thead><tr><th>Canal</th><th class="num">Réservations</th><th class="num">Revenu</th></tr></thead>
        <tbody>${byChannel.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.count}</td><td class="num">${escapeHtml(formatMoney(c.revenue))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>

      <h3 style="margin-top:24px;font-size:13px;">Encaissements par mode de paiement</h3>
      <table class="doc-table">
        <thead><tr><th>Mode</th><th class="num">Montant</th></tr></thead>
        <tbody>${byPaymentMethod.map((p) => `<tr><td>${escapeHtml(PAYMENT_LABEL[p.method])}</td><td class="num">${escapeHtml(formatMoney(p.amount))}</td></tr>`).join("") || `<tr><td colspan="2">Aucune donnée</td></tr>`}</tbody>
      </table>
    `;
    const html = renderA4Document({
      docTitle: "Rapport ZegHotel",
      docDate: new Date().toLocaleString("fr-FR"),
      shop: {
        shopName: currentOrganization?.name ?? "Hôtel",
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
      <PageHeader title="Rapports" subtitle="Occupation, revenus et prévisions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector period={period} onChange={setPeriod}
              customFrom={customFrom} customTo={customTo}
              onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
            <button onClick={exportPdf} disabled={isLoading}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40">
              <FileDown className="h-4 w-4" /> Export PDF
            </button>
          </div>
        }
      />
      <div className="space-y-5 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"><Percent className="h-4 w-4" /> Taux d'occupation</div>
            <div className="tabular mt-1.5 font-display text-2xl font-bold tracking-tight">{occupancyPct}%</div>
            <div className="text-xs text-muted-foreground">{nights} nuits vendues</div>
            <TrendBadge current={occupancyPct} previous={prevOccupancyPct} />
          </div>
          <StatCard label="ADR (prix moyen/nuit)" value={formatMoney(adr)} icon={<Coins className="h-5 w-5" />} accent="accent" />
          <StatCard label="RevPAR" value={formatMoney(revpar)} hint="Revenu par chambre disponible" icon={<TrendingUp className="h-5 w-5" />} accent="success" />
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"><BarChart3 className="h-4 w-4" /> Revenu hébergement</div>
            <div className="tabular mt-1.5 font-display text-2xl font-bold tracking-tight">{formatMoney(revenue)}</div>
            <TrendBadge current={revenue} previous={prevRevenue} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Durée moyenne de séjour" value={`${alos.toFixed(1)} nuit${alos >= 2 ? "s" : ""}`} icon={<CalendarDays className="h-5 w-5" />} accent="primary" />
          <StatCard label="Revenu extras (hors chambre)" value={formatMoney(extrasTotal)} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Annulations" value={String(cancelledCount)} icon={<Ban className="h-5 w-5" />} />
          <StatCard label="No-show" value={String(noShowCount)} icon={<UserX className="h-5 w-5" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BedDouble className="h-4 w-4 text-primary" /> Revenu par type de chambre</div>
            {byRoomType.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune donnée sur la période.</div>
            ) : (
              <div className="space-y-2">
                {byRoomType.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t.name} <span className="text-xs">({t.nights.toFixed(1)} nuits)</span></span>
                    <span className="tabular font-semibold">{formatMoney(t.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Revenu par canal</div>
            {byChannel.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune donnée sur la période.</div>
            ) : (
              <div className="space-y-2">
                {byChannel.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{c.name} <span className="text-xs">({c.count} résa.)</span></span>
                    <span className="tabular font-semibold">{formatMoney(c.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> Encaissements par mode de paiement</div>
            {byPaymentMethod.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun encaissement sur la période.</div>
            ) : (
              <div className="space-y-2">
                {byPaymentMethod.map((p) => (
                  <div key={p.method} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{PAYMENT_LABEL[p.method]}</span>
                    <span className="tabular font-semibold">{formatMoney(p.amount)}</span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
                  <span>Total</span><span className="tabular">{formatMoney(totalCollected)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Top clients (revenu)</div>
            {topGuests.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune donnée sur la période.</div>
            ) : (
              <div className="space-y-2">
                {topGuests.map((g, i) => (
                  <div key={g.name + i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{i + 1}. {g.name} <span className="text-xs">({g.stays} séjour{g.stays > 1 ? "s" : ""})</span></span>
                    <span className="tabular font-semibold">{formatMoney(g.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> Détail des extras</div>
            {extrasByKind.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune charge extra sur la période.</div>
            ) : (
              <div className="space-y-2">
                {extrasByKind.map((e) => (
                  <div key={e.kind} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{CHARGE_KIND_LABEL[e.kind] ?? e.kind}</span>
                    <span className="tabular font-semibold">{formatMoney(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
