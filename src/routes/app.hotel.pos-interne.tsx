// Point de vente interne ZegHotel (Phase 7) — facturer un article
// (restaurant/bar/room service) directement sur le folio d'un client en
// séjour, plutôt qu'en caisse séparée. Réutilise le catalogue
// products/categories de ZegCaisse (déjà scopé organization_id, jusqu'ici
// totalement inutilisé côté ZegHotel) via post_hotel_pos_charge()
// (migration 033, RPC atomique — folio_charges + stock_movements en une
// transaction, garde-fou anti-survente inclus).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Receipt, Loader2, Coffee, Save, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useFormatMoney, useMyRole, useCategories, useProducts, useUpsertProduct, type ProductWithStock } from "@/lib/data/hooks";
import { useHotelActiveFolios, usePostHotelPosCharge } from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/pos-interne")({
  component: HotelPosInternePage,
});

type CartLine = { product: ProductWithStock; quantity: number };

function HotelPosInternePage() {
  const { data: myRole } = useMyRole();
  const canManageCatalog = myRole === "owner" || myRole === "manager";
  const [tab, setTab] = useState<"vente" | "catalogue">("vente");

  return (
    <div>
      <PageHeader title="Point de vente interne" subtitle="Restaurant, bar, room service — facturé directement sur la note du client" />
      <div className="p-4 sm:p-8">
        {canManageCatalog && (
          <div className="mb-4 flex gap-1 rounded-xl border border-border bg-card p-1">
            {(["vente", "catalogue"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t === "vente" ? "Vente" : "Catalogue"}
              </button>
            ))}
          </div>
        )}
        {tab === "vente" ? <VenteTab /> : <CatalogueTab />}
      </div>
    </div>
  );
}

function VenteTab() {
  const formatMoney = useFormatMoney();
  const { data: folios = [], isLoading: loadingFolios } = useHotelActiveFolios();
  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const post = usePostHotelPosCharge();

  const [folioId, setFolioId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeProducts = products.filter((p) => p.is_active && (!categoryId || p.category_id === categoryId));
  const total = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);

  const addToCart = (product: ProductWithStock) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product, quantity: 1 }];
    });
  };
  const setQty = (productId: string, quantity: number) => {
    setCart((prev) => quantity <= 0
      ? prev.filter((l) => l.product.id !== productId)
      : prev.map((l) => l.product.id === productId ? { ...l, quantity } : l));
  };

  const submit = async () => {
    setError(null); setSuccess(null);
    if (!folioId) { setError("Sélectionnez un client en séjour."); return; }
    if (!cart.length) { setError("Le panier est vide."); return; }
    try {
      await post.mutateAsync({
        folioId,
        items: cart.map((l) => ({ product_id: l.product.id, name: l.product.name, quantity: l.quantity, unit_price: l.product.price })),
      });
      setSuccess("Facturé sur la note du client.");
      setCart([]);
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <select value={folioId} onChange={(e) => setFolioId(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary">
            <option value="">{loadingFolios ? "Chargement…" : "Sélectionner un client en séjour…"}</option>
            {folios.map((f) => (
              <option key={f.folio_id} value={f.folio_id}>{f.guest_name} — Ch. {f.room_numbers || "—"}</option>
            ))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary">
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {!folios.length && !loadingFolios && (
          <div className="mb-3 rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
            Aucun client actuellement en séjour (check-in effectué).
          </div>
        )}

        {loadingProducts ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : activeProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <Coffee className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Aucun article dans le catalogue. {canManageCatalogHint()}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeProducts.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)}
                className="rounded-xl border border-border bg-card p-3 text-left hover:border-primary/40 hover:shadow-elegant">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="mt-1 text-xs font-bold text-primary">{formatMoney(p.price)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-fit rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold"><ShoppingCart className="h-4 w-4 text-primary" /> Panier</div>
        {cart.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun article sélectionné.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.product.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border hover:bg-muted"><Minus className="h-3 w-3" /></button>
                  <span className="w-5 text-center tabular">{l.quantity}</span>
                  <button onClick={() => setQty(l.product.id, l.quantity + 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border hover:bg-muted"><Plus className="h-3 w-3" /></button>
                </div>
                <span className="w-16 shrink-0 text-right tabular font-semibold">{formatMoney(l.product.price * l.quantity)}</span>
                <button onClick={() => setQty(l.product.id, 0)} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-bold">
          <span>Total</span><span>{formatMoney(total)}</span>
        </div>
        {error && <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
        {success && <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-2.5 text-xs text-success">{success}</div>}
        <button onClick={submit} disabled={post.isPending || !cart.length || !folioId}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
          {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Facturer sur la note
        </button>
      </div>
    </div>
  );
}

function canManageCatalogHint() {
  return "Un owner/manager peut l'ajouter depuis l'onglet Catalogue.";
}

function CatalogueTab() {
  const formatMoney = useFormatMoney();
  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading } = useProducts();
  const upsert = useUpsertProduct();
  const [form, setForm] = useState({ name: "", price: 0, category_id: "", stock: 0 });
  const inp = "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    if (!form.name.trim() || !form.price) return;
    await upsert.mutateAsync({
      name: form.name.trim(), price: form.price,
      category_id: form.category_id || null, stock: form.stock,
    } as any);
    setForm({ name: "", price: 0, category_id: "", stock: 0 });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-bold">Ajouter un article</div>
        <div className="grid gap-2 sm:grid-cols-5">
          <input placeholder="Nom (ex. Bière 33cl)" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className={cn(inp, "sm:col-span-2")} />
          <select value={form.category_id} onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value }))} className={inp}>
            <option value="">Catégorie…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" onFocus={selectOnFocus} placeholder="Prix" value={form.price || ""} onChange={(e) => setForm((s) => ({ ...s, price: Number(e.target.value) }))} className={inp} />
          <div className="flex gap-2">
            <input type="number" onFocus={selectOnFocus} placeholder="Stock initial" value={form.stock || ""} onChange={(e) => setForm((s) => ({ ...s, stock: Number(e.target.value) }))} className={cn(inp, "flex-1")} />
            <button disabled={!form.name.trim() || !form.price || upsert.isPending} onClick={submit}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Save className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Aucun article pour l'instant.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">Stock : {p.stock}</div>
              </div>
              <span className="shrink-0 font-bold text-primary">{formatMoney(p.price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
