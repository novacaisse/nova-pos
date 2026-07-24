import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, LogIn, Pause, Play, Trash2, Clock, Store, User, Mail, Phone, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useAdminOrganizations, useAdminSubscriptions, useSuspendOrganization, useExtendTrial, useDeleteOrganization, useImpersonate,
  usePlans, type AdminOrganization, type AdminSubscription,
} from "@/lib/data/adminHooks";
import { organizationStatus, STATUS_META, type OrganizationStatus } from "@/lib/adminShopStatus";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/boutiques")({
  component: AdminBoutiques,
});

function AdminBoutiques() {
  const { data: organizations = [], isLoading } = useAdminOrganizations();
  const { data: subs = [] } = useAdminSubscriptions();
  const { data: plans = [] } = usePlans();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | OrganizationStatus>("all");
  const [selected, setSelected] = useState<AdminOrganization | null>(null);

  const subByOrganization = useMemo(() => {
    const m = new Map<string, AdminSubscription>();
    for (const s of subs) if (!m.has(s.organization_id)) m.set(s.organization_id, s); // subs déjà triées par created_at desc
    return m;
  }, [subs]);
  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  const filtered = useMemo(() => organizations.filter((s) => {
    const st = organizationStatus(s, subByOrganization.get(s.id));
    if (status !== "all" && st !== status) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return s.name.toLowerCase().includes(needle)
      || (s.owner_profile?.full_name ?? "").toLowerCase().includes(needle)
      || (s.owner_email ?? "").toLowerCase().includes(needle);
  }), [organizations, subByOrganization, status, q]);

  return (
    <div>
      <PageHeader title="Boutiques" subtitle={`${organizations.length} boutique${organizations.length > 1 ? "s" : ""} enregistrée${organizations.length > 1 ? "s" : ""}`} />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher boutique, gérant, email…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(STATUS_META) as OrganizationStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Gérant</th>
                <th className="px-4 py-3">Pays</th>
                <th className="px-4 py-3">Formule</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Inscrite</th>
                <th className="px-4 py-3 text-right">MRR (approx.)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const sub = subByOrganization.get(s.id);
                const st = organizationStatus(s, sub);
                const mrr = st === "active" ? Number(sub?.amount ?? 0) : 0;
                return (
                  <tr key={s.id} onClick={() => setSelected(s)} className="cursor-pointer border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">{s.name}</td>
                    <td className="px-4 py-3 text-xs">{s.owner_profile?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{s.country}</td>
                    <td className="px-4 py-3 text-xs">{planById[s.plan]?.name ?? (s.plan === "trial" ? "Essai" : s.plan)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_META[st].color)}>{STATUS_META[st].label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(mrr)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucune boutique ne correspond</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <Drawer shop={selected} sub={subByOrganization.get(selected.id)} plan={planById[selected.plan]}
            onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Drawer({ shop, sub, plan, onClose }: {
  shop: AdminOrganization; sub?: AdminSubscription; plan?: { name: string };
  onClose: () => void;
}) {
  const status = organizationStatus(shop, sub);
  const suspend = useSuspendOrganization();
  const extend = useExtendTrial();
  const remove = useDeleteOrganization();
  const impersonate = useImpersonate();
  const [extending, setExtending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImpersonate = async () => {
    setError(null);
    try {
      const { action_link } = await impersonate.mutateAsync({ target_user_id: shop.owner_id, organization_id: shop.id });
      window.location.href = action_link;
    } catch (e: any) {
      setError(e?.message ?? "Impossible de générer le lien de connexion.");
    }
  };

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
              <h2 className="font-display text-lg font-bold">{shop.name}</h2>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_META[status].color)}>{STATUS_META[status].label}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{plan?.name ?? (shop.plan === "trial" ? "Essai" : shop.plan)}</span>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-border hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</div>
            <div className="space-y-2 rounded-2xl border border-border/60 p-3 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> {shop.owner_profile?.full_name ?? "—"}</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {shop.owner_email ?? "— (fonction admin_get_user_emails non déployée ?)"}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {shop.owner_profile?.phone ?? "—"}</div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-border/60 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Devise</div>
              <div className="tabular font-display text-lg font-bold">{shop.currency}</div>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">MRR</div>
              <div className="tabular font-display text-lg font-bold text-primary">{formatXOF(status === "active" ? Number(sub?.amount ?? 0) : 0)}</div>
            </div>
          </section>

          {shop.trial_ends_at && (
            <div className="rounded-xl bg-muted p-3 text-xs">
              Essai {new Date(shop.trial_ends_at) < new Date() ? "terminé le" : "jusqu'au"} {new Date(shop.trial_ends_at).toLocaleDateString("fr-FR")}
            </div>
          )}
          {sub?.current_period_end && (
            <div className="rounded-xl bg-muted p-3 text-xs">
              Prochaine échéance : {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}
            </div>
          )}

          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

          {extending && (
            <ExtendForm onCancel={() => setExtending(false)}
              onConfirm={async (days) => { await extend.mutateAsync({ id: shop.id, days }); setExtending(false); }} />
          )}
          {deleting && (
            <DeleteConfirm shopName={shop.name} onCancel={() => setDeleting(false)}
              onConfirm={async () => { await remove.mutateAsync(shop.id); setDeleting(false); onClose(); }} />
          )}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <button onClick={doImpersonate} disabled={impersonate.isPending}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {impersonate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Se connecter en tant que
          </button>
          <button onClick={() => setExtending((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold hover:bg-muted">
            <Clock className="h-3.5 w-3.5" /> Prolonger essai
          </button>
          <button onClick={() => suspend.mutate({ id: shop.id, suspended: !shop.suspended })} disabled={suspend.isPending}
            className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold",
              shop.suspended ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                : "border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/20")}>
            {shop.suspended ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {shop.suspended ? "Réactiver" : "Suspendre"}
          </button>
          <button onClick={() => setDeleting((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20">
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        </footer>
      </motion.aside>
    </>
  );
}

function ExtendForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (days: number) => Promise<void> }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">Prolonger l'essai de combien de jours ?</div>
      <div className="flex gap-2">
        <input type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm" />
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Annuler</button>
        <button onClick={async () => { setBusy(true); await onConfirm(days); setBusy(false); }} disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Confirmer
        </button>
      </div>
    </div>
  );
}

function DeleteConfirm({ shopName, onCancel, onConfirm }: { shopName: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <div className="mb-2 text-xs text-destructive">
        Action irréversible — supprime la boutique et toutes ses données (ventes, stock, clients…).
        Tapez <b>{shopName}</b> pour confirmer.
      </div>
      <div className="flex gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm" />
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Annuler</button>
        <button onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
          disabled={typed !== shopName || busy}
          className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground disabled:opacity-40">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Supprimer définitivement
        </button>
      </div>
    </div>
  );
}
