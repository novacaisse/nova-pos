import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Phone, Mail, MapPin, X, Star, CreditCard, Receipt } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { CUSTOMERS, type Customer } from "@/lib/mock/customers";
import { formatXOF } from "@/lib/mock/catalog";
import { SALES } from "@/lib/mock/sales";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  const list = useMemo(
    () =>
      CUSTOMERS.filter((c) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.city.toLowerCase().includes(q);
      }),
    [query],
  );

  const totalCredit = CUSTOMERS.reduce((s, c) => s + c.credit_balance, 0);
  const totalPoints = CUSTOMERS.reduce((s, c) => s + c.loyalty_points, 0);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${CUSTOMERS.length} clients enregistrés`}
        actions={
          <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau client
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="CA cumulé" value={formatXOF(CUSTOMERS.reduce((s, c) => s + c.total_spent, 0))} accent="primary" />
          <StatCard label="Points fidélité" value={String(totalPoints)} icon={<Star className="h-5 w-5" />} accent="accent" />
          <StatCard label="Créances totales" value={formatXOF(totalCredit)} icon={<CreditCard className="h-5 w-5" />} accent="destructive" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, téléphone, ville…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-elegant">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
                  {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.city} · {c.visits} visites</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.tags.slice(0, 2).map((t) => (
                    <span key={t} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t}</span>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Achats</div><div className="tabular text-sm font-bold">{formatXOF(c.total_spent)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</div><div className="tabular text-sm font-bold text-accent-foreground">{c.loyalty_points}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Crédit</div><div className={cn("tabular text-sm font-bold", c.credit_balance > 0 ? "text-destructive" : "text-muted-foreground")}>{formatXOF(c.credit_balance)}</div></div>
              </div>
            </button>
          ))}
        </div>
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
                    <div className="text-xs opacity-80">{selected.city}</div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><Phone className="h-4 w-4 text-muted-foreground" /> {selected.phone}</div>
                  {selected.email && <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><Mail className="h-4 w-4 text-muted-foreground" /> {selected.email}</div>}
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {selected.city}</div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border p-3 text-center"><div className="text-[10px] uppercase text-muted-foreground">CA</div><div className="tabular font-display text-lg font-bold">{formatXOF(selected.total_spent)}</div></div>
                  <div className="rounded-xl border border-border p-3 text-center"><div className="text-[10px] uppercase text-muted-foreground">Points</div><div className="tabular font-display text-lg font-bold text-accent-foreground">{selected.loyalty_points}</div></div>
                  <div className="rounded-xl border border-border p-3 text-center"><div className="text-[10px] uppercase text-muted-foreground">Crédit</div><div className={cn("tabular font-display text-lg font-bold", selected.credit_balance > 0 ? "text-destructive" : "")}>{formatXOF(selected.credit_balance)}</div></div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Derniers achats</div>
                  <div className="space-y-1">
                    {SALES.slice(0, 4).map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 p-2 text-sm">
                        <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-xs">{s.ticket}</span><span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("fr-FR")}</span></div>
                        <div className="tabular font-semibold">{formatXOF(s.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
