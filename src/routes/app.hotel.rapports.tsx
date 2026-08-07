import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart3, TrendingUp, Percent, Coins, Moon, Loader2, FileDown, ArrowUp, ArrowDown, Minus,
  BedDouble, Wallet, Ban, UserX, CalendarDays, Trophy, Banknote, Users, Truck, Package,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney, useMyRole, useShopSettings, useExpenses, useProducts, useSuppliers } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { renderA4Document, openPrintWindow, escapeHtml } from "@/lib/printDoc";
import {
  useHotelReservations, useHotelRooms, useRunNightAudit, nightsInRange,
  useHotelPaymentsInRange, useHotelFolioExtrasInRange, useHotelPosSales, type HotelPaymentMethod,
} from "@/lib/data/hotelHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/rapports")({
  component: HotelReportsPage,
});

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }
// Abrégé pour l'axe du graphique (formatMoney() n'a pas de mode compact) —
// le montant complet reste affiché dans le tooltip via formatMoney().
function compactAmount(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

const PAYMENT_LABEL: Record<HotelPaymentMethod, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", bank_transfer: "Virement",
};
const CHARGE_KIND_LABEL: Record<string, string> = {
  extra: "Extra", penalty: "Pénalité", tax: "Taxe", discount: "Remise",
};

// Rapports par onglet (mission "Round 2", 4 apps — même pattern que
// /app/rapports, ZegCaisse) : Ventes/Dépenses/Clients/Fournisseurs/
// Produits/Meilleurs mois s'ajoutent ici aux indicateurs PMS déjà en
// place (occupation/ADR/RevPAR — restent toujours visibles au-dessus,
// ce ne sont pas des "rapports" au sens de cette liste mais le tableau
// de bord de la page). "Meilleures chambres" remplace "Meilleurs
// produits" (pas de notion de produit vendable hors du PDV interne côté
// hôtel — voir l'onglet "produits" séparé, alimenté par hotel_pos_sales).
const REPORTS = [
  { id: "ventes", label: "Ventes (hébergement)", icon: BarChart3 },
  { id: "rooms", label: "Meilleures chambres", icon: BedDouble },
  { id: "clients", label: "Clients", icon: Users },
  { id: "fournisseurs", label: "Fournisseurs", icon: Truck },
  { id: "produits", label: "Produits (PDV interne)", icon: Package },
  { id: "depenses", label: "Dépenses", icon: Banknote },
  { id: "months", label: "Meilleurs mois", icon: Trophy },
] as const;
type ReportId = (typeof REPORTS)[number]["id"];

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
  const [report, setReport] = useState<ReportId>("ventes");
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
      topGuests: [...guestMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
  }, [reservations]);

  // Meilleures chambres (nouvel onglet, refonte "Rapports par onglet") —
  // même boucle que byRoomType ci-dessus mais agrégée par CHAMBRE (numéro
  // réel), pas par type.
  const roomNumberById = useMemo(() => new Map(rooms.map((r) => [r.id, r.number])), [rooms]);
  const byRoom = useMemo(() => {
    const map = new Map<string, { nights: number; revenue: number }>();
    for (const res of reservations ?? []) {
      for (const rr of res.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        const effectiveCheckOut = rr.check_out > rr.check_in ? rr.check_out : addDays(rr.check_in, 1);
        const start = rr.check_in < rangeStart ? rangeStart : rr.check_in;
        const end = effectiveCheckOut > rangeEnd ? rangeEnd : effectiveCheckOut;
        const n = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86400000);
        if (n <= 0) continue;
        const totalNights = Math.max(1, (new Date(effectiveCheckOut).getTime() - new Date(rr.check_in).getTime()) / 86400000);
        const rev = (rr.rate_amount / totalNights) * n;
        const number = roomNumberById.get(rr.room_id) ?? "—";
        const entry = map.get(number) ?? { nights: 0, revenue: 0 };
        entry.nights += n; entry.revenue += rev;
        map.set(number, entry);
      }
    }
    return [...map.entries()].map(([number, v]) => ({ number, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [reservations, roomNumberById, rangeStart, rangeEnd]);

  // Fournisseurs / Produits (nouveaux onglets) — alimentés par le point de
  // vente interne (piscine/bar/restaurant, hotel_pos_sales), seul canal de
  // vente de produits côté ZegHotel — products/suppliers sont des tables
  // partagées avec ZegCaisse (cf. /app/hotel/produits, /app/hotel/fournisseurs).
  const { data: posSales = [] } = useHotelPosSales({ from: fromDate.toISOString(), to: toDate.toISOString() });
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const supplierIdByProduct = useMemo(() => new Map(products.map((p) => [p.id, p.supplier_id])), [products]);
  const supplierNameById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const { byProduct, bySupplier } = useMemo(() => {
    const productMap = new Map<string, { name: string; qty: number; ca: number }>();
    const supplierMap = new Map<string, { name: string; qty: number; ca: number }>();
    for (const sale of posSales) {
      for (const item of sale.items) {
        const key = item.product_id ?? `manuel:${item.name}`;
        const pEntry = productMap.get(key) ?? { name: item.name, qty: 0, ca: 0 };
        pEntry.qty += item.quantity; pEntry.ca += item.unit_price * item.quantity;
        productMap.set(key, pEntry);

        const supplierId = item.product_id ? supplierIdByProduct.get(item.product_id) : null;
        if (!supplierId) continue;
        const supplierName = supplierNameById.get(supplierId) ?? "Fournisseur";
        const sEntry = supplierMap.get(supplierId) ?? { name: supplierName, qty: 0, ca: 0 };
        sEntry.qty += item.quantity; sEntry.ca += item.unit_price * item.quantity;
        supplierMap.set(supplierId, sEntry);
      }
    }
    return {
      byProduct: [...productMap.values()].sort((a, b) => b.ca - a.ca).slice(0, 15),
      bySupplier: [...supplierMap.values()].sort((a, b) => b.ca - a.ca),
    };
  }, [posSales, supplierIdByProduct, supplierNameById]);

  // Dépenses (mission "Round 2 ZegHotel", item 6) — jusqu'ici absentes des
  // rapports malgré un module Dépenses actif ; même filtre client que le
  // dashboard (expenses est une table partagée, pas de hook hotelHooks dédié).
  const { data: expenses = [] } = useExpenses();
  const expensesInRange = useMemo(() => expenses
    .filter((e) => { const d = new Date(e.paid_at + "T12:00:00"); return d >= fromDate && d <= toDate; }), [expenses, fromDate, toDate]);
  const periodExpensesTotal = useMemo(() => expensesInRange.reduce((s, e) => s + Number(e.amount || 0), 0), [expensesInRange]);
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; ca: number }>();
    for (const e of expensesInRange) {
      const key = e.category?.trim() || "Sans catégorie";
      const entry = map.get(key) ?? { name: key, qty: 0, ca: 0 };
      entry.qty += 1; entry.ca += Number(e.amount || 0);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.ca - a.ca);
  }, [expensesInRange]);

  // Meilleurs mois (nouvel onglet) — 12 derniers mois glissants,
  // indépendant du sélecteur de période ci-dessus (revenu hébergement +
  // extras, même définition que le résultat net affiché plus haut).
  const twelveMonthsStart = useMemo(() => toISO(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)), []);
  const todayIso = useMemo(() => toISO(new Date()), []);
  const { data: yearReservations } = useHotelReservations(twelveMonthsStart, todayIso);
  const { data: yearExtras = [] } = useHotelFolioExtrasInRange(twelveMonthsStart, todayIso);
  const bestMonths = useMemo(() => {
    const map = new Map<string, { key: string; label: string; ca: number }>();
    for (const res of yearReservations ?? []) {
      for (const rr of res.reservation_rooms) {
        if (rr.status === "cancelled" || rr.status === "no_show") continue;
        const d = new Date(rr.check_in + "T00:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        const entry = map.get(key) ?? { key, label, ca: 0 };
        entry.ca += rr.rate_amount;
        map.set(key, entry);
      }
    }
    for (const c of yearExtras) {
      const d = new Date(c.charge_date + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      const entry = map.get(key) ?? { key, label, ca: 0 };
      entry.ca += c.amount * c.quantity;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [yearReservations, yearExtras]);

  // Ventes (onglet "Ventes (hébergement)") — revenu hébergement par jour
  // sur la période sélectionnée, regroupé par semaine au-delà d'un mois
  // (même repli que le graphique du dashboard, app.hotel.index.tsx).
  const ventesByDay = useMemo(() => {
    const bucketDays = periodDays > 31 ? 7 : 1;
    const points: { label: string; ca: number }[] = [];
    for (let i = 0; i < periodDays; i += bucketDays) {
      const bStart = addDays(rangeStart, i);
      const bDays = Math.min(bucketDays, periodDays - i);
      const bEnd = addDays(bStart, bDays);
      const { revenue: bRevenue } = nightsInRange(reservations, bStart, bEnd);
      const label = new Date(bStart + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      points.push({ label, ca: Math.round(bRevenue) });
    }
    return points;
  }, [reservations, rangeStart, periodDays]);
  const netResult = revenue + extrasTotal - periodExpensesTotal;

  const isLoading = loadingReservations || loadingPayments || loadingExtras;

  // Lignes génériques par onglet (mission "Round 2", pattern partagé avec
  // /app/rapports ZegCaisse) — {label, qty, ca}, réutilisées par le
  // graphique et le tableau ci-dessous, ainsi que par l'export PDF par
  // onglet (exportTabPdf).
  const currentRows: { label: string; qty: number; ca: number }[] = useMemo(() => {
    if (report === "ventes") return ventesByDay.map((d) => ({ label: d.label, qty: 0, ca: d.ca }));
    if (report === "rooms") return byRoom.map((r) => ({ label: `Chambre ${r.number}`, qty: Math.round(r.nights), ca: r.revenue }));
    if (report === "clients") return topGuests.map((g) => ({ label: g.name, qty: g.stays, ca: g.revenue }));
    if (report === "fournisseurs") return bySupplier.map((s) => ({ label: s.name, qty: s.qty, ca: s.ca }));
    if (report === "produits") return byProduct.map((p) => ({ label: p.name, qty: p.qty, ca: p.ca }));
    if (report === "depenses") return expensesByCategory.map((e) => ({ label: e.name, qty: e.qty, ca: e.ca }));
    if (report === "months") return bestMonths.map((m) => ({ label: m.label, qty: 0, ca: m.ca }));
    return [];
  }, [report, ventesByDay, byRoom, topGuests, bySupplier, byProduct, expensesByCategory, bestMonths]);
  const chartRows = useMemo(() => (report === "ventes" || report === "months") ? [...currentRows].reverse() : currentRows, [report, currentRows]);

  const exportTabPdf = () => {
    const reportLabel = REPORTS.find((r) => r.id === report)?.label ?? "";
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Période</h2><div class="name">${report === "months" ? "12 derniers mois" : `${escapeHtml(fromDate.toLocaleDateString("fr-FR"))} — ${escapeHtml(toDate.toLocaleDateString("fr-FR"))}`}</div></div>
        <div class="block" style="text-align:right"><h2>Lignes</h2><div class="name">${currentRows.length}</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Libellé</th><th class="num">Qté</th><th class="num">Montant</th></tr></thead>
        <tbody>${currentRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.qty}</td><td class="num">${escapeHtml(formatMoney(r.ca))}</td></tr>`).join("") || `<tr><td colspan="3">Aucune donnée</td></tr>`}</tbody>
      </table>`;
    const html = renderA4Document({
      docTitle: `Rapport — ${reportLabel}`,
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
          <tr><td>Dépenses</td><td class="num">${escapeHtml(formatMoney(periodExpensesTotal))}</td></tr>
          <tr><td>Résultat net</td><td class="num">${escapeHtml(formatMoney(netResult))}</td></tr>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Dépenses" value={formatMoney(periodExpensesTotal)} icon={<Wallet className="h-5 w-5" />} accent="destructive" />
          <StatCard label="Résultat net" value={formatMoney(netResult)} hint="Hébergement + extras − dépenses"
            icon={<TrendingUp className="h-5 w-5" />} accent={netResult >= 0 ? "success" : "destructive"} />
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button key={r.id} onClick={() => setReport(r.id)}
                className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium", report === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {r.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {REPORTS.find((r) => r.id === report)?.label} · {report === "months" ? "12 derniers mois" : `${fromDate.toLocaleDateString("fr-FR")} — ${toDate.toLocaleDateString("fr-FR")}`}
            </div>
            <button onClick={exportTabPdf} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
          {currentRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</div>
          ) : (
            <>
              <div className="mb-4 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      interval="preserveStartEnd" tickFormatter={(v: string) => v.length > 12 ? `${v.slice(0, 12)}…` : v} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactAmount} />
                    <Tooltip formatter={(value: number) => [formatMoney(value), "Montant"]} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                    <Bar dataKey="ca" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">
                        {report === "ventes" ? "Jour" : report === "months" ? "Mois" : report === "clients" ? "Client" : report === "fournisseurs" ? "Fournisseur" : report === "depenses" ? "Catégorie" : report === "rooms" ? "Chambre" : "Produit"}
                      </th>
                      <th className="px-3 py-2 text-right">{report === "clients" ? "Séjours" : report === "rooms" ? "Nuits" : "Qté"}</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{r.label}</td>
                        <td className="tabular px-3 py-2 text-right">{r.qty || "—"}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{formatMoney(r.ca)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
