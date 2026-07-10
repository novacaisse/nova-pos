import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Sparkles } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { MONTHLY_REVENUE, TENANTS, PLAN_LABEL, type PlanId } from "@/lib/mock/tenants";
import { formatXOF } from "@/lib/mock/catalog";

export const Route = createFileRoute("/admin/facturation")({
  component: AdminFacturation,
});

function AdminFacturation() {
  const totalRevenue = MONTHLY_REVENUE.reduce((s, m) => s + m.amount, 0);
  const lastMonth = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 1].amount;
  const prevMonth = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 2].amount;
  const growth = (((lastMonth - prevMonth) / prevMonth) * 100).toFixed(1);
  const projection = Math.round(lastMonth * 1.08);

  const byPlan: Record<PlanId, number> = { starter: 0, pro: 0, business: 0 };
  TENANTS.forEach((t) => (byPlan[t.plan] += t.mrr));
  const totalMRR = Object.values(byPlan).reduce((s, n) => s + n, 0);

  const maxRev = Math.max(...MONTHLY_REVENUE.map((m) => m.amount));

  return (
    <div>
      <PageHeader title="Facturation" subtitle="Vue financière consolidée" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Revenu total 12 mois" value={formatXOF(totalRevenue)} icon={<Wallet className="h-5 w-5" />} accent="primary" />
          <StatCard label="Revenu du mois" value={formatXOF(lastMonth)} accent="success" delta={`${growth}%`} />
          <StatCard label="Projection mois +1" value={formatXOF(projection)} icon={<TrendingUp className="h-5 w-5" />} accent="accent" />
          <StatCard label="MRR total" value={formatXOF(totalMRR)} icon={<Sparkles className="h-5 w-5" />} accent="primary" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4">
            <div className="font-display text-base font-bold">Revenu mensuel</div>
            <div className="text-xs text-muted-foreground">12 derniers mois</div>
          </div>
          <div className="flex h-56 items-end gap-3">
            {MONTHLY_REVENUE.map((m, i) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="tabular text-[10px] font-semibold text-muted-foreground">{Math.round(m.amount / 1000)}k</div>
                <motion.div initial={{ height: 0 }} animate={{ height: `${(m.amount / maxRev) * 100}%` }} transition={{ delay: i * 0.04 }}
                  className="w-full rounded-t-xl bg-gradient-to-t from-primary to-primary-glow shadow-glow" />
                <span className="text-[10px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(byPlan) as PlanId[]).map((k) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-5">
              <div className="font-display text-sm font-bold text-muted-foreground">{PLAN_LABEL[k]}</div>
              <div className="mt-2 tabular font-display text-2xl font-black text-primary">{formatXOF(byPlan[k])}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {TENANTS.filter((t) => t.plan === k && t.status === "active").length} boutiques actives
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(byPlan[k] / totalMRR) * 100 || 0}%` }}
                  className="h-full bg-gradient-to-r from-primary to-primary-glow" />
              </div>
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {totalMRR ? Math.round((byPlan[k] / totalMRR) * 100) : 0}% du MRR
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
