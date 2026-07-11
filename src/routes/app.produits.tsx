import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Edit3, Trash2, X, Save, LayoutGrid, List, Tag as TagIcon, Package } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useProducts, useUpsertProduct, useDeleteProduct,
  useCategories, useUpsertCategory, useDeleteCategory,
  formatXOF, type ProductWithStock, type Category,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/produits")({
  component: ProduitsPage,
});

function ProduitsPage() {
  const { data: products = [], isLoading } = useProducts();
  const { data: cats = [] } = useCategories();
  const upsert = useUpsertProduct();
  const remove = useDeleteProduct();

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | string>("all");
  const [view, setView] = useState<"grid" | "list">("list");
  const [edit, setEdit] = useState<Partial<ProductWithStock> | null>(null);
  const [confirmDel, setConfirmDel] = useState<ProductWithStock | null>(null);
  const [manageCats, setManageCats] = useState(false);

  const list = useMemo(() => products.filter((p) => {
    if (cat !== "all" && p.category_id !== cat) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
  }), [products, query, cat]);

  return (
    <div>
      <PageHeader title="Produits" subtitle={`${products.length} référence${products.length > 1 ? "s" : ""} dans le catalogue`}
        actions={
          <>
            <button onClick={() => setManageCats(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><TagIcon className="h-4 w-4" /> Catégories</button>
            <button onClick={() => setEdit({ name: "", price: 0, cost: 0, unit: "pcs", is_active: true, low_stock_threshold: 5, tax_rate: 0 })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouveau produit</button>
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
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1">
            <button onClick={() => setCat("all")} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium", cat === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Tous</button>
            {cats.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium", cat === c.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{c.name}</button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button onClick={() => setView("list")} className={cn("grid h-8 w-8 place-items-center rounded-md", view === "list" && "bg-muted")}><List className="h-4 w-4" /></button>
            <button onClick={() => setView("grid")} className={cn("grid h-8 w-8 place-items-center rounded-md", view === "grid" && "bg-muted")}><LayoutGrid className="h-4 w-4" /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-sm text-muted-foreground">Aucun produit. Commencez par créer votre catalogue.</div>
            <button onClick={() => setEdit({ name: "", price: 0, cost: 0, unit: "pcs", is_active: true, low_stock_threshold: 5, tax_rate: 0 })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter un produit</button>
          </div>
        ) : view === "list" ? (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Produit</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3 text-right">Prix achat</th><th className="px-4 py-3 text-right">Prix vente</th>
                  <th className="px-4 py-3 text-right">Marge</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const cost = Number(p.cost) || 0;
                  const price = Number(p.price) || 0;
                  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;
                  const catName = cats.find((c) => c.id === p.category_id)?.name ?? "—";
                  return (
                    <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-lg">📦</div>
                          <div><div className="font-semibold">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.unit}</div></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku ?? "—"}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{catName}</span></td>
                      <td className="tabular px-4 py-3 text-right text-muted-foreground">{formatXOF(cost)}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold">{formatXOF(price)}</td>
                      <td className={cn("tabular px-4 py-3 text-right", margin > 0 ? "text-success" : "text-muted-foreground")}>{margin}%</td>
                      <td className={cn("tabular px-4 py-3 text-right font-bold", p.stock < p.low_stock_threshold && "text-warning-foreground")}>{p.stock}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                          <button onClick={() => setConfirmDel(p)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((p) => (
              <div key={p.id} className="group rounded-2xl border border-border bg-card p-3 hover:shadow-elegant">
                <div className="grid aspect-square place-items-center rounded-xl bg-muted text-5xl">📦</div>
                <div className="mt-3 truncate text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">{p.sku ?? "—"}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="tabular font-bold">{formatXOF(Number(p.price))}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEdit(p)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDel(p)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <ProductDialog initial={edit} cats={cats}
            onClose={() => setEdit(null)}
            onSave={async (p) => { await upsert.mutateAsync(p); setEdit(null); }}
          />
        )}
        {confirmDel && (
          <ConfirmDialog title={`Supprimer ${confirmDel.name} ?`} onClose={() => setConfirmDel(null)}
            onConfirm={async () => { await remove.mutateAsync(confirmDel.id); setConfirmDel(null); }} />
        )}
        {manageCats && (
          <CategoriesDialog cats={cats} onClose={() => setManageCats(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ProductDialog({ initial, cats, onClose, onSave }: { initial: Partial<ProductWithStock>; cats: Category[]; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [form, setForm] = useState<Partial<ProductWithStock>>(initial);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const price = Number(form.price) || 0;
  const cost = Number(form.cost) || 0;
  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial.id ? "Modifier produit" : "Nouveau produit"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">SKU</div><input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Code-barres</div><input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Catégorie</div><select value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })} className={inp}>
            <option value="">— Sans catégorie —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Unité</div><input value={form.unit ?? "pcs"} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Prix achat (F)</div><input type="number" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) || 0 })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Prix vente (F) *</div><input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} className={inp} /></label>
          {!initial.id && (
            <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Stock initial</div><input type="number" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} className={inp} /></label>
          )}
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Seuil stock bas</div><input type="number" value={form.low_stock_threshold ?? 5} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) || 0 })} className={inp} /></label>
        </div>
        {price > 0 && (
          <div className="rounded-xl bg-muted p-3 text-xs">Marge indicative : <b className="text-success">{margin}%</b></div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.name || !form.price} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function CategoriesDialog({ cats, onClose }: { cats: Category[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const upsertCat = useUpsertCategory();
  const delCat = useDeleteCategory();
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Catégories</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-5">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
          <button onClick={async () => { if (name.trim()) { await upsertCat.mutateAsync({ name: name.trim(), color: "#0891b2" }); setName(""); } }} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Ajouter</button>
        </div>
        <div className="space-y-1">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <input defaultValue={c.name} onBlur={(e) => { if (e.target.value !== c.name) upsertCat.mutate({ id: c.id, name: e.target.value, color: c.color }); }} className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm focus:border-border focus:bg-background" />
              <button onClick={() => delCat.mutate(c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {cats.length === 0 && <div className="py-4 text-center text-xs text-muted-foreground">Aucune catégorie.</div>}
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onClose} w="max-w-sm">
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">Supprimer</button>
        </div>
      </div>
    </Overlay>
  );
}
