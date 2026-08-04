// Réservations ZegCaisse — clients qui réservent des articles à l'avance
// (coordonnées, articles, montant total, avance versée, reste, date de
// réservation). Ne bouge jamais le stock avant d'être honorée (voir
// migration 062) — une réservation devient une vraie vente au moment où
// elle est honorée, geste manuel laissé au caissier (comme la remise en
// main propre d'un ticket en attente).
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, X, Loader2, AlertCircle, Search, Trash2, CheckCircle2, XCircle, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useReservations, useUpsertReservation, useUpdateReservationStatus, useDeleteReservation,
  useCustomers, useProducts, useMyRole, useFormatMoney,
  type Reservation, type ReservationItem, type ReservationStatus, type Customer,
} from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/reservations")({
  component: ReservationsPage,
});

const STATUS_LABEL: Record<ReservationStatus, string> = { pending: "En attente", fulfilled: "Honorée", cancelled: "Annulée" };
const STATUS_CLASS: Record<ReservationStatus, string> = {
  pending: "bg-warning/15 text-warning", fulfilled: "bg-success/15 text-success", cancelled: "bg-muted text-muted-foreground",
};

function ReservationsPage() {
  const formatXOF = useFormatMoney();
  const { data: reservations = [], isLoading } = useReservations();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const canCreate = canManage || myRole === "cashier";
  const updateStatus = useUpdateReservationStatus();
  const remove = useDeleteReservation();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<ReservationStatus | "all">("pending");

  const filtered = filter === "all" ? reservations : reservations.filter((r) => r.status === filter);

  return (
    <div>
      <PageHeader title="Réservations" subtitle="Articles réservés par des clients, avec avance et date de retrait"
        actions={canCreate ? (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle réservation
          </button>
        ) : undefined}
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {(["pending", "fulfilled", "cancelled", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "Toutes" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          {isLoading ? (
            <div className="grid place-items-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <CalendarRange className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              Aucune réservation {filter !== "all" ? STATUS_LABEL[filter as ReservationStatus].toLowerCase() : ""}.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => {
                const reste = Math.max(0, Number(r.total) - Number(r.deposit));
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{r.customer_name}</div>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_CLASS[r.status])}>{STATUS_LABEL[r.status]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.reference} · {r.items.length} article{r.items.length > 1 ? "s" : ""} · Retrait le {new Date(r.reservation_date).toLocaleDateString("fr-FR")}
                        {r.customer_phone && ` · ${r.customer_phone}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-sm font-bold">{formatXOF(Number(r.total))}</div>
                      <div className="tabular text-xs text-muted-foreground">Avance {formatXOF(Number(r.deposit))}{reste > 0 && ` · Reste ${formatXOF(reste)}`}</div>
                    </div>
                    {canManage && r.status === "pending" && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button onClick={() => updateStatus.mutate({ id: r.id, status: "fulfilled" })} title="Marquer honorée"
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-success/10 hover:text-success"><CheckCircle2 className="h-4 w-4" /></button>
                        <button onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })} title="Annuler"
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><XCircle className="h-4 w-4" /></button>
                      </div>
                    )}
                    {canManage && r.status !== "pending" && (
                      <button onClick={() => { if (confirm("Supprimer cette réservation ?")) remove.mutate(r.id); }}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {creating && <ReservationDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ReservationDialog({ onClose }: { onClose: () => void }) {
  const formatXOF = useFormatMoney();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const upsert = useUpsertReservation();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().slice(0, 10));
  const [deposit, setDeposit] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);

  const pickCustomer = (c: Customer) => { setCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone ?? ""); };
  const addItem = (p: (typeof products)[number]) => {
    setItems((c) => {
      const idx = c.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) { const copy = [...c]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 }; return copy; }
      return [...c, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.price) }];
    });
    setProductQuery("");
  };
  const updateQty = (idx: number, delta: number) =>
    setItems((c) => c.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  const removeItem = (idx: number) => setItems((c) => c.filter((_, i) => i !== idx));

  const valid = customerName.trim() && items.length > 0 && reservationDate && deposit <= total;

  const save = async () => {
    if (!valid) return;
    setError(null);
    try {
      await upsert.mutateAsync({
        reference: `RES-${Date.now().toString(36).toUpperCase()}`,
        customer_id: customerId, customer_name: customerName.trim(), customer_phone: customerPhone.trim() || null,
        items, total, deposit, reservation_date: reservationDate, notes: notes.trim() || null,
      });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer la réservation."); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Nouvelle réservation</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client *</span>
              <input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerId(null); }} placeholder="Nom du client"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Téléphone</span>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+225 …"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
          </div>
          {!customerId && customerName.trim().length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {customers.filter((c) => c.name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => pickCustomer(c)} className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary hover:text-primary">
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Articles *</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Chercher un produit à ajouter…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            {filteredProducts.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border bg-card">
                {filteredProducts.map((p) => (
                  <button key={p.id} onClick={() => addItem(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{p.name}</span><span className="tabular text-xs text-muted-foreground">{formatXOF(Number(p.price))}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          {items.length > 0 && (
            <div className="divide-y divide-border rounded-xl border border-border">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                    <button onClick={() => updateQty(i, -1)} className="grid h-6 w-6 place-items-center rounded hover:bg-background">−</button>
                    <span className="tabular w-6 text-center text-xs font-bold">{it.quantity}</span>
                    <button onClick={() => updateQty(i, 1)} className="grid h-6 w-6 place-items-center rounded hover:bg-background">+</button>
                  </div>
                  <span className="tabular w-20 text-right font-semibold">{formatXOF(it.unit_price * it.quantity)}</span>
                  <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date de retrait *</span>
              <input type="date" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avance versée</span>
              <input type="number" onFocus={selectOnFocus} min={0} max={total} value={deposit}
                onChange={(e) => setDeposit(Math.max(0, Math.min(total, Number(e.target.value) || 0)))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>

          <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
            <span className="font-semibold">Total · Reste</span>
            <span className="tabular font-bold">{formatXOF(total)} · {formatXOF(Math.max(0, total - deposit))} restant</span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={save} disabled={!valid || upsert.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer la réservation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
