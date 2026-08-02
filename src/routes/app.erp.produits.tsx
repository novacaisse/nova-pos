// Produits ZegERP (Frontend Phase 1) — Catégories/Marques/Unités/Dépôts en
// listes simples (nom [+ code], pas de dialog : ce sont de purs
// référentiels), Produits en dialog complet (mêmes conventions que
// app.resto.menu.tsx : dialog fixed overlay, bannière d'erreur inline,
// selectOnFocus sur les champs numériques). Pas d'upload de photo produit
// en V1 (image_url texte, hors scope — comme ZegCaisse V1, voir migration
// 048) : pas de bucket erp dédié pour l'instant.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, Pencil, X, Package, Tag, Ruler, Warehouse as WarehouseIcon, AlertCircle, Star } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import {
  useErpProductCategories, useUpsertErpProductCategory, useDeleteErpProductCategory,
  useErpBrands, useUpsertErpBrand, useDeleteErpBrand,
  useErpUnits, useUpsertErpUnit, useDeleteErpUnit,
  useErpWarehouses, useUpsertErpWarehouse, useDeleteErpWarehouse,
  useErpProducts, useUpsertErpProduct, useDeleteErpProduct,
  type ErpProduct, type ErpWarehouse,
} from "@/lib/data/erpHooks";

export const Route = createFileRoute("/app/erp/produits")({
  component: ErpProduitsPage,
});

const TABS = [
  { k: "produits", label: "Produits", icon: Package },
  { k: "categories", label: "Catégories", icon: Tag },
  { k: "marques", label: "Marques", icon: Tag },
  { k: "unites", label: "Unités", icon: Ruler },
  { k: "depots", label: "Dépôts", icon: WarehouseIcon },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpProduitsPage() {
  const [tab, setTab] = useState<TabKey>("produits");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "stock";

  return (
    <div>
      <PageHeader title="Produits" subtitle="Catalogue ZegERP — produits, catégories, marques, unités, dépôts" />
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

        {tab === "produits" && <ProductsTab canManage={canManage} />}
        {tab === "categories" && <SimpleLookupTab kind="categories" canManage={canManage} />}
        {tab === "marques" && <SimpleLookupTab kind="marques" canManage={canManage} />}
        {tab === "unites" && <SimpleLookupTab kind="unites" canManage={canManage} />}
        {tab === "depots" && <WarehousesTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ============ Catégories / Marques / Unités — listes simples ============
function SimpleLookupTab({ kind, canManage }: { kind: "categories" | "marques" | "unites"; canManage: boolean }) {
  const categories = useErpProductCategories();
  const brands = useErpBrands();
  const units = useErpUnits();
  const upsertCategory = useUpsertErpProductCategory();
  const upsertBrand = useUpsertErpBrand();
  const upsertUnit = useUpsertErpUnit();
  const deleteCategory = useDeleteErpProductCategory();
  const deleteBrand = useDeleteErpBrand();
  const deleteUnit = useDeleteErpUnit();

  const hasCode = kind === "unites";
  const { data, isLoading, label, remove, upsert } = kind === "categories"
    ? { data: categories.data ?? [], isLoading: categories.isLoading, label: "catégorie", remove: deleteCategory, upsert: upsertCategory }
    : kind === "marques"
      ? { data: brands.data ?? [], isLoading: brands.isLoading, label: "marque", remove: deleteBrand, upsert: upsertBrand }
      : { data: units.data ?? [], isLoading: units.isLoading, label: "unité", remove: deleteUnit, upsert: upsertUnit };

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim() || (hasCode && !code.trim())) return;
    setError(null);
    try {
      await upsert.mutateAsync(hasCode ? { name: name.trim(), code: code.trim() } as never : { name: name.trim() } as never);
      setName("");
      setCode("");
    } catch (e: any) {
      setError(e?.message ?? `Impossible de créer la ${label}.`);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nouvelle ${label}…`}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          {hasCode && (
            <div className="w-32">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="kg, L…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          )}
          <button onClick={add} disabled={upsert.isPending || !name.trim() || (hasCode && !code.trim())}
            className="flex h-[38px] items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter
          </button>
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune {label} pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {data.map((row: any) => (
            <div key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-medium">{row.name}{hasCode && <span className="ml-2 text-xs text-muted-foreground">({row.code})</span>}</span>
              {canManage && (
                <button onClick={() => { if (confirm(`Supprimer "${row.name}" ?`)) remove.mutate(row.id); }}
                  className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Dépôts ============
function WarehousesTab({ canManage }: { canManage: boolean }) {
  const { data: warehouses = [], isLoading } = useErpWarehouses();
  const upsert = useUpsertErpWarehouse();
  const remove = useDeleteErpWarehouse();
  const [editing, setEditing] = useState<ErpWarehouse | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau dépôt
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : warehouses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun dépôt pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {warehouses.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  {w.name} {w.is_default && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}
                  {!w.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactif</span>}
                </div>
                {w.address && <div className="truncate text-xs text-muted-foreground">{w.address}</div>}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setEditing(w)} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Supprimer "${w.name}" ?`)) remove.mutate(w.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <WarehouseDialog warehouse={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />
      )}
    </div>
  );
}

function WarehouseDialog({ warehouse, onClose, onSave }: { warehouse: ErpWarehouse | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpWarehouse> }) {
  const [name, setName] = useState(warehouse?.name ?? "");
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [isActive, setIsActive] = useState(warehouse?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(warehouse?.is_default ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({ id: warehouse?.id, name: name.trim(), code: code.trim() || null, address: address.trim() || null, is_active: isActive, is_default: isDefault });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer le dépôt.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{warehouse ? "Modifier le dépôt" : "Nouveau dépôt"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <LabeledInput label="Nom *" value={name} onChange={setName} placeholder="Ex : Entrepôt central" />
          <LabeledInput label="Code" value={code} onChange={setCode} placeholder="Ex : ENT-01" />
          <LabeledInput label="Adresse" value={address} onChange={setAddress} placeholder="Rue, quartier, ville…" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border" /> Actif
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded border-border" /> Dépôt par défaut
          </label>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button onClick={save} disabled={!name.trim() || onSave.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {onSave.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Produits ============
function ProductsTab({ canManage }: { canManage: boolean }) {
  const { data: products = [], isLoading } = useErpProducts();
  const { data: categories = [] } = useErpProductCategories();
  const { data: brands = [] } = useErpBrands();
  const { data: units = [] } = useErpUnits();
  const upsert = useUpsertErpProduct();
  const remove = useDeleteErpProduct();
  const formatMoney = useFormatMoney();
  const [editing, setEditing] = useState<ErpProduct | null | "new">(null);

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau produit
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucun produit pour l'instant.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {p.name} {!p.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactif</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.sku ? `SKU ${p.sku}` : "Sans SKU"} · {categoryName(p.category_id)} · Coût {formatMoney(p.cost)} · Prix {formatMoney(p.price)}
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setEditing(p)} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Supprimer "${p.name}" ?`)) remove.mutate(p.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          categories={categories} brands={brands} units={units}
          onClose={() => setEditing(null)} onSave={upsert}
        />
      )}
    </div>
  );
}

function ProductDialog({ product, categories, brands, units, onClose, onSave }: {
  product: ErpProduct | null;
  categories: { id: string; name: string }[]; brands: { id: string; name: string }[]; units: { id: string; name: string }[];
  onClose: () => void; onSave: ReturnType<typeof useUpsertErpProduct>;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [brandId, setBrandId] = useState(product?.brand_id ?? "");
  const [unitId, setUnitId] = useState(product?.unit_id ?? "");
  const [price, setPrice] = useState(product?.price ?? 0);
  const [cost, setCost] = useState(product?.cost ?? 0);
  const [taxRate, setTaxRate] = useState(product?.tax_rate ?? 0);
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.low_stock_threshold ?? 0);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({
        id: product?.id, name: name.trim(),
        sku: sku.trim() || null, barcode: barcode.trim() || null, description: description.trim() || null,
        category_id: categoryId || null, brand_id: brandId || null, unit_id: unitId || null,
        price, cost, tax_rate: taxRate, low_stock_threshold: lowStockThreshold, is_active: isActive,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer le produit.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{product ? "Modifier le produit" : "Nouveau produit"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <LabeledInput label="Nom *" value={name} onChange={setName} placeholder="Ex : Ciment 50kg" />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="SKU" value={sku} onChange={setSku} placeholder="Auto ou manuel" />
            <LabeledInput label="Code-barres" value={barcode} onChange={setBarcode} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <LabeledSelect label="Catégorie" value={categoryId} onChange={setCategoryId} options={categories} />
            <LabeledSelect label="Marque" value={brandId} onChange={setBrandId} options={brands} />
            <LabeledSelect label="Unité" value={unitId} onChange={setUnitId} options={units} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledNumber label="Coût d'achat" value={cost} onChange={setCost} />
            <LabeledNumber label="Prix de vente" value={price} onChange={setPrice} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledNumber label="Taxe (%)" value={taxRate} onChange={setTaxRate} />
            <LabeledNumber label="Seuil stock bas" value={lowStockThreshold} onChange={setLowStockThreshold} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border" /> Actif
          </label>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button onClick={save} disabled={!name.trim() || onSave.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {onSave.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Champs partagés ============
function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function LabeledNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="number" value={value} onFocus={selectOnFocus} onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
