// Gestion du menu ZegResto (Phase 1) — catégories, articles, modificateurs
// (ex. "Cuisson", "Suppléments") assignables à un article. Recette
// (Phase 4) : ingrédients = produits ZegCaisse existants (catalogue
// products/stock_levels déjà en place), pas de table "ingrédients" séparée
// — voir migration 040. Photo (V2, migration 042) : vrai upload (bucket
// resto-menu-photos) via ImageUploadField, plus un champ URL texte —
// nécessite que l'article existe déjà (a un id) pour connaître le chemin
// {organization_id}/{menu_item_id}, même contrainte que product-images ;
// pour un nouvel article, enregistrer d'abord (nom + prix), puis rouvrir
// pour ajouter la photo.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X, Save, Trash2, Loader2, UtensilsCrossed, Tag, SlidersHorizontal, EyeOff, Boxes, Star } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ImageUploadField } from "@/components/app/ImageUploadField";
import { useFormatMoney, useMyRole, useProducts } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import {
  useRestoMenuCategories, useUpsertRestoMenuCategory, useDeleteRestoMenuCategory,
  useRestoMenuItems, useUpsertRestoMenuItem, useDeleteRestoMenuItem,
  useRestoModifiers, useUpsertRestoModifier, useDeleteRestoModifier,
  useRestoModifierOptions, useUpsertRestoModifierOption, useDeleteRestoModifierOption,
  useRestoMenuItemModifiers, useSetRestoMenuItemModifiers,
  useRestoRecipe, useAddRecipeIngredient, useDeleteRecipeIngredient,
  type RestoMenuItem, type RestoModifier, type MenuCreneau,
} from "@/lib/data/restoHooks";
import { cn, selectOnFocus } from "@/lib/utils";

const CRENEAU_OPTIONS: { k: MenuCreneau; label: string }[] = [
  { k: "matin", label: "Matin" }, { k: "midi", label: "Midi" }, { k: "soir", label: "Soir" },
];

export const Route = createFileRoute("/app/resto/menu")({
  component: MenuPage,
});

function MenuPage() {
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const [tab, setTab] = useState<"articles" | "categories" | "modificateurs">("articles");

  return (
    <div>
      <PageHeader title="Menu" subtitle="Catégories, articles et modificateurs" />
      <div className="p-4 sm:p-8">
        <div className="mb-4 flex gap-1 rounded-xl border border-border bg-card p-1">
          {([
            { k: "articles", label: "Articles" },
            { k: "categories", label: "Catégories" },
            { k: "modificateurs", label: "Modificateurs" },
          ] as const).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "articles" && <ArticlesTab canManage={canManage} />}
        {tab === "categories" && <CategoriesTab canManage={canManage} />}
        {tab === "modificateurs" && <ModifiersTab canManage={canManage} />}
      </div>
    </div>
  );
}

function ArticlesTab({ canManage }: { canManage: boolean }) {
  const formatMoney = useFormatMoney();
  const { data: categories = [] } = useRestoMenuCategories();
  const { data: items = [], isLoading } = useRestoMenuItems();
  const upsert = useUpsertRestoMenuItem();
  const remove = useDeleteRestoMenuItem();
  const [categoryId, setCategoryId] = useState("");
  const [edit, setEdit] = useState<Partial<RestoMenuItem> | null>(null);

  const filtered = categoryId ? items.filter((i) => i.category_id === categoryId) : items;
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.nom ?? "Sans catégorie";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        {canManage && (
          <button onClick={() => setEdit({ nom: "", prix: 0, category_id: categoryId || null, disponible: true })}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvel article
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucun article pour l'instant.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <div key={i.id} className={cn("rounded-2xl border border-border bg-card p-4", !i.disponible && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 gap-2.5">
                  {i.photo_url && (
                    <img src={i.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-semibold">
                      {!i.disponible && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      {i.nom}
                    </div>
                    <div className="text-xs text-muted-foreground">{categoryName(i.category_id)}</div>
                    {i.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.description}</div>}
                  </div>
                </div>
                <span className="shrink-0 font-bold text-primary">{formatMoney(i.prix)}</span>
              </div>
              {i.temps_preparation_min != null && (
                <div className="mt-2 text-[11px] text-muted-foreground">≈ {i.temps_preparation_min} min de préparation</div>
              )}
              {i.allergenes.length > 0 && (
                <div className="mt-1 text-[11px] text-warning-foreground">⚠ {i.allergenes.join(", ")}</div>
              )}
              {canManage && (
                <div className="mt-3 flex gap-2 border-t border-border pt-2">
                  <button onClick={() => setEdit(i)} className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold hover:bg-muted">Modifier</button>
                  <button onClick={() => { if (confirm(`Supprimer ${i.nom} ?`)) remove.mutate(i.id); }} className="flex-1 rounded-lg border border-destructive/40 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">Supprimer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <ItemDialog initial={edit} categories={categories} allItems={items} onClose={() => setEdit(null)}
          onSave={(i) => upsert.mutateAsync(i)} />
      )}
    </div>
  );
}

function ItemDialog({ initial, categories, allItems, onClose, onSave }: {
  initial: Partial<RestoMenuItem>; categories: { id: string; nom: string }[]; allItems: RestoMenuItem[]; onClose: () => void;
  onSave: (i: Partial<RestoMenuItem> & { nom: string; prix: number }) => Promise<RestoMenuItem>;
}) {
  const { currentOrganization } = useOrganization();
  const [form, setForm] = useState<Partial<RestoMenuItem>>(initial);
  const [saving, setSaving] = useState(false);
  const { data: modifiers = [] } = useRestoModifiers();
  const { data: assigned = [] } = useRestoMenuItemModifiers(initial.id ?? null);
  const setItemModifiers = useSetRestoMenuItemModifiers();
  const [selectedModifiers, setSelectedModifiers] = useState<string[] | null>(null);
  const effectiveModifiers = selectedModifiers ?? assigned;
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  const toggleModifier = (id: string) => {
    setSelectedModifiers((effectiveModifiers.includes(id) ? effectiveModifiers.filter((m) => m !== id) : [...effectiveModifiers, id]));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const saved = await onSave(form as Partial<RestoMenuItem> & { nom: string; prix: number });
      const itemId = initial.id ?? saved.id;
      if (itemId && selectedModifiers) await setItemModifiers.mutateAsync({ menuItemId: itemId, modifierIds: selectedModifiers });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial.id ? "Modifier l'article" : "Nouvel article"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div>
            <input value={form.nom ?? ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Description</div>
            <textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Prix *</div>
              <input type="number" onFocus={selectOnFocus} value={form.prix ?? 0} onChange={(e) => setForm({ ...form, prix: Number(e.target.value) })} className={inp} /></label>
            <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Temps préparation (min)</div>
              <input type="number" onFocus={selectOnFocus} value={form.temps_preparation_min ?? ""} onChange={(e) => setForm({ ...form, temps_preparation_min: e.target.value === "" ? null : Number(e.target.value) })} className={inp} /></label>
          </div>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Catégorie</div>
            <select value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })} className={inp}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
          {initial.id && currentOrganization ? (
            <ImageUploadField label="Photo" bucket="resto-menu-photos" path={`${currentOrganization.id}/${initial.id}`}
              value={form.photo_url ?? null} onChange={(url) => setForm({ ...form, photo_url: url })} />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              Enregistrez d'abord l'article (nom + prix) pour pouvoir ajouter une photo.
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.disponible ?? true} onChange={(e) => setForm({ ...form, disponible: e.target.checked })} className="h-4 w-4 rounded border-border" />
            <span className="text-xs font-semibold uppercase text-muted-foreground">Disponible à la vente</span>
          </label>

          {/* #2 favoris par créneau (mission "47 fonctionnalités ZegResto",
             Phase A) : épingle l'article dans le filtre rapide "Favoris" de
             la prise de commande, pour un ou plusieurs créneaux. */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><Star className="h-3.5 w-3.5" /> Favori sur ces créneaux</div>
            <div className="flex flex-wrap gap-1.5">
              {CRENEAU_OPTIONS.map((c) => {
                const active = (form.favori_creneaux ?? []).includes(c.k);
                return (
                  <button key={c.k} type="button"
                    onClick={() => setForm({ ...form, favori_creneaux: active ? (form.favori_creneaux ?? []).filter((x) => x !== c.k) : [...(form.favori_creneaux ?? []), c.k] })}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* #7 suggestions automatiques d'accompagnement : proposées à la
             prise de commande juste après l'ajout de cet article. */}
          {allItems.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Suggestions d'accompagnement</div>
              <div className="flex flex-wrap gap-1.5">
                {allItems.filter((i) => i.id !== initial.id).map((i) => {
                  const active = (form.suggestion_ids ?? []).includes(i.id);
                  return (
                    <button key={i.id} type="button"
                      onClick={() => setForm({ ...form, suggestion_ids: active ? (form.suggestion_ids ?? []).filter((x) => x !== i.id) : [...(form.suggestion_ids ?? []), i.id] })}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      {i.nom}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* #21 allergènes — alerte visible côté cuisine (KDS) et côté
             prise de commande, saisie libre (les allergènes varient trop
             pour un enum fermé). */}
          <AllergeneField value={form.allergenes ?? []} onChange={(v) => setForm({ ...form, allergenes: v })} />

          {modifiers.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Modificateurs proposés</div>
              <div className="flex flex-wrap gap-1.5">
                {modifiers.map((m) => (
                  <button key={m.id} type="button" onClick={() => toggleModifier(m.id)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", effectiveModifiers.includes(m.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {m.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          {initial.id && <RecipeSection menuItemId={initial.id} />}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button disabled={!form.nom?.trim() || saving} onClick={submit}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllergeneField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Allergènes</div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((a) => (
          <span key={a} className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning-foreground">
            {a}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== a))} className="hover:opacity-70"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Ex. gluten, arachides… (Entrée pour ajouter)"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary" />
        <button type="button" onClick={add} disabled={!draft.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function CategoriesTab({ canManage }: { canManage: boolean }) {
  const { data: categories = [], isLoading } = useRestoMenuCategories();
  const upsert = useUpsertRestoMenuCategory();
  const remove = useDeleteRestoMenuCategory();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ nom: name.trim(), ordre: categories.length });
    setName("");
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nom de la catégorie (ex. Entrées)" className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary" />
          <button onClick={add} disabled={!name.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter</button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground"><Tag className="mx-auto mb-2 h-6 w-6 opacity-40" /> Aucune catégorie.</div>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <span className="font-semibold">{c.nom}</span>
              {canManage && <button onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) remove.mutate(c.id); }} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModifiersTab({ canManage }: { canManage: boolean }) {
  const { data: modifiers = [], isLoading } = useRestoModifiers();
  const upsert = useUpsertRestoModifier();
  const remove = useDeleteRestoModifier();
  const [name, setName] = useState("");
  const [openModifier, setOpenModifier] = useState<RestoModifier | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ nom: name.trim() });
    setName("");
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nom du modificateur (ex. Cuisson)" className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary" />
          <button onClick={add} disabled={!name.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter</button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : modifiers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground"><SlidersHorizontal className="mx-auto mb-2 h-6 w-6 opacity-40" /> Aucun modificateur.</div>
      ) : (
        <div className="space-y-2">
          {modifiers.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <button onClick={() => setOpenModifier(m)} className="flex-1 text-left font-semibold hover:text-primary">{m.nom}</button>
              {canManage && <button onClick={() => { if (confirm(`Supprimer ${m.nom} et ses options ?`)) remove.mutate(m.id); }} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
      {openModifier && <ModifierOptionsDialog modifier={openModifier} canManage={canManage} onClose={() => setOpenModifier(null)} />}
    </div>
  );
}

// Recette (Phase 4) : liste d'ingrédients — chacun un produit ZegCaisse
// existant (recherche par nom, pas de création de produit ici) — avec une
// quantité consommée par plat servi. Décrémentée automatiquement au
// moment où le plat est ajouté à une commande (add_resto_order_item()).
function RecipeSection({ menuItemId }: { menuItemId: string }) {
  const { data: products = [] } = useProducts();
  const { data, isLoading } = useRestoRecipe(menuItemId);
  const addIngredient = useAddRecipeIngredient();
  const removeIngredient = useDeleteRecipeIngredient();
  const [productId, setProductId] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [unite, setUnite] = useState("");

  const ingredients = data?.ingredients ?? [];
  const usedIds = new Set(ingredients.map((i) => i.ingredient_ref));
  const available = products.filter((p) => !usedIds.has(p.id));

  const add = async () => {
    if (!productId || quantite <= 0) return;
    await addIngredient.mutateAsync({ menuItemId, ingredientRef: productId, quantite, unite: unite || undefined });
    setProductId(""); setQuantite(1); setUnite("");
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Recette (décrément de stock automatique)</div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1.5">
          {ingredients.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs">
              <span>{i.product?.name ?? "Produit"} — {i.quantite}{i.unite ? ` ${i.unite}` : ""}</span>
              <button onClick={() => removeIngredient.mutate({ id: i.id, menuItemId })} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {ingredients.length === 0 && <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Aucun ingrédient — plat sans suivi de stock.</div>}
        </div>
      )}
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary">
            <option value="">Ajouter un ingrédient…</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" onFocus={selectOnFocus} value={quantite} onChange={(e) => setQuantite(Number(e.target.value))}
            className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" placeholder="Qté" />
          <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="unité"
            className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
          <button onClick={add} disabled={!productId || addIngredient.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

function ModifierOptionsDialog({ modifier, canManage, onClose }: { modifier: RestoModifier; canManage: boolean; onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: options = [], isLoading } = useRestoModifierOptions(modifier.id);
  const upsert = useUpsertRestoModifierOption();
  const remove = useDeleteRestoModifierOption();
  const [name, setName] = useState("");
  const [impact, setImpact] = useState(0);

  const add = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ modifier_id: modifier.id, nom: name.trim(), impact_prix: impact });
    setName(""); setImpact(0);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Options — {modifier.nom}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {canManage && (
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. Bien cuit)" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
              <input type="number" onFocus={selectOnFocus} value={impact} onChange={(e) => setImpact(Number(e.target.value))} placeholder="+prix" className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
              <button onClick={add} disabled={!name.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </div>
          )}
          {isLoading ? (
            <div className="grid place-items-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : options.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune option.</div>
          ) : (
            <div className="space-y-1.5">
              {options.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span>{o.nom}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-muted-foreground">{o.impact_prix > 0 ? "+" : ""}{formatMoney(o.impact_prix)}</span>
                    {canManage && <button onClick={() => remove.mutate({ id: o.id, modifierId: modifier.id })} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
