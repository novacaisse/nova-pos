// Module Paiements ZegHotel (mission "mise à jour ZegHotel", item 10) —
// liste en lecture des paiements MoneyFusion réels (payment_requests,
// migration 083) pour ce module, avec un détail par paiement. Pas d'action
// d'écriture proposée ici : payment_requests_select est la seule policy sur
// cette table pour authenticated (écriture réservée au service_role via les
// Edge Functions create-module-payment / moneyfusion-webhook), donc "les
// actions" se limitent à consulter le détail et copier la référence
// MoneyFusion — il n'existe pas de retry/annulation côté client à exposer.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, Search, X, Copy, Check, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import { usePaymentRequestsList, type PaymentRequestRow, type PaymentRequestStatus } from "@/lib/data/paymentHooks";
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

function PaiementsPage() {
  const formatMoney = useFormatMoney();
  const { data: payments = [], isLoading } = usePaymentRequestsList("hotel");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentRequestStatus | "all">("all");
  const [selected, setSelected] = useState<PaymentRequestRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (p.full_name ?? "").toLowerCase().includes(q) || (p.phone ?? "").includes(q) || (p.provider_ref ?? "").toLowerCase().includes(q);
    });
  }, [payments, query, statusFilter]);

  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const failedCount = payments.filter((p) => p.status === "failed").length;

  return (
    <div>
      <PageHeader title="Paiements" subtitle="Paiements Mobile Money (MoneyFusion) — acomptes et règlements de notes de séjour" />
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
            {(["all", "pending", "paid", "failed"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn("rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold", statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
                {s === "all" ? "Tous" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {payments.length === 0 ? "Aucun paiement Mobile Money pour l'instant." : "Aucun paiement ne correspond à ces filtres."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const Icon = STATUS_ICON[p.status];
              return (
                <button key={p.id} onClick={() => setSelected(p)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/40">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.phone || "—"} · {new Date(p.created_at).toLocaleString("fr-FR")} · {TARGET_LABEL[p.target_table] ?? p.target_table}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular font-bold">{formatMoney(p.amount)}</span>
                    <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[p.status])}>
                      <Icon className="h-3.5 w-3.5" /> {STATUS_LABEL[p.status]}
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
  payment: PaymentRequestRow; onClose: () => void; formatMoney: (n: number) => string;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = STATUS_ICON[payment.status];
  const copyRef = () => {
    if (!payment.provider_ref) return;
    navigator.clipboard.writeText(payment.provider_ref);
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
              <Icon className="h-4 w-4" /> {STATUS_LABEL[payment.status]}
            </span>
          </div>
          {row("Client", payment.full_name || "—")}
          {row("Téléphone", payment.phone || "—")}
          {row("Cible", TARGET_LABEL[payment.target_table] ?? payment.target_table)}
          {row("Fournisseur", payment.provider)}
          {row("Créé le", new Date(payment.created_at).toLocaleString("fr-FR"))}
          {payment.paid_at && row("Payé le", new Date(payment.paid_at).toLocaleString("fr-FR"))}
          {payment.provider_ref && (
            <div className="flex items-center justify-between border-b border-border/60 py-2.5 text-sm last:border-0">
              <span className="text-muted-foreground">Référence</span>
              <button onClick={copyRef} className="flex items-center gap-1.5 font-mono text-xs hover:text-primary">
                {payment.provider_ref} {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
