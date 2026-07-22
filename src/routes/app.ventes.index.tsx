import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Download, Receipt, X, Wallet, Banknote, Smartphone, CreditCard,
  Plus, Printer, FileText, Ban, CreditCard as CardIcon, Loader2, Edit3,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useShop } from "@/lib/auth/ShopProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useSales, useMyRole, useCancelSale, useAddSalePayment,
  useShopSettings, useProfile, DEFAULT_TICKET_CONFIG,
  formatXOF, type Sale, type SaleItem,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

type SaleFull = Sale & { sale_items: SaleItem[]; customers: { name: string } | null };

export const Route = createFileRoute("/app/ventes/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: VentesPage,
});

const PAY_LABEL: Record<Sale["payment_method"], string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", credit: "Crédit", mixed: "Mixte",
};
const PAY_ICON: Record<Sale["payment_method"], typeof Banknote> = {
  cash: Banknote, mobile_money: Smartphone, card: CreditCard, credit: Wallet, mixed: Wallet,
};

function VentesPage() {
  const { q } = Route.useSearch();
  // Un lien de recherche global doit pouvoir retrouver une vente même hors
  // de la période par défaut : on part large ("Cette année") dans ce cas.
  const [period, setPeriod] = useState<Period>(q ? "year" : "month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);

  const { data: sales = [], isLoading } = useSales({ from: from.toISOString(), to: to.toISOString(), limit: 1000 });
  const [query, setQuery] = useState(q ?? "");
  const [payFilter, setPayFilter] = useState<"all" | Sale["payment_method"]>("all");
  const [selected, setSelected] = useState<SaleFull | null>(null);

  const filtered = useMemo(() => sales.filter((s) => {
    if (payFilter !== "all" && s.payment_method !== payFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return s.reference.toLowerCase().includes(q) || (s.customers?.name ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [sales, query, payFilter]);

  const totalRevenue = filtered.reduce((s, x) => s + Number(x.total || 0), 0);
  const avg = filtered.length ? Math.round(totalRevenue / filtered.length) : 0;

  return (
    <div>
      <PageHeader title="Ventes" subtitle={`${filtered.length} transaction${filtered.length > 1 ? "s" : ""}`}
        actions={
          <>
            <PeriodSelector period={period} onChange={setPeriod}
              customFrom={customFrom} customTo={customTo}
              onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Exporter</button>
            <Link to="/app/ventes/nouvelle" className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
              <Plus className="h-4 w-4" /> Nouvelle vente
            </Link>
          </>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="CA de la période" value={formatXOF(totalRevenue)} icon={<Wallet className="h-5 w-5" />} accent="primary" />
          <StatCard label="Tickets" value={String(filtered.length)} icon={<Receipt className="h-5 w-5" />} accent="accent" />
          <StatCard label="Panier moyen" value={formatXOF(avg)} icon={<Wallet className="h-5 w-5" />} accent="success" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher ticket, client…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as any)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">Tous paiements</option>
              {(Object.keys(PAY_LABEL) as Sale["payment_method"][]).map((k) => <option key={k} value={k}>{PAY_LABEL[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Aucune vente pour l'instant. Passez à la caisse pour enregistrer votre première vente.</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th><th className="px-4 py-3">Paiement</th><th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const Icon = PAY_ICON[s.payment_method];
                return (
                  <tr key={s.id} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => setSelected(s)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{s.reference}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.customers?.name ?? "Comptoir"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                        <Icon className="h-3 w-3" /> {PAY_LABEL[s.payment_method]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        s.status === "completed" && "bg-success/15 text-success",
                        s.status === "refunded" && "bg-destructive/15 text-destructive",
                        s.status === "partially_refunded" && "bg-warning/20 text-warning-foreground",
                        s.status === "draft" && "bg-muted text-muted-foreground",
                        s.status === "cancelled" && "bg-muted text-muted-foreground",
                      )}>{SALE_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(Number(s.total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <DetailDialog sale={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        {children}
      </motion.div>
    </motion.div>
  );
}

const SALE_STATUS_LABEL: Record<Sale["status"], string> = {
  completed: "Payée", draft: "En attente", refunded: "Remboursée",
  partially_refunded: "Remb. partielle", cancelled: "Annulée",
};

function DetailDialog({ sale, onClose }: { sale: SaleFull; onClose: () => void }) {
  const { currentShop } = useShop();
  const { data: settings } = useShopSettings();
  const { data: profile } = useProfile();
  const { data: myRole } = useMyRole();
  const { user } = useAuth();
  const cancelSale = useCancelSale();
  const printRef = useRef<HTMLDivElement>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const canManage = myRole === "owner" || myRole === "manager";
  const canPay = myRole === "owner" || myRole === "manager" || myRole === "cashier";
  const isDue = Number(sale.paid) < Number(sale.total);
  const canCancel = canManage && (sale.status === "completed" || sale.status === "partially_refunded");
  const canComplementaryPay = canPay && isDue && sale.status !== "draft" && sale.status !== "cancelled";
  // Reprendre un brouillon le supprime ensuite (useDeleteHoldTicket) : il faut
  // donc les mêmes droits que la suppression réelle — owner/manager, ou le
  // caissier qui a lui-même mis ce ticket en attente (RLS étendue en ce sens).
  const canEditDraft = sale.status === "draft" && (canManage || (myRole === "cashier" && sale.cashier_id === user?.id));

  const printDocument = (mode: "receipt" | "proforma") => {
    if (!printRef.current) return;
    const title = mode === "proforma" ? `Proforma ${sale.reference}` : `Reçu ${sale.reference}`;
    const w = window.open("", "_blank", "width=420,height=680");
    if (!w) return;
    w.document.write(`<html><head><title>${title}</title>
      <style>body{font-family:-apple-system,sans-serif;font-size:12px;padding:16px;color:#000}
      h1{font-size:14px;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}img{max-width:80px;display:block;margin:0 auto 6px}
      .center{text-align:center}.b{font-weight:700}.banner{text-align:center;font-weight:700;letter-spacing:1px;margin-bottom:8px}
      </style></head><body>${mode === "proforma" ? '<div class="banner">FACTURE PROFORMA — NON FISCALE</div>' : ""}${printRef.current!.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 200);
  };

  const ticket = { ...DEFAULT_TICKET_CONFIG, ...(settings?.data.ticket ?? {}) };
  const extra = settings?.data ?? {};

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
        <div><div className="text-xs opacity-80">Détail ticket</div><div className="font-display text-lg font-bold">{sale.reference}</div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Info label="Date" value={new Date(sale.created_at).toLocaleString("fr-FR")} />
            <Info label="Paiement" value={PAY_LABEL[sale.payment_method]} />
            <Info label="Client" value={sale.customers?.name ?? "Comptoir"} />
            <Info label="Statut" value={SALE_STATUS_LABEL[sale.status]} />
          </div>
          <div className="rounded-xl border border-border">
            {sale.sale_items.map((l, i) => (
              <div key={l.id ?? i} className={cn("flex items-center justify-between px-3 py-2 text-sm", i > 0 && "border-t border-border/60")}>
                <div><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.quantity} × {formatXOF(Number(l.unit_price))}</div></div>
                <div className="tabular font-semibold">{formatXOF(Number(l.total))}</div>
              </div>
            ))}
            {sale.sale_items.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Aucune ligne.</div>}
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground"><span>Remise</span><span className="tabular">-{formatXOF(Number(sale.discount))}</span></div>
          )}
          <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <div className="text-sm font-semibold">Total</div>
            <div className="tabular font-display text-xl font-bold">{formatXOF(Number(sale.total))}</div>
          </div>
          {isDue && (
            <div className="flex items-center justify-between rounded-xl bg-warning/15 px-4 py-2 text-sm text-warning-foreground">
              <span>Reste à payer</span>
              <span className="tabular font-bold">{formatXOF(Number(sale.total) - Number(sale.paid))}</span>
            </div>
          )}
          {sale.notes && <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{sale.notes}</div>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {canEditDraft && (
            <Link to="/app/caisse" search={{ holdId: sale.id }}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <Edit3 className="h-3.5 w-3.5" /> Modifier à la caisse
            </Link>
          )}
          {sale.status !== "draft" && (
            <>
              <button onClick={() => printDocument("receipt")}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <Printer className="h-3.5 w-3.5" /> Reçu
              </button>
              <button onClick={() => printDocument("proforma")}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <FileText className="h-3.5 w-3.5" /> PDF proforma
              </button>
            </>
          )}
          {canComplementaryPay && (
            <button onClick={() => setPayOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15">
              <CardIcon className="h-3.5 w-3.5" /> Paiement complémentaire
            </button>
          )}
          {canCancel && (
            <button onClick={() => setConfirmCancel(true)}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/15">
              <Ban className="h-3.5 w-3.5" /> Annuler la vente
            </button>
          )}
        </div>
      </div>

      {/* Contenu imprimable hors-écran, réutilisé par Reçu et PDF proforma */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="center text-center">
            {ticket.showLogo && currentShop?.logo_url && (
              <img src={currentShop.logo_url} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />
            )}
            <div className="b text-base font-bold">{currentShop?.name ?? "Boutique"}</div>
            {ticket.showAddress && extra.address && <div className="text-xs">{extra.address}</div>}
            {ticket.showPhone && extra.phone && <div className="text-xs">{extra.phone}</div>}
            {ticket.showFiscal && extra.ifu && <div className="text-xs">IFU {extra.ifu}</div>}
          </div>
          <hr className="my-2 border-dashed" />
          <div className="row flex justify-between text-xs"><span>Ticket</span><span className="b font-bold">{sale.reference}</span></div>
          <div className="row flex justify-between text-xs"><span>Date</span><span>{new Date(sale.created_at).toLocaleString("fr-FR")}</span></div>
          <div className="row flex justify-between text-xs"><span>Client</span><span>{sale.customers?.name ?? "Comptoir"}</span></div>
          {ticket.showCashier && profile?.full_name && <div className="row flex justify-between text-xs"><span>Vendeur</span><span>{profile.full_name}</span></div>}
          <hr className="my-2 border-dashed" />
          {sale.sale_items.map((l) => (
            <div key={l.id} className="mb-1 text-xs">
              <div className="flex justify-between"><span>{l.name}</span><span>{formatXOF(Number(l.total))}</span></div>
              <div className="text-[10px] text-gray-600">{l.quantity} × {formatXOF(Number(l.unit_price))}</div>
            </div>
          ))}
          <hr className="my-2 border-dashed" />
          <div className="row flex justify-between text-xs"><span>Sous-total</span><span>{formatXOF(Number(sale.subtotal))}</span></div>
          {Number(sale.discount) > 0 && <div className="row flex justify-between text-xs"><span>Remise</span><span>-{formatXOF(Number(sale.discount))}</span></div>}
          <div className="row flex justify-between text-sm b font-bold"><span>TOTAL</span><span>{formatXOF(Number(sale.total))}</span></div>
          <div className="row flex justify-between text-xs"><span>Mode de paiement</span><span>{PAY_LABEL[sale.payment_method]}</span></div>
          {isDue && <div className="row flex justify-between text-xs"><span>Reste à payer</span><span>{formatXOF(Number(sale.total) - Number(sale.paid))}</span></div>}
          <div className="mt-3 text-center text-xs italic">{ticket.thanks}</div>
        </div>
      </div>

      <AnimatePresence>
        {payOpen && (
          <PaymentDialog sale={sale} onClose={() => setPayOpen(false)} />
        )}
        {confirmCancel && (
          <ConfirmDialog title={`Annuler la vente ${sale.reference} ?`}
            description="Le stock des articles liés à un produit sera remis en stock. Les paiements déjà encaissés ne sont pas remboursés automatiquement."
            onClose={() => setConfirmCancel(false)}
            onConfirm={async () => { await cancelSale.mutateAsync(sale); setConfirmCancel(false); onClose(); }} />
        )}
      </AnimatePresence>
    </Overlay>
  );
}

function PaymentDialog({ sale, onClose }: { sale: SaleFull; onClose: () => void }) {
  const due = Math.max(0, Number(sale.total) - Number(sale.paid));
  const [amount, setAmount] = useState(due);
  const [method, setMethod] = useState<Sale["payment_method"]>("cash");
  const [error, setError] = useState<string | null>(null);
  const addPayment = useAddSalePayment();

  const submit = async () => {
    setError(null);
    try {
      await addPayment.mutateAsync({ sale, amount, method });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Paiement complémentaire</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="rounded-xl bg-muted px-4 py-2 text-sm">
          Reste à payer : <span className="tabular font-bold">{formatXOF(due)}</span>
        </div>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Montant reçu</div>
          <input type="number" min={0} max={due} value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Mode de paiement</div>
          <select value={method} onChange={(e) => setMethod(e.target.value as Sale["payment_method"])}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
            {(Object.keys(PAY_LABEL) as Sale["payment_method"][]).filter((k) => k !== "credit").map((k) => (
              <option key={k} value={k}>{PAY_LABEL[k]}</option>
            ))}
          </select>
        </label>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={submit} disabled={amount <= 0 || amount > due || addPayment.isPending}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {addPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CardIcon className="h-4 w-4" />} Encaisser
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, description, onClose, onConfirm }: { title: string; description: string; onClose: () => void; onConfirm: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Retour</button>
          <button onClick={async () => { setPending(true); await onConfirm(); }} disabled={pending}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
