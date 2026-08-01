// Prise de commande et suivi ZegResto (Phase 2) — chaque commande a une
// table (salle) ou un type emporter/livraison, un panier d'articles ajoutés
// un par un via add_resto_order_item() (RPC atomique, synchronise le ticket
// cuisine), et un statut de ticket visible en direct (Supabase Realtime).
// Facturation (Phase 5) : "Facturer" ouvre la note (create_resto_bill),
// choix du partage (aucun/égal/détaillé), puis enregistrement des
// paiements (add_resto_bill_payment) jusqu'à couvrir le total — la note
// passe alors "payee" et la commande "fermee" (RPC, atomique côté base).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, Receipt, CheckCircle2, Ban, Utensils, CreditCard, Smartphone, Wallet, Users } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney, useMyRole } from "@/lib/data/hooks";
import {
  useRestoOrders, useUpsertRestoOrder, useRestoOrderItems, useAddRestoOrderItem,
  useUpdateRestoOrderItemStatut, useRestoOrderKitchenTicket, useUpdateRestoTableStatut,
  useRestoTables, useRestoMenuCategories, useRestoMenuItems, useRestoModifiers, useRestoModifierOptions,
  useRestoMenuItemModifiers, useRestoBill, useCreateRestoBill, useRestoBillSplits, useRestoBillPayments,
  useSetRestoBillSplitItems, useAddRestoBillPayment,
  type RestoOrder, type OrderType, type ChosenModifier, type KitchenTicketStatut, type SplitMode, type PaymentMethode, type RestoOrderItem,
} from "@/lib/data/restoHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/commandes")({
  component: CommandesPage,
});

const TYPE_LABEL: Record<OrderType, string> = { salle: "Sur place", emporter: "À emporter", livraison: "Livraison" };
const TICKET_LABEL: Record<KitchenTicketStatut, string> = { en_attente: "En attente", en_preparation: "En préparation", pret: "Prêt" };
const TICKET_COLOR: Record<KitchenTicketStatut, string> = {
  en_attente: "bg-muted text-muted-foreground",
  en_preparation: "bg-warning/15 text-warning-foreground",
  pret: "bg-success/15 text-success",
};

function CommandesPage() {
  const formatMoney = useFormatMoney();
  const { data: orders = [], isLoading } = useRestoOrders(false);
  const [openOrder, setOpenOrder] = useState<RestoOrder | null>(null);
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => ({
    open: orders.length,
    salle: orders.filter((o) => o.type === "salle").length,
  }), [orders]);

  return (
    <div>
      <PageHeader title="Commandes" subtitle="Prise de commande et suivi"
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle commande
          </button>
        }
      />
      <div className="space-y-4 p-4 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Commandes en cours" value={String(stats.open)} icon={<Receipt className="h-5 w-5" />} accent="primary" />
          <StatCard label="Sur place" value={String(stats.salle)} icon={<Utensils className="h-5 w-5" />} accent="accent" />
        </div>

        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucune commande en cours.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} onOpen={() => setOpenOrder(o)} formatMoney={formatMoney} />
            ))}
          </div>
        )}
      </div>

      {creating && <NewOrderModal onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); setOpenOrder(o); }} />}
      {openOrder && <OrderDrawer order={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  );
}

function OrderCard({ order, onOpen, formatMoney }: { order: RestoOrder; onOpen: () => void; formatMoney: (n: number) => string }) {
  const { data: items = [] } = useRestoOrderItems(order.id);
  const { data: ticket } = useRestoOrderKitchenTicket(order.id);
  const total = items.reduce((s, i) => s + i.prix_unitaire * i.quantite, 0);

  return (
    <button onClick={onOpen} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:shadow-elegant">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{order.type === "salle" ? `Table ${order.table?.numero ?? "?"}` : TYPE_LABEL[order.type]}</div>
          <div className="text-xs text-muted-foreground">{items.length} article{items.length > 1 ? "s" : ""} · {formatMoney(total)}</div>
        </div>
        {ticket && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", TICKET_COLOR[ticket.statut])}>
            {TICKET_LABEL[ticket.statut]}
          </span>
        )}
      </div>
    </button>
  );
}

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (o: RestoOrder) => void }) {
  const { data: tables = [] } = useRestoTables();
  const upsert = useUpsertRestoOrder();
  const updateTableStatut = useUpdateRestoTableStatut();
  const [type, setType] = useState<OrderType>("salle");
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (type === "salle" && !tableId) { setError("Sélectionnez une table."); return; }
    try {
      const order = await upsert.mutateAsync({ type, table_id: type === "salle" ? tableId : null, statut: "ouverte" });
      // Convenance UI uniquement (pas de trigger DB) : une commande sur
      // place occupe la table si elle était libre/réservée.
      const table = tables.find((t) => t.id === tableId);
      if (type === "salle" && table && table.statut !== "occupee") updateTableStatut.mutate({ id: tableId, statut: "occupee" });
      onCreated(order);
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Nouvelle commande</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-3 gap-2">
            {(["salle", "emporter", "livraison"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={cn("rounded-xl border px-2 py-2.5 text-xs font-semibold", type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          {type === "salle" && (
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary">
              <option value="">Sélectionner une table…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>Table {t.numero} ({t.capacite} couverts) — {t.statut}</option>)}
            </select>
          )}
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
          <button onClick={submit} disabled={upsert.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer la commande
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDrawer({ order, onClose }: { order: RestoOrder; onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const { data: items = [], isLoading } = useRestoOrderItems(order.id);
  const { data: ticket } = useRestoOrderKitchenTicket(order.id);
  const { data: bill } = useRestoBill(order.id);
  const setLineStatut = useUpdateRestoOrderItemStatut();
  const cancelOrder = useUpsertRestoOrder();
  const [addingItem, setAddingItem] = useState(false);
  const [billing, setBilling] = useState(false);

  const total = items.reduce((s, i) => s + i.prix_unitaire * i.quantite, 0);
  const closed = order.statut === "fermee" || order.statut === "annulee";

  const cancel = async () => {
    if (!confirm("Annuler cette commande ?")) return;
    await cancelOrder.mutateAsync({ id: order.id, type: order.type, statut: "annulee" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-md flex-col bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-display text-lg font-bold">{order.type === "salle" ? `Table ${order.table?.numero ?? "?"}` : TYPE_LABEL[order.type]}</div>
            {ticket && <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", TICKET_COLOR[ticket.statut])}>{TICKET_LABEL[ticket.statut]}</span>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {isLoading ? (
            <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun article. Ajoutez-en un.</div>
          ) : (
            items.map((it) => (
              <div key={it.id} className={cn("rounded-xl border border-border p-3 text-sm", it.statut_ligne === "annulee" && "opacity-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{it.quantite}× {it.menu_item?.nom ?? "Article"}</div>
                    {it.modifiers_choisis.length > 0 && (
                      <div className="text-xs text-muted-foreground">{it.modifiers_choisis.map((m) => m.nom).join(", ")}</div>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold">{formatMoney(it.prix_unitaire * it.quantite)}</span>
                </div>
                {it.statut_ligne !== "annulee" && (
                  <div className="mt-2 flex gap-2">
                    {it.statut_ligne === "en_attente" ? (
                      <button onClick={() => setLineStatut.mutate({ id: it.id, orderId: order.id, statut_ligne: "servie" })}
                        className="flex items-center gap-1 rounded-lg border border-success/40 px-2 py-1 text-xs font-semibold text-success hover:bg-success/10">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Marquer servi
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Servi</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-5">
          <div className="mb-3 flex items-center justify-between text-sm font-bold"><span>Total</span><span>{formatMoney(total)}</span></div>
          {closed ? (
            <div className={cn("flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold",
              order.statut === "fermee" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
              <CheckCircle2 className="h-4 w-4" /> {order.statut === "fermee" ? "Commande facturée et réglée" : "Commande annulée"}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setAddingItem(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-muted">
                <Plus className="h-4 w-4" /> Article
              </button>
              <button onClick={() => setBilling(true)} disabled={items.length === 0}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
                <Receipt className="h-4 w-4" /> Facturer
              </button>
              {canManage && (
                <button onClick={cancel} className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10">
                  <Ban className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {addingItem && <AddItemSheet orderId={order.id} onClose={() => setAddingItem(false)} />}
      {billing && <BillModal orderId={order.id} items={items} existingBill={bill ?? null} onClose={() => setBilling(false)} />}
    </div>
  );
}

function AddItemSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: categories = [] } = useRestoMenuCategories();
  const { data: items = [] } = useRestoMenuItems();
  const addItem = useAddRestoOrderItem();
  const [categoryId, setCategoryId] = useState("");
  const [pickingModifiers, setPickingModifiers] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = items.filter((i) => i.disponible && (!categoryId || i.category_id === categoryId));

  const addSimple = async (menuItemId: string) => {
    setError(null);
    try { await addItem.mutateAsync({ orderId, menuItemId, quantite: 1 }); }
    catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Ajouter un article</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-border p-3">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary">
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            {available.map((i) => (
              <ItemPicker key={i.id} item={i} onAddSimple={() => addSimple(i.id)} onNeedsModifiers={() => setPickingModifiers(i.id)} formatMoney={formatMoney} busy={addItem.isPending} />
            ))}
          </div>
        </div>
      </div>

      {pickingModifiers && (
        <ModifierPickerModal menuItemId={pickingModifiers} orderId={orderId}
          onClose={() => setPickingModifiers(null)} onError={setError} />
      )}
    </div>
  );
}

function ItemPicker({ item, onAddSimple, onNeedsModifiers, formatMoney, busy }: {
  item: { id: string; nom: string; prix: number }; onAddSimple: () => void; onNeedsModifiers: () => void;
  formatMoney: (n: number) => string; busy: boolean;
}) {
  const { data: assigned = [] } = useRestoMenuItemModifiers(item.id);
  return (
    <button disabled={busy} onClick={() => (assigned.length > 0 ? onNeedsModifiers() : onAddSimple())}
      className="rounded-xl border border-border bg-background p-3 text-left hover:border-primary/40 disabled:opacity-50">
      <div className="truncate text-sm font-semibold">{item.nom}</div>
      <div className="mt-1 text-xs font-bold text-primary">{formatMoney(item.prix)}</div>
    </button>
  );
}

function ModifierPickerModal({ menuItemId, orderId, onClose, onError }: {
  menuItemId: string; orderId: string; onClose: () => void; onError: (e: string | null) => void;
}) {
  const { data: modifiers = [] } = useRestoModifiers();
  const { data: assignedIds = [] } = useRestoMenuItemModifiers(menuItemId);
  const itemModifiers = modifiers.filter((m) => assignedIds.includes(m.id));
  const addItem = useAddRestoOrderItem();
  const [selected, setSelected] = useState<Record<string, ChosenModifier[]>>({});

  const toggle = (modifierId: string, option: ChosenModifier) => {
    setSelected((s) => {
      const current = s[modifierId] ?? [];
      const exists = current.some((o) => o.option_id === option.option_id);
      return { ...s, [modifierId]: exists ? current.filter((o) => o.option_id !== option.option_id) : [...current, option] };
    });
  };

  const confirm = async () => {
    onError(null);
    const chosen = Object.values(selected).flat();
    try { await addItem.mutateAsync({ orderId, menuItemId, quantite: 1, modifiers: chosen }); onClose(); }
    catch (e: any) { onError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-foreground/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-base font-bold">Personnaliser</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {itemModifiers.map((m) => <ModifierOptionsPicker key={m.id} modifierId={m.id} nom={m.nom} selected={selected[m.id] ?? []} onToggle={(o) => toggle(m.id, o)} />)}
          <button onClick={confirm} disabled={addItem.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter à la commande
          </button>
        </div>
      </div>
    </div>
  );
}

const METHODE_LABEL: Record<PaymentMethode, string> = { mobile_money: "Mobile Money", cash: "Espèces", carte: "Carte" };
const METHODE_ICON: Record<PaymentMethode, React.ComponentType<{ className?: string }>> = { mobile_money: Smartphone, cash: Wallet, carte: CreditCard };

function BillModal({ orderId, items, existingBill, onClose }: {
  orderId: string; items: RestoOrderItem[]; existingBill: ReturnType<typeof useRestoBill>["data"]; onClose: () => void;
}) {
  const formatMoney = useFormatMoney();
  const createBill = useCreateRestoBill();
  const { data: bill } = useRestoBill(orderId);
  const activeBill = bill ?? existingBill;
  const [splitMode, setSplitMode] = useState<SplitMode>("aucun");
  const [splitCount, setSplitCount] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try { await createBill.mutateAsync({ orderId, splitMode, splitCount: splitMode === "egal" ? splitCount : undefined }); }
    catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Facturer</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {!activeBill ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Partage de la note</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["aucun", "Aucun"], ["egal", "Égal"], ["detaille", "Détaillé"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setSplitMode(k)}
                      className={cn("rounded-xl border px-2 py-2.5 text-xs font-semibold", splitMode === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {splitMode === "egal" && (
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nombre de parts</div>
                  <input type="number" min={2} value={splitCount} onChange={(e) => setSplitCount(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                </label>
              )}
              {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
              <button onClick={create} disabled={createBill.isPending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
                {createBill.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Ouvrir la note
              </button>
            </div>
          ) : (
            <BillPaymentPanel bill={activeBill} items={items} formatMoney={formatMoney} onFullyPaid={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function BillPaymentPanel({ bill, items, formatMoney, onFullyPaid }: {
  bill: NonNullable<ReturnType<typeof useRestoBill>["data"]>; items: RestoOrderItem[];
  formatMoney: (n: number) => string; onFullyPaid: () => void;
}) {
  const { data: splits = [] } = useRestoBillSplits(bill.split_mode !== "aucun" ? bill.id : null);
  const { data: payments = [] } = useRestoBillPayments(bill.id);
  const setSplitItems = useSetRestoBillSplitItems();
  const addPayment = useAddRestoBillPayment();
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const totalPaid = payments.filter((p) => p.statut === "validee").reduce((s, p) => s + p.montant, 0);
  const remaining = Math.max(0, bill.total - totalPaid);

  // Pré-remplit "1 convive par article" au premier rendu, sans écraser une
  // modification déjà faite par l'utilisateur (dépend de la liste d'ids,
  // pas du tableau items lui-même, pour ne pas re-déclencher à chaque
  // refetch réseau qui renvoie un nouveau tableau avec le même contenu).
  const itemIds = items.map((i) => i.id).join(",");
  useEffect(() => {
    setAssignments((a) => {
      const next = { ...a };
      let changed = false;
      for (const it of items) {
        if (next[it.id] === undefined) { next[it.id] = 1; changed = true; }
      }
      return changed ? next : a;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIds]);

  const validateDetailed = async () => {
    setError(null);
    const list = items.filter((i) => assignments[i.id]).map((i) => ({ order_item_id: i.id, split_index: assignments[i.id] }));
    if (list.length !== items.length) { setError("Assignez chaque article à un convive."); return; }
    try { await setSplitItems.mutateAsync({ billId: bill.id, assignments: list }); }
    catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  if (bill.statut === "payee") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
        <div className="font-semibold text-success">Note réglée intégralement</div>
      </div>
    );
  }

  if (bill.split_mode === "detaille" && splits.length === 0) {
    const maxIndex = Math.max(1, ...Object.values(assignments));
    return (
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">Attribuez chaque article à un convive (1, 2, 3…).</div>
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{it.quantite}× {it.menu_item?.nom ?? "Article"}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => setAssignments((a) => ({ ...a, [it.id]: Math.max(1, (a[it.id] ?? 1) - 1) }))} className="grid h-6 w-6 place-items-center rounded-md border border-border">-</button>
              <span className="w-5 text-center tabular">{assignments[it.id] ?? 1}</span>
              <button onClick={() => setAssignments((a) => ({ ...a, [it.id]: (a[it.id] ?? 1) + 1 }))} className="grid h-6 w-6 place-items-center rounded-md border border-border">+</button>
            </div>
          </div>
        ))}
        <div className="text-xs text-muted-foreground">{maxIndex} convive{maxIndex > 1 ? "s" : ""} détecté{maxIndex > 1 ? "s" : ""}.</div>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}
        <button onClick={validateDetailed} disabled={setSplitItems.isPending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
          {setSplitItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Valider la répartition
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between"><span>Total</span><span className="font-semibold">{formatMoney(bill.total)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Réglé</span><span>{formatMoney(totalPaid)}</span></div>
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold"><span>Reste</span><span>{formatMoney(remaining)}</span></div>
      </div>

      {bill.split_mode === "aucun" ? (
        <PaymentForm remaining={remaining} onPay={(montant, methode) => addPayment.mutateAsync({ billId: bill.id, montant, methode }).then(() => { if (montant >= remaining) onFullyPaid(); })} busy={addPayment.isPending} />
      ) : (
        <div className="space-y-3">
          {splits.map((s) => {
            const splitPaid = payments.filter((p) => p.split_id === s.id && p.statut === "validee").reduce((sum, p) => sum + p.montant, 0);
            const splitRemaining = Math.max(0, s.montant - splitPaid);
            return (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span>Convive {s.split_index}</span>
                  <span>{formatMoney(s.montant)}{splitPaid > 0 && splitRemaining > 0 ? ` (reste ${formatMoney(splitRemaining)})` : ""}</span>
                </div>
                {splitRemaining <= 0 ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Réglé</div>
                ) : (
                  <PaymentForm remaining={splitRemaining} compact
                    onPay={(montant, methode) => addPayment.mutateAsync({ billId: bill.id, montant, methode, splitId: s.id }).then(() => { if (remaining - montant <= 0) onFullyPaid(); })}
                    busy={addPayment.isPending} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaymentForm({ remaining, onPay, busy, compact }: { remaining: number; onPay: (montant: number, methode: PaymentMethode) => Promise<void>; busy: boolean; compact?: boolean }) {
  const [montant, setMontant] = useState(remaining);
  const [methode, setMethode] = useState<PaymentMethode>("cash");
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    if (montant <= 0) { setError("Montant invalide."); return; }
    try { await onPay(montant, methode); }
    catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className={cn("space-y-2", !compact && "rounded-xl border border-border p-3")}>
      <div className="flex gap-2">
        {(["cash", "mobile_money", "carte"] as const).map((m) => {
          const Icon = METHODE_ICON[m];
          return (
            <button key={m} onClick={() => setMethode(m)}
              className={cn("flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold", methode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
              <Icon className="h-3.5 w-3.5" /> {METHODE_LABEL[m]}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input type="number" value={montant} onChange={(e) => setMontant(Number(e.target.value))}
          className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        <button onClick={pay} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encaisser"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
    </div>
  );
}

function ModifierOptionsPicker({ modifierId, nom, selected, onToggle }: {
  modifierId: string; nom: string; selected: ChosenModifier[]; onToggle: (o: ChosenModifier) => void;
}) {
  const formatMoney = useFormatMoney();
  const { data: options = [] } = useRestoModifierOptions(modifierId);
  if (options.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">{nom}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const isSelected = selected.some((s) => s.option_id === o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => onToggle({ option_id: o.id, nom: o.nom, impact_prix: o.impact_prix })}
              className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                isSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {o.nom} {o.impact_prix !== 0 && <span className="tabular">({o.impact_prix > 0 ? "+" : ""}{formatMoney(o.impact_prix)})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

