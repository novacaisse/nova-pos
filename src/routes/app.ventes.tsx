import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Download, Receipt, X, Edit3, Trash2, Save,
  Banknote, Smartphone, CreditCard, Wallet, Plus, Minus,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SALES, PAYMENT_LABEL, type Sale, type PaymentMethod, type SaleLine } from "@/lib/mock/sales";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ventes")({
  component: VentesPage,
});

const PAY_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote, mobile: Smartphone, card: CreditCard, credit: Wallet,
};

function VentesPage() {
  const [sales, setSales] = useState<Sale[]>(SALES);
  const [query, setQuery] = useState("");
  const [payFilter, setPayFilter] = useState<"all" | PaymentMethod>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [confirmDel, setConfirmDel] = useState<Sale | null>(null);

  const cashiers = useMemo(() => [...new Set(sales.map((s) => s.cashier))], [sales]);
  const filtered = useMemo(() => sales.filter((s) => {
    if (payFilter !== "all" && s.payment !== payFilter) return false;
    if (cashierFilter !== "all" && s.cashier !== cashierFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return s.ticket.toLowerCase().includes(q) || s.cashier.toLowerCase().includes(q) || (s.customer ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [sales, query, payFilter, cashierFilter]);

  const totalRevenue = filtered.reduce((s, x) => s + x.total, 0);
  const avg = filtered.length ? Math.round(totalRevenue / filtered.length) : 0;

  const saveEdit = (updated: Sale) => {
    setSales((l) => l.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
    setSelected(updated);
  };

  const doDelete = (id: string) => {
    setSales((l) => l.filter((s) => s.id !== id));
    setConfirmDel(null);
    setSelected(null);
  };

  return (
    <div>
      <PageHeader title="Ventes" subtitle={`${filtered.length} transaction${filtered.length > 1 ? "s" : ""}`}
        actions={<button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Exporter</button>}
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
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher ticket, caissier, client…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as typeof payFilter)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">Tous paiements</option>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
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
                <th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Caissier</th>
                <th className="px-4 py-3">Client</th><th className="px-4 py-3">Paiement</th><th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const Icon = PAY_ICON[s.payment];
                return (
                  <tr key={s.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="cursor-pointer px-4 py-3 font-mono text-xs font-semibold" onClick={() => setSelected(s)}>{s.ticket}</td>
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
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        s.status === "paid" && "bg-success/15 text-success",
                        s.status === "refunded" && "bg-destructive/15 text-destructive",
                        s.status === "partial_refund" && "bg-warning/20 text-warning-foreground",
                        s.status === "pending" && "bg-muted text-muted-foreground",
                      )}>
                        {s.status === "paid" ? "Payée" : s.status === "refunded" ? "Remboursée" : s.status === "partial_refund" ? "Avoir partiel" : "En attente"}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(s.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(s)} title="Modifier / Ajuster" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={() => setConfirmDel(s)} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && !editing && !confirmDel && (
          <DetailDialog sale={selected} onClose={() => setSelected(null)} onEdit={() => setEditing(selected)} onDelete={() => setConfirmDel(selected)} />
        )}
        {editing && <EditDialog sale={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
        {confirmDel && (
          <ConfirmDialog title={`Supprimer ${confirmDel.ticket} ?`}
            desc="La vente sera définitivement retirée de l'historique."
            onClose={() => setConfirmDel(null)} onConfirm={() => doDelete(confirmDel.id)} />
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

function DetailDialog({ sale, onClose, onEdit, onDelete }: { sale: Sale; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
        <div><div className="text-xs opacity-80">Détail ticket</div><div className="font-display text-lg font-bold">{sale.ticket}</div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Date" value={new Date(sale.created_at).toLocaleString("fr-FR")} />
          <Info label="Caissier" value={sale.cashier} />
          <Info label="Client" value={sale.customer ?? "Comptoir"} />
          <Info label="Paiement" value={PAYMENT_LABEL[sale.payment]} />
        </div>
        <div className="rounded-xl border border-border">
          {sale.lines.map((l, i) => (
            <div key={i} className={cn("flex items-center justify-between px-3 py-2 text-sm", i > 0 && "border-t border-border/60")}>
              <div><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.qty} × {formatXOF(l.unit_price)}</div></div>
              <div className="tabular font-semibold">{formatXOF(l.qty * l.unit_price)}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <div className="text-sm font-semibold">Total</div>
          <div className="tabular font-display text-xl font-bold">{formatXOF(sale.total)}</div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onDelete} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 text-sm font-semibold text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
          <button onClick={onEdit} className="flex h-10 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90">
            <Edit3 className="h-4 w-4" /> Modifier / Ajuster
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function EditDialog({ sale, onClose, onSave }: { sale: Sale; onClose: () => void; onSave: (s: Sale) => void }) {
  const [lines, setLines] = useState<SaleLine[]>(sale.lines);
  const [payment, setPayment] = useState(sale.payment);
  const [customer, setCustomer] = useState(sale.customer ?? "");
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  const bump = (i: number, d: number) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
  const del = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Modifier {sale.ticket}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Client</div>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
          <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Paiement</div>
            <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
            </select></label>
        </div>
        <div className="rounded-xl border border-border">
          {lines.map((l, i) => (
            <div key={i} className={cn("flex items-center gap-2 p-3", i > 0 && "border-t border-border/60")}>
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{l.name}</div><div className="text-xs text-muted-foreground">{formatXOF(l.unit_price)}</div></div>
              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                <button onClick={() => bump(i, -1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-background"><Minus className="h-3.5 w-3.5" /></button>
                <span className="tabular w-8 text-center text-sm font-bold">{l.qty}</span>
                <button onClick={() => bump(i, 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-background"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="tabular w-20 text-right text-sm font-bold">{formatXOF(l.qty * l.unit_price)}</div>
              <button onClick={() => del(i)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-muted p-3">
          <span className="text-sm font-semibold">Nouveau total</span>
          <span className="tabular font-display text-xl font-bold">{formatXOF(total)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={() => onSave({ ...sale, lines, payment, customer: customer || undefined, total })}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, desc, onClose, onConfirm }: { title: string; desc: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">Supprimer</button>
        </div>
      </div>
    </Overlay>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
