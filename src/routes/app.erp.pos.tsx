// POS ERP ZegERP (Frontend Phase 4) — Sessions de caisse / Ventes comptoir
// / Retours. Réutilise le rôle cashier (existant) — aucun rôle ERP-
// spécifique nécessaire pour ce module.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, Wallet, ScanBarcode, RotateCcw, Lock, Unlock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import { useErpProducts, useErpWarehouses } from "@/lib/data/erpHooks";
import {
  useErpCashSessions, useOpenErpCashSession, useCloseErpCashSession,
  useErpPosSales, useErpPosSaleLines, useCreateErpPosSale, useUpsertErpPosSaleLine,
  useDeleteErpPosSaleLine, useCancelErpPosSale, useCompleteErpPosSale,
  useErpPosReturns, useErpPosReturnLines, useCreateErpPosReturn, useUpsertErpPosReturnLine,
  useDeleteErpPosReturnLine, useConfirmErpPosReturn,
  type ErpCashSession, type ErpPosSale, type ErpPosReturn,
} from "@/lib/data/erpPosHooks";

export const Route = createFileRoute("/app/erp/pos")({
  component: ErpPosPage,
});

const TABS = [
  { k: "sessions", label: "Sessions", icon: Wallet },
  { k: "ventes", label: "Ventes", icon: ScanBarcode },
  { k: "retours", label: "Retours", icon: RotateCcw },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpPosPage() {
  const [tab, setTab] = useState<TabKey>("ventes");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "cashier";

  return (
    <div>
      <PageHeader title="POS ERP" subtitle="Sessions de caisse, ventes comptoir et retours" />
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

        {tab === "sessions" && <SessionsTab canManage={canManage} />}
        {tab === "ventes" && <SalesTab canManage={canManage} />}
        {tab === "retours" && <ReturnsTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ============ Sessions de caisse ============
function SessionsTab({ canManage }: { canManage: boolean }) {
  const { data: sessions = [], isLoading } = useErpCashSessions();
  const { data: warehouses = [] } = useErpWarehouses();
  const formatMoney = useFormatMoney();
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState<ErpCashSession | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setOpening(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Unlock className="h-4 w-4" /> Ouvrir une session
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune session pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{s.erp_warehouses?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  Ouverte {new Date(s.opened_at).toLocaleString("fr-FR")} · Fond {formatMoney(s.opening_amount)}
                  {s.closing_amount != null && ` · Clôture ${formatMoney(s.closing_amount)}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", s.status === "open" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                  {s.status === "open" ? "Ouverte" : "Fermée"}
                </span>
                {canManage && s.status === "open" && (
                  <button onClick={() => setClosing(s)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
                    <Lock className="h-3.5 w-3.5" /> Fermer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {opening && <OpenSessionDialog warehouses={warehouses} onClose={() => setOpening(false)} />}
      {closing && <CloseSessionDialog session={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}
function OpenSessionDialog({ warehouses, onClose }: { warehouses: { id: string; name: string }[]; onClose: () => void }) {
  const open = useOpenErpCashSession();
  const [warehouseId, setWarehouseId] = useState("");
  const [openingAmount, setOpeningAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!warehouseId) return;
    setError(null);
    try { await open.mutateAsync({ warehouse_id: warehouseId, opening_amount: openingAmount }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ouvrir la session."); }
  };

  return (
    <Dialog title="Ouvrir une session de caisse" onClose={onClose}>
      <SelectField label="Dépôt *" value={warehouseId} onChange={setWarehouseId} options={warehouses} />
      <NumberField label="Fond de caisse" value={openingAmount} onChange={setOpeningAmount} width="w-full" />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={submit} disabled={!warehouseId} pending={open.isPending} label="Ouvrir" />
    </Dialog>
  );
}
function CloseSessionDialog({ session, onClose }: { session: ErpCashSession; onClose: () => void }) {
  const close = useCloseErpCashSession();
  const [closingAmount, setClosingAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try { await close.mutateAsync({ id: session.id, closingAmount }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de fermer la session."); }
  };

  return (
    <Dialog title="Fermer la session" onClose={onClose}>
      <NumberField label="Montant compté en caisse" value={closingAmount} onChange={setClosingAmount} width="w-full" />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={submit} disabled={false} pending={close.isPending} label="Fermer la session" />
    </Dialog>
  );
}

// ============ Ventes comptoir ============
function SalesTab({ canManage }: { canManage: boolean }) {
  const { data: sales = [], isLoading } = useErpPosSales();
  const { data: sessions = [] } = useErpCashSessions();
  const openSessions = sessions.filter((s) => s.status === "open");
  const formatMoney = useFormatMoney();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpPosSale | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", completed: "Terminée", cancelled: "Annulée" };
  const STATUS_CLASS: Record<string, string> = { draft: "bg-warning/15 text-warning", completed: "bg-success/15 text-success", cancelled: "bg-destructive/15 text-destructive" };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} disabled={openSessions.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            <Plus className="h-4 w-4" /> Nouvelle vente
          </button>
        </div>
      )}
      {openSessions.length === 0 && canManage && (
        <div className="mb-3 rounded-xl border border-dashed border-warning/40 bg-warning/5 p-3 text-xs text-warning">Ouvrez une session de caisse pour démarrer une vente.</div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : sales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune vente pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {sales.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{s.reference || `Vente du ${new Date(s.created_at).toLocaleDateString("fr-FR")}`}</div><div className="text-xs text-muted-foreground">{formatMoney(s.total_amount)}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[s.status])}>{STATUS_LABEL[s.status]}</span>
            </button>
          ))}
        </div>
      )}
      {creating && <SaleCreateDialog sessions={openSessions} onClose={() => setCreating(false)} onCreated={(s) => { setCreating(false); setSelected(s); }} />}
      {selected && <SaleDetailDialog sale={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function SaleCreateDialog({ sessions, onClose, onCreated }: { sessions: ErpCashSession[]; onClose: () => void; onCreated: (s: ErpPosSale) => void }) {
  const create = useCreateErpPosSale();
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!sessionId) return;
    setError(null);
    try { onCreated(await create.mutateAsync({ cash_session_id: sessionId })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la vente."); }
  };

  return (
    <Dialog title="Nouvelle vente" onClose={onClose}>
      <SelectField label="Session de caisse *" value={sessionId} onChange={setSessionId} options={sessions.map((s) => ({ id: s.id, name: s.erp_warehouses?.name ?? "—" }))} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={submit} disabled={!sessionId} pending={create.isPending} label="Créer" />
    </Dialog>
  );
}
function SaleDetailDialog({ sale, canManage, onClose }: { sale: ErpPosSale; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpPosSaleLines(sale.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpPosSaleLine();
  const removeLine = useDeleteErpPosSaleLine();
  const cancel = useCancelErpPosSale();
  const complete = useCompleteErpPosSale();
  const formatMoney = useFormatMoney();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isDraft = sale.status === "draft";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ sale_id: sale.id, product_id: productId, quantity, unit_price: unitPrice }); setProductId(""); setQuantity(1); setUnitPrice(0); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const onProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((pr) => pr.id === id);
    if (p) setUnitPrice(p.price);
  };

  return (
    <Dialog title={sale.reference || "Vente comptoir"} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
            <select value={productId} onChange={(e) => onProductChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
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
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, saleId: sale.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2 text-sm font-semibold">Total (avant taxes) : {formatMoney(total)}</div>
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => cancel.mutateAsync(sale.id).then(onClose)} disabled={cancel.isPending} className="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">Annuler</button>
          <button onClick={() => complete.mutateAsync(sale.id).then(onClose)} disabled={lines.length === 0 || complete.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {complete.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Finaliser
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ============ Retours comptoir ============
function ReturnsTab({ canManage }: { canManage: boolean }) {
  const { data: returns = [], isLoading } = useErpPosReturns();
  const { data: sales = [] } = useErpPosSales();
  const completedSales = sales.filter((s) => s.status === "completed");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpPosReturn | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} disabled={completedSales.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
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
              <span>{r.reason || "Sans motif"}</span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {r.status === "confirmed" ? "Confirmé" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <ReturnCreateDialog sales={completedSales} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setSelected(r); }} />}
      {selected && <ReturnDetailDialog posReturn={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function ReturnCreateDialog({ sales, onClose, onCreated }: { sales: ErpPosSale[]; onClose: () => void; onCreated: (r: ErpPosReturn) => void }) {
  const create = useCreateErpPosReturn();
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;
    setError(null);
    try { onCreated(await create.mutateAsync({ sale_id: sale.id, cash_session_id: sale.cash_session_id, reason: reason.trim() || undefined })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le retour."); }
  };

  return (
    <Dialog title="Nouveau retour" onClose={onClose}>
      <SelectField label="Vente *" value={saleId} onChange={setSaleId} options={sales.map((s) => ({ id: s.id, name: s.reference || new Date(s.created_at).toLocaleDateString("fr-FR") }))} />
      <Field label="Motif" value={reason} onChange={setReason} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={submit} disabled={!saleId} pending={create.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function ReturnDetailDialog({ posReturn, canManage, onClose }: { posReturn: ErpPosReturn; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpPosReturnLines(posReturn.id);
  const { data: saleLines = [] } = useErpPosSaleLines(posReturn.sale_id);
  const addLine = useUpsertErpPosReturnLine();
  const removeLine = useDeleteErpPosReturnLine();
  const confirmReturn = useConfirmErpPosReturn();
  const [saleLineId, setSaleLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isDraft = posReturn.status === "draft";
  const remaining = saleLines.filter((sl) => sl.returned_quantity < sl.quantity);

  const add = async () => {
    const sl = saleLines.find((s) => s.id === saleLineId);
    if (!sl || quantity <= 0) return;
    setError(null);
    try { await addLine.mutateAsync({ return_id: posReturn.id, sale_line_id: sl.id, product_id: sl.product_id, quantity }); setSaleLineId(""); setQuantity(1); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };

  return (
    <Dialog title="Retour comptoir" onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit à retourner</span>
            <select value={saleLineId} onChange={(e) => setSaleLineId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>
              {remaining.map((sl) => <option key={sl.id} value={sl.id}>{sl.erp_products?.name ?? "—"} ({sl.returned_quantity}/{sl.quantity})</option>)}
            </select>
          </div>
          <NumberField label="Qté" value={quantity} onChange={setQuantity} width="w-20" />
          <button onClick={add} disabled={!saleLineId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
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
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, returnId: posReturn.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={() => confirmReturn.mutateAsync(posReturn.id).then(onClose)} disabled={lines.length === 0 || confirmReturn.isPending}
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
