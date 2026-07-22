import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Download, Receipt, X, Wallet, Banknote, Smartphone, CreditCard } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useSales, formatXOF, type Sale } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ventes")({
  component: VentesPage,
});

const PAY_LABEL: Record<Sale["payment_method"], string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", credit: "Crédit", mixed: "Mixte",
};
const PAY_ICON: Record<Sale["payment_method"], typeof Banknote> = {
  cash: Banknote, mobile_money: Smartphone, card: CreditCard, credit: Wallet, mixed: Wallet,
};

function VentesPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);

  const { data: sales = [], isLoading } = useSales({ from: from.toISOString(), to: to.toISOString(), limit: 1000 });
  const [query, setQuery] = useState("");
  const [payFilter, setPayFilter] = useState<"all" | Sale["payment_method"]>("all");
  const [selected, setSelected] = useState<any | null>(null);

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
                      )}>{s.status}</span>
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

function DetailDialog({ sale, onClose }: { sale: any; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
        <div><div className="text-xs opacity-80">Détail ticket</div><div className="font-display text-lg font-bold">{sale.reference}</div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Date" value={new Date(sale.created_at).toLocaleString("fr-FR")} />
          <Info label="Paiement" value={PAY_LABEL[sale.payment_method as Sale["payment_method"]]} />
          <Info label="Client" value={sale.customers?.name ?? "Comptoir"} />
          <Info label="Statut" value={sale.status} />
        </div>
        <div className="rounded-xl border border-border">
          {(sale.sale_items ?? []).map((l: any, i: number) => (
            <div key={l.id ?? i} className={cn("flex items-center justify-between px-3 py-2 text-sm", i > 0 && "border-t border-border/60")}>
              <div><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.quantity} × {formatXOF(Number(l.unit_price))}</div></div>
              <div className="tabular font-semibold">{formatXOF(Number(l.total))}</div>
            </div>
          ))}
          {(sale.sale_items ?? []).length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Aucune ligne.</div>}
        </div>
        {Number(sale.discount) > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground"><span>Remise</span><span className="tabular">-{formatXOF(Number(sale.discount))}</span></div>
        )}
        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <div className="text-sm font-semibold">Total</div>
          <div className="tabular font-display text-xl font-bold">{formatXOF(Number(sale.total))}</div>
        </div>
        {sale.notes && <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{sale.notes}</div>}
      </div>
    </Overlay>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
