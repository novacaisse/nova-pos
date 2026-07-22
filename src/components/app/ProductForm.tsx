import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, Trash2, Image as ImageIcon, Wand2, Loader2, X } from "lucide-react";
import {
  useUpsertProduct, useDeleteProduct, useUploadProductImage,
  formatXOF, type ProductWithStock, type Category,
} from "@/lib/data/hooks";
import { generateSku, generateBarcode } from "@/lib/generateProductCodes";
import { cn } from "@/lib/utils";

export function ProductForm({ initial, cats, canManage }: {
  initial: Partial<ProductWithStock>;
  cats: Category[];
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const upsert = useUpsertProduct();
  const remove = useDeleteProduct();
  const uploadImage = useUploadProductImage();
  const isNew = !initial.id;

  const [form, setForm] = useState<Partial<ProductWithStock>>(initial);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initial.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
  const price = Number(form.price) || 0;
  const cost = Number(form.cost) || 0;
  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;
  const categoryName = cats.find((c) => c.id === form.category_id)?.name;

  const onPickImage = (file?: File) => {
    if (!file) return;
    setImageFile(file);
    const r = new FileReader();
    r.onload = () => setImagePreview(r.result as string);
    r.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await upsert.mutateAsync(form as Partial<ProductWithStock> & { name: string; price: number });
      if (imageFile) {
        const url = await uploadImage.mutateAsync({ productId: saved.id, file: imageFile });
        await upsert.mutateAsync({ id: saved.id, name: saved.name, price: saved.price, image_url: url });
      }
      navigate({ to: "/app/produits" });
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer le produit.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!form.id) return;
    await remove.mutateAsync(form.id);
    navigate({ to: "/app/produits" });
  };

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border bg-card/50 px-5 py-5 sm:px-8">
        <button onClick={() => navigate({ to: "/app/produits" })}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{isNew ? "Nouveau produit" : "Modifier le produit"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isNew ? "Ajoutez une référence à votre catalogue." : form.name}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photo</div>
            <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-muted text-5xl">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {canManage && (
              <div className="mt-3 flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold hover:bg-muted">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
                  Choisir une photo
                </label>
                {imagePreview && (
                  <button onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, image_url: null }); }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive/10">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {price > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marge indicative</div>
              <div className={cn("mt-1 font-display text-2xl font-bold", margin > 0 ? "text-success" : "text-muted-foreground")}>{margin}%</div>
            </div>
          )}

          {!isNew && canManage && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              {confirmDelete ? (
                <>
                  <p className="text-xs text-destructive">Suppression irréversible. Confirmer ?</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-border bg-card py-1.5 text-xs font-semibold">Annuler</button>
                    <button onClick={doDelete} className="flex-1 rounded-lg bg-destructive py-1.5 text-xs font-bold text-destructive-foreground">Confirmer</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex w-full items-center justify-center gap-2 text-xs font-semibold text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer ce produit
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div>
                <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                  SKU
                  {canManage && (
                    <button type="button" onClick={() => setForm({ ...form, sku: generateSku(form.name ?? "", categoryName) })}
                      className="flex items-center gap-1 text-[10px] font-bold normal-case text-primary hover:underline">
                      <Wand2 className="h-3 w-3" /> Générer
                    </button>
                  )}
                </div>
                <input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                  Code-barres
                  {canManage && (
                    <button type="button" onClick={() => setForm({ ...form, barcode: generateBarcode() })}
                      className="flex items-center gap-1 text-[10px] font-bold normal-case text-primary hover:underline">
                      <Wand2 className="h-3 w-3" /> Générer
                    </button>
                  )}
                </div>
                <input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Catégorie</div>
                <select value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })} disabled={!canManage} className={inp}>
                  <option value="">— Sans catégorie —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Unité</div>
                <input value={form.unit ?? "pcs"} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Prix achat (F)</div>
                <input type="number" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) || 0 })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Prix vente (F) *</div>
                <input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} disabled={!canManage} className={inp} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Taux de taxe (%)</div>
                <input type="number" min={0} max={100} value={form.tax_rate ?? 0} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) || 0 })} disabled={!canManage} className={inp} />
              </label>
              {isNew && (
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Stock initial</div>
                  <input type="number" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} disabled={!canManage} className={inp} />
                </label>
              )}
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Seuil stock bas</div>
                <input type="number" value={form.low_stock_threshold ?? 5} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) || 0 })} disabled={!canManage} className={inp} />
              </label>
              <label className="block sm:col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Description</div>
                <textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canManage}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary disabled:opacity-60" />
              </label>
            </div>

            <label className="mt-4 flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
              <span>Produit actif (visible en Caisse et dans le catalogue)</span>
              <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                disabled={!canManage} className="h-5 w-5 accent-primary" />
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
          )}

          {canManage && (
            <div className="flex justify-end gap-2">
              <button onClick={() => navigate({ to: "/app/produits" })} className="h-11 rounded-xl border border-border bg-card px-5 text-sm font-semibold">
                Annuler
              </button>
              <button onClick={save} disabled={!form.name || !form.price || saving}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
