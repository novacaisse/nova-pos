import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus, Download, Upload, Barcode, Edit3, Tag as TagIcon, LayoutGrid, List } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PRODUCTS, CATEGORIES, formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/produits")({
  component: ProduitsPage,
});

function ProduitsPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | string>("all");
  const [view, setView] = useState<"grid" | "list">("list");

  const list = useMemo(
    () =>
      PRODUCTS.filter((p) => {
        if (cat !== "all" && p.category_id !== cat) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }),
    [query, cat],
  );

  return (
    <div>
      <PageHeader
        title="Produits"
        subtitle={`${PRODUCTS.length} références dans le catalogue`}
        actions={
          <>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" /> Importer</button>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Exporter</button>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Barcode className="h-4 w-4" /> Étiquettes</button>
            <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouveau produit</button>
          </>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, SKU, code-barres…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            <button onClick={() => setCat("all")} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", cat === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Tous</button>
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", cat === c.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{c.name}</button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button onClick={() => setView("list")} className={cn("grid h-8 w-8 place-items-center rounded-md", view === "list" && "bg-muted")}><List className="h-4 w-4" /></button>
            <button onClick={() => setView("grid")} className={cn("grid h-8 w-8 place-items-center rounded-md", view === "grid" && "bg-muted")}><LayoutGrid className="h-4 w-4" /></button>
          </div>
        </div>

        {view === "list" ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Produit</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3 text-right">Prix achat</th>
                  <th className="px-4 py-3 text-right">Prix vente</th>
                  <th className="px-4 py-3 text-right">Marge</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const cost = Math.round(p.price * 0.68);
                  const margin = Math.round(((p.price - cost) / p.price) * 100);
                  const catName = CATEGORIES.find((c) => c.id === p.category_id)?.name ?? "—";
                  return (
                    <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-xl">{p.emoji}</div>
                          <div><div className="font-semibold">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.unit}</div></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{catName}</span></td>
                      <td className="tabular px-4 py-3 text-right text-muted-foreground">{formatXOF(cost)}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold">{formatXOF(p.price)}</td>
                      <td className="tabular px-4 py-3 text-right text-success">{margin}%</td>
                      <td className={cn("tabular px-4 py-3 text-right font-bold", p.stock < 25 && "text-warning-foreground")}>{p.stock}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((p) => {
              const cost = Math.round(p.price * 0.68);
              const margin = Math.round(((p.price - cost) / p.price) * 100);
              return (
                <div key={p.id} className="group rounded-2xl border border-border bg-card p-3 transition-shadow hover:shadow-elegant">
                  <div className="grid aspect-square place-items-center rounded-xl bg-muted text-5xl">{p.emoji}</div>
                  <div className="mt-3 truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="tabular font-bold">{formatXOF(p.price)}</span>
                    <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">{margin}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span><TagIcon className="mr-1 inline h-3 w-3" />Stock {p.stock}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
