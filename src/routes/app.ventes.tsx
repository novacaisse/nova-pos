import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Download, Receipt, X, RotateCcw,
  Banknote, Smartphone, CreditCard, Wallet,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SALES, PAYMENT_LABEL, type Sale, type PaymentMethod } from "@/lib/mock/sales";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ventes")({
  component: VentesPage,
});

const PAY_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote, mobile: Smartphone, card: CreditCard, credit: Wallet,
};

function VentesPage() {
  const [query, setQuery] = useState("");
  const [payFilter, setPayFilter] = useState<"all" | PaymentMethod>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Sale | null>(null);

  const cashiers = useMemo(() => [...new Set(SALES.map((s) => s.cashier))], []);
  const filtered = useMemo(
    () =>
      SALES.filter((s) => {
        if (payFilter !== "all" && s.payment !== payFilter) return false;
        if (cashierFilter !== "all" && s.cashier !== cashierFilter) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          return s.ticket.toLowerCase().includes(q) || s.cashier.toLowerCase().includes(q) || (s.customer ?? "").toLowerCase().includes(q);
        }
        return true;
      }),
    [query, payFilter, cashierFilter],
  );

  const totalRevenue = filtered.reduce((s, x) => s + x.total, 0);
  const avg = filtered.length ? Math.round(totalRevenue / filtered.length) : 0;

  return (
    <div>
      <PageHeader
        title="Ventes"
        subtitle={`${filtered.length} transaction${filtered.length > 1 ? "s" : ""} sur la période`}
        actions={
          <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            <Download className="h-4 w-4" /> Exporter
          </button>
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
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher ticket, caissier, client…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as "all" | PaymentMethod)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">Tous paiements</option>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((k) => (
                <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>
              ))}
            </select>
            <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">Tous caissiers</option>
              {cashiers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Caissier</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Paiement</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const Icon = PAY_ICON[s.payment];
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{s.ticket}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">{s.cashier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.customer ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                        <Icon className="h-3 w-3" /> {PAYMENT_LABEL[s.payment]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        s.status === "paid" && "bg-success/15 text-success",
                        s.status === "refunded" && "bg-destructive/15 text-destructive",
                        s.status === "partial_refund" && "bg-warning/20 text-warning-foreground",
                        s.status === "pending" && "bg-muted text-muted-foreground",
                      )}>
                        {s.status === "paid" ? "Payée" : s.status === "refunded" ? "Remboursée" : s.status === "partial_refund" ? "Avoir partiel" : "En attente"}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(s.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-elegant"
            >
              <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
                <div>
                  <div className="text-xs opacity-80">Détail ticket</div>
                  <div className="font-display text-lg font-bold">{selected.ticket}</div>
                </div>
                <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-muted-foreground">Date</div><div className="font-semibold">{new Date(selected.created_at).toLocaleString("fr-FR")}</div></div>
                  <div><div className="text-muted-foreground">Caissier</div><div className="font-semibold">{selected.cashier}</div></div>
                  <div><div className="text-muted-foreground">Client</div><div className="font-semibold">{selected.customer ?? "Comptoir"}</div></div>
                  <div><div className="text-muted-foreground">Paiement</div><div className="font-semibold">{PAYMENT_LABEL[selected.payment]}</div></div>
                </div>
                <div className="rounded-xl border border-border">
                  {selected.lines.map((l, i) => (
                    <div key={i} className={cn("flex items-center justify-between px-3 py-2 text-sm", i > 0 && "border-t border-border/60")}>
                      <div>
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.qty} × {formatXOF(l.unit_price)}</div>
                      </div>
                      <div className="tabular font-semibold">{formatXOF(l.qty * l.unit_price)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
                  <div className="text-sm font-semibold">Total</div>
                  <div className="tabular font-display text-xl font-bold">{formatXOF(selected.total)}</div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted">
                    <RotateCcw className="h-4 w-4" /> Remboursement / Avoir
                  </button>
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                    <Receipt className="h-4 w-4" /> Imprimer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
