// Ventes & CRM ZegERP (Frontend Phase 3a — cycle de vente central : Clients
// / Devis / Commandes / Livraisons / Factures / Retours ; pipeline
// prospects, avoirs, encaissements et activités CRM suivent en Phase 3b).
// Asymétrie assumée vs Achats (module 2) : la livraison est portée par
// salesperson (pas stock) ; le retour client est porté par stock (pas
// salesperson) — voir ARCHITECTURE_ERP.md.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2, Plus, Trash2, X, AlertCircle, Users, FileText, ShoppingCart,
  Truck as TruckIcon, Receipt, RotateCcw, Send, CheckCircle2, XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import { useErpProducts, useErpWarehouses } from "@/lib/data/erpHooks";
import {
  useErpCustomers, useUpsertErpCustomer, useDeleteErpCustomer,
  useErpQuotes, useErpQuoteLines, useUpsertErpQuote, useUpsertErpQuoteLine, useDeleteErpQuoteLine, useSendErpQuote, useResolveErpQuote,
  useErpSalesOrders, useErpSalesOrderLines, useUpsertErpSalesOrder, useUpsertErpSalesOrderLine,
  useDeleteErpSalesOrderLine, useConfirmErpSalesOrder, useCancelErpSalesOrder,
  useErpDeliveryNotes, useErpDeliveryNoteLines, useUpsertErpDeliveryNote, useUpsertErpDeliveryNoteLine,
  useDeleteErpDeliveryNoteLine, useConfirmErpDelivery,
  useErpInvoices, useErpInvoiceLines, useUpsertErpInvoice, useUpsertErpInvoiceLine, useDeleteErpInvoiceLine, useDeleteErpInvoice,
  useErpCustomerReturns, useErpCustomerReturnLines, useUpsertErpCustomerReturn,
  useUpsertErpCustomerReturnLine, useDeleteErpCustomerReturnLine, useConfirmErpCustomerReturn,
  type ErpCustomer, type ErpQuote, type ErpSalesOrder, type ErpDeliveryNote, type ErpInvoice, type ErpCustomerReturn,
} from "@/lib/data/erpSalesHooks";

export const Route = createFileRoute("/app/erp/ventes")({
  component: ErpVentesPage,
});

const TABS = [
  { k: "clients", label: "Clients", icon: Users },
  { k: "devis", label: "Devis", icon: FileText },
  { k: "commandes", label: "Commandes", icon: ShoppingCart },
  { k: "livraisons", label: "Livraisons", icon: TruckIcon },
  { k: "factures", label: "Factures", icon: Receipt },
  { k: "retours", label: "Retours", icon: RotateCcw },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpVentesPage() {
  const [tab, setTab] = useState<TabKey>("commandes");
  const { data: myRole } = useMyRole();
  const canManageSales = myRole === "owner" || myRole === "manager" || myRole === "salesperson";
  const canManageStock = myRole === "owner" || myRole === "manager" || myRole === "stock";
  const canManageInvoices = canManageSales || myRole === "accountant";

  return (
    <div>
      <PageHeader title="Ventes" subtitle="Clients, devis, commandes, livraisons, factures et retours" />
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

        {tab === "clients" && <CustomersTab canManage={canManageSales} />}
        {tab === "devis" && <QuotesTab canManage={canManageSales} />}
        {tab === "commandes" && <OrdersTab canManage={canManageSales} canSeeAmounts={canManageSales || myRole === "accountant"} />}
        {tab === "livraisons" && <DeliveriesTab canManage={canManageSales} />}
        {tab === "factures" && <InvoicesTab canManage={canManageInvoices} />}
        {tab === "retours" && <ReturnsTab canManage={canManageStock} />}
      </div>
    </div>
  );
}

// ============ Clients ============
function CustomersTab({ canManage }: { canManage: boolean }) {
  const { data: customers = [], isLoading } = useErpCustomers();
  const upsert = useUpsertErpCustomer();
  const remove = useDeleteErpCustomer();
  const [editing, setEditing] = useState<ErpCustomer | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau client
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun client pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {customers.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{[c.contact_name, c.phone].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(c)} className="text-muted-foreground hover:text-primary">Modifier</button>
                  <button onClick={() => { if (confirm(`Supprimer "${c.name}" ?`)) remove.mutate(c.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <CustomerDialog customer={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function CustomerDialog({ customer, onClose, onSave }: { customer: ErpCustomer | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpCustomer> }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({ id: customer?.id, name: name.trim(), contact_name: contactName.trim() || null, phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le client."); }
  };

  return (
    <Dialog title={customer ? "Modifier le client" : "Nouveau client"} onClose={onClose}>
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

// ============ Devis ============
function QuotesTab({ canManage }: { canManage: boolean }) {
  const { data: quotes = [], isLoading } = useErpQuotes();
  const { data: customers = [] } = useErpCustomers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpQuote | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", refused: "Refusé", expired: "Expiré", converted: "Converti" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", sent: "bg-warning/15 text-warning",
    accepted: "bg-success/15 text-success", refused: "bg-destructive/15 text-destructive",
    expired: "bg-destructive/15 text-destructive", converted: "bg-success/15 text-success",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau devis
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun devis pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {quotes.map((q) => (
            <button key={q.id} onClick={() => setSelected(q)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{q.erp_customers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{q.reference || "Sans référence"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[q.status])}>{STATUS_LABEL[q.status]}</span>
            </button>
          ))}
        </div>
      )}
      {creating && <QuoteCreateDialog customers={customers} onClose={() => setCreating(false)} onCreated={(q) => { setCreating(false); setSelected(q); }} />}
      {selected && <QuoteDetailDialog quote={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function QuoteCreateDialog({ customers, onClose, onCreated }: { customers: { id: string; name: string }[]; onClose: () => void; onCreated: (q: ErpQuote) => void }) {
  const upsert = useUpsertErpQuote();
  const [customerId, setCustomerId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!customerId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ customer_id: customerId, reference: reference.trim() || null })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le devis."); }
  };

  return (
    <Dialog title="Nouveau devis" onClose={onClose}>
      <SelectField label="Client *" value={customerId} onChange={setCustomerId} options={customers} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!customerId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function QuoteDetailDialog({ quote, canManage, onClose }: { quote: ErpQuote; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpQuoteLines(quote.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpQuoteLine();
  const removeLine = useDeleteErpQuoteLine();
  const send = useSendErpQuote();
  const resolve = useResolveErpQuote();
  const formatMoney = useFormatMoney();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isDraft = quote.status === "draft";
  const isSent = quote.status === "sent";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ quote_id: quote.id, product_id: productId, quantity, unit_price: unitPrice }); setProductId(""); setQuantity(1); setUnitPrice(0); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  return (
    <Dialog title={`${quote.erp_customers?.name ?? "—"} — ${quote.reference || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          <NumberField label="Prix unit." value={unitPrice} onChange={setUnitPrice} width="w-24" />
          <button onClick={add} disabled={!productId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
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
                <span className="font-mono text-xs text-muted-foreground">{formatMoney(l.unit_price)}</span>
                <span className="font-mono font-semibold">{l.quantity}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, quoteId: quote.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2 text-sm font-semibold">Total : {formatMoney(total)}</div>
        </div>
      )}
      <ErrorBanner error={error} />
      {canManage && (isDraft || isSent) && (
        <div className="flex justify-end gap-2 pt-2">
          {isDraft && (
            <button onClick={() => send.mutateAsync(quote.id).then(onClose)} disabled={lines.length === 0 || send.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              <Send className="h-3.5 w-3.5" /> Envoyer
            </button>
          )}
          {isSent && (
            <>
              <button onClick={() => resolve.mutateAsync({ id: quote.id, status: "refused" }).then(onClose)} disabled={resolve.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                <XCircle className="h-3.5 w-3.5" /> Refusé
              </button>
              <button onClick={() => resolve.mutateAsync({ id: quote.id, status: "accepted" }).then(onClose)} disabled={resolve.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                <CheckCircle2 className="h-3.5 w-3.5" /> Accepté
              </button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ============ Commandes client ============
function OrdersTab({ canManage, canSeeAmounts }: { canManage: boolean; canSeeAmounts: boolean }) {
  const { data: orders = [], isLoading } = useErpSalesOrders();
  const { data: customers = [] } = useErpCustomers();
  const upsert = useUpsertErpSalesOrder();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpSalesOrder | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", partially_delivered: "Partiellement livrée", delivered: "Livrée", cancelled: "Annulée" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", confirmed: "bg-warning/15 text-warning",
    partially_delivered: "bg-warning/15 text-warning", delivered: "bg-success/15 text-success", cancelled: "bg-destructive/15 text-destructive",
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
              <div className="min-w-0"><div className="font-medium">{o.erp_customers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{o.reference || "Sans référence"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[o.status])}>{STATUS_LABEL[o.status]}</span>
            </button>
          ))}
        </div>
      )}
      {creating && <OrderCreateDialog customers={customers} upsert={upsert} onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); setSelected(o); }} />}
      {selected && <OrderDetailDialog order={selected} canManage={canManage} canSeeAmounts={canSeeAmounts} onClose={() => setSelected(null)} />}
    </div>
  );
}
function OrderCreateDialog({ customers, upsert, onClose, onCreated }: {
  customers: { id: string; name: string }[]; upsert: ReturnType<typeof useUpsertErpSalesOrder>; onClose: () => void; onCreated: (o: ErpSalesOrder) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!customerId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ customer_id: customerId, reference: reference.trim() || null })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la commande."); }
  };

  return (
    <Dialog title="Nouvelle commande" onClose={onClose}>
      <SelectField label="Client *" value={customerId} onChange={setCustomerId} options={customers} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!customerId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function OrderDetailDialog({ order, canManage, canSeeAmounts, onClose }: { order: ErpSalesOrder; canManage: boolean; canSeeAmounts: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpSalesOrderLines(order.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpSalesOrderLine();
  const removeLine = useDeleteErpSalesOrderLine();
  const confirm = useConfirmErpSalesOrder();
  const cancel = useCancelErpSalesOrder();
  const formatMoney = useFormatMoney();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isDraft = order.status === "draft";
  const canCancel = order.status === "confirmed" || order.status === "partially_delivered";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ sales_order_id: order.id, product_id: productId, quantity, unit_price: unitPrice }); setProductId(""); setQuantity(1); setUnitPrice(0); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  return (
    <Dialog title={`${order.erp_customers?.name ?? "—"} — ${order.reference || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          {canSeeAmounts && <NumberField label="Prix unit." value={unitPrice} onChange={setUnitPrice} width="w-24" />}
          <button onClick={add} disabled={!productId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <div><div>{l.erp_products?.name ?? "—"}</div><div className="text-xs text-muted-foreground">Livré {l.delivered_quantity} / {l.quantity}</div></div>
              <div className="flex items-center gap-3">
                {canSeeAmounts && <span className="font-mono text-xs text-muted-foreground">{formatMoney(l.unit_price)}</span>}
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
          {canCancel && <button onClick={() => cancel.mutateAsync(order.id).then(onClose)} disabled={cancel.isPending} className="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Annuler la commande</button>}
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

// ============ Livraisons ============
function DeliveriesTab({ canManage }: { canManage: boolean }) {
  const { data: deliveries = [], isLoading } = useErpDeliveryNotes();
  const { data: orders = [] } = useErpSalesOrders();
  const { data: warehouses = [] } = useErpWarehouses();
  const deliverableOrders = orders.filter((o) => o.status === "confirmed" || o.status === "partially_delivered");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpDeliveryNote | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} disabled={deliverableOrders.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            <Plus className="h-4 w-4" /> Nouvelle livraison
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : deliveries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune livraison pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {deliveries.map((d) => (
            <button key={d.id} onClick={() => setSelected(d)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{d.erp_warehouses?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{d.reference || "Sans référence"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", d.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {d.status === "confirmed" ? "Confirmée" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <DeliveryCreateDialog orders={deliverableOrders} warehouses={warehouses} onClose={() => setCreating(false)} onCreated={(d) => { setCreating(false); setSelected(d); }} />}
      {selected && <DeliveryDetailDialog delivery={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function DeliveryCreateDialog({ orders, warehouses, onClose, onCreated }: {
  orders: ErpSalesOrder[]; warehouses: { id: string; name: string }[]; onClose: () => void; onCreated: (d: ErpDeliveryNote) => void;
}) {
  const upsert = useUpsertErpDeliveryNote();
  const [orderId, setOrderId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!orderId || !warehouseId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ sales_order_id: orderId, warehouse_id: warehouseId })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la livraison."); }
  };

  return (
    <Dialog title="Nouvelle livraison" onClose={onClose}>
      <SelectField label="Commande *" value={orderId} onChange={setOrderId} options={orders.map((o) => ({ id: o.id, name: `${o.erp_customers?.name ?? "—"} — ${o.reference || "Sans réf."}` }))} />
      <SelectField label="Dépôt *" value={warehouseId} onChange={setWarehouseId} options={warehouses} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!orderId || !warehouseId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function DeliveryDetailDialog({ delivery, canManage, onClose }: { delivery: ErpDeliveryNote; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpDeliveryNoteLines(delivery.id);
  const { data: orderLines = [] } = useErpSalesOrderLines(delivery.sales_order_id);
  const addLine = useUpsertErpDeliveryNoteLine();
  const removeLine = useDeleteErpDeliveryNoteLine();
  const confirmDelivery = useConfirmErpDelivery();
  const [orderLineId, setOrderLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = delivery.status === "draft";
  const remaining = orderLines.filter((ol) => ol.delivered_quantity < ol.quantity);

  const add = async () => {
    const ol = orderLines.find((o) => o.id === orderLineId);
    if (!ol || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ delivery_note_id: delivery.id, sales_order_line_id: ol.id, product_id: ol.product_id, quantity }); setOrderLineId(""); setQuantity(1); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title={`${delivery.erp_warehouses?.name ?? "—"} — ${delivery.reference || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit à livrer</span>
            <select value={orderLineId} onChange={(e) => setOrderLineId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>
              {remaining.map((ol) => <option key={ol.id} value={ol.id}>{ol.erp_products?.name ?? "—"} ({ol.delivered_quantity}/{ol.quantity})</option>)}
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
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, deliveryId: delivery.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={() => confirmDelivery.mutateAsync(delivery.id).then(onClose)} disabled={lines.length === 0 || confirmDelivery.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {confirmDelivery.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TruckIcon className="h-3.5 w-3.5" />} Confirmer la livraison
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ============ Factures client ============
function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { data: invoices = [], isLoading } = useErpInvoices();
  const { data: customers = [] } = useErpCustomers();
  const upsert = useUpsertErpInvoice();
  const remove = useDeleteErpInvoice();
  const [editing, setEditing] = useState<ErpInvoice | null | "new">(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", sent: "Envoyée", partially_paid: "Partiellement payée", paid: "Payée", overdue: "En retard", cancelled: "Annulée" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", sent: "bg-warning/15 text-warning", partially_paid: "bg-warning/15 text-warning",
    paid: "bg-success/15 text-success", overdue: "bg-destructive/15 text-destructive", cancelled: "bg-destructive/15 text-destructive",
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
              <div className="min-w-0"><div className="font-medium">{inv.erp_customers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{inv.reference || "Sans référence"}</div></div>
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
      {editing && <InvoiceDialog invoice={editing === "new" ? null : editing} customers={customers} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function InvoiceDialog({ invoice, customers, onClose, onSave }: {
  invoice: ErpInvoice | null; customers: { id: string; name: string }[]; onClose: () => void; onSave: ReturnType<typeof useUpsertErpInvoice>;
}) {
  const [customerId, setCustomerId] = useState(invoice?.customer_id ?? "");
  const [reference, setReference] = useState(invoice?.reference ?? "");
  const [status, setStatus] = useState(invoice?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!customerId) return;
    setError(null);
    try { await onSave.mutateAsync({ id: invoice?.id, customer_id: customerId, reference: reference.trim() || null, status: status as any }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer la facture."); }
  };

  return (
    <Dialog title={invoice ? "Modifier la facture" : "Nouvelle facture"} onClose={onClose}>
      <SelectField label="Client *" value={customerId} onChange={setCustomerId} options={customers} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="draft">Brouillon</option><option value="sent">Envoyée</option><option value="partially_paid">Partiellement payée</option>
          <option value="paid">Payée</option><option value="overdue">En retard</option><option value="cancelled">Annulée</option>
        </select>
      </label>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!customerId} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Retours client ============
function ReturnsTab({ canManage }: { canManage: boolean }) {
  const { data: returns = [], isLoading } = useErpCustomerReturns();
  const { data: customers = [] } = useErpCustomers();
  const { data: warehouses = [] } = useErpWarehouses();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpCustomerReturn | null>(null);

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
              <div className="min-w-0"><div className="font-medium">{r.erp_customers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.reason || "Sans motif"}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {r.status === "confirmed" ? "Confirmé" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <ReturnCreateDialog customers={customers} warehouses={warehouses} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setSelected(r); }} />}
      {selected && <ReturnDetailDialog customerReturn={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function ReturnCreateDialog({ customers, warehouses, onClose, onCreated }: {
  customers: { id: string; name: string }[]; warehouses: { id: string; name: string }[]; onClose: () => void; onCreated: (r: ErpCustomerReturn) => void;
}) {
  const upsert = useUpsertErpCustomerReturn();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!customerId || !warehouseId) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ customer_id: customerId, warehouse_id: warehouseId, reason: reason.trim() || null })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le retour."); }
  };

  return (
    <Dialog title="Nouveau retour client" onClose={onClose}>
      <SelectField label="Client *" value={customerId} onChange={setCustomerId} options={customers} />
      <SelectField label="Dépôt *" value={warehouseId} onChange={setWarehouseId} options={warehouses} />
      <Field label="Motif" value={reason} onChange={setReason} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!customerId || !warehouseId} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function ReturnDetailDialog({ customerReturn, canManage, onClose }: { customerReturn: ErpCustomerReturn; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpCustomerReturnLines(customerReturn.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpCustomerReturnLine();
  const removeLine = useDeleteErpCustomerReturnLine();
  const confirmReturn = useConfirmErpCustomerReturn();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = customerReturn.status === "draft";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ return_id: customerReturn.id, product_id: productId, quantity }); setProductId(""); setQuantity(1); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title={`${customerReturn.erp_customers?.name ?? "—"} — ${customerReturn.erp_warehouses?.name ?? "—"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          <button onClick={add} disabled={!productId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
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
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, returnId: customerReturn.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={() => confirmReturn.mutateAsync(customerReturn.id).then(onClose)} disabled={lines.length === 0 || confirmReturn.isPending}
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
