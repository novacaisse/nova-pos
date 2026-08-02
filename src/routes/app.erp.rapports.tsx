// Rapports & BI ZegERP (Frontend Phase 9) — Stock / Achats / Ventes /
// Trésorerie / Mes rapports. Chaque onglet lit une vue SQL agrégée
// (migration 059) : aucune RLS propre à ces hooks, la vue hérite
// automatiquement de la RLS des tables sous-jacentes (erp_stock_levels,
// erp_purchase_orders, erp_sales_orders/erp_pos_sales, erp_cash_accounts)
// — même donnée, même périmètre par rôle que les modules 1/2/3/5. "Mes
// rapports" (erp_custom_reports) est privé à son auteur : un simple
// favori nommé pointant vers un des 4 onglets, jamais partagé entre
// collègues même au sein de la même organisation.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, Warehouse, Truck, Receipt, Landmark, Star } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import {
  useErpStockValuationReport, useErpPurchaseOrdersSummaryReport, useErpSalesSummaryReport, useErpCashPositionReport,
  useErpCustomReports, useUpsertErpCustomReport, useDeleteErpCustomReport,
  type ErpCustomReportType,
} from "@/lib/data/erpReportsHooks";

export const Route = createFileRoute("/app/erp/rapports")({
  component: ErpRapportsPage,
});

const TABS = [
  { k: "stock_valuation", label: "Stock", icon: Warehouse },
  { k: "purchases", label: "Achats", icon: Truck },
  { k: "sales", label: "Ventes", icon: Receipt },
  { k: "cash_position", label: "Trésorerie", icon: Landmark },
  { k: "custom", label: "Mes rapports", icon: Star },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpRapportsPage() {
  const [tab, setTab] = useState<TabKey>("stock_valuation");

  return (
    <div>
      <PageHeader title="Rapports & BI" subtitle="Valorisation du stock, achats, ventes et trésorerie" />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "stock_valuation" && <StockValuationTab />}
        {tab === "purchases" && <PurchasesTab />}
        {tab === "sales" && <SalesTab />}
        {tab === "cash_position" && <CashPositionTab />}
        {tab === "custom" && <CustomReportsTab onOpen={setTab} />}
      </div>
    </div>
  );
}

// ============ Stock ============
function StockValuationTab() {
  const { data: rows = [], isLoading } = useErpStockValuationReport();
  const formatMoney = useFormatMoney();
  const total = rows.reduce((sum, r) => sum + r.valuation, 0);

  return (
    <div className="space-y-4">
      <StatCard label="Valorisation totale du stock" value={formatMoney(total)} icon={<Warehouse className="h-5 w-5" />} />
      <div className="rounded-2xl border border-border bg-card p-4">
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune donnée de stock pour l'instant.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={`${r.product_id}-${r.warehouse_id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{r.product_name}</div>
                  <div className="text-xs text-muted-foreground">{r.warehouse_name} · {r.quantity} unités × {formatMoney(r.cost)}</div>
                </div>
                <div className="shrink-0 font-semibold">{formatMoney(r.valuation)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Achats ============
const PO_STATUS_LABEL: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", partially_received: "Partiellement reçue", received: "Reçue", cancelled: "Annulée" };
function PurchasesTab() {
  const { data: rows = [], isLoading } = useErpPurchaseOrdersSummaryReport();
  const formatMoney = useFormatMoney();
  const totalOrdered = rows.reduce((sum, r) => sum + r.total_amount, 0);
  const totalReceived = rows.reduce((sum, r) => sum + r.received_amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total commandé" value={formatMoney(totalOrdered)} icon={<Truck className="h-5 w-5" />} />
        <StatCard label="Total reçu" value={formatMoney(totalReceived)} icon={<Truck className="h-5 w-5" />} accent="success" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune commande fournisseur pour l'instant.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.purchase_order_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{r.reference || r.supplier_name}</div>
                  <div className="text-xs text-muted-foreground">{r.supplier_name} · {PO_STATUS_LABEL[r.status] ?? r.status}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{formatMoney(r.total_amount)}</div>
                  <div className="text-xs text-muted-foreground">{formatMoney(r.received_amount)} reçu</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Ventes ============
const CHANNEL_LABEL: Record<string, string> = { sales_order: "Commande", pos: "POS" };
function SalesTab() {
  const { data: rows = [], isLoading } = useErpSalesSummaryReport();
  const formatMoney = useFormatMoney();
  const total = rows.reduce((sum, r) => sum + r.total_amount, 0);
  const totalPos = rows.filter((r) => r.channel === "pos").reduce((sum, r) => sum + r.total_amount, 0);
  const totalOrders = rows.filter((r) => r.channel === "sales_order").reduce((sum, r) => sum + r.total_amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total ventes" value={formatMoney(total)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Commandes client" value={formatMoney(totalOrders)} />
        <StatCard label="Ventes POS" value={formatMoney(totalPos)} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune vente pour l'instant.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={`${r.channel}-${r.sale_id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{r.reference || (r.customer_name ?? "Vente comptoir")}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_name ?? "—"} · {r.status}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{CHANNEL_LABEL[r.channel]}</span>
                  <span className="font-semibold">{formatMoney(r.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Trésorerie ============
function CashPositionTab() {
  const { data: rows = [], isLoading } = useErpCashPositionReport();
  const formatMoney = useFormatMoney();
  const total = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-4">
      <StatCard label="Position de trésorerie" value={formatMoney(total)} icon={<Landmark className="h-5 w-5" />} />
      <div className="rounded-2xl border border-border bg-card p-4">
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun compte pour l'instant.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.cash_account_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{r.name}</span>
                <span className="font-semibold">{formatMoney(r.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Mes rapports (favoris privés) ============
const CUSTOM_TYPE_LABEL: Record<ErpCustomReportType, string> = { stock_valuation: "Stock", purchases: "Achats", sales: "Ventes", cash_position: "Trésorerie" };
function CustomReportsTab({ onOpen }: { onOpen: (tab: TabKey) => void }) {
  const { data: reports = [], isLoading } = useErpCustomReports();
  const remove = useDeleteErpCustomReport();
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">Vos rapports enregistrés — privés, visibles par vous seul même au sein de la même organisation.</p>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Enregistrer un rapport
        </button>
      </div>
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun rapport enregistré pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <button onClick={() => r.config.report_type && onOpen(r.config.report_type)} className="min-w-0 flex-1 text-left hover:underline">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.config.report_type ? CUSTOM_TYPE_LABEL[r.config.report_type] : "—"}{r.description ? ` · ${r.description}` : ""}</div>
              </button>
              <button onClick={() => { if (confirm(`Supprimer "${r.name}" ?`)) remove.mutate(r.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {creating && <CustomReportDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
function CustomReportDialog({ onClose }: { onClose: () => void }) {
  const upsert = useUpsertErpCustomReport();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reportType, setReportType] = useState<ErpCustomReportType>("stock_valuation");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try { await upsert.mutateAsync({ name: name.trim(), description: description.trim() || undefined, report_type: reportType }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le rapport."); }
  };

  return (
    <Dialog title="Enregistrer un rapport" onClose={onClose}>
      <Field label="Nom *" value={name} onChange={setName} placeholder="Ex : Stock fin de mois" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Domaine</span>
        <select value={reportType} onChange={(e) => setReportType(e.target.value as ErpCustomReportType)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(CUSTOM_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <Field label="Notes" value={description} onChange={setDescription} />
      <ErrorBanner error={error} />
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
        <button onClick={save} disabled={!name.trim() || upsert.isPending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {upsert.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer
        </button>
      </div>
    </Dialog>
  );
}

// ============ Composants partagés ============
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
