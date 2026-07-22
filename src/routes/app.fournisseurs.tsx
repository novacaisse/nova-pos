import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Truck, Phone, Mail, FileText, PackageCheck, Edit3, Trash2, X, Save, Search,
  Send, Check, Ban, Package, Loader2, MapPin,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useSuppliers, useUpsertSupplier, useDeleteSupplier, useMyRole, useProducts,
  usePurchaseOrders, useUpsertPurchaseOrder, useDeletePurchaseOrder,
  useSendPurchaseOrder, useCancelPurchaseOrder, useReceivePurchaseOrder,
  formatXOF, type Supplier, type PurchaseOrderWithItems, type PurchaseOrderStatus, type ProductWithStock,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/fournisseurs")({
  component: FournisseursPage,
});

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Brouillon", sent: "Envoyée", received: "Reçue", cancelled: "Annulée",
};
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary",
  received: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function FournisseursPage() {
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  const [del, setDel] = useState<Supplier | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [query, setQuery] = useState("");
  const [newOrder, setNewOrder] = useState(false);
  const [orderDetail, setOrderDetail] = useState<PurchaseOrderWithItems | null>(null);
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: products = [] } = useProducts();
  const { data: orders = [], isLoading: ordersLoading } = usePurchaseOrders();
  const upsert = useUpsertSupplier();
  const remove = useDeleteSupplier();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager"; // stock/accountant : lecture seule
  const canManagePO = myRole === "owner" || myRole === "manager" || myRole === "stock";

  const pending = orders.filter((o) => o.status === "sent").length;
  const outstanding = orders.filter((o) => o.status === "sent").reduce((s, o) =>
    s + o.purchase_order_items.reduce((a, it) => a + Number(it.total), 0), 0);

  const filteredSuppliers = suppliers.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q)
      || (s.contact ?? "").toLowerCase().includes(q)
      || (s.phone ?? "").toLowerCase().includes(q)
      || (s.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        subtitle="Partenaires et bons de commande"
        actions={
          <>
            {canManage && tab === "suppliers" && (
              <button onClick={() => setEdit({ name: "" })} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Nouveau fournisseur</button>
            )}
            {canManagePO && tab === "orders" && suppliers.length > 0 && (
              <button onClick={() => setNewOrder(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><FileText className="h-4 w-4" /> Bon de commande</button>
            )}
          </>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Fournisseurs actifs" value={String(suppliers.length)} icon={<Truck className="h-5 w-5" />} accent="primary" />
          <StatCard label="Commandes en cours" value={String(pending)} icon={<PackageCheck className="h-5 w-5" />} accent="accent" />
          <StatCard label="Montant en attente" value={formatXOF(outstanding)} accent="destructive" />
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
          isLoading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : suppliers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <div className="text-sm text-muted-foreground">Aucun fournisseur pour l'instant.</div>
              {canManage && (
                <button onClick={() => setEdit({ name: "" })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
              )}
            </div>
          ) : (
            <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un fournisseur (nom, contact, téléphone, email)…"
                className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            {filteredSuppliers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Aucun fournisseur ne correspond.</div>
            ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredSuppliers.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-elegant">
                  <div className="flex items-start gap-3">
                    <button onClick={() => setDetail(s)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                      <Truck className="h-5 w-5" />
                    </button>
                    <button onClick={() => setDetail(s)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.contact ?? "—"}</div>
                    </button>
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => setEdit(s)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={() => setDel(s)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    {s.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {s.phone}</div>}
                    {s.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {s.email}</div>}
                    {s.address && <div className="text-muted-foreground">{s.address}</div>}
                  </div>
                </div>
              ))}
            </div>
            )}
            </>
          )
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {ordersLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
            ) : orders.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Aucun bon de commande pour l'instant.
                {suppliers.length === 0 && <div className="mt-1">Ajoutez d'abord un fournisseur.</div>}
              </div>
            ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Créé</th>
                  <th className="px-4 py-3">Livraison prévue</th>
                  <th className="px-4 py-3 text-right">Articles</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const total = o.purchase_order_items.reduce((s, it) => s + Number(it.total), 0);
                  return (
                    <tr key={o.id} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => setOrderDetail(o)}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{o.reference}</td>
                      <td className="px-4 py-3 font-medium">{o.suppliers?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3 text-xs">{o.expected_at ? new Date(o.expected_at).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="tabular px-4 py-3 text-right">{o.purchase_order_items.length}</td>
                      <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(total)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[o.status])}>{STATUS_LABEL[o.status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <SupplierDialog
            initial={edit}
            onClose={() => setEdit(null)}
            onSave={async (s) => { await upsert.mutateAsync(s); setEdit(null); }}
          />
        )}
        {del && (
          <ConfirmDialog title={`Supprimer ${del.name} ?`} onClose={() => setDel(null)}
            onConfirm={async () => { await remove.mutateAsync(del.id); setDel(null); }} />
        )}
        {detail && (
          <SupplierDetailModal supplier={detail} products={products} orders={orders} onClose={() => setDetail(null)} />
        )}
        {newOrder && (
          <PurchaseOrderForm suppliers={suppliers} products={products} onClose={() => setNewOrder(false)} />
        )}
        {orderDetail && (
          <PurchaseOrderDetailModal order={orderDetail} canManage={canManagePO} onClose={() => setOrderDetail(null)} />
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

function SupplierDialog({ initial, onClose, onSave }: { initial: Partial<Supplier>; onClose: () => void; onSave: (s: any) => Promise<void> | void }) {
  const [form, setForm] = useState<Partial<Supplier>>(initial);
  const isNew = !initial.id;
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{isNew ? "Nouveau fournisseur" : "Modifier fournisseur"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Contact</div><input value={form.contact ?? ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Email</div><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Adresse</div><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex gap-2 pt-1 sm:col-span-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.name} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
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

function SupplierDetailModal({ supplier, products, orders, onClose }: {
  supplier: Supplier; products: ProductWithStock[]; orders: PurchaseOrderWithItems[]; onClose: () => void;
}) {
  const linkedProducts = products.filter((p) => p.supplier_id === supplier.id);
  const supplierOrders = orders.filter((o) => o.supplier_id === supplier.id);
  const stockValue = linkedProducts.reduce((s, p) => s + Number(p.cost) * p.stock, 0);
  const totalSpent = supplierOrders.filter((o) => o.status === "received")
    .reduce((s, o) => s + o.purchase_order_items.reduce((a, it) => a + Number(it.total), 0), 0);

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"><Truck className="h-5 w-5" /></div>
          <div>
            <div className="font-display text-lg font-bold leading-tight">{supplier.name}</div>
            {supplier.contact && <div className="text-xs text-muted-foreground">{supplier.contact}</div>}
          </div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {supplier.phone && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {supplier.phone}</div>}
          {supplier.email && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {supplier.email}</div>}
          {supplier.address && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm sm:col-span-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {supplier.address}</div>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Valeur stock fourni</div>
            <div className="tabular mt-1 text-lg font-bold">{formatXOF(stockValue)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total commandé (reçu)</div>
            <div className="tabular mt-1 text-lg font-bold">{formatXOF(totalSpent)}</div>
          </div>
        </div>

        {supplier.notes && <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{supplier.notes}</div>}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Produits fournis ({linkedProducts.length})
          </div>
          {linkedProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">Aucun produit lié à ce fournisseur.</div>
          ) : (
            <div className="space-y-1">
              {linkedProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="tabular text-xs text-muted-foreground">Stock {p.stock} · {formatXOF(Number(p.cost))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Bons de commande ({supplierOrders.length})
          </div>
          {supplierOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">Aucun bon de commande.</div>
          ) : (
            <div className="space-y-1">
              {supplierOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{o.reference}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[o.status])}>{STATUS_LABEL[o.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

type POLine = { product_id: string | null; name: string; quantity: number; unit_cost: number };

function PurchaseOrderForm({ suppliers, products, onClose }: {
  suppliers: Supplier[]; products: ProductWithStock[]; onClose: () => void;
}) {
  const upsert = useUpsertPurchaseOrder();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);

  const addLine = (p: ProductWithStock) => {
    setLines((c) => {
      const idx = c.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const copy = [...c]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 }; return copy;
      }
      return [...c, { product_id: p.id, name: p.name, quantity: 1, unit_cost: Number(p.cost) }];
    });
    setProductQuery("");
  };
  const updateLine = (i: number, patch: Partial<POLine>) =>
    setLines((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((c) => c.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  const submit = async () => {
    setError(null);
    if (!supplierId) { setError("Sélectionnez un fournisseur."); return; }
    if (lines.length === 0) { setError("Ajoutez au moins un article."); return; }
    try {
      await upsert.mutateAsync({ supplier_id: supplierId, expected_at: expectedAt || null, notes: notes.trim() || null, items: lines });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <Overlay onClose={onClose} w="max-w-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Nouveau bon de commande</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Fournisseur *</div>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Livraison prévue</div>
            <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Ajouter un produit…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          {filteredProducts.length > 0 && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-elegant">
              {filteredProducts.map((p) => (
                <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">Coût actuel {formatXOF(Number(p.cost))}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucun article.</div>
          ) : lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <div className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</div>
              <input type="number" min={0} value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })}
                className="tabular h-8 w-16 rounded-lg border border-border bg-background px-2 text-right text-xs" />
              <input type="number" min={0} value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) || 0 })}
                className="tabular h-8 w-24 rounded-lg border border-border bg-background px-2 text-right text-xs" />
              <div className="tabular w-20 shrink-0 text-right text-sm font-semibold">{formatXOF(l.quantity * l.unit_cost)}</div>
              <button onClick={() => removeLine(i)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
        </label>

        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <div className="text-sm font-semibold">Total</div>
          <div className="tabular font-display text-lg font-bold">{formatXOF(total)}</div>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={submit} disabled={upsert.isPending}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer en brouillon
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function PurchaseOrderDetailModal({ order, canManage, onClose }: {
  order: PurchaseOrderWithItems; canManage: boolean; onClose: () => void;
}) {
  const send = useSendPurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const receive = useReceivePurchaseOrder();
  const total = order.purchase_order_items.reduce((s, it) => s + Number(it.total), 0);

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
        <div><div className="text-xs opacity-80">{order.suppliers?.name ?? "—"}</div><div className="font-display text-lg font-bold">{order.reference}</div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Créé le {new Date(order.created_at).toLocaleDateString("fr-FR")}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[order.status])}>{STATUS_LABEL[order.status]}</span>
        </div>
        <div className="rounded-xl border border-border">
          {order.purchase_order_items.map((it, i) => (
            <div key={it.id} className={cn("flex items-center justify-between px-3 py-2 text-sm", i > 0 && "border-t border-border/60")}>
              <div><div className="font-medium">{it.name}</div><div className="text-xs text-muted-foreground">{it.quantity} × {formatXOF(Number(it.unit_cost))}</div></div>
              <div className="tabular font-semibold">{formatXOF(Number(it.total))}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <div className="text-sm font-semibold">Total</div>
          <div className="tabular font-display text-xl font-bold">{formatXOF(total)}</div>
        </div>
        {order.notes && <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{order.notes}</div>}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {order.status === "draft" && (
              <button onClick={() => send.mutate(order.id)} disabled={send.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15">
                <Send className="h-3.5 w-3.5" /> Envoyer au fournisseur
              </button>
            )}
            {(order.status === "draft" || order.status === "sent") && (
              <button onClick={async () => { await receive.mutateAsync(order); onClose(); }} disabled={receive.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/15">
                {receive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marquer reçue
              </button>
            )}
            {(order.status === "draft" || order.status === "sent") && (
              <button onClick={async () => { await cancel.mutateAsync(order.id); onClose(); }} disabled={cancel.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/15">
                <Ban className="h-3.5 w-3.5" /> Annuler
              </button>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
