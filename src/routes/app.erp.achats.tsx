// Achats & Fournisseurs ZegERP (Frontend Phase 2) — Fournisseurs / Demandes
// / Commandes / Réceptions / Factures / Retours. Cloisonnement des droits
// respecté côté UI (même s'il est déjà garanti par la RLS, migration 050) :
// canManageBuyer (owner/manager/buyer) pilote fournisseurs/demandes/
// commandes/factures/retours ; canManageStock (owner/manager/stock) pilote
// exclusivement les réceptions — jamais buyer directement.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2, Plus, Trash2, X, AlertCircle, Truck, FileText, ShoppingCart,
  PackageCheck, Receipt, RotateCcw, Send, CheckCircle2, XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import { useErpProducts, useErpWarehouses } from "@/lib/data/erpHooks";
import {
  useErpSuppliers, useUpsertErpSupplier, useDeleteErpSupplier,
  useErpPurchaseRequests, useErpPurchaseRequestLines, useUpsertErpPurchaseRequest,
  useUpsertErpPurchaseRequestLine, useDeleteErpPurchaseRequestLine, useSubmitErpPurchaseRequest, useReviewErpPurchaseRequest,
  useErpPurchaseOrders, useErpPurchaseOrderLines, useUpsertErpPurchaseOrder, useUpsertErpPurchaseOrderLine,
  useDeleteErpPurchaseOrderLine, useConfirmErpPurchaseOrder, useCancelErpPurchaseOrder,
  useErpGoodsReceipts, useErpGoodsReceiptLines, useErpPurchaseOrderLinesForReceiving,
  useUpsertErpGoodsReceipt, useUpsertErpGoodsReceiptLine, useDeleteErpGoodsReceiptLine, useConfirmErpGoodsReceipt,
  useErpSupplierInvoices, useUpsertErpSupplierInvoice, useDeleteErpSupplierInvoice,
  useErpSupplierReturns, useErpSupplierReturnLines, useUpsertErpSupplierReturn,
  useUpsertErpSupplierReturnLine, useDeleteErpSupplierReturnLine, useConfirmErpSupplierReturn,
  type ErpSupplier, type ErpPurchaseRequest, type ErpPurchaseOrder, type ErpGoodsReceipt,
  type ErpSupplierInvoice, type ErpSupplierReturn,
} from "@/lib/data/erpPurchasesHooks";

export const Route = createFileRoute("/app/erp/achats")({
  component: ErpAchatsPage,
});

const TABS = [
  { k: "fournisseurs", label: "Fournisseurs", icon: Truck },
  { k: "demandes", label: "Demandes", icon: FileText },
  { k: "commandes", label: "Commandes", icon: ShoppingCart },
  { k: "receptions", label: "Réceptions", icon: PackageCheck },
  { k: "factures", label: "Factures", icon: Receipt },
  { k: "retours", label: "Retours", icon: RotateCcw },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpAchatsPage() {
  const [tab, setTab] = useState<TabKey>("commandes");
  const { data: myRole } = useMyRole();
  const canManageBuyer = myRole === "owner" || myRole === "manager" || myRole === "buyer";
  const canManageStock = myRole === "owner" || myRole === "manager" || myRole === "stock";
  const canSeeAmounts = myRole === "owner" || myRole === "manager" || myRole === "accountant" || myRole === "buyer";

  return (
    <div>
      <PageHeader title="Achats" subtitle="Fournisseurs, demandes, commandes, réceptions, factures et retours" />
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

        {tab === "fournisseurs" && <SuppliersTab canManage={canManageBuyer} />}
        {tab === "demandes" && <RequestsTab canManage={canManageBuyer} canReview={myRole === "owner" || myRole === "manager"} />}
        {tab === "commandes" && <OrdersTab canManage={canManageBuyer} canSeeAmounts={canSeeAmounts} />}
        {tab === "receptions" && <ReceiptsTab canManage={canManageStock} />}
        {tab === "factures" && <InvoicesTab canManage={canManageBuyer || myRole === "accountant"} />}
        {tab === "retours" && <ReturnsTab canManage={canManageBuyer} />}
      </div>
    </div>
  );
}

// ============ Fournisseurs ============
function SuppliersTab({ canManage }: { canManage: boolean }) {
  const { data: suppliers = [], isLoading } = useErpSuppliers();
  const upsert = useUpsertErpSupplier();
  const remove = useDeleteErpSupplier();
  const [editing, setEditing] = useState<ErpSupplier | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau fournisseur
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun fournisseur pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{[s.contact_name, s.phone].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(s)} className="text-muted-foreground hover:text-primary">Modifier</button>
                  <button onClick={() => { if (confirm(`Supprimer "${s.name}" ?`)) remove.mutate(s.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <SupplierDialog supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function SupplierDialog({ supplier, onClose, onSave }: { supplier: ErpSupplier | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpSupplier> }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contact_name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({ id: supplier?.id, name: name.trim(), contact_name: contactName.trim() || null, phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le fournisseur."); }
  };

  return (
    <Dialog title={supplier ? "Modifier le fournisseur" : "Nouveau fournisseur"} onClose={onClose}>
      <Field label="Nom *" value={name} onChange={setName} />
      <Field label="Contact" value={contactName} onChange={setContactName} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Email" value={email} onChange={setEmail} />
      </div>
      <Field label="Adresse" value={address} onChange={setAddress} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!name.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Demandes d'achat ============
function RequestsTab({ canManage, canReview }: { canManage: boolean; canReview: boolean }) {
  const { data: requests = [], isLoading } = useErpPurchaseRequests();
  const upsert = useUpsertErpPurchaseRequest();
  const [selected, setSelected] = useState<ErpPurchaseRequest | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", submitted: "Soumise", approved: "Approuvée", rejected: "Rejetée" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", submitted: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success", rejected: "bg-destructive/15 text-destructive",
  };

  const create = () => upsert.mutateAsync({}).then(setSelected);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={create} disabled={upsert.isPending} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nouvelle demande
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune demande pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {requests.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <span>{r.reference || `Demande du ${new Date(r.created_at).toLocaleDateString("fr-FR")}`}</span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[r.status])}>{STATUS_LABEL[r.status]}</span>
            </button>
          ))}
        </div>
      )}
      {selected && <RequestDetailDialog request={selected} canManage={canManage} canReview={canReview} onClose={() => setSelected(null)} />}
    </div>
  );
}
function RequestDetailDialog({ request, canManage, canReview, onClose }: { request: ErpPurchaseRequest; canManage: boolean; canReview: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpPurchaseRequestLines(request.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpPurchaseRequestLine();
  const removeLine = useDeleteErpPurchaseRequestLine();
  const submit = useSubmitErpPurchaseRequest();
  const review = useReviewErpPurchaseRequest();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = request.status === "draft";
  const isSubmitted = request.status === "submitted";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ request_id: request.id, product_id: productId, quantity }); setProductId(""); setQuantity(1); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title={request.reference || "Demande d'achat"} onClose={onClose} wide>
      {isDraft && canManage && (
        <LineAddRow products={products} productId={productId} setProductId={setProductId} quantity={quantity} setQuantity={setQuantity} onAdd={add} pending={addLine.isPending} />
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.erp_products?.name ?? "—"}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{l.quantity}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, requestId: request.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      <div className="flex justify-end gap-2 pt-2">
        {isDraft && canManage && (
          <button onClick={() => submit.mutateAsync(request.id).then(onClose)} disabled={lines.length === 0 || submit.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            <Send className="h-3.5 w-3.5" /> Soumettre
          </button>
        )}
        {isSubmitted && canReview && (
          <>
            <button onClick={() => review.mutateAsync({ id: request.id, approve: false }).then(onClose)} disabled={review.isPending}
              className="flex items-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
              <XCircle className="h-3.5 w-3.5" /> Rejeter
            </button>
            <button onClick={() => review.mutateAsync({ id: request.id, approve: true }).then(onClose)} disabled={review.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approuver
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ============ Commandes fournisseur ============
function OrdersTab({ canManage, canSeeAmounts }: { canManage: boolean; canSeeAmounts: boolean }) {
  const { data: orders = [], isLoading } = useErpPurchaseOrders();
  const { data: suppliers = [] } = useErpSuppliers();
  const upsert = useUpsertErpPurchaseOrder();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpPurchaseOrder | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", partially_received: "Partiellement reçue", received: "Reçue", cancelled: "Annulée" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", confirmed: "bg-warning/15 text-warning",
    partially_received: "bg-warning/15 text-warning", received: "bg-success/15 text-success", cancelled: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvelle commande
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune commande pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((o) => (
            <button key={o.id} onClick={() => setSelected(o)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0">
                <div className="font-medium">{o.erp_suppliers?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{o.reference || "Sans référence"}</div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[o.status])}>{STATUS_LABEL[o.status]}</span>
            </button>
          ))}
        </div>
      )}
      {creating && <OrderCreateDialog suppliers={suppliers} upsert={upsert} onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); setSelected(o); }} />}
      {selected && <OrderDetailDialog order={selected} canManage={canManage} canSeeAmounts={canSeeAmounts} onClose={() => setSelected(null)} />}
    </div>
  );
}
function OrderCreateDialog({ suppliers, upsert, onClose, onCreated }: {
  suppliers: { id: string; name: string }[]; upsert: ReturnType<typeof useUpsertErpPurchaseOrder>; onClose: () => void; onCreated: (o: ErpPurchaseOrder) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!supplierId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ supplier_id: supplierId, reference: reference.trim() || null })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la commande."); }
  };

  return (
    <Dialog title="Nouvelle commande" onClose={onClose}>
      <SelectField label="Fournisseur *" value={supplierId} onChange={setSupplierId} options={suppliers} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!supplierId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function OrderDetailDialog({ order, canManage, canSeeAmounts, onClose }: { order: ErpPurchaseOrder; canManage: boolean; canSeeAmounts: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpPurchaseOrderLines(order.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpPurchaseOrderLine();
  const removeLine = useDeleteErpPurchaseOrderLine();
  const confirm = useConfirmErpPurchaseOrder();
  const cancel = useCancelErpPurchaseOrder();
  const formatMoney = useFormatMoney();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isDraft = order.status === "draft";
  const canCancel = order.status === "confirmed" || order.status === "partially_received";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ purchase_order_id: order.id, product_id: productId, quantity, unit_cost: unitCost }); setProductId(""); setQuantity(1); setUnitCost(0); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  return (
    <Dialog title={`${order.erp_suppliers?.name ?? "—"} — ${order.reference || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          {canSeeAmounts && <NumberField label="Coût unit." value={unitCost} onChange={setUnitCost} width="w-24" />}
          <button onClick={add} disabled={!productId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div>{l.erp_products?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Reçu {l.received_quantity} / {l.quantity}</div>
              </div>
              <div className="flex items-center gap-3">
                {canSeeAmounts && <span className="font-mono text-xs text-muted-foreground">{formatMoney(l.unit_cost)}</span>}
                <span className="font-mono font-semibold">{l.quantity}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, orderId: order.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
          {canSeeAmounts && <div className="flex justify-end pt-2 text-sm font-semibold">Total : {formatMoney(total)}</div>}
        </div>
      )}
      <ErrorBanner error={error} />
      {canManage && (isDraft || canCancel) && (
        <div className="flex justify-end gap-2 pt-2">
          {canCancel && (
            <button onClick={() => cancel.mutateAsync(order.id).then(onClose)} disabled={cancel.isPending}
              className="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Annuler la commande</button>
          )}
          {isDraft && (
            <button onClick={() => confirm.mutateAsync(order.id).then(onClose)} disabled={lines.length === 0 || confirm.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {confirm.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmer
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ============ Réceptions (rôle stock) ============
function ReceiptsTab({ canManage }: { canManage: boolean }) {
  const { data: receipts = [], isLoading } = useErpGoodsReceipts();
  const { data: orders = [] } = useErpPurchaseOrders();
  const { data: warehouses = [] } = useErpWarehouses();
  const receivableOrders = orders.filter((o) => o.status === "confirmed" || o.status === "partially_received");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpGoodsReceipt | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} disabled={receivableOrders.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            <Plus className="h-4 w-4" /> Nouvelle réception
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : receipts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune réception pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {receipts.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{r.erp_warehouses?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.reference || "Sans référence"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {r.status === "confirmed" ? "Confirmée" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <ReceiptCreateDialog orders={receivableOrders} warehouses={warehouses} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setSelected(r); }} />}
      {selected && <ReceiptDetailDialog receipt={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function ReceiptCreateDialog({ orders, warehouses, onClose, onCreated }: {
  orders: ErpPurchaseOrder[]; warehouses: { id: string; name: string }[]; onClose: () => void; onCreated: (r: ErpGoodsReceipt) => void;
}) {
  const upsert = useUpsertErpGoodsReceipt();
  const [orderId, setOrderId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!orderId || !warehouseId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ purchase_order_id: orderId, warehouse_id: warehouseId })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la réception."); }
  };

  return (
    <Dialog title="Nouvelle réception" onClose={onClose}>
      <SelectField label="Commande *" value={orderId} onChange={setOrderId} options={orders.map((o) => ({ id: o.id, name: `${o.erp_suppliers?.name ?? "—"} — ${o.reference || "Sans réf."}` }))} />
      <SelectField label="Dépôt *" value={warehouseId} onChange={setWarehouseId} options={warehouses} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!orderId || !warehouseId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function ReceiptDetailDialog({ receipt, canManage, onClose }: { receipt: ErpGoodsReceipt; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpGoodsReceiptLines(receipt.id);
  const { data: orderLines = [] } = useErpPurchaseOrderLinesForReceiving(receipt.purchase_order_id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpGoodsReceiptLine();
  const removeLine = useDeleteErpGoodsReceiptLine();
  const confirmReceipt = useConfirmErpGoodsReceipt();
  const [orderLineId, setOrderLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = receipt.status === "draft";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  const remaining = orderLines.filter((ol) => ol.received_quantity < ol.quantity);

  const add = async () => {
    const ol = orderLines.find((o) => o.id === orderLineId);
    if (!ol || quantity <= 0) return;
    setError(null);
    try {
      await addLine.mutateAsync({ receipt_id: receipt.id, purchase_order_line_id: ol.id, product_id: ol.product_id, quantity });
      setOrderLineId(""); setQuantity(1);
    } catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title={`${receipt.erp_warehouses?.name ?? "—"} — ${receipt.reference || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit à réceptionner</span>
            <select value={orderLineId} onChange={(e) => setOrderLineId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>
              {remaining.map((ol) => <option key={ol.id} value={ol.id}>{productName(ol.product_id)} ({ol.received_quantity}/{ol.quantity})</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          <button onClick={add} disabled={!orderLineId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.erp_products?.name ?? "—"}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{l.quantity}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, receiptId: receipt.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={() => confirmReceipt.mutateAsync(receipt.id).then(onClose)} disabled={lines.length === 0 || confirmReceipt.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {confirmReceipt.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />} Confirmer la réception
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ============ Factures fournisseur ============
function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { data: invoices = [], isLoading } = useErpSupplierInvoices();
  const { data: suppliers = [] } = useErpSuppliers();
  const upsert = useUpsertErpSupplierInvoice();
  const remove = useDeleteErpSupplierInvoice();
  const formatMoney = useFormatMoney();
  const [editing, setEditing] = useState<ErpSupplierInvoice | null | "new">(null);

  const STATUS_LABEL: Record<string, string> = { unpaid: "Impayée", partially_paid: "Partiellement payée", paid: "Payée", disputed: "Litige" };
  const STATUS_CLASS: Record<string, string> = {
    unpaid: "bg-destructive/15 text-destructive", partially_paid: "bg-warning/15 text-warning",
    paid: "bg-success/15 text-success", disputed: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvelle facture
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune facture pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{inv.erp_suppliers?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{inv.reference || "Sans référence"} · {formatMoney(inv.amount)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[inv.status])}>{STATUS_LABEL[inv.status]}</span>
                {canManage && (
                  <>
                    <button onClick={() => setEditing(inv)} className="text-muted-foreground hover:text-primary">Modifier</button>
                    <button onClick={() => { if (confirm("Supprimer cette facture ?")) remove.mutate(inv.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <InvoiceDialog invoice={editing === "new" ? null : editing} suppliers={suppliers} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function InvoiceDialog({ invoice, suppliers, onClose, onSave }: {
  invoice: ErpSupplierInvoice | null; suppliers: { id: string; name: string }[]; onClose: () => void; onSave: ReturnType<typeof useUpsertErpSupplierInvoice>;
}) {
  const [supplierId, setSupplierId] = useState(invoice?.supplier_id ?? "");
  const [reference, setReference] = useState(invoice?.reference ?? "");
  const [amount, setAmount] = useState(invoice?.amount ?? 0);
  const [status, setStatus] = useState(invoice?.status ?? "unpaid");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!supplierId || amount <= 0) return;
    setError(null);
    try { await onSave.mutateAsync({ id: invoice?.id, supplier_id: supplierId, reference: reference.trim() || null, amount, status: status as any }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer la facture."); }
  };

  return (
    <Dialog title={invoice ? "Modifier la facture" : "Nouvelle facture"} onClose={onClose}>
      <SelectField label="Fournisseur *" value={supplierId} onChange={setSupplierId} options={suppliers} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <NumberField label="Montant *" value={amount} onChange={setAmount} width="w-full" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="unpaid">Impayée</option><option value="partially_paid">Partiellement payée</option><option value="paid">Payée</option><option value="disputed">Litige</option>
        </select>
      </label>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!supplierId || amount <= 0} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Retours fournisseur ============
function ReturnsTab({ canManage }: { canManage: boolean }) {
  const { data: returns = [], isLoading } = useErpSupplierReturns();
  const { data: suppliers = [] } = useErpSuppliers();
  const { data: warehouses = [] } = useErpWarehouses();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpSupplierReturn | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau retour
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : returns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun retour pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {returns.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{r.erp_suppliers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.reason || "Sans motif"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {r.status === "confirmed" ? "Confirmé" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <ReturnCreateDialog suppliers={suppliers} warehouses={warehouses} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setSelected(r); }} />}
      {selected && <ReturnDetailDialog supplierReturn={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function ReturnCreateDialog({ suppliers, warehouses, onClose, onCreated }: {
  suppliers: { id: string; name: string }[]; warehouses: { id: string; name: string }[]; onClose: () => void; onCreated: (r: ErpSupplierReturn) => void;
}) {
  const upsert = useUpsertErpSupplierReturn();
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!supplierId || !warehouseId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ supplier_id: supplierId, warehouse_id: warehouseId, reason: reason.trim() || null })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le retour."); }
  };

  return (
    <Dialog title="Nouveau retour fournisseur" onClose={onClose}>
      <SelectField label="Fournisseur *" value={supplierId} onChange={setSupplierId} options={suppliers} />
      <SelectField label="Dépôt *" value={warehouseId} onChange={setWarehouseId} options={warehouses} />
      <Field label="Motif" value={reason} onChange={setReason} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!supplierId || !warehouseId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function ReturnDetailDialog({ supplierReturn, canManage, onClose }: { supplierReturn: ErpSupplierReturn; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpSupplierReturnLines(supplierReturn.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpSupplierReturnLine();
  const removeLine = useDeleteErpSupplierReturnLine();
  const confirmReturn = useConfirmErpSupplierReturn();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = supplierReturn.status === "draft";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ return_id: supplierReturn.id, product_id: productId, quantity }); setProductId(""); setQuantity(1); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title={`${supplierReturn.erp_suppliers?.name ?? "—"} — ${supplierReturn.erp_warehouses?.name ?? "—"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <LineAddRow products={products} productId={productId} setProductId={setProductId} quantity={quantity} setQuantity={setQuantity} onAdd={add} pending={addLine.isPending} />
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.erp_products?.name ?? "—"}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{l.quantity}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, returnId: supplierReturn.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={() => confirmReturn.mutateAsync(supplierReturn.id).then(onClose)} disabled={lines.length === 0 || confirmReturn.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {confirmReturn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Confirmer le retour
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ============ Composants partagés ============
function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", wide ? "max-w-lg" : "max-w-md")}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
function DialogFooter({ onClose, onSave, disabled, pending, label = "Enregistrer" }: { onClose: () => void; onSave: () => void; disabled: boolean; pending: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
      <button onClick={onSave} disabled={disabled || pending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
      </button>
    </div>
  );
}
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>
  );
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function NumberField({ label, value, onChange, width = "w-full" }: { label: string; value: number; onChange: (v: number) => void; width?: string }) {
  return (
    <div className={width}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="number" value={value} onFocus={selectOnFocus} onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
    </div>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
function LineAddRow({ products, productId, setProductId, quantity, setQuantity, onAdd, pending }: {
  products: { id: string; name: string }[]; productId: string; setProductId: (v: string) => void;
  quantity: number; setQuantity: (v: number) => void; onAdd: () => void; pending: boolean;
}) {
  return (
    <div className="flex items-end gap-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex-1">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
      <button onClick={onAdd} disabled={!productId || quantity <= 0 || pending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
