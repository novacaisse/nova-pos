import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Store, TrendingUp, TrendingDown, Wallet, Activity, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useAdminShops, useAdminSubscriptions, useAdminPayments, usePlans } from "@/lib/data/adminHooks";
import { shopStatus, STATUS_META } from "@/lib/adminShopStatus";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: shops = [], isLoading } = useAdminShops();
  const { data: subs = [] } = useAdminSubscriptions();
  const { data: payments = [] } = useAdminPayments();
  const { data: plans = [] } = usePlans();

  const subByShop = useMemo(() => {
    const m = new Map<string, (typeof subs)[number]>();
    for (const s of subs) if (!m.has(s.shop_id)) m.set(s.shop_id, s);
    return m;
  }, [subs]);
  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  const withStatus = useMemo(() => shops.map((s) => ({ shop: s, status: shopStatus(s, subByShop.get(s.id)) })), [shops, subByShop]);

  const total = shops.length;
  const active = withStatus.filter((s) => s.status === "active").length;
  const trial = withStatus.filter((s) => s.status === "essai").length;
  const expired = withStatus.filter((s) => s.status === "expiree" || s.status === "suspendue").length;
  const mrr = withStatus.reduce((sum, s) => sum + (s.status === "active" ? Number(subByShop.get(s.shop.id)?.amount ?? 0) : 0), 0);
  const churn = total > 0 ? ((expired / total) * 100).toFixed(1) : "0.0";

  const byPlan = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) counts[p.id] = 0;
    for (const s of shops) if (s.plan !== "trial") counts[s.plan] = (counts[s.plan] ?? 0) + 1;
    return counts;
  }, [shops, plans]);
  const planColors = ["var(--primary)", "hsl(var(--muted-foreground))", "var(--accent-foreground)", "hsl(var(--warning))"];

  const recent = useMemo(() => [...shops].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5), [shops]);
  const alerts = useMemo(() => withStatus.filter((s) => s.status === "essai" || s.status === "expiree").slice(0, 4), [withStatus]);

  const signups30d = useMemo(() => {
    const days: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = shops.filter((s) => s.created_at.slice(0, 10) === key).length;
      days.push({ day: `${d.getDate()}/${d.getMonth() + 1}`, count });
    }
    return days;
  }, [shops]);

  const monthlyRevenue = useMemo(() => {
    const months: { month: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i, 1);
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      const amount = payments
        .filter((p) => p.status === "paid" && p.paid_at
          && new Date(p.paid_at).getMonth() === d.getMonth() && new Date(p.paid_at).getFullYear() === d.getFullYear())
        .reduce((s, p) => s + Number(p.amount), 0);
      months.push({ month: label, amount });
    }
    return months;
  }, [payments]);
  const maxSignup = Math.max(1, ...signups30d.map((d) => d.count));
  const maxRev = Math.max(1, ...monthlyRevenue.map((m) => m.amount));

  if (isLoading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div>
      <PageHeader title="Vue d'ensemble" subtitle="Métriques globales du parc NovaCaisse" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Boutiques totales" value={String(total)} icon={<Store className="h-5 w-5" />} accent="primary" />
          <StatCard label="Actives" value={String(active)} icon={<Activity className="h-5 w-5" />} accent="success" />
          <StatCard label="En essai" value={String(trial)} icon={<TrendingUp className="h-5 w-5" />} accent="accent" />
          <StatCard label="Expirées/suspendues" value={String(expired)} icon={<TrendingDown className="h-5 w-5" />} accent="destructive" />
          <StatCard label="MRR (approx.)" value={formatXOF(mrr)} icon={<Wallet className="h-5 w-5" />} accent="primary" />
          <StatCard label="Churn" value={`${churn}%`} accent="destructive" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-display text-base font-bold">Nouvelles inscriptions</div>
              <div className="text-xs text-muted-foreground">30 derniers jours</div>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              {signups30d.reduce((s, d) => s + d.count, 0)} au total
            </span>
          </div>
          <div className="flex h-32 items-end gap-1">
            {signups30d.map((d, i) => (
              <motion.div key={d.day + i} initial={{ height: 0 }} animate={{ height: `${(d.count / maxSignup) * 100}%` }}
                transition={{ delay: i * 0.01 }} title={`${d.day}: ${d.count}`}
                className="flex-1 rounded-t-md bg-gradient-to-t from-primary to-primary-glow" style={{ minHeight: d.count > 0 ? 4 : 0 }} />
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="font-display text-base font-bold">Dernières inscriptions</div>
            <div className="mt-3 space-y-2">
              {recent.length === 0 && <div className="text-sm text-muted-foreground">Aucune boutique pour l'instant.</div>}
              {recent.map((s) => {
                const st = shopStatus(s, subByShop.get(s.id));
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.owner_profile?.full_name ?? "—"} · {s.country}</div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_META[st].color)}>{STATUS_META[st].label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 font-display text-base font-bold">Répartition par formule</div>
            <Donut data={byPlan} colors={planColors} />
            <div className="mt-4 space-y-1.5 text-sm">
              {Object.keys(byPlan).map((k, i) => (
                <div key={k} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: planColors[i % planColors.length] }} />
                    <span>{planById[k]?.name ?? k}</span>
                  </div>
                  <span className="tabular font-bold">{byPlan[k]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <div className="font-display text-base font-bold">Alertes</div>
            <Link to="/admin/boutiques" className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Voir toutes les boutiques <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {alerts.length === 0 && <div className="text-sm text-muted-foreground">Aucune alerte 🎉</div>}
            {alerts.map(({ shop, status }) => (
              <div key={shop.id} className="rounded-xl border border-border/60 p-3">
                <div className="text-sm font-semibold">{shop.name}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{shop.trial_ends_at ? new Date(shop.trial_ends_at).toLocaleDateString("fr-FR") : "—"}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_META[status].color)}>{STATUS_META[status].label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-display text-base font-bold">Revenu mensuel</div>
              <div className="text-xs text-muted-foreground">12 derniers mois · paiements confirmés uniquement</div>
            </div>
            <Link to="/admin/facturation" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Détails <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex h-40 items-end gap-2">
            {monthlyRevenue.map((m, i) => (
              <div key={m.month + i} className="flex flex-1 flex-col items-center gap-1">
                <motion.div initial={{ height: 0 }} animate={{ height: `${(m.amount / maxRev) * 100}%` }} transition={{ delay: i * 0.03 }}
                  className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary-glow" style={{ minHeight: m.amount > 0 ? 4 : 0 }} />
                <span className="text-[9px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Donut({ data, colors }: { data: Record<string, number>; colors: string[] }) {
  const total = Object.values(data).reduce((s, n) => s + n, 0) || 1;
  const keys = Object.keys(data);
  let offset = 0;
  const c = 2 * Math.PI * 45;
  return (
    <svg viewBox="0 0 120 120" className="mx-auto h-40 w-40 -rotate-90">
      <circle cx="60" cy="60" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
      {keys.map((k, i) => {
        const val = data[k];
        const len = (val / total) * c;
        const el = (
          <motion.circle key={k} cx="60" cy="60" r="45" fill="none" stroke={colors[i % colors.length]} strokeWidth="14"
            initial={{ strokeDasharray: `0 ${c}` }} animate={{ strokeDasharray: `${len} ${c - len}` }}
            strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += len;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" transform="rotate(90 60 60)"
        className="fill-foreground font-display text-lg font-bold">{Object.values(data).reduce((s, n) => s + n, 0)}</text>
    </svg>
  );
}
