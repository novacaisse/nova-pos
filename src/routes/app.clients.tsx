import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Phone, Mail, MapPin, X, Star, CreditCard, Edit3, Trash2, Save } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useCustomers, useUpsertCustomer, useDeleteCustomer,
  formatXOF, type Customer,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [del, setDel] = useState<Customer | null>(null);
  const { data: customers = [], isLoading } = useCustomers();
  const upsert = useUpsertCustomer();
  const remove = useDeleteCustomer();

  const list = useMemo(() => customers.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q)
      || (c.phone ?? "").includes(q)
      || (c.email ?? "").toLowerCase().includes(q);
  }), [customers, query]);

  const totalCredit = customers.reduce((s, c) => s + Number(c.credit_balance || 0), 0);
  const totalPoints = customers.reduce((s, c) => s + (c.loyalty_points || 0), 0);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${customers.length} client${customers.length > 1 ? "s" : ""} enregistré${customers.length > 1 ? "s" : ""}`}
        actions={
          <button onClick={() => setEdit({ name: "" })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau client
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Clients" value={String(customers.length)} accent="primary" />
          <StatCard label="Points fidélité" value={String(totalPoints)} icon={<Star className="h-5 w-5" />} accent="accent" />
          <StatCard label="Créances totales" value={formatXOF(totalCredit)} icon={<CreditCard className="h-5 w-5" />} accent="destructive" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, téléphone, email…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="text-sm text-muted-foreground">Aucun client pour l'instant.</div>
            <button onClick={() => setEdit({ name: "" })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-elegant">
                <div className="flex items-start gap-3">
                  <button onClick={() => setSelected(c)} className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
                    {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </button>
                  <button onClick={() => setSelected(c)} className="min-w-0 flex-1 text-left">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone ?? c.email ?? "—"}</div>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => setEdit(c)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => setDel(c)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</div><div className="tabular text-sm font-bold text-accent-foreground">{c.loyalty_points}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Crédit</div><div className={cn("tabular text-sm font-bold", Number(c.credit_balance) > 0 ? "text-destructive" : "text-muted-foreground")}>{formatXOF(Number(c.credit_balance))}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
            onClick={() => setSelected(null)}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
              <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-sm font-bold">
                    {selected.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold">{selected.name}</div>
                    <div className="text-xs opacity-80">{selected.address ?? "—"}</div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selected.phone && <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><Phone className="h-4 w-4 text-muted-foreground" /> {selected.phone}</div>}
                  {selected.email && <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><Mail className="h-4 w-4 text-muted-foreground" /> {selected.email}</div>}
                  {selected.address && <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 sm:col-span-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {selected.address}</div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-3 text-center"><div className="text-[10px] uppercase text-muted-foreground">Points</div><div className="tabular font-display text-lg font-bold text-accent-foreground">{selected.loyalty_points}</div></div>
                  <div className="rounded-xl border border-border p-3 text-center"><div className="text-[10px] uppercase text-muted-foreground">Crédit</div><div className={cn("tabular font-display text-lg font-bold", Number(selected.credit_balance) > 0 ? "text-destructive" : "")}>{formatXOF(Number(selected.credit_balance))}</div></div>
                </div>
                {selected.notes && (
                  <div className="rounded-xl bg-muted/50 p-3 text-sm">{selected.notes}</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {edit && (
          <CustomerDialog initial={edit} onClose={() => setEdit(null)}
            onSave={async (c) => { await upsert.mutateAsync(c); setEdit(null); }} />
        )}
        {del && (
          <ConfirmDialog title={`Supprimer ${del.name} ?`} onClose={() => setDel(null)}
            onConfirm={async () => { await remove.mutateAsync(del.id); setDel(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
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

function CustomerDialog({ initial, onClose, onSave }: { initial: Partial<Customer>; onClose: () => void; onSave: (c: any) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Customer>>(initial);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial.id ? "Modifier client" : "Nouveau client"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Email</div><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Adresse</div><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Points fidélité</div><input type="number" value={form.loyalty_points ?? 0} onChange={(e) => setForm({ ...form, loyalty_points: Number(e.target.value) || 0 })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Crédit dû (F)</div><input type="number" value={form.credit_balance ?? 0} onChange={(e) => setForm({ ...form, credit_balance: Number(e.target.value) || 0 })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex gap-2 pt-1 sm:col-span-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.name} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
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
