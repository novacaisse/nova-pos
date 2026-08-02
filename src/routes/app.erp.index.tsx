// Tableau de bord ZegERP — Frontend Phase 1 : ne couvre pour l'instant que
// le module Stock/Produits (seul module dont les écrans existent). KPI
// réels (pas de placeholder) : sur une organisation neuve, ils affichent
// simplement 0 — c'est le comportement correct, pas un signe d'écran
// inachevé. Mis à jour en temps réel (erp_stock_movements) avec un filet
// refetchInterval, même pattern que app.resto.index.tsx.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Package, Warehouse, AlertTriangle, ArrowLeftRight, ClipboardList } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useErpDashboardStats } from "@/lib/data/erpHooks";

export const Route = createFileRoute("/app/erp/")({
  component: ErpDashboard,
});

function ErpDashboard() {
  const { data, isLoading } = useErpDashboardStats();

  return (
    <div>
      <PageHeader title="ZegERP" subtitle="Tableau de bord" />
      <div className="space-y-4 p-5 sm:p-8">
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Produits actifs" value={String(data?.productsCount ?? 0)} icon={<Package className="h-5 w-5" />} accent="primary" />
              <StatCard label="Dépôts actifs" value={String(data?.warehousesCount ?? 0)} icon={<Warehouse className="h-5 w-5" />} accent="accent" />
              <StatCard label="Stock bas" value={String(data?.lowStockCount ?? 0)} icon={<AlertTriangle className="h-5 w-5" />}
                accent={(data?.lowStockCount ?? 0) > 0 ? "destructive" : "success"} />
              <StatCard label="Transferts en transit" value={String(data?.pendingTransfersCount ?? 0)} icon={<ArrowLeftRight className="h-5 w-5" />} accent="accent" />
              <StatCard label="Inventaires en cours" value={String(data?.inProgressInventoriesCount ?? 0)} icon={<ClipboardList className="h-5 w-5" />} accent="accent" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/app/erp/produits" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-primary/40 hover:shadow-elegant">Gérer les produits →</Link>
              <Link to="/app/erp/stock" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold hover:border-primary/40 hover:shadow-elegant">Voir le stock →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
