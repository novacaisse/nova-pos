import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Phone, Mail, MapPin, X, Star, CreditCard, Edit3, Trash2, Save, Receipt, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useCustomers, useUpsertCustomer, useDeleteCustomer, useCustomerSales, useMyRole,
  formatXOF, type Customer,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/clients")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [del, setDel] = useState<Customer | null>(null);
  const { data: customers = [], isLoading } = useCustomers();
  const upsert = useUpsertCustomer();
  const remove = useDeleteCustomer();
  const { data: myRole } = useMyRole();
  const canDelete = myRole !== "cashier"; // cashier a SIU sur customers, pas D

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
                    {canDelete && (
                      <button onClick={() => setDel(c)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    )}
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
          <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />
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

const SALE_STATUS_LABEL: Record<string, string> = {
  completed: "Payée", draft: "En attente", refunded: "Remboursée",
  partially_refunded: "Remb. partielle", cancelled: "Annulée",
};
const PAY_METHOD_LABEL: Record<string, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", credit: "Crédit", mixed: "Mixte",
};

function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data: sales = [], isLoading } = useCustomerSales(customer.id);

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
            {customer.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-tight">{customer.name}</div>
            {customer.address && <div className="text-xs text-muted-foreground">{customer.address}</div>}
          </div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-5">
        {(customer.phone || customer.email || customer.address) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {customer.phone && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone}
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" /> {customer.email}
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm sm:col-span-2">
                <MapPin className="h-4 w-4 text-muted-foreground" /> {customer.address}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Points fidélité</div>
            <div className="tabular mt-1 text-lg font-bold text-accent-foreground">{customer.loyalty_points}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Crédit dû</div>
            <div className={cn("tabular mt-1 text-lg font-bold", Number(customer.credit_balance) > 0 ? "text-destructive" : "text-muted-foreground")}>
              {formatXOF(Number(customer.credit_balance))}
            </div>
          </div>
        </div>

        {customer.notes && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {customer.notes}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Receipt className="h-3.5 w-3.5" /> Historique d'achats
          </div>
          {isLoading ? (
            <div className="grid place-items-center rounded-xl border border-border bg-card p-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : sales.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">
              Aucun achat pour l'instant.
            </div>
          ) : (
            <div className="space-y-2">
              {sales.map((s) => (
                <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-xs font-semibold">{s.reference}</div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      s.status === "completed" && "bg-success/15 text-success",
                      s.status === "refunded" && "bg-destructive/15 text-destructive",
                      s.status === "partially_refunded" && "bg-warning/20 text-warning-foreground",
                      (s.status === "draft" || s.status === "cancelled") && "bg-muted text-muted-foreground",
                    )}>{SALE_STATUS_LABEL[s.status] ?? s.status}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{PAY_METHOD_LABEL[s.payment_method] ?? s.payment_method}
                    </span>
                    <span className="tabular font-bold text-foreground">{formatXOF(Number(s.total))}</span>
                  </div>
                  {Number(s.paid) < Number(s.total) && (
                    <div className="mt-1 text-[11px] font-semibold text-destructive">
                      Payé {formatXOF(Number(s.paid))} / {formatXOF(Number(s.total))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
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
