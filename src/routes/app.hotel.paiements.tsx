// Module Paiements ZegHotel (mission "mise à jour ZegHotel", item 10,
// refonte "corrige durement" — bug remonté : "je ne vois pas tout les
// paiements effectués à la caisse [point de vente] ni la réceptionniste
// (réservation et séjour), je ne parle pas de Money Fusion ici") —
// répertoire unifié des 3 canaux d'encaissement ZegHotel :
//   - "online"    : payment_requests (MoneyFusion, migration 083)
//   - "reception" : hotel_payments (acomptes/règlements/remboursements de
//                    séjour encaissés au comptoir, migration 028)
//   - "pos"       : hotel_pos_sales (ventes comptoir bar/restaurant/piscine
//                    réglées immédiatement, migration 077)
// Pas d'action d'écriture proposée ici : les 3 tables sources ont chacune
// leurs propres écrans de saisie (folio, POS interne, webhook MoneyFusion),
// cette page ne fait que consolider en lecture pour une vue "tout ce qui a
// été encaissé".
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, Search, X, Copy, Check, CheckCircle2, Clock, XCircle, Loader2, Globe, Store, BedDouble } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney } from "@/lib/data/hooks";
import { usePaymentRequestsList, type PaymentRequestStatus } from "@/lib/data/paymentHooks";
import { useHotelFolioPaymentsList, useHotelPosSales } from "@/lib/data/hotelHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/paiements")({
  component: PaiementsPage,
});

const STATUS_LABEL: Record<PaymentRequestStatus, string> = { pending: "En attente", paid: "Payé", failed: "Échoué" };
const STATUS_STYLE: Record<PaymentRequestStatus, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};
const STATUS_ICON: Record<PaymentRequestStatus, typeof Clock> = { pending: Clock, paid: CheckCircle2, failed: XCircle };
const TARGET_LABEL: Record<string, string> = {
  hotel_folios: "Note de séjour", sales: "Vente", resto_bills: "Note restaurant", erp_pos_sales: "Vente POS",
};

type PaymentSource = "online" | "reception" | "pos";
const SOURCE_LABEL: Record<PaymentSource, string> = { online: "En ligne", reception: "Réception", pos: "Caisse" };
const SOURCE_ICON: Record<PaymentSource, typeof Globe> = { online: Globe, reception: BedDouble, pos: Store };
const SOURCE_STYLE: Record<PaymentSource, string> = {
  online: "bg-accent/10 text-accent-foreground", reception: "bg-primary/10 text-primary", pos: "bg-secondary text-secondary-foreground",
};

const HOTEL_METHOD_LABEL: Record<string, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", bank_transfer: "Virement", credit: "Crédit", mixed: "Mixte",
};
const KIND_LABEL: Record<string, string> = { deposit: "Acompte de séjour", payment: "Règlement de séjour", refund: "Remboursement de séjour" };

// Forme commune aux 3 sources — assez pour lister/filtrer/afficher un
// détail sans que la page ait besoin de connaître les colonnes propres à
// chaque table source.
type UnifiedPaymentRow = {
  id: string;
  source: PaymentSource;
  status: PaymentRequestStatus;
  amount: number;
  methodLabel: string;
  fullName: string | null;
  phone: string | null;
  reference: string | null;
  targetLabel: string;
  createdAt: string;
  paidAt: string | null;
};

function PaiementsPage() {
  const formatMoney = useFormatMoney();
  const { data: onlinePayments = [], isLoading: loadingOnline } = usePaymentRequestsList("hotel");
  const { data: receptionPayments = [], isLoading: loadingReception } = useHotelFolioPaymentsList();
  const { data: posSales = [], isLoading: loadingPos } = useHotelPosSales(300);
  const isLoading = loadingOnline || loadingReception || loadingPos;

  const rows = useMemo<UnifiedPaymentRow[]>(() => {
    const online: UnifiedPaymentRow[] = onlinePayments.map((p) => ({
      id: `online-${p.id}`, source: "online", status: p.status, amount: p.amount,
      methodLabel: p.provider || "Mobile Money", fullName: p.full_name, phone: p.phone,
      reference: p.provider_ref, targetLabel: TARGET_LABEL[p.target_table] ?? p.target_table,
      createdAt: p.created_at, paidAt: p.paid_at,
    }));
    // hotel_payments n'a pas de statut : c'est un encaissement déjà
    // effectué au comptoir, donc toujours "paid" — un remboursement reste
    // affiché en montant positif (le libellé "Remboursement de séjour" et
    // l'icône le distinguent) mais compte négativement dans le total encaissé.
    const reception: UnifiedPaymentRow[] = receptionPayments.map((p) => ({
      id: `reception-${p.id}`, source: "reception", status: "paid", amount: p.kind === "refund" ? -p.amount : p.amount,
      methodLabel: HOTEL_METHOD_LABEL[p.method] ?? p.method, fullName: p.guest_name, phone: null,
      reference: p.reference, targetLabel: KIND_LABEL[p.kind] ?? p.kind,
      createdAt: p.created_at, paidAt: p.created_at,
    }));
    // Vente comptoir : seul le montant réellement encaissé (paid) compte
    // comme "paiement" — une vente à crédit non réglée (paid = 0) n'a pas
    // sa place dans un répertoire d'encaissements.
    const pos: UnifiedPaymentRow[] = posSales.filter((s) => s.paid > 0).map((s) => ({
      id: `pos-${s.id}`, source: "pos", status: "paid", amount: s.paid,
      methodLabel: HOTEL_METHOD_LABEL[s.payment_method] ?? s.payment_method, fullName: null, phone: null,
      reference: s.reference, targetLabel: "Vente comptoir",
      createdAt: s.created_at, paidAt: s.created_at,
    }));
    return [...online, ...reception, ...pos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [onlinePayments, receptionPayments, posSales]);

  const [query, setQuery] = useState("");
  // Défaut sur "paid" (mission "Round 2 ZegHotel", item 5 : "afficher
  // automatiquement que les paiements effectués par les clients") — les
  // autres statuts restent consultables via les boutons, juste plus le
  // filtre par défaut à l'ouverture du module. Caisse/réception sont
  // toujours "paid" (aucun état pending/failed côté encaissement direct),
  // donc ce filtre par défaut les inclut désormais naturellement.
  const [statusFilter, setStatusFilter] = useState<PaymentRequestStatus | "all">("paid");
  const [sourceFilter, setSourceFilter] = useState<PaymentSource | "all">("all");
  const [selected, setSelected] = useState<UnifiedPaymentRow | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from: periodFrom, to: periodTo } = periodRange(period, customFrom, customTo);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
      const createdAt = new Date(p.createdAt);
      if (createdAt < periodFrom || createdAt >= periodTo) return false;
      if (!q) return true;
      return (p.fullName ?? "").toLowerCase().includes(q) || (p.phone ?? "").includes(q) || (p.reference ?? "").toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter, sourceFilter, periodFrom, periodTo]);

  const totalPaid = filtered.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingCount = filtered.filter((p) => p.status === "pending").length;
  const failedCount = filtered.filter((p) => p.status === "failed").length;

  return (
    <div>
      <PageHeader title="Paiements" subtitle="Répertoire de tous les encaissements — caisse, réception et paiements en ligne"
        actions={<PeriodSelector period={period} onChange={setPeriod}
          customFrom={customFrom} customTo={customTo}
          onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />} />
      <div className="space-y-4 p-4 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total encaissé" value={formatMoney(totalPaid)} icon={<Wallet className="h-5 w-5" />} accent="success" />
          <StatCard label="En attente" value={String(pendingCount)} icon={<Clock className="h-5 w-5" />} accent="accent" />
          <StatCard label="Échoués" value={String(failedCount)} icon={<XCircle className="h-5 w-5" />} accent="destructive" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, téléphone, référence…"
              className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
          </div>
          <div className="flex gap-1">
            {(["paid", "pending", "failed", "all"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn("rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold", statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
                {s === "all" ? "Tous" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["all", "pos", "reception", "online"] as const).map((s) => (
              <button key={s} onClick={() => setSourceFilter(s)}
                className={cn("rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold", sourceFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
                {s === "all" ? "Toutes sources" : SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "Aucun paiement pour l'instant." : "Aucun paiement ne correspond à ces filtres."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const StatusIcon = STATUS_ICON[p.status];
              const SourceIcon = SOURCE_ICON[p.source];
              return (
                <button key={p.id} onClick={() => setSelected(p)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/40">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.fullName || (p.source === "pos" ? "Client de passage" : "—")}</div>
                    <div className="text-xs text-muted-foreground">{p.phone ? `${p.phone} · ` : ""}{new Date(p.createdAt).toLocaleString("fr-FR")} · {p.targetLabel}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", SOURCE_STYLE[p.source])}>
                      <SourceIcon className="h-3.5 w-3.5" /> {SOURCE_LABEL[p.source]}
                    </span>
                    <span className="tabular font-bold">{formatMoney(p.amount)}</span>
                    <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[p.status])}>
                      <StatusIcon className="h-3.5 w-3.5" /> {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && <PaymentDetailModal payment={selected} onClose={() => setSelected(null)} formatMoney={formatMoney} />}
    </div>
  );
}

function PaymentDetailModal({ payment, onClose, formatMoney }: {
  payment: UnifiedPaymentRow; onClose: () => void; formatMoney: (n: number) => string;
}) {
  const [copied, setCopied] = useState(false);
  const StatusIcon = STATUS_ICON[payment.status];
  const copyRef = () => {
    if (!payment.reference) return;
    navigator.clipboard.writeText(payment.reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Détail du paiement</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between rounded-xl bg-muted/40 p-4">
            <span className="text-2xl font-bold tabular">{formatMoney(payment.amount)}</span>
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", STATUS_STYLE[payment.status])}>
              <StatusIcon className="h-4 w-4" /> {STATUS_LABEL[payment.status]}
            </span>
          </div>
          {row("Client", payment.fullName || (payment.source === "pos" ? "Client de passage" : "—"))}
          {payment.phone && row("Téléphone", payment.phone)}
          {row("Source", SOURCE_LABEL[payment.source])}
          {row("Type", payment.targetLabel)}
          {row("Mode", payment.methodLabel)}
          {row("Créé le", new Date(payment.createdAt).toLocaleString("fr-FR"))}
          {payment.paidAt && payment.paidAt !== payment.createdAt && row("Payé le", new Date(payment.paidAt).toLocaleString("fr-FR"))}
          {payment.reference && (
            <div className="flex items-center justify-between border-b border-border/60 py-2.5 text-sm last:border-0">
              <span className="text-muted-foreground">Référence</span>
              <button onClick={copyRef} className="flex items-center gap-1.5 font-mono text-xs hover:text-primary">
                {payment.reference} {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
