import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Store, TrendingUp, TrendingDown, Wallet, Activity, AlertTriangle, ArrowRight } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { TENANTS, MONTHLY_REVENUE, SIGNUPS_30D, TENANT_STATUS_META, PLAN_LABEL } from "@/lib/mock/tenants";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const total = TENANTS.length;
  const active = TENANTS.filter((t) => t.status === "active").length;
  const trial = TENANTS.filter((t) => t.status === "essai").length;
  const expired = TENANTS.filter((t) => t.status === "expiree" || t.status === "suspendue").length;
  const mrr = TENANTS.reduce((s, t) => s + t.mrr, 0);
  const churn = ((expired / total) * 100).toFixed(1);

  const byPlan = { starter: 0, pro: 0, business: 0 };
  TENANTS.forEach((t) => byPlan[t.plan]++);
  const planColors = { starter: "hsl(var(--muted-foreground))", pro: "var(--primary)", business: "var(--accent-foreground)" };

  const recent = [...TENANTS].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const alerts = TENANTS.filter((t) => t.status === "essai" || t.status === "expiree").slice(0, 4);

  const maxSignup = Math.max(...SIGNUPS_30D.map((d) => d.count));
  const maxRev = Math.max(...MONTHLY_REVENUE.map((m) => m.amount));

  return (
    <div>
      <PageHeader title="Vue d'ensemble" subtitle="Métriques globales du parc NovaCaisse" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Boutiques totales" value={String(total)} icon={<Store className="h-5 w-5" />} accent="primary" />
          <StatCard label="Actives" value={String(active)} icon={<Activity className="h-5 w-5" />} accent="success" />
          <StatCard label="En essai" value={String(trial)} icon={<TrendingUp className="h-5 w-5" />} accent="accent" />
          <StatCard label="Expirées/suspendues" value={String(expired)} icon={<TrendingDown className="h-5 w-5" />} accent="destructive" />
          <StatCard label="MRR" value={formatXOF(mrr)} icon={<Wallet className="h-5 w-5" />} accent="primary" />
          <StatCard label="Churn mensuel" value={`${churn}%`} accent="destructive" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-base font-bold">Nouvelles inscriptions</div>
                <div className="text-xs text-muted-foreground">30 derniers jours</div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                {SIGNUPS_30D.reduce((s, d) => s + d.count, 0)} au total
              </span>
            </div>
            <div className="flex h-40 items-end gap-1">
              {SIGNUPS_30D.map((d, i) => (
                <motion.div key={d.day} initial={{ height: 0 }} animate={{ height: `${(d.count / maxSignup) * 100}%` }}
                  transition={{ delay: i * 0.015 }}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-primary to-primary-glow" title={`${d.day}: ${d.count}`} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 font-display text-base font-bold">Répartition par formule</div>
            <Donut data={byPlan} colors={planColors} />
            <div className="mt-4 space-y-1.5 text-sm">
              {(Object.keys(byPlan) as (keyof typeof byPlan)[]).map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: planColors[k] }} />
                    <span>{PLAN_LABEL[k]}</span>
                  </div>
                  <span className="tabular font-bold">{byPlan[k]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card lg:col-span-2">
            <div className="flex items-center justify-between p-5 pb-3">
              <div className="font-display text-base font-bold">Dernières inscriptions</div>
              <Link to="/admin/boutiques" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Tout voir <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2">Boutique</th>
                  <th className="px-5 py-2">Pays</th>
                  <th className="px-5 py-2">Formule</th>
                  <th className="px-5 py-2">Statut</th>
                  <th className="px-5 py-2">Inscrite</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="font-semibold">{t.shop_name}</div>
                      <div className="text-xs text-muted-foreground">{t.owner_name}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">{t.country}</td>
                    <td className="px-5 py-3 text-xs">{PLAN_LABEL[t.plan]}</td>
                    <td className="px-5 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", TENANT_STATUS_META[t.status].color)}>
                        {TENANT_STATUS_META[t.status].label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{t.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div className="font-display text-base font-bold">Alertes</div>
            </div>
            <div className="space-y-2">
              {alerts.map((t) => (
                <div key={t.id} className="rounded-xl border border-border/60 p-3">
                  <div className="text-sm font-semibold">{t.shop_name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.status === "essai" ? "Essai jusqu'au" : "Expirée le"} {t.next_renewal_at}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", TENANT_STATUS_META[t.status].color)}>
                      {TENANT_STATUS_META[t.status].label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-display text-base font-bold">Revenu mensuel</div>
              <div className="text-xs text-muted-foreground">12 derniers mois</div>
            </div>
            <Link to="/admin/facturation" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Détails <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex h-40 items-end gap-2">
            {MONTHLY_REVENUE.map((m, i) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <motion.div initial={{ height: 0 }} animate={{ height: `${(m.amount / maxRev) * 100}%` }} transition={{ delay: i * 0.03 }}
                  className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary-glow" />
                <span className="text-[9px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Donut({ data, colors }: { data: Record<string, number>; colors: Record<string, string> }) {
  const total = Object.values(data).reduce((s, n) => s + n, 0);
  const keys = Object.keys(data);
  let offset = 0;
  const c = 2 * Math.PI * 45;
  return (
    <svg viewBox="0 0 120 120" className="mx-auto h-40 w-40 -rotate-90">
      <circle cx="60" cy="60" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
      {keys.map((k) => {
        const val = data[k];
        const len = (val / total) * c;
        const el = (
          <circle key={k} cx="60" cy="60" r="45" fill="none" stroke={colors[k]} strokeWidth="14"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += len;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" transform="rotate(90 60 60)"
        className="fill-foreground font-display text-lg font-bold">{total}</text>
    </svg>
  );
}
