import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Wallet, Trash2, Edit3, Save, X } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useExpenses, useUpsertExpense, useDeleteExpense, formatXOF, type Expense } from "@/lib/data/hooks";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/mock/expenses";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/depenses")({
  component: DepensesPage,
});

function DepensesPage() {
  const { data: items = [], isLoading } = useExpenses();
  const upsert = useUpsertExpense();
  const remove = useDeleteExpense();
  const [filter, setFilter] = useState<string>("all");
  const [edit, setEdit] = useState<Partial<Expense> | null>(null);
  const [del, setDel] = useState<Expense | null>(null);

  const filtered = filter === "all" ? items : items.filter((e) => (e.category ?? "Autre") === filter);
  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div>
      <PageHeader title="Dépenses" subtitle="Suivi des sorties de caisse"
        actions={
          <button onClick={() => setEdit({ label: "", amount: 0, category: DEFAULT_EXPENSE_CATEGORIES[0], paid_at: new Date().toISOString().slice(0,10), method: "Espèces" })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouvelle dépense</button>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total filtré" value={formatXOF(total)} icon={<Wallet className="h-5 w-5" />} accent="destructive" />
          <StatCard label="Dépenses" value={String(filtered.length)} accent="accent" />
          <StatCard label="Catégories" value={String(new Set(items.map((e) => e.category ?? "Autre")).size)} accent="primary" />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
          <button onClick={() => setFilter("all")} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Toutes</button>
          {DEFAULT_EXPENSE_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{c}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucune dépense enregistrée.</div>
        ) : (
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
                    <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.category ?? "—"}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.paid_at}</td>
                    <td className="px-4 py-3 text-xs">{e.method ?? "—"}</td>
                    <td className="tabular px-4 py-3 text-right font-bold text-destructive">-{formatXOF(Number(e.amount))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEdit(e)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={() => setDel(e)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <EditDialog initial={edit} onClose={() => setEdit(null)}
            onSave={async (e) => { await upsert.mutateAsync(e); setEdit(null); }} />
        )}
        {del && (
          <ConfirmDialog title={`Supprimer « ${del.label} » ?`} onClose={() => setDel(null)}
            onConfirm={async () => { await remove.mutateAsync(del.id); setDel(null); }} />
        )}
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

function EditDialog({ initial, onClose, onSave }: { initial: Partial<Expense>; onClose: () => void; onSave: (e: any) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Expense>>(initial);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial.id ? "Modifier" : "Nouvelle"} dépense</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Libellé</div><input value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inp} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Catégorie</div><select value={form.category ?? DEFAULT_EXPENSE_CATEGORIES[0]} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
            {DEFAULT_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Montant (F)</div><input type="number" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Date</div><input type="date" value={form.paid_at ?? new Date().toISOString().slice(0,10)} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Méthode</div><select value={form.method ?? "Espèces"} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inp}>
            {["Espèces", "Mobile Money", "Carte", "Virement", "Chèque"].map((m) => <option key={m}>{m}</option>)}
          </select></label>
        </div>
        <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.label || !form.amount || form.amount <= 0} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onClose} w="max-w-sm">
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">Supprimer</button>
        </div>
      </div>
    </Overlay>
  );
}
