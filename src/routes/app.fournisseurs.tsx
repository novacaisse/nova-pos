import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Truck, Phone, Mail, FileText, PackageCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { SUPPLIERS, PURCHASE_ORDERS, type PurchaseOrder } from "@/lib/mock/suppliers";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/fournisseurs")({
  component: FournisseursPage,
});

const STATUS_COLOR: Record<PurchaseOrder["status"], string> = {
  brouillon: "bg-muted text-muted-foreground",
  envoyée: "bg-primary/15 text-primary",
  reçue: "bg-success/15 text-success",
  partielle: "bg-warning/20 text-warning-foreground",
  annulée: "bg-destructive/15 text-destructive",
};

function FournisseursPage() {
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");

  const outstanding = SUPPLIERS.reduce((s, x) => s + x.outstanding, 0);
  const pending = PURCHASE_ORDERS.filter((p) => p.status === "envoyée" || p.status === "partielle").length;

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        subtitle="Partenaires et bons de commande"
        actions={
          <>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Nouveau fournisseur</button>
            <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><FileText className="h-4 w-4" /> Bon de commande</button>
          </>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Fournisseurs actifs" value={String(SUPPLIERS.length)} icon={<Truck className="h-5 w-5" />} accent="primary" />
          <StatCard label="Commandes en cours" value={String(pending)} icon={<PackageCheck className="h-5 w-5" />} accent="accent" />
          <StatCard label="À payer" value={formatXOF(outstanding)} accent="destructive" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["suppliers", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "suppliers" ? "Fournisseurs" : "Bons de commande"}
            </button>
          ))}
        </div>

        {tab === "suppliers" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SUPPLIERS.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-elegant">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.category} · {s.city}</div>
                  </div>
                  {s.outstanding > 0 && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">Dû</span>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {s.phone}</div>
                  {s.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {s.email}</div>}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Solde dû</div><div className="tabular font-bold">{formatXOF(s.outstanding)}</div></div>
                  <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dernier BC</div><div className="text-xs font-semibold">{s.last_order}</div></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Créé</th>
                  <th className="px-4 py-3">Livraison</th>
                  <th className="px-4 py-3 text-right">Articles</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {PURCHASE_ORDERS.map((o) => (
                  <tr key={o.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{o.ref}</td>
                    <td className="px-4 py-3 font-medium">{o.supplier_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.created_at}</td>
                    <td className="px-4 py-3 text-xs">{o.expected_at}</td>
                    <td className="tabular px-4 py-3 text-right">{o.items_count}</td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[o.status])}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
