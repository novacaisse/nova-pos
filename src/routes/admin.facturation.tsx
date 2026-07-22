import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Sparkles, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useAdminShops, useAdminSubscriptions, useAdminPayments, usePlans } from "@/lib/data/adminHooks";
import { shopStatus } from "@/lib/adminShopStatus";
import { formatXOF } from "@/lib/mock/catalog";

export const Route = createFileRoute("/admin/facturation")({
  component: AdminFacturation,
});

function AdminFacturation() {
  const { data: shops = [], isLoading: shopsLoading } = useAdminShops();
  const { data: subs = [] } = useAdminSubscriptions();
  const { data: payments = [] } = useAdminPayments();
  const { data: plans = [] } = usePlans();

  const subByShop = useMemo(() => {
    const m = new Map<string, (typeof subs)[number]>();
    for (const s of subs) if (!m.has(s.shop_id)) m.set(s.shop_id, s);
    return m;
  }, [subs]);

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

  const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.amount, 0);
  const lastMonth = monthlyRevenue[monthlyRevenue.length - 1]?.amount ?? 0;
  const prevMonth = monthlyRevenue[monthlyRevenue.length - 2]?.amount ?? 0;
  const growth = prevMonth > 0 ? (((lastMonth - prevMonth) / prevMonth) * 100).toFixed(1) : "0.0";
  const projection = Math.round(lastMonth * 1.08);
  const maxRev = Math.max(1, ...monthlyRevenue.map((m) => m.amount));

  const byPlan = useMemo(() => {
    const counts: Record<string, { mrr: number; active: number }> = {};
    for (const p of plans) counts[p.id] = { mrr: 0, active: 0 };
    for (const s of shops) {
      const sub = subByShop.get(s.id);
      if (shopStatus(s, sub) === "active" && counts[s.plan]) {
        counts[s.plan].mrr += Number(sub?.amount ?? 0);
        counts[s.plan].active += 1;
      }
    }
    return counts;
  }, [shops, subByShop, plans]);
  const totalMRR = Object.values(byPlan).reduce((s, p) => s + p.mrr, 0);

  if (shopsLoading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div>
      <PageHeader title="Facturation" subtitle="Vue financière consolidée" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Revenu total 12 mois" value={formatXOF(totalRevenue)} icon={<Wallet className="h-5 w-5" />} accent="primary" />
          <StatCard label="Revenu du mois" value={formatXOF(lastMonth)} accent="success" trend={{ value: `${growth}%`, positive: Number(growth) >= 0 }} />
          <StatCard label="Projection mois +1" value={formatXOF(projection)} icon={<TrendingUp className="h-5 w-5" />} accent="accent" />
          <StatCard label="MRR total" value={formatXOF(totalMRR)} icon={<Sparkles className="h-5 w-5" />} accent="primary" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4">
            <div className="font-display text-base font-bold">Revenu mensuel</div>
            <div className="text-xs text-muted-foreground">12 derniers mois · paiements confirmés uniquement</div>
          </div>
          <div className="flex h-56 items-end gap-3">
            {monthlyRevenue.map((m, i) => (
              <div key={m.month + i} className="flex flex-1 flex-col items-center gap-2">
                <div className="tabular text-[10px] font-semibold text-muted-foreground">{Math.round(m.amount / 1000)}k</div>
                <motion.div initial={{ height: 0 }} animate={{ height: `${(m.amount / maxRev) * 100}%` }} transition={{ delay: i * 0.04 }}
                  className="w-full rounded-t-xl bg-gradient-to-t from-primary to-primary-glow shadow-glow" style={{ minHeight: m.amount > 0 ? 4 : 0 }} />
                <span className="text-[10px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="font-display text-sm font-bold text-muted-foreground">{p.name}</div>
              <div className="mt-2 tabular font-display text-2xl font-black text-primary">{formatXOF(byPlan[p.id]?.mrr ?? 0)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{byPlan[p.id]?.active ?? 0} boutiques actives</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div initial={{ width: 0 }} animate={{ width: `${totalMRR ? ((byPlan[p.id]?.mrr ?? 0) / totalMRR) * 100 : 0}%` }}
                  className="h-full bg-gradient-to-r from-primary to-primary-glow" />
              </div>
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {totalMRR ? Math.round(((byPlan[p.id]?.mrr ?? 0) / totalMRR) * 100) : 0}% du MRR
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
