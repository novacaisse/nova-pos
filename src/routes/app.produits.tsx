import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Download, Upload, Barcode, Edit3, Trash2, X, Save, LayoutGrid, List, Tag as TagIcon } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PRODUCTS as SEED, CATEGORIES as SEED_CATS, formatXOF, type Product, type Category } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/produits")({
  component: ProduitsPage,
});

const EMOJIS = ["📦", "🥤", "🧃", "☕", "🍫", "🍪", "🍚", "🫒", "🥫", "🧂", "🧼", "🪥", "🧻", "🧽", "💡", "🍎", "🥖"];

function ProduitsPage() {
  const [products, setProducts] = useState<Product[]>(SEED);
  const [cats, setCats] = useState<Category[]>(SEED_CATS);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | string>("all");
  const [view, setView] = useState<"grid" | "list">("list");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);
  const [manageCats, setManageCats] = useState(false);

  const list = useMemo(() => products.filter((p) => {
    if (cat !== "all" && p.category_id !== cat) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  }), [products, query, cat]);

  const upsert = (p: Product) => setProducts((l) => l.some((x) => x.id === p.id) ? l.map((x) => x.id === p.id ? p : x) : [p, ...l]);
  const del = (id: string) => { setProducts((l) => l.filter((p) => p.id !== id)); setConfirmDel(null); };

  return (
    <div>
      <PageHeader title="Produits" subtitle={`${products.length} références dans le catalogue`}
        actions={
          <>
            <button onClick={() => setManageCats(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><TagIcon className="h-4 w-4" /> Catégories</button>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" /> Importer</button>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Exporter</button>
            <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Barcode className="h-4 w-4" /> Étiquettes</button>
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouveau produit</button>
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

        {view === "list" ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
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
                  const cost = Math.round(p.price * 0.68);
                  const margin = Math.round(((p.price - cost) / p.price) * 100);
                  const catName = cats.find((c) => c.id === p.category_id)?.name ?? "—";
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
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
                <div className="grid aspect-square place-items-center rounded-xl bg-muted text-5xl">{p.emoji}</div>
                <div className="mt-3 truncate text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="tabular font-bold">{formatXOF(p.price)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(p)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDel(p)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {(editing || creating) && (
          <ProductDialog initial={editing} cats={cats} onClose={() => { setEditing(null); setCreating(false); }} onSave={(p) => { upsert(p); setEditing(null); setCreating(false); }} />
        )}
        {confirmDel && (
          <ConfirmDialog title={`Supprimer ${confirmDel.name} ?`} onClose={() => setConfirmDel(null)} onConfirm={() => del(confirmDel.id)} />
        )}
        {manageCats && (
          <CategoriesDialog cats={cats} setCats={setCats} onClose={() => setManageCats(false)} />
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

function ProductDialog({ initial, cats, onClose, onSave }: { initial: Product | null; cats: Category[]; onClose: () => void; onSave: (p: Product) => void }) {
  const [form, setForm] = useState<Product>(initial ?? {
    id: `p-${Date.now()}`, sku: `NEW-${Math.floor(Math.random() * 900) + 100}`, name: "", category_id: cats[0]?.id ?? "",
    price: 0, stock: 0, unit: "unité", emoji: "📦",
  });
  const cost = Math.round(form.price * 0.68);
  const margin = form.price ? Math.round(((form.price - cost) / form.price) * 100) : 0;

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial ? "Modifier produit" : "Nouveau produit"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Nom *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></F>
          <F label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inputCls} /></F>
          <F label="Catégorie"><select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></F>
          <F label="Unité"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} /></F>
          <F label="Prix vente (FCFA)"><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} className={inputCls} /></F>
          <F label="Stock initial"><input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} className={inputCls} /></F>
        </div>
        <F label="Icône">
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setForm({ ...form, emoji: e })}
                className={cn("grid h-10 w-10 place-items-center rounded-lg border text-2xl", form.emoji === e ? "border-primary bg-primary/10" : "border-border")}>
                {e}
              </button>
            ))}
          </div>
        </F>
        {form.price > 0 && (
          <div className="rounded-xl bg-muted p-3 text-xs">
            Coût estimé : <b>{formatXOF(cost)}</b> · Marge indicative : <b className="text-success">{margin}%</b>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.name} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function CategoriesDialog({ cats, setCats, onClose }: { cats: Category[]; setCats: (c: Category[]) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    setCats([...cats, { id: `c-${Date.now()}`, name: name.trim(), color: "#0891b2" }]);
    setName("");
  };
  const remove = (id: string) => setCats(cats.filter((c) => c.id !== id));
  const rename = (id: string, n: string) => setCats(cats.map((c) => (c.id === id ? { ...c, name: n } : c)));

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Catégories personnalisées</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 p-5">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
          <button onClick={add} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Ajouter</button>
        </div>
        <div className="space-y-1">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <input value={c.name} onChange={(e) => rename(c.id, e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm focus:border-border focus:bg-background" />
              <button onClick={() => remove(c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
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

const inputCls = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
