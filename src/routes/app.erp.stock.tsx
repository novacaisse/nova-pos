// Stock ZegERP (Frontend Phase 1) — Niveaux / Transferts / Inventaires /
// Mouvements. Transferts et inventaires suivent le flux à deux temps
// imposé par la RLS (migration 048) : création du brouillon (lignes
// éditables), puis passage d'état exclusivement via RPC
// (send_erp_stock_transfer/receive_erp_stock_transfer/
// validate_erp_inventory) — jamais d'écriture directe de `status`.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2, Plus, Trash2, X, AlertCircle, AlertTriangle, Warehouse, ArrowLeftRight,
  ClipboardList, History, Send, PackageCheck, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import {
  useErpStockLevels, useErpWarehouses, useErpProducts,
  useErpStockTransfers, useErpStockTransferLines, useUpsertErpStockTransfer, useUpsertErpStockTransferLine,
  useDeleteErpStockTransferLine, useSendErpStockTransfer, useReceiveErpStockTransfer,
  useErpInventories, useErpInventoryLines, useUpsertErpInventory, useUpsertErpInventoryLine, useValidateErpInventory,
  useErpStockMovements,
  type ErpStockTransfer, type ErpInventory,
} from "@/lib/data/erpHooks";

export const Route = createFileRoute("/app/erp/stock")({
  component: ErpStockPage,
});

const TABS = [
  { k: "niveaux", label: "Niveaux", icon: Warehouse },
  { k: "transferts", label: "Transferts", icon: ArrowLeftRight },
  { k: "inventaires", label: "Inventaires", icon: ClipboardList },
  { k: "mouvements", label: "Mouvements", icon: History },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpStockPage() {
  const [tab, setTab] = useState<TabKey>("niveaux");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "stock";

  return (
    <div>
      <PageHeader title="Stock" subtitle="Niveaux, transferts inter-dépôts, inventaires et mouvements" />
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

        {tab === "niveaux" && <LevelsTab />}
        {tab === "transferts" && <TransfersTab canManage={canManage} />}
        {tab === "inventaires" && <InventoriesTab canManage={canManage} />}
        {tab === "mouvements" && <MovementsTab />}
      </div>
    </div>
  );
}

// ============ Niveaux de stock ============
function LevelsTab() {
  const { data: levels = [], isLoading } = useErpStockLevels();

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : levels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucun mouvement de stock enregistré pour l'instant.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {levels.map((l) => {
            const low = l.erp_products && l.erp_products.low_stock_threshold > 0 && l.quantity < l.erp_products.low_stock_threshold;
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{l.erp_products?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{l.erp_warehouses?.name ?? "—"}{l.erp_products?.sku && ` · SKU ${l.erp_products.sku}`}</div>
                </div>
                <div className={cn("flex shrink-0 items-center gap-1.5 font-mono text-sm font-semibold", low ? "text-destructive" : "text-foreground")}>
                  {low && <AlertTriangle className="h-3.5 w-3.5" />} {l.quantity}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ Transferts inter-dépôts ============
function TransfersTab({ canManage }: { canManage: boolean }) {
  const { data: transfers = [], isLoading } = useErpStockTransfers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpStockTransfer | null>(null);

  const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", in_transit: "En transit", received: "Reçu" };
  const STATUS_CLASS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    in_transit: "bg-warning/15 text-warning",
    received: "bg-success/15 text-success",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau transfert
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun transfert pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {transfers.map((t) => (
            <button key={t.id} onClick={() => setSelected(t)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0">
                <div className="font-medium">{t.from_warehouse?.name ?? "—"} → {t.to_warehouse?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{t.reference || "Sans référence"}</div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span>
            </button>
          ))}
        </div>
      )}

      {creating && <TransferCreateDialog onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); setSelected(t); }} />}
      {selected && <TransferDetailDialog transfer={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TransferCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ErpStockTransfer) => void }) {
  const { data: warehouses = [] } = useErpWarehouses();
  const upsert = useUpsertErpStockTransfer();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const valid = fromId && toId && fromId !== toId;

  const create = async () => {
    if (!valid) return;
    setError(null);
    try {
      const t = await upsert.mutateAsync({ from_warehouse_id: fromId, to_warehouse_id: toId, reference: reference.trim() || null });
      onCreated(t);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer le transfert.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">Nouveau transfert</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <WarehouseSelect label="Dépôt source *" value={fromId} onChange={setFromId} warehouses={warehouses} />
          <WarehouseSelect label="Dépôt destination *" value={toId} onChange={setToId} warehouses={warehouses.filter((w) => w.id !== fromId)} />
          <TextField label="Référence" value={reference} onChange={setReference} />
          {fromId && toId && fromId === toId && (
            <div className="text-xs text-destructive">Le dépôt source et destination doivent être différents.</div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button onClick={create} disabled={!valid || upsert.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {upsert.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Créer le brouillon
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferDetailDialog({ transfer, canManage, onClose }: { transfer: ErpStockTransfer; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpStockTransferLines(transfer.id);
  const { data: products = [] } = useErpProducts();
  const addLine = useUpsertErpStockTransferLine();
  const removeLine = useDeleteErpStockTransferLine();
  const send = useSendErpStockTransfer();
  const receive = useReceiveErpStockTransfer();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const isDraft = transfer.status === "draft";

  const add = async () => {
    if (!productId || quantity <= 0) return;
    setError(null);
    try {
      await addLine.mutateAsync({ transfer_id: transfer.id, product_id: productId, quantity });
      setProductId(""); setQuantity(1);
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'ajouter la ligne.");
    }
  };

  const doSend = async () => {
    setError(null);
    try { await send.mutateAsync(transfer.id); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'envoyer ce transfert."); }
  };
  const doReceive = async () => {
    setError(null);
    try { await receive.mutateAsync(transfer.id); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de réceptionner ce transfert."); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="font-display text-lg font-bold">{transfer.from_warehouse?.name} → {transfer.to_warehouse?.name}</div>
            <div className="text-xs text-muted-foreground">{transfer.reference || "Sans référence"}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {isDraft && canManage && (
            <div className="flex items-end gap-2 rounded-xl border border-dashed border-border p-3">
              <div className="flex-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produit</span>
                <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="w-24">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qté</span>
                <input type="number" value={quantity} onFocus={selectOnFocus} onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </div>
              <button onClick={add} disabled={!productId || quantity <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid place-items-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
          ) : (
            <div className="divide-y divide-border">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{l.erp_products?.name ?? "—"}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold">{l.quantity}</span>
                    {isDraft && canManage && (
                      <button onClick={() => removeLine.mutate({ id: l.id, transferId: transfer.id })} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        {canManage && (transfer.status === "draft" || transfer.status === "in_transit") && (
          <div className="flex justify-end gap-2 border-t border-border p-4">
            {transfer.status === "draft" && (
              <button onClick={doSend} disabled={lines.length === 0 || send.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Envoyer
              </button>
            )}
            {transfer.status === "in_transit" && (
              <button onClick={doReceive} disabled={receive.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                {receive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />} Réceptionner
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Inventaires physiques ============
function InventoriesTab({ canManage }: { canManage: boolean }) {
  const { data: inventories = [], isLoading } = useErpInventories();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpInventory | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvel inventaire
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : inventories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun inventaire pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {inventories.map((inv) => (
            <button key={inv.id} onClick={() => setSelected(inv)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0">
                <div className="font-medium">{inv.erp_warehouses?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{inv.notes || "Sans note"}</div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", inv.status === "validated" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {inv.status === "validated" ? "Validé" : "En cours"}
              </span>
            </button>
          ))}
        </div>
      )}

      {creating && <InventoryCreateDialog onClose={() => setCreating(false)} onCreated={(inv) => { setCreating(false); setSelected(inv); }} />}
      {selected && <InventoryDetailDialog inventory={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}

function InventoryCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: ErpInventory) => void }) {
  const { data: warehouses = [] } = useErpWarehouses();
  const upsert = useUpsertErpInventory();
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!warehouseId) return;
    setError(null);
    try {
      const inv = await upsert.mutateAsync({ warehouse_id: warehouseId, notes: notes.trim() || null });
      onCreated(inv);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer l'inventaire.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">Nouvel inventaire</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <WarehouseSelect label="Dépôt *" value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
          <TextField label="Notes" value={notes} onChange={setNotes} />
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button onClick={create} disabled={!warehouseId || upsert.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {upsert.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryDetailDialog({ inventory, canManage, onClose }: { inventory: ErpInventory; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpInventoryLines(inventory.id);
  const { data: products = [] } = useErpProducts();
  const { data: levels = [] } = useErpStockLevels();
  const upsertLine = useUpsertErpInventoryLine();
  const validate = useValidateErpInventory();
  const [productId, setProductId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inProgress = inventory.status === "in_progress";
  const existingProductIds = new Set(lines.map((l) => l.product_id));

  const addProduct = async () => {
    if (!productId) return;
    setError(null);
    const theoretical = levels.find((l) => l.product_id === productId && l.warehouse_id === inventory.warehouse_id)?.quantity ?? 0;
    try {
      await upsertLine.mutateAsync({ inventory_id: inventory.id, product_id: productId, theoretical_quantity: theoretical });
      setProductId("");
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'ajouter le produit.");
    }
  };

  const setCounted = async (lineId: string, productIdForLine: string, theoretical: number, counted: number) => {
    setError(null);
    try {
      await upsertLine.mutateAsync({ id: lineId, inventory_id: inventory.id, product_id: productIdForLine, theoretical_quantity: theoretical, counted_quantity: counted });
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer le comptage.");
    }
  };

  const doValidate = async () => {
    setError(null);
    try { await validate.mutateAsync(inventory.id); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de valider cet inventaire."); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="font-display text-lg font-bold">{inventory.erp_warehouses?.name}</div>
            <div className="text-xs text-muted-foreground">{inventory.notes || "Sans note"}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {inProgress && canManage && (
            <div className="flex items-end gap-2 rounded-xl border border-dashed border-border p-3">
              <div className="flex-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ajouter un produit à compter</span>
                <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {products.filter((p) => !existingProductIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button onClick={addProduct} disabled={!productId || upsertLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid place-items-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucun produit ajouté pour l'instant.</div>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <InventoryLineRow key={l.id} line={l} editable={inProgress && canManage} onSetCounted={(v) => setCounted(l.id, l.product_id, l.theoretical_quantity, v)} />
              ))}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        {inProgress && canManage && (
          <div className="flex justify-end gap-2 border-t border-border p-4">
            <button onClick={doValidate} disabled={lines.length === 0 || validate.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {validate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Valider l'inventaire
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InventoryLineRow({ line, editable, onSetCounted }: { line: { erp_products: { name: string } | null; theoretical_quantity: number; counted_quantity: number | null }; editable: boolean; onSetCounted: (v: number) => void }) {
  const [counted, setCounted] = useState(line.counted_quantity ?? line.theoretical_quantity);
  const gap = line.counted_quantity != null ? line.counted_quantity - line.theoretical_quantity : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{line.erp_products?.name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          Théorique {line.theoretical_quantity}
          {gap != null && gap !== 0 && <span className={cn("ml-1.5 font-semibold", gap > 0 ? "text-success" : "text-destructive")}>({gap > 0 ? "+" : ""}{gap})</span>}
        </div>
      </div>
      {editable ? (
        <div className="flex items-center gap-1.5">
          <input type="number" value={counted} onFocus={selectOnFocus} onChange={(e) => setCounted(Number(e.target.value) || 0)}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm" />
          <button onClick={() => onSetCounted(counted)} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">OK</button>
        </div>
      ) : (
        <span className="font-mono font-semibold">{line.counted_quantity ?? "—"}</span>
      )}
    </div>
  );
}

// ============ Mouvements ============
function MovementsTab() {
  const { data: movements = [], isLoading } = useErpStockMovements(100);
  const TYPE_LABEL: Record<string, string> = {
    in: "Entrée", out: "Sortie", adjustment: "Ajustement", transfer_out: "Transfert (sortie)", transfer_in: "Transfert (entrée)",
    purchase_receipt: "Réception achat", sale: "Vente", supplier_return: "Retour fournisseur", customer_return: "Retour client",
  };
  const isPositive = (t: string) => ["in", "transfer_in", "purchase_receipt", "customer_return"].includes(t);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : movements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun mouvement pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{m.erp_products?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{TYPE_LABEL[m.type] ?? m.type} · {m.erp_warehouses?.name ?? "—"} · {new Date(m.created_at).toLocaleString("fr-FR")}</div>
              </div>
              <span className={cn("shrink-0 font-mono text-sm font-semibold", isPositive(m.type) || m.type === "adjustment" ? "text-success" : "text-destructive")}>
                {m.type === "adjustment" ? (m.quantity > 0 ? "+" : "") : isPositive(m.type) ? "+" : "-"}{Math.abs(m.quantity)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Champs partagés ============
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function WarehouseSelect({ label, value, onChange, warehouses }: { label: string; value: string; onChange: (v: string) => void; warehouses: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">—</option>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}
