// Prise de commande et suivi ZegResto — refonte V2 (chantier 1) : plus de
// modale "un article à la fois", place à un poste de travail complet par
// commande — grille visuelle du menu (photos, recherche, catégories) d'un
// côté, récap panier + étapes d'envoi cuisine de l'autre, et une colonne de
// bascule rapide entre les tables/commandes actives sans rien perdre (le
// panier vit déjà côté base via add_resto_order_item(), changer de commande
// active est donc un simple changement de sélection, pas un état local qui
// pourrait se perdre).
//
// Étapes d'envoi cuisine (migration 043, resto_order_courses) : un article
// ajouté rejoint une étape (Entrée/Plat/Dessert, ou une étape par défaut
// sans nom) ; c'est l'action explicite "Envoyer en cuisine" sur l'étape
// (send_resto_course()) qui crée/relance son ticket. Le statut affiché par
// étape suit le ticket cuisine tant qu'il existe (en_attente → en_préparation
// → prêt, mis à jour en direct par le KDS), et bascule à "Servie" par une
// action explicite du serveur une fois l'étape apportée à table.
//
// Facturation (Phase 5, inchangée) : "Facturer" ouvre la note
// (create_resto_bill), choix du partage (aucun/égal/détaillé), puis
// enregistrement des paiements (add_resto_bill_payment) jusqu'à couvrir le
// total — la note passe alors "payee" et la commande "fermee".
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Loader2, Receipt, CheckCircle2, Ban, Utensils, CreditCard, Smartphone, Wallet, Users,
  Search, Send, ChefHat, Image as ImageIcon, Circle,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useFormatMoney, useMyRole } from "@/lib/data/hooks";
import {
  useRestoOrders, useUpsertRestoOrder, useRestoOrderItems, useAddRestoOrderItem,
  useUpdateRestoOrderItemStatut, useRestoOrderKitchenTickets, useUpdateRestoTableStatut,
  useRestoTables, useRestoMenuCategories, useRestoMenuItems, useRestoModifiers, useRestoModifierOptions,
  useRestoMenuItemModifiers, useRestoBill, useCreateRestoBill, useRestoBillSplits, useRestoBillPayments,
  useSetRestoBillSplitItems, useAddRestoBillPayment,
  useRestoOrderCourses, useCreateRestoOrderCourse, useSendRestoCourse, useMarkRestoCourseServed,
  type RestoOrder, type OrderType, type ChosenModifier, type KitchenTicketStatut, type SplitMode, type PaymentMethode,
  type RestoOrderItem, type RestoOrderCourse, type RestoKitchenTicket, type RestoMenuItem,
} from "@/lib/data/restoHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/commandes")({
  component: CommandesPage,
});

const TYPE_LABEL: Record<OrderType, string> = { salle: "Sur place", emporter: "À emporter", livraison: "Livraison" };
const TICKET_LABEL: Record<KitchenTicketStatut, string> = { en_attente: "En attente", en_preparation: "En préparation", pret: "Prêt à servir" };
const TICKET_COLOR: Record<KitchenTicketStatut, string> = {
  en_attente: "bg-muted text-muted-foreground",
  en_preparation: "bg-warning/15 text-warning-foreground",
  pret: "bg-success/15 text-success",
};

function CommandesPage() {
  const { data: orders = [], isLoading } = useRestoOrders(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Sélectionne automatiquement une commande (la plus récente) si aucune
  // n'est choisie, et retombe sur "aucune" si celle affichée vient de
  // disparaître de la liste (fermée/annulée depuis un autre poste).
  useEffect(() => {
    if (activeOrderId && !orders.some((o) => o.id === activeOrderId)) { setActiveOrderId(null); return; }
    if (!activeOrderId && orders.length > 0) setActiveOrderId(orders[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  return (
    <div>
      <PageHeader title="Commandes" subtitle={`${orders.length} commande${orders.length > 1 ? "s" : ""} en cours`}
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle commande
          </button>
        }
      />
      <div className="p-3 sm:p-6">
        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-sm text-muted-foreground">
            <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Aucune commande en cours.
            <button onClick={() => setCreating(true)} className="mx-auto mt-3 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Nouvelle commande
            </button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <OrdersRail orders={orders} activeId={activeOrderId} onSelect={setActiveOrderId} />
            <div className="min-w-0">
              {activeOrder && <OrderWorkspace key={activeOrder.id} order={activeOrder} />}
            </div>
          </div>
        )}
      </div>

      {creating && <NewOrderModal onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); setActiveOrderId(o.id); }} />}
    </div>
  );
}

// ============ COLONNE DE BASCULE RAPIDE ENTRE COMMANDES ACTIVES ============
function OrdersRail({ orders, activeId, onSelect }: { orders: RestoOrder[]; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0 lg:pr-1">
      {orders.map((o) => (
        <OrderRailCard key={o.id} order={o} active={o.id === activeId} onClick={() => onSelect(o.id)} />
      ))}
    </div>
  );
}

function OrderRailCard({ order, active, onClick }: { order: RestoOrder; active: boolean; onClick: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: items = [] } = useRestoOrderItems(order.id);
  const { data: tickets = [] } = useRestoOrderKitchenTickets(order.id);
  const total = items.filter((i) => i.statut_ligne !== "annulee").reduce((s, i) => s + i.prix_unitaire * i.quantite, 0);
  const ready = tickets.some((t) => t.statut === "pret");
  const inKitchen = !ready && tickets.some((t) => t.statut === "en_attente" || t.statut === "en_preparation");

  return (
    <button onClick={onClick}
      className={cn("shrink-0 rounded-xl border p-3 text-left transition-colors lg:shrink lg:w-full",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{order.type === "salle" ? `Table ${order.table?.numero ?? "?"}` : TYPE_LABEL[order.type]}</div>
          <div className="text-xs text-muted-foreground">{items.length} art. · {formatMoney(total)}</div>
        </div>
        {ready && <span className="grid h-2.5 w-2.5 shrink-0 place-items-center"><Circle className="h-2.5 w-2.5 fill-success text-success" /></span>}
        {inKitchen && <span className="grid h-2.5 w-2.5 shrink-0 place-items-center"><Circle className="h-2.5 w-2.5 fill-warning text-warning" /></span>}
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

// ============ POSTE DE TRAVAIL D'UNE COMMANDE : menu visuel + panier/étapes ============
function OrderWorkspace({ order }: { order: RestoOrder }) {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const { data: items = [] } = useRestoOrderItems(order.id);
  const { data: courses = [] } = useRestoOrderCourses(order.id);
  const { data: bill } = useRestoBill(order.id);
  const cancelOrder = useUpsertRestoOrder();
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [tab, setTab] = useState<"menu" | "panier">("menu");
  const [billing, setBilling] = useState(false);
  const [pickingModifiers, setPickingModifiers] = useState<RestoMenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Étape active pour les prochains ajouts : reste sur la dernière étape
  // encore en brouillon tant qu'elle existe, sinon laisse add_resto_order_item()
  // recréer l'étape par défaut (p_course_id = null).
  useEffect(() => {
    if (activeCourseId && courses.some((c) => c.id === activeCourseId && c.statut === "brouillon")) return;
    const draft = [...courses].reverse().find((c) => c.statut === "brouillon");
    setActiveCourseId(draft ? draft.id : null);
  }, [courses, activeCourseId]);

  const total = items.filter((i) => i.statut_ligne !== "annulee").reduce((s, i) => s + i.prix_unitaire * i.quantite, 0);
  const closed = order.statut === "fermee" || order.statut === "annulee";

  const cancel = async () => {
    if (!confirm("Annuler cette commande ?")) return;
    await cancelOrder.mutateAsync({ id: order.id, type: order.type, statut: "annulee" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <div className="font-display text-lg font-bold">{order.type === "salle" ? `Table ${order.table?.numero ?? "?"}` : TYPE_LABEL[order.type]}</div>
          <div className="text-xs text-muted-foreground">{items.filter((i) => i.statut_ligne !== "annulee").length} article(s) · {formatMoney(total)}</div>
        </div>
        {!closed ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setBilling(true)} disabled={items.length === 0}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">
              <Receipt className="h-4 w-4" /> Facturer
            </button>
            {canManage && (
              <button onClick={cancel} className="flex items-center gap-2 rounded-xl border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                <Ban className="h-4 w-4" /> Annuler
              </button>
            )}
          </div>
        ) : (
          <div className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold",
            order.statut === "fermee" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
            <CheckCircle2 className="h-4 w-4" /> {order.statut === "fermee" ? "Facturée et réglée" : "Annulée"}
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}

      {/* Bascule Menu/Panier en dessous de lg (deux colonnes côte à côte
         au-delà) — un poste de travail complet n'a pas la place pour les
         deux panneaux côte à côte sur mobile. */}
      <div className="flex gap-2 lg:hidden">
        {(["menu", "panier"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-semibold", tab === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            {t === "menu" ? "Menu" : `Panier (${items.filter((i) => i.statut_ligne !== "annulee").length})`}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className={cn(tab !== "menu" && "hidden lg:block")}>
          <MenuBrowser disabled={closed}
            courses={courses}
            activeCourseId={activeCourseId}
            onSelectCourse={setActiveCourseId}
            orderId={order.id}
            onPickModifiers={setPickingModifiers}
            onError={setError}
          />
        </div>
        <div className={cn(tab !== "panier" && "hidden lg:block")}>
          <CartPanel order={order} items={items} courses={courses} closed={closed} formatMoney={formatMoney} onError={setError} />
        </div>
      </div>

      {pickingModifiers && (
        <ModifierPickerModal menuItem={pickingModifiers} orderId={order.id} courseId={activeCourseId}
          onClose={() => setPickingModifiers(null)} onError={setError} />
      )}
      {billing && <BillModal orderId={order.id} items={items} existingBill={bill ?? null} onClose={() => setBilling(false)} />}
    </div>
  );
}

// ============ GRILLE VISUELLE DU MENU (photos, recherche, catégories) ============
function MenuBrowser({ disabled, courses, activeCourseId, onSelectCourse, orderId, onPickModifiers, onError }: {
  disabled: boolean; courses: RestoOrderCourse[]; activeCourseId: string | null; onSelectCourse: (id: string | null) => void;
  orderId: string; onPickModifiers: (item: RestoMenuItem) => void; onError: (e: string | null) => void;
}) {
  const { data: categories = [] } = useRestoMenuCategories();
  const { data: items = [] } = useRestoMenuItems();
  const addItem = useAddRestoOrderItem();
  const createCourse = useCreateRestoOrderCourse();
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => i.disponible && (!categoryId || i.category_id === categoryId) && (!q || i.nom.toLowerCase().includes(q)));
  }, [items, categoryId, search]);

  const addSimple = async (item: RestoMenuItem) => {
    onError(null);
    try { await addItem.mutateAsync({ orderId, menuItemId: item.id, quantite: 1, courseId: activeCourseId }); }
    catch (e: any) { onError(e?.message ?? "Erreur inconnue"); }
  };

  const addNewCourse = async () => {
    try {
      const c = await createCourse.mutateAsync({ orderId, ordre: courses.length + 1 });
      onSelectCourse(c.id);
    } catch (e: any) { onError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="space-y-3">
      {/* Étape active : détermine à quelle étape d'envoi cuisine les
         prochains articles ajoutés seront rattachés. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card p-2">
        <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Étape :</span>
        {courses.map((c, idx) => (
          <button key={c.id} onClick={() => onSelectCourse(c.id)} disabled={disabled}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-40",
              activeCourseId === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
            {c.nom || `Étape ${c.ordre ?? idx + 1}`}
          </button>
        ))}
        <button onClick={addNewCourse} disabled={disabled || createCourse.isPending}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40">
          <Plus className="h-3 w-3" /> Étape
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setCategoryId("")}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", !categoryId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
            Toutes
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategoryId(c.id)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", categoryId === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
              {c.nom}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Utensils className="mx-auto mb-2 h-8 w-8 opacity-40" /> Aucun article ne correspond.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((i) => (
            <MenuItemCard key={i.id} item={i} disabled={disabled || addItem.isPending}
              onAddSimple={() => addSimple(i)} onNeedsModifiers={() => onPickModifiers(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItemCard({ item, disabled, onAddSimple, onNeedsModifiers }: {
  item: RestoMenuItem; disabled: boolean; onAddSimple: () => void; onNeedsModifiers: () => void;
}) {
  const formatMoney = useFormatMoney();
  const { data: assigned = [] } = useRestoMenuItemModifiers(item.id);
  const hasModifiers = assigned.length > 0;

  return (
    <button disabled={disabled} onClick={() => (hasModifiers ? onNeedsModifiers() : onAddSimple())}
      className="overflow-hidden rounded-xl border border-border bg-background text-left hover:border-primary/40 disabled:opacity-50">
      <div className="grid aspect-square w-full place-items-center overflow-hidden bg-muted">
        {item.photo_url ? (
          <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-semibold">{item.nom}</div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-xs font-bold text-primary">{formatMoney(item.prix)}</span>
          {hasModifiers && <span className="text-[10px] text-muted-foreground">options</span>}
        </div>
      </div>
    </button>
  );
}

// ============ PANIER / RÉCAP PAR ÉTAPE + ENVOI CUISINE ============
function CartPanel({ order, items, courses, closed, formatMoney, onError }: {
  order: RestoOrder; items: RestoOrderItem[]; courses: RestoOrderCourse[]; closed: boolean;
  formatMoney: (n: number) => string; onError: (e: string | null) => void;
}) {
  const { data: tickets = [] } = useRestoOrderKitchenTickets(order.id);
  const sendCourse = useSendRestoCourse();
  const markServed = useMarkRestoCourseServed();
  const setLineStatut = useUpdateRestoOrderItemStatut();

  const ticketByCourse = new Map(tickets.map((t) => [t.course_id, t] as const));
  const itemsByCourse = new Map<string, RestoOrderItem[]>();
  for (const it of items) {
    const key = it.course_id ?? "__sans_etape__";
    itemsByCourse.set(key, [...(itemsByCourse.get(key) ?? []), it]);
  }
  const orphanItems = itemsByCourse.get("__sans_etape__") ?? [];

  const send = async (courseId: string) => {
    onError(null);
    try { await sendCourse.mutateAsync({ courseId, orderId: order.id }); }
    catch (e: any) { onError(e?.message ?? "Erreur inconnue"); }
  };
  const markLineServed = (item: RestoOrderItem) => setLineStatut.mutate({ id: item.id, orderId: order.id, statut_ligne: "servie" });

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Aucun article. Choisissez une étape puis ajoutez des articles depuis le menu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {courses.filter((c) => (itemsByCourse.get(c.id) ?? []).length > 0).map((c) => (
        <CourseGroup key={c.id} course={c} items={itemsByCourse.get(c.id) ?? []} ticket={ticketByCourse.get(c.id) ?? null}
          closed={closed} formatMoney={formatMoney} onSend={() => send(c.id)} sending={sendCourse.isPending}
          onMarkServed={() => markServed.mutate({ courseId: c.id, orderId: order.id })} markingServed={markServed.isPending}
          onMarkLineServed={markLineServed} markingLine={setLineStatut.isPending} />
      ))}
      {orphanItems.length > 0 && (
        <CourseGroup course={null} items={orphanItems} ticket={null} closed={closed} formatMoney={formatMoney}
          onSend={() => {}} sending={false} onMarkServed={() => {}} markingServed={false}
          onMarkLineServed={markLineServed} markingLine={setLineStatut.isPending} />
      )}
    </div>
  );
}

function CourseGroup({ course, items, ticket, closed, formatMoney, onSend, sending, onMarkServed, markingServed, onMarkLineServed, markingLine }: {
  course: RestoOrderCourse | null; items: RestoOrderItem[]; ticket: RestoKitchenTicket | null; closed: boolean;
  formatMoney: (n: number) => string; onSend: () => void; sending: boolean;
  onMarkServed: () => void; markingServed: boolean; onMarkLineServed: (item: RestoOrderItem) => void; markingLine: boolean;
}) {
  const activeItems = items.filter((i) => i.statut_ligne !== "annulee");
  const served = course?.statut === "servie";
  const statutLabel = served ? "Servie" : ticket ? TICKET_LABEL[ticket.statut] : "Brouillon";
  const statutColor = served ? "bg-success/15 text-success" : ticket ? TICKET_COLOR[ticket.statut] : "bg-muted text-muted-foreground";
  const canSend = !closed && !ticket && course && activeItems.length > 0;
  const canMarkServed = !closed && !served && ticket?.statut === "pret";

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold">{course ? (course.nom || `Étape ${course.ordre}`) : "Sans étape (avant migration)"}</span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", statutColor)}>{statutLabel}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.id} className={cn("flex items-start justify-between gap-2 text-sm", it.statut_ligne === "annulee" && "opacity-50")}>
            <div className="min-w-0">
              <div className="truncate font-medium">{it.quantite}× {it.menu_item?.nom ?? "Article"}</div>
              {it.modifiers_choisis.length > 0 && (
                <div className="truncate text-xs text-muted-foreground">{it.modifiers_choisis.map((m) => m.nom).join(", ")}</div>
              )}
              {it.statut_ligne === "pret" && !closed && (
                <button onClick={() => onMarkLineServed(it)} disabled={markingLine}
                  className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-success hover:underline disabled:opacity-50">
                  <CheckCircle2 className="h-3 w-3" /> Marquer servi
                </button>
              )}
              {it.statut_ligne === "servie" && (
                <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3 w-3" /> Servi</span>
              )}
            </div>
            <span className="shrink-0 font-semibold">{formatMoney(it.prix_unitaire * it.quantite)}</span>
          </div>
        ))}
      </div>
      {(canSend || canMarkServed) && (
        <div className="mt-3">
          {canSend ? (
            <button onClick={onSend} disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Envoyer en cuisine
            </button>
          ) : (
            <button onClick={onMarkServed} disabled={markingServed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-success/15 py-2 text-xs font-bold text-success hover:bg-success/25 disabled:opacity-40">
              {markingServed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Marquer l'étape servie
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ModifierPickerModal({ menuItem, orderId, courseId, onClose, onError }: {
  menuItem: RestoMenuItem; orderId: string; courseId: string | null; onClose: () => void; onError: (e: string | null) => void;
}) {
  const formatMoney = useFormatMoney();
  const { data: modifiers = [] } = useRestoModifiers();
  const { data: assignedIds = [] } = useRestoMenuItemModifiers(menuItem.id);
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
    try { await addItem.mutateAsync({ orderId, menuItemId: menuItem.id, quantite: 1, modifiers: chosen, courseId }); onClose(); }
    catch (e: any) { onError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-foreground/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-base font-bold">{menuItem.nom}</div>
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
