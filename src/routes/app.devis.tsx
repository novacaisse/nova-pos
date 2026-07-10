import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, Search, X, Send, ArrowRightLeft, Trash2, Edit3, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { QUOTES, QUOTE_STATUS_LABEL, type Quote } from "@/lib/mock/quotes";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { CUSTOMERS } from "@/lib/mock/customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/devis")({
  component: DevisPage,
});

function DevisPage() {
  const [items, setItems] = useState<Quote[]>(QUOTES);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Quote["status"]>("all");
  const [editing, setEditing] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => items.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (!query.trim()) return true;
    const s = query.toLowerCase();
    return q.ref.toLowerCase().includes(s) || q.customer.toLowerCase().includes(s);
  }), [items, status, query]);

  const total = filtered.reduce((s, q) => s + q.total, 0);
  const accepted = items.filter((q) => q.status === "accepte" || q.status === "converti").length;

  const remove = (id: string) => setItems((l) => l.filter((q) => q.id !== id));
  const convert = (id: string) => setItems((l) => l.map((q) =>
    q.id === id ? { ...q, status: "converti" as const, converted_invoice: `F-2026-${String(100 + l.length).slice(-3)}` } : q
  ));
  const upsert = (q: Quote) => setItems((l) => l.some((x) => x.id === q.id) ? l.map((x) => x.id === q.id ? q : x) : [q, ...l]);

  return (
    <div>
      <PageHeader title="Devis" subtitle={`${items.length} devis · conversion 1 clic en facture`}
        actions={
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau devis
          </button>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Devis" value={String(items.length)} icon={<FileText className="h-5 w-5" />} accent="primary" />
          <StatCard label="Acceptés / Convertis" value={String(accepted)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
          <StatCard label="Montant filtré" value={formatXOF(total)} accent="accent" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Réf., client…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(QUOTE_STATUS_LABEL) as Quote["status"][]).map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Réf.</th><th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Créé</th><th className="px-4 py-3">Valide jusqu'au</th>
                <th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{q.ref}</td>
                  <td className="px-4 py-3 font-medium">{q.customer}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{q.created_at}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{q.valid_until}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      q.status === "accepte" && "bg-success/15 text-success",
                      q.status === "converti" && "bg-primary/15 text-primary",
                      q.status === "envoye" && "bg-accent/25 text-accent-foreground",
                      q.status === "brouillon" && "bg-muted text-muted-foreground",
                      q.status === "refuse" && "bg-destructive/15 text-destructive",
                    )}>{QUOTE_STATUS_LABEL[q.status]}</span>
                  </td>
                  <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(q.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {q.status !== "converti" && (
                        <button onClick={() => convert(q.id)} title="Convertir en facture"
                          className="grid h-8 w-8 place-items-center rounded-lg text-primary hover:bg-primary/10">
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => setEditing(q)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => remove(q.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {(editing || creating) && (
          <QuoteEditor
            initial={editing}
            onClose={() => { setEditing(null); setCreating(false); }}
            onSave={(q) => { upsert(q); setEditing(null); setCreating(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuoteEditor({ initial, onClose, onSave }: { initial: Quote | null; onClose: () => void; onSave: (q: Quote) => void }) {
  const [customer, setCustomer] = useState(initial?.customer ?? CUSTOMERS[0].name);
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState(initial?.lines ?? []);
  const [productSel, setProductSel] = useState(PRODUCTS[0].id);
  const [qty, setQty] = useState(1);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  const addLine = () => {
    const p = PRODUCTS.find((x) => x.id === productSel);
    if (!p || qty <= 0) return;
    setLines((l) => [...l, { product_id: p.id, name: p.name, qty, unit_price: p.price }]);
    setQty(1);
  };

  const save = () => {
    const q: Quote = {
      id: initial?.id ?? `q-${Date.now()}`,
      ref: initial?.ref ?? `DEV-2026-${String(Math.floor(Math.random() * 900) + 100)}`,
      customer, valid_until: validUntil,
      created_at: initial?.created_at ?? new Date().toISOString().slice(0, 10),
      status: initial?.status ?? "brouillon",
      lines, total,
    };
    onSave(q);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial ? `Modifier ${initial.ref}` : "Nouveau devis"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Client</div>
              <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                {CUSTOMERS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Valide jusqu'au</div>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            </label>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Ajouter un article</div>
            <div className="flex gap-2">
              <select value={productSel} onChange={(e) => setProductSel(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm">
                {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatXOF(p.price)}</option>)}
              </select>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="h-10 w-20 rounded-xl border border-border bg-background px-2 text-center text-sm" />
              <button onClick={addLine} className="rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">Ajouter</button>
            </div>
          </div>

          <div className="rounded-xl border border-border">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Aucun article</div>
            ) : lines.map((l, i) => (
              <div key={i} className={cn("flex items-center gap-2 p-3", i > 0 && "border-t border-border/60")}>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.qty} × {formatXOF(l.unit_price)}</div></div>
                <div className="tabular text-sm font-bold">{formatXOF(l.qty * l.unit_price)}</div>
                <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                  <X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="tabular font-display text-2xl font-bold">{formatXOF(total)}</span>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={save} disabled={lines.length === 0} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              <Send className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
