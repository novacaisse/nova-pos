import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Wallet, Trash2, Edit3, Save, X, Tag as TagIcon } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { formatXOF } from "@/lib/mock/catalog";
import { EXPENSES as SEED, DEFAULT_EXPENSE_CATEGORIES, type Expense } from "@/lib/mock/expenses";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/depenses")({
  component: DepensesPage,
});

function DepensesPage() {
  const [items, setItems] = useState<Expense[]>(SEED);
  const [cats, setCats] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false);
  const [manageCats, setManageCats] = useState(false);

  const filtered = filter === "all" ? items : items.filter((e) => e.category === filter);
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const save = (e: Expense) => { setItems((l) => l.some((x) => x.id === e.id) ? l.map((x) => x.id === e.id ? e : x) : [e, ...l]); setEditing(null); setCreating(false); };
  const del = (id: string) => setItems((l) => l.filter((e) => e.id !== id));

  return (
    <div>
      <PageHeader title="Dépenses" subtitle="Suivi des sorties de caisse"
        actions={
          <>
            <button onClick={() => setManageCats(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><TagIcon className="h-4 w-4" /> Catégories</button>
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouvelle dépense</button>
          </>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total filtré" value={formatXOF(total)} icon={<Wallet className="h-5 w-5" />} accent="destructive" />
          <StatCard label="Dépenses" value={String(filtered.length)} accent="accent" />
          <StatCard label="Catégories actives" value={String(new Set(items.map((e) => e.category)).size)} accent="primary" />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
          <button onClick={() => setFilter("all")} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Toutes</button>
          {cats.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{c}</button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Libellé</th><th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Méthode</th>
                <th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{e.label}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.category}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-3 text-xs">{e.method}</td>
                  <td className="tabular px-4 py-3 text-right font-bold text-destructive">-{formatXOF(e.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(e)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => del(e.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {(editing || creating) && <EditDialog initial={editing} cats={cats} onClose={() => { setEditing(null); setCreating(false); }} onSave={save} />}
        {manageCats && <CatsDialog cats={cats} setCats={setCats} onClose={() => setManageCats(false)} />}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-md" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function EditDialog({ initial, cats, onClose, onSave }: { initial: Expense | null; cats: string[]; onClose: () => void; onSave: (e: Expense) => void }) {
  const [form, setForm] = useState<Expense>(initial ?? {
    id: `e-${Date.now()}`, label: "", category: cats[0] ?? "Autre", amount: 0,
    date: new Date().toISOString().slice(0, 10), method: "Espèces",
  });
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial ? "Modifier" : "Nouvelle"} dépense</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <F label="Libellé"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inp} /></F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Catégorie"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></F>
          <F label="Montant (FCFA)"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} className={inp} /></F>
          <F label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} /></F>
          <F label="Méthode"><select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inp}>
            {["Espèces", "Mobile Money", "Carte", "Virement", "Chèque"].map((m) => <option key={m}>{m}</option>)}
          </select></F>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.label || form.amount <= 0} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function CatsDialog({ cats, setCats, onClose }: { cats: string[]; setCats: (c: string[]) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const isDefault = (c: string) => DEFAULT_EXPENSE_CATEGORIES.includes(c);
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Catégories de dépenses</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-5">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie…" className={inp} />
          <button onClick={() => { if (name.trim()) { setCats([...cats, name.trim()]); setName(""); } }} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">+</button>
        </div>
        <div className="space-y-1">
          {cats.map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
              <span>{c}{isDefault(c) && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Prédéfinie</span>}</span>
              {!isDefault(c) && <button onClick={() => setCats(cats.filter((x) => x !== c))} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>{children}</label>;
}
