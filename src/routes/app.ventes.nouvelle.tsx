import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search, Plus, Minus, Trash2, User, X, Loader2, Check, Banknote, Smartphone, CreditCard, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useProducts, useCustomers, useCreateSale, useMyRole, useTeamPermissions, formatXOF, newTicketRef,
  type ProductWithStock, type Customer, type Sale,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

// Écran de saisie back-office, distinct de la Caisse : pas de scan
// code-barres ni de tickets en attente — pensé pour enregistrer une vente
// déjà convenue (téléphone, comptoir sans POS) rapidement, avec recherche
// produit/client simple plutôt que la grille tactile de /app/caisse.
export const Route = createFileRoute("/app/ventes/nouvelle")({
  component: NouvelleVentePage,
});

type Line = { product_id: string | null; name: string; unit_price: number; quantity: number };

const PAY_LABEL: Record<Sale["payment_method"], string> = {
  cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", credit: "Crédit", mixed: "Mixte",
};
const PAY_ICON: Record<Sale["payment_method"], typeof Banknote> = {
  cash: Banknote, mobile_money: Smartphone, card: CreditCard, credit: Wallet, mixed: Wallet,
};

function NouvelleVentePage() {
  const navigate = useNavigate();
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const createSale = useCreateSale();
  const { data: myRole } = useMyRole();
  const perms = useTeamPermissions();
  const canDiscount = myRole !== "cashier" || perms.cashier_can_discount;

  const [productQuery, setProductQuery] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<Sale["payment_method"]>("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) =>
      p.is_active && (p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
    ).slice(0, 8);
  }, [products, productQuery]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)
    ).slice(0, 6);
  }, [customers, customerQuery]);

  const addProduct = (p: ProductWithStock) => {
    setCart((c) => {
      const idx = c.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...c, { product_id: p.id, name: p.name, unit_price: Number(p.price), quantity: 1 }];
    });
    setProductQuery("");
  };
  const updateQty = (i: number, delta: number) =>
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  const updatePrice = (i: number, price: number) =>
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, unit_price: Math.max(0, price) } : l)));
  const removeLine = (i: number) => setCart((c) => c.filter((_, idx) => idx !== i));

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountAmt = Math.max(0, Math.min(Math.round(subtotal), Math.round(discount)));
  const total = Math.max(0, subtotal - discountAmt);
  const [paid, setPaid] = useState<number | null>(null);
  const paidAmount = paid ?? total;

  const submit = async () => {
    if (cart.length === 0) return;
    setError(null);
    try {
      const sale = await createSale.mutateAsync({
        reference: newTicketRef("V"),
        customer_id: customer?.id ?? null,
        items: cart.map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity, unit_price: l.unit_price })),
        discount: discountAmt,
        payment_method: paidAmount < total ? "credit" : method,
        paid: paidAmount,
        notes: notes.trim() || undefined,
      });
      navigate({ to: "/app/ventes", search: { q: sale.reference } });
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div>
      <PageHeader title="Nouvelle vente" subtitle="Saisie manuelle (téléphone, comptoir sans caisse)" />

      <div className="grid gap-4 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Articles</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Rechercher un produit (nom, SKU)…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              {filteredProducts.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-elegant">
                  {filteredProducts.map((p) => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">{formatXOF(Number(p.price))} · stock {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {cart.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Aucun article. Recherchez un produit ci-dessus pour l'ajouter.
                </div>
              ) : cart.map((l, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <input type="number" min={0} value={l.unit_price} onChange={(e) => updatePrice(i, Number(e.target.value) || 0)}
                      className="tabular mt-1 h-7 w-28 rounded-lg border border-border bg-background px-2 text-xs" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(i, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-muted"><Minus className="h-3 w-3" /></button>
                    <span className="tabular w-8 text-center text-sm font-bold">{l.quantity}</span>
                    <button onClick={() => updateQty(i, 1)} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="tabular w-20 shrink-0 text-right text-sm font-semibold">{formatXOF(l.unit_price * l.quantity)}</div>
                  <button onClick={() => removeLine(i)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client (optionnel)</div>
            {customer ? (
              <div className="flex items-center gap-2 rounded-xl border border-border p-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {customer.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1 truncate text-sm font-medium">{customer.name}</div>
                <button onClick={() => setCustomer(null)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Nom ou téléphone… (sinon comptoir)"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                {filteredCustomers.length > 0 && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-elegant">
                    {filteredCustomers.map((c) => (
                      <button key={c.id} onClick={() => { setCustomer(c); setCustomerQuery(""); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paiement</div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sous-total</span><span className="tabular font-semibold">{formatXOF(subtotal)}</span></div>
              {canDiscount && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Remise (montant)</span>
                  <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="tabular h-9 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm" />
                </label>
              )}
              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <span className="text-sm font-semibold">Total</span>
                <span className="tabular font-display text-lg font-bold">{formatXOF(total)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PAY_LABEL) as Sale["payment_method"][]).filter((k) => k !== "credit" && k !== "mixed").map((k) => {
                  const Icon = PAY_ICON[k];
                  return (
                    <button key={k} onClick={() => setMethod(k)}
                      className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold",
                        method === k ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                      <Icon className="h-3.5 w-3.5" /> {PAY_LABEL[k]}
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Montant reçu</span>
                <input type="number" min={0} value={paidAmount} onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))}
                  className="tabular h-9 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm" />
              </label>
              {paidAmount < total && (
                <div className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                  Vente à crédit — solde dû {formatXOF(total - paidAmount)}.
                </div>
              )}

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-2 text-sm" />
              </label>

              {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

              <button onClick={submit} disabled={cart.length === 0 || createSale.isPending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-sm font-bold text-primary-foreground shadow-elegant disabled:opacity-40">
                {createSale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Enregistrer la vente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
