import { createFileRoute } from "@tanstack/react-router";
import { Plus, Wallet } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/depenses")({
  component: DepensesPage,
});

type Expense = { id: string; label: string; category: string; amount: number; date: string; method: string };

const EXPENSES: Expense[] = [
  { id: "e1", label: "Loyer boutique", category: "Locaux", amount: 150000, date: "2026-07-01", method: "Virement" },
  { id: "e2", label: "Facture SBEE", category: "Utilités", amount: 42000, date: "2026-07-03", method: "Mobile Money" },
  { id: "e3", label: "Salaire Moussa", category: "Personnel", amount: 85000, date: "2026-07-05", method: "Espèces" },
  { id: "e4", label: "Sachets emballage", category: "Consommables", amount: 12500, date: "2026-07-07", method: "Espèces" },
  { id: "e5", label: "Abonnement NovaCaisse", category: "Logiciel", amount: 19000, date: "2026-07-01", method: "Mobile Money" },
];

function DepensesPage() {
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Dépenses"
        subtitle="Suivi des sorties de caisse"
        actions={
          <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle dépense
          </button>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total du mois" value={formatXOF(total)} icon={<Wallet className="h-5 w-5" />} accent="destructive" />
          <StatCard label="Dépenses" value={String(EXPENSES.length)} accent="accent" />
          <StatCard label="Catégories" value={String(new Set(EXPENSES.map((e) => e.category)).size)} accent="primary" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Libellé</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Méthode</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {EXPENSES.map((e) => (
                <tr key={e.id} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{e.label}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.category}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-3 text-xs">{e.method}</td>
                  <td className={cn("tabular px-4 py-3 text-right font-bold text-destructive")}>-{formatXOF(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
