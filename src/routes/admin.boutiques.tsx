import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, LogIn, Pause, Trash2, Clock, Store, User, Mail, Phone, MapPin } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { TENANTS, TENANT_STATUS_META, PLAN_LABEL, PAYMENTS, type Tenant, type TenantStatus, type PlanId } from "@/lib/mock/tenants";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/boutiques")({
  component: AdminBoutiques,
});

function AdminBoutiques() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TenantStatus>("all");
  const [plan, setPlan] = useState<"all" | PlanId>("all");
  const [country, setCountry] = useState<"all" | string>("all");
  const [selected, setSelected] = useState<Tenant | null>(null);

  const countries = Array.from(new Set(TENANTS.map((t) => t.country))).sort();

  const filtered = useMemo(() => TENANTS.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (plan !== "all" && t.plan !== plan) return false;
    if (country !== "all" && t.country !== country) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return t.shop_name.toLowerCase().includes(s) || t.owner_name.toLowerCase().includes(s) || t.email.toLowerCase().includes(s);
  }), [q, status, plan, country]);

  return (
    <div>
      <PageHeader title="Boutiques" subtitle={`${TENANTS.length} boutiques enregistrées`} />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher boutique, gérant, email…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | TenantStatus)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(TENANT_STATUS_META) as TenantStatus[]).map((s) => <option key={s} value={s}>{TENANT_STATUS_META[s].label}</option>)}
          </select>
          <select value={plan} onChange={(e) => setPlan(e.target.value as "all" | PlanId)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Toutes formules</option>
            {(Object.keys(PLAN_LABEL) as PlanId[]).map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous pays</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Gérant</th>
                <th className="px-4 py-3">Pays</th>
                <th className="px-4 py-3">Formule</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Inscrite</th>
                <th className="px-4 py-3">Dernier paiement</th>
                <th className="px-4 py-3 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer border-t border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-3 font-semibold">{t.shop_name}</td>
                  <td className="px-4 py-3 text-xs">{t.owner_name}</td>
                  <td className="px-4 py-3 text-xs">{t.city}, {t.country}</td>
                  <td className="px-4 py-3 text-xs">{PLAN_LABEL[t.plan]}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", TENANT_STATUS_META[t.status].color)}>
                      {TENANT_STATUS_META[t.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.created_at}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.last_payment_at ?? "—"}</td>
                  <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(t.mrr)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucune boutique ne correspond</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && <Drawer tenant={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Drawer({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const payments = PAYMENTS.filter((p) => p.tenant_id === tenant.id);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 24 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l border-border bg-card shadow-elegant">
        <header className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-bold">{tenant.shop_name}</h2>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", TENANT_STATUS_META[tenant.status].color)}>
                {TENANT_STATUS_META[tenant.status].label}
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{PLAN_LABEL[tenant.plan]}</span>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-border hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</div>
            <div className="space-y-2 rounded-2xl border border-border/60 p-3 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> {tenant.owner_name}</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {tenant.email}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {tenant.phone}</div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {tenant.city}, {tenant.country}</div>
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-border/60 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Utilisateurs</div>
              <div className="tabular font-display text-lg font-bold">{tenant.users_count}</div>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Boutiques</div>
              <div className="tabular font-display text-lg font-bold">{tenant.shops_count}</div>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">MRR</div>
              <div className="tabular font-display text-lg font-bold text-primary">{formatXOF(tenant.mrr)}</div>
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paiements</div>
            <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
              {payments.length === 0 && <div className="p-4 text-xs text-muted-foreground">Aucun paiement enregistré</div>}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="font-semibold">{formatXOF(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">{p.method} · {new Date(p.created_at).toLocaleDateString("fr-FR")}</div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    p.status === "reussi" ? "bg-success/15 text-success" :
                    p.status === "echoue" ? "bg-destructive/15 text-destructive" : "bg-accent/25 text-accent-foreground")}>
                    {p.status === "reussi" ? "Réussi" : p.status === "echoue" ? "Échoué" : "En attente"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activité récente</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>• Connexion il y a 2 heures depuis Cotonou</li>
              <li>• 47 ventes enregistrées aujourd'hui</li>
              <li>• Ajout de 3 nouveaux produits (hier)</li>
              <li>• Renouvellement automatique programmé le {tenant.next_renewal_at}</li>
            </ul>
          </section>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <button className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <LogIn className="h-3.5 w-3.5" /> Se connecter en tant que
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold hover:bg-muted">
            <Clock className="h-3.5 w-3.5" /> Prolonger essai
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs font-semibold text-warning-foreground hover:bg-warning/20">
            <Pause className="h-3.5 w-3.5" /> Suspendre
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20">
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        </footer>
      </motion.aside>
    </>
  );
}
