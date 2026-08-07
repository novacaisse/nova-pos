// Produits & Stock ZegHotel — même écran que ZegCaisse (app.produits.index.tsx),
// dupliqué plutôt que partagé pour ce premier jet (seuls les chemins de route
// changent) : products/categories/stock_movements sont déjà des tables
// partagées scopées organization_id, aucune migration nécessaire — vendus au
// POS interne (app.hotel.pos-interne.tsx) et par le futur POS ZegHotel.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Edit3, Trash2, X, LayoutGrid, List, Tag as TagIcon, Package, ChevronDown, Check,
  Upload, Download, Loader2, ArrowDownCircle, ArrowUpCircle, Sliders, AlertTriangle, ArrowLeftRight, Save,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PageSkeleton } from "@/components/app/PageSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useProducts, useDeleteProduct, useProductStockMovements, useBulkImportProducts,
  useCategories, useUpsertCategory, useDeleteCategory, useMyRole, useCreateStockMovement,
  useFormatMoney, type ProductWithStock, type Category, type BulkImportProductRow,
} from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

export const Route = createFileRoute("/app/hotel/produits/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ProduitsPage,
});

function ProduitsPage() {
  const formatXOF = useFormatMoney();
  const { q } = Route.useSearch();
  const { data: products = [], isLoading } = useProducts();
  const { data: cats = [] } = useCategories();
  const remove = useDeleteProduct();
  const createMove = useCreateStockMovement();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const canSeeCostMargin = true;

  const [query, setQuery] = useState(q ?? "");
  const [cat, setCat] = useState<"all" | string>("all");
  // Séparation produits avec/sans stock (mission "mise à jour ZegHotel",
  // item 6, migration 088) — "module spécial" demandé : plutôt qu'un
  // écran dupliqué, un filtre sur ce même catalogue déjà partagé avec
  // ZegCaisse, cohérent avec track_stock stocké directement sur products.
  const [stockFilter, setStockFilter] = useState<"all" | "tracked" | "untracked">("all");
  const [view, setView] = useState<"grid" | "list">("list");
  const [confirmDel, setConfirmDel] = useState<ProductWithStock | null>(null);
  const [manageCats, setManageCats] = useState(false);
  const [importing, setImporting] = useState(false);
  const [viewing, setViewing] = useState<ProductWithStock | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  const list = useMemo(() => products.filter((p) => {
    if (cat !== "all" && p.category_id !== cat) return false;
    if (stockFilter === "tracked" && !p.track_stock) return false;
    if (stockFilter === "untracked" && p.track_stock) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
  }), [products, query, cat, stockFilter]);

  if (isLoading) return <PageSkeleton title="Produits & Stock" subtitle="Catalogue" />;

  return (
    <div>
      <PageHeader title="Produits & Stock" subtitle={`${products.length} référence${products.length > 1 ? "s" : ""} dans le catalogue`}
        actions={canManage && (
          <>
            <button onClick={() => setManageCats(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><TagIcon className="h-4 w-4" /> Catégories</button>
            <button onClick={() => setImporting(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" /> Importer</button>
            {products.length > 0 && (
              <button onClick={() => setShowAdjust(true)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Sliders className="h-4 w-4" /> Nouveau mouvement</button>
            )}
            <Link to="/app/hotel/produits/nouveau" className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Nouveau produit</Link>
          </>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative w-full min-w-0 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, SKU, code-barres…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <CategoryFilter cats={cats} value={cat} onChange={setCat} />
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 text-xs font-semibold">
            {([["all", "Tous"], ["tracked", "Avec stock"], ["untracked", "Sans stock"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setStockFilter(k)}
                className={cn("rounded-md px-2.5 py-1.5", stockFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
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
            {canManage && (
              <Link to="/app/hotel/produits/nouveau" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter un produit</Link>
            )}
          </div>
        ) : view === "list" ? (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Produit</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Catégorie</th>
                  {canSeeCostMargin && <th className="px-4 py-3 text-right">Prix achat</th>}
                  <th className="px-4 py-3 text-right">Prix vente</th>
                  {canSeeCostMargin && <th className="px-4 py-3 text-right">Marge</th>}
                  <th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3"></th>
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
                        <button onClick={() => setViewing(p)} className="flex items-center gap-3 text-left hover:underline">
                          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-lg">
                            {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : "📦"}
                          </div>
                          <div><div className="font-semibold">{p.name}</div><div className="text-[11px] text-muted-foreground">{p.unit}</div></div>
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku ?? "—"}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{catName}</span></td>
                      {canSeeCostMargin && <td className="tabular px-4 py-3 text-right text-muted-foreground">{formatXOF(cost)}</td>}
                      <td className="tabular px-4 py-3 text-right font-semibold">{formatXOF(price)}</td>
                      {canSeeCostMargin && <td className={cn("tabular px-4 py-3 text-right", margin > 0 ? "text-success" : "text-muted-foreground")}>{margin}%</td>}
                      <td className={cn("tabular px-4 py-3 text-right font-bold", p.stock < p.low_stock_threshold && "text-warning-foreground")}>{p.stock}</td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex items-center justify-end gap-1">
                            <Link to="/app/hotel/produits/$productId" params={{ productId: p.id }} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></Link>
                            <button onClick={() => setConfirmDel(p)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
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
                <button onClick={() => setViewing(p)} className="block w-full text-left">
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-muted text-5xl">
                    {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : "📦"}
                  </div>
                  <div className="mt-3 truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.sku ?? "—"}</div>
                </button>
                <div className="mt-2 flex items-center justify-between">
                  <span className="tabular font-bold">{formatXOF(Number(p.price))}</span>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Link to="/app/hotel/produits/$productId" params={{ productId: p.id }} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></Link>
                      <button onClick={() => setConfirmDel(p)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmDel && (
          <ConfirmDialog title={`Supprimer ${confirmDel.name} ?`} onClose={() => setConfirmDel(null)}
            onConfirm={async () => { await remove.mutateAsync(confirmDel.id); setConfirmDel(null); }} />
        )}
        {manageCats && (
          <CategoriesDialog cats={cats} onClose={() => setManageCats(false)} />
        )}
        {importing && (
          <ImportDialog cats={cats} onClose={() => setImporting(false)} />
        )}
        {showAdjust && products.length > 0 && (
          <AdjustStockDialog products={products} onClose={() => setShowAdjust(false)}
            onSave={async (payload) => { await createMove.mutateAsync(payload); setShowAdjust(false); }} />
        )}
        {viewing && (
          <ProductDetailDialog product={viewing} cats={cats} canManage={canManage} canSeeCostMargin={canSeeCostMargin}
            onClose={() => setViewing(null)}
            onDelete={() => { setConfirmDel(viewing); setViewing(null); }} />
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

function CategoryFilter({ cats, value, onChange }: { cats: Category[]; value: "all" | string; onChange: (v: "all" | string) => void }) {
  const [open, setOpen] = useState(false);
  const label = value === "all" ? "Toutes catégories" : cats.find((c) => c.id === value)?.name ?? "Toutes catégories";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[10rem] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-56 p-1.5">
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          <button onClick={() => { onChange("all"); setOpen(false); }}
            className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              value === "all" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
            Toutes catégories {value === "all" && <Check className="h-3.5 w-3.5" />}
          </button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => { onChange(c.id); setOpen(false); }}
              className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                value === c.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
              {c.name} {value === c.id && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const IMPORT_TEMPLATE_HEADER = ["Nom", "SKU", "Code-barres", "Catégorie", "Prix vente", "Prix achat", "Unité", "Seuil stock bas", "Stock initial"];

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ImportDialog({ cats, onClose }: { cats: Category[]; onClose: () => void }) {
  const bulkImport = useBulkImportProducts();
  const [mode, setMode] = useState<"all" | "category">("all");
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkImportProductRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null);

  const categoryName = cats.find((c) => c.id === categoryId)?.name ?? "";

  const onFile = async (file?: File) => {
    if (!file) return;
    setResult(null); setParseError(null); setFileName(file.name);
    try {
      const text = await file.text();
      const table = parseCsv(text);
      if (table.length < 2) { setParseError("Fichier vide ou sans lignes de données."); setRows([]); return; }
      const header = table[0].map((h) => h.trim().toLowerCase());
      const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const iName = idx("nom", "name");
      const iSku = idx("sku");
      const iBarcode = idx("code-barres", "code barres", "barcode");
      const iCategory = idx("catégorie", "categorie", "category");
      const iPrice = idx("prix vente", "prix", "price");
      const iCost = idx("prix achat", "cost", "coût", "cout");
      const iUnit = idx("unité", "unite", "unit");
      const iThreshold = idx("seuil stock bas", "seuil", "threshold");
      const iStock = idx("stock initial", "stock");
      if (iName === -1 || iPrice === -1) {
        setParseError("Colonnes obligatoires manquantes : « Nom » et « Prix vente ».");
        setRows([]);
        return;
      }
      const parsed: BulkImportProductRow[] = table.slice(1).map((r) => ({
        name: r[iName] ?? "",
        sku: iSku >= 0 ? r[iSku] : null,
        barcode: iBarcode >= 0 ? r[iBarcode] : null,
        category_name: mode === "category" ? categoryName : (iCategory >= 0 ? r[iCategory] : null),
        price: Number((r[iPrice] ?? "0").replace(",", ".")) || 0,
        cost: iCost >= 0 ? Number((r[iCost] ?? "0").replace(",", ".")) || 0 : 0,
        unit: iUnit >= 0 ? r[iUnit] : null,
        low_stock_threshold: iThreshold >= 0 ? Number(r[iThreshold]) || 5 : 5,
        stock: iStock >= 0 ? Number(r[iStock]) || 0 : 0,
      }));
      setRows(parsed);
    } catch (e: any) {
      setParseError(e?.message ?? "Impossible de lire ce fichier.");
      setRows([]);
    }
  };

  const downloadTemplate = () => {
    const example = ["Riz 5kg", "RIZ-5KG", "", mode === "category" ? categoryName : "Alimentation", "5000", "4000", "pcs", "5", "20"];
    const csv = [IMPORT_TEMPLATE_HEADER.join(","), example.join(",")].join("\n");
    downloadFile("modele-import-produits.csv", csv, "text/csv");
  };

  const submit = async () => {
    if (rows.length === 0) return;
    const res = await bulkImport.mutateAsync(rows);
    setResult(res);
    setRows([]);
  };

  return (
    <Overlay onClose={onClose} w="max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Importer des produits</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <button onClick={() => setMode("all")}
            className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-semibold", mode === "all" ? "border-primary bg-primary/10 text-primary" : "border-border")}>
            Tous les produits
          </button>
          <button onClick={() => setMode("category")}
            className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-semibold", mode === "category" ? "border-primary bg-primary/10 text-primary" : "border-border")}>
            Par catégorie
          </button>
        </div>
        {mode === "category" && (
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Catégorie appliquée à toutes les lignes</div>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
              {cats.length === 0 && <option value="">Aucune catégorie — créez-en une d'abord</option>}
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Fichier CSV — colonnes : {IMPORT_TEMPLATE_HEADER.join(" · ")}.
            {mode === "category" && " (la colonne Catégorie est ignorée en mode « Par catégorie »)"}
          </p>
          <button onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <Download className="h-3.5 w-3.5" /> Télécharger un modèle
          </button>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Upload className="h-4 w-4" /> {fileName || "Choisir un fichier CSV…"}
          </label>
        </div>

        {parseError && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{parseError}</div>}

        {rows.length > 0 && (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <b>{rows.length}</b> ligne{rows.length > 1 ? "s" : ""} prête{rows.length > 1 ? "s" : ""} à importer.
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <div><span className="font-semibold text-success">{result.created}</span> créé{result.created > 1 ? "s" : ""} · <span className="font-semibold text-primary">{result.updated}</span> mis à jour</div>
            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs text-destructive">
                {result.errors.map((e, i) => <div key={i}>Ligne {e.row} : {e.message}</div>)}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Fermer</button>
          <button onClick={submit} disabled={rows.length === 0 || bulkImport.isPending || (mode === "category" && !categoryId)}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {bulkImport.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importer {rows.length > 0 ? `(${rows.length})` : ""}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// Entrée/ajustement manuel de stock (mission "récupération + correctifs
// impact élevé", Partie 1) — même pattern que app.stock.tsx (ZegCaisse),
// réutilisé tel quel plutôt que recréé : mêmes types de mouvement, même
// garde-fou anti-survente côté serveur (apply_stock_movement(), migration
// 026, s'applique à toute écriture stock_movements quel que soit l'appelant).
// Note connue (voir RAPPORT_ZEGHOTEL_CORRECTIFS_2026-08.md) : côté
// ZegHotel, seul le propriétaire peut réellement écrire sur products/
// stock_movements aujourd'hui (has_module_permission(...,'produits'/'stock',...)
// pointe vers des clés de module qui n'existent que pour app_module='pos') —
// ce bouton est donc affiché à owner+manager pour rester cohérent avec le
// reste de cette page (Modifier/Supprimer produit ont la même limite
// préexistante), mais un manager verra son enregistrement rejeté par la
// RLS. Corriger cette limite dépasse le mandat de cette mission (décision
// produit sur la convergence des clés de module pos/hotel).
type LocalKind = "entree" | "sortie" | "ajustement" | "perte" | "transfert";
const KIND_META: Record<LocalKind, { label: string; icon: typeof ArrowDownCircle; dbType: "in" | "out" | "adjustment" | "transfer" }> = {
  entree:     { label: "Entrée",     icon: ArrowDownCircle,  dbType: "in" },
  sortie:     { label: "Sortie",     icon: ArrowUpCircle,    dbType: "out" },
  ajustement: { label: "Ajustement", icon: Sliders,          dbType: "adjustment" },
  perte:      { label: "Perte",      icon: AlertTriangle,    dbType: "out" },
  transfert:  { label: "Transfert",  icon: ArrowLeftRight,   dbType: "transfer" },
};

function AdjustStockDialog({ products, onClose, onSave }: {
  products: ProductWithStock[]; onClose: () => void;
  onSave: (m: { product_id: string; type: any; quantity: number; reason?: string }) => Promise<void>;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [kind, setKind] = useState<LocalKind>("entree");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  const p = products.find((x) => x.id === productId);
  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((x) => x.name.toLowerCase().includes(q) || (x.sku ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);
  if (!p) return null;

  const delta = kind === "entree" ? +Math.abs(qty)
    : kind === "sortie" || kind === "perte" || kind === "transfert" ? -Math.abs(qty)
    : qty; // ajustement signé
  const newStock = Math.max(0, p.stock + delta);

  const submit = async () => {
    if (!qty) return;
    setError(null); setSaving(true);
    try {
      await onSave({
        product_id: p.id,
        type: KIND_META[kind].dbType,
        quantity: Math.abs(qty),
        reason: reason.trim() ? `${KIND_META[kind].label} — ${reason.trim()}` : KIND_META[kind].label,
      });
    } catch (e: any) {
      // Le garde-fou anti-survente (apply_stock_movement()) rejette toute
      // sortie qui ferait passer le stock sous zéro — message serveur
      // remonté tel quel plutôt qu'un message générique.
      setError(e?.message ?? "Erreur inconnue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Nouveau mouvement de stock</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Produit</div>
          <div className="mb-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs">
            Sélectionné : <b>{p.name}</b> (stock : {p.stock})
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Rechercher un autre produit (nom, SKU)…"
              className={cn(inp, "pl-9")} />
            {filteredProducts.length > 0 && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-elegant">
                {filteredProducts.map((x) => (
                  <button key={x.id} type="button" onClick={() => { setProductId(x.id); setProductQuery(""); }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="min-w-0 truncate">{x.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">stock {x.stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(KIND_META) as LocalKind[]).map((t) => (
            <button key={t} onClick={() => setKind(t)}
              className={cn("rounded-lg border py-2 text-[11px] font-semibold", kind === t ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {KIND_META[t].label}
            </button>
          ))}
        </div>
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Quantité</div>
          <input type="number" onFocus={selectOnFocus} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className={inp} />
        </label>
        <label className="block"><div className="mb-1 text-xs font-semibold text-muted-foreground">Motif (optionnel)</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex : Inventaire mensuel" className={inp} />
        </label>
        <div className="rounded-xl bg-muted p-3 text-xs">
          Impact : <b className={delta >= 0 ? "text-success" : "text-destructive"}>{delta > 0 ? "+" : ""}{delta}</b> · Nouveau stock : <b>{newStock}</b>
        </div>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={submit} disabled={!qty || saving} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

const MOVEMENT_LABEL: Record<string, string> = { in: "Entrée", out: "Sortie", adjustment: "Ajustement", transfer: "Transfert", sale: "Vente", return: "Retour" };

function ProductDetailDialog({ product, cats, canManage, canSeeCostMargin, onClose, onDelete }: {
  product: ProductWithStock; cats: Category[]; canManage: boolean; canSeeCostMargin: boolean;
  onClose: () => void; onDelete: () => void;
}) {
  const formatXOF = useFormatMoney();
  const { data: movements = [], isLoading } = useProductStockMovements(product.id);
  const catName = cats.find((c) => c.id === product.category_id)?.name ?? "—";
  const cost = Number(product.cost) || 0;
  const price = Number(product.price) || 0;
  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;

  return (
    <Overlay onClose={onClose} w="max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{product.name}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
        <div className="flex gap-4">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-4xl">
            {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : "📦"}
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span className="font-mono">{product.sku ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Code-barres</span><span className="font-mono">{product.barcode ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Catégorie</span><span>{catName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unité</span><span>{product.unit ?? "—"}</span></div>
          </div>
        </div>

        <div className={cn("grid gap-2", canSeeCostMargin ? "grid-cols-4" : "grid-cols-2")}>
          {canSeeCostMargin && (
            <div className="rounded-xl border border-border bg-card p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Achat</div>
              <div className="tabular mt-0.5 text-sm font-bold">{formatXOF(cost)}</div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vente</div>
            <div className="tabular mt-0.5 text-sm font-bold">{formatXOF(price)}</div>
          </div>
          {canSeeCostMargin && (
            <div className="rounded-xl border border-border bg-card p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Marge</div>
              <div className={cn("tabular mt-0.5 text-sm font-bold", margin > 0 ? "text-success" : "text-muted-foreground")}>{margin}%</div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock</div>
            <div className={cn("tabular mt-0.5 text-sm font-bold", product.stock < product.low_stock_threshold ? "text-warning-foreground" : "")}>{product.stock}</div>
          </div>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <Link to="/app/hotel/produits/$productId" params={{ productId: product.id }}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted">
              <Edit3 className="h-4 w-4" /> Modifier
            </Link>
            <button onClick={onDelete} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/40 text-sm font-semibold text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Supprimer
            </button>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Entrées / sorties de stock</div>
          {isLoading ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : movements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Aucun mouvement pour l'instant.</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {movements.map((m) => {
                const positive = m.type === "in" || m.type === "return";
                const Icon = positive ? ArrowDownCircle : ArrowUpCircle;
                return (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Icon className={cn("h-4 w-4 shrink-0", positive ? "text-success" : "text-primary")} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{MOVEMENT_LABEL[m.type] ?? m.type}{m.reason ? ` — ${m.reason}` : ""}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div className={cn("tabular shrink-0 text-sm font-bold", positive ? "text-success" : "text-destructive")}>
                      {positive ? "+" : "−"}{m.quantity}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
