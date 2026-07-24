import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, Search, X, Send, ArrowRightLeft, Trash2, Edit3, CheckCircle2, Loader2, Printer } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import {
  useQuotes, useUpsertQuote, useDeleteQuote, useMarkQuoteConverted,
  useCreateSale, useCustomers, useProducts, useMyRole, useShopSettings, useFormatMoney,
  type QuoteWithItems, type QuoteStatus,
} from "@/lib/data/hooks";
import { useShop } from "@/lib/auth/ShopProvider";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/devis")({
  component: DevisPage,
});

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Brouillon", sent: "Envoyé", accepted: "Accepté",
  refused: "Refusé", converted: "Converti", expired: "Expiré",
};

function DevisPage() {
  const formatXOF = useFormatMoney();
  const { currentShop } = useShop();
  const { data: settings } = useShopSettings();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = periodRange(period, customFrom, customTo);

  const { data: quotes = [], isLoading } = useQuotes({ from: from.toISOString(), to: to.toISOString(), limit: 1000 });
  const { data: myRole } = useMyRole();
  const upsert = useUpsertQuote();
  const remove = useDeleteQuote();
  const canManage = myRole === "owner" || myRole === "manager";

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [editing, setEditing] = useState<QuoteWithItems | null>(null);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<QuoteWithItems | null>(null);

  const filtered = useMemo(() => quotes.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (!query.trim()) return true;
    const s = query.toLowerCase();
    return q.reference.toLowerCase().includes(s) || (q.customers?.name ?? "").toLowerCase().includes(s);
  }), [quotes, status, query]);

  const total = filtered.reduce((s, q) => s + q.total, 0);
  const accepted = quotes.filter((q) => q.status === "accepted" || q.status === "converted").length;

  const printQuote = (q: QuoteWithItems) => {
    const bodyHtml = `
      <div class="doc-parties">
        <div class="block"><h2>Client</h2><div class="name">${q.customers?.name ?? "—"}</div></div>
        <div class="block" style="text-align:right"><h2>Valide jusqu'au</h2><div class="name">${q.valid_until ? new Date(q.valid_until).toLocaleDateString("fr-FR") : "—"}</div></div>
      </div>
      <table class="doc-table">
        <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Total</th></tr></thead>
        <tbody>${q.quote_items.map((l) => `<tr><td>${l.name}</td><td class="num">${l.quantity}</td><td class="num">${formatXOF(l.unit_price)}</td><td class="num">${formatXOF(l.total)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="doc-totals">
        <div class="row"><span>Sous-total</span><span>${formatXOF(q.subtotal)}</span></div>
        ${q.discount > 0 ? `<div class="row"><span>Remise</span><span>-${formatXOF(q.discount)}</span></div>` : ""}
        <div class="row total"><span>Total</span><span>${formatXOF(q.total)}</span></div>
      </div>
      ${q.notes ? `<div class="doc-notes">${q.notes}</div>` : ""}`;
    const html = renderA4Document({
      docTitle: "Devis",
      docNumber: q.reference,
      docDate: new Date(q.created_at).toLocaleDateString("fr-FR"),
      shop: {
        shopName: currentShop?.name ?? "Boutique",
        logoUrl: currentShop?.logo_url,
        address: settings?.data.address,
        phone: settings?.data.phone,
        ifu: settings?.data.ifu,
      },
      bodyHtml,
      footerHtml: "Devis généré par ZegCaisse — sujet à modification jusqu'à acceptation.",
    });
    openPrintWindow(html, { width: 900, height: 700 });
  };

  return (
    <div>
      <PageHeader title="Devis" subtitle={`${quotes.length} devis · conversion en vente en un clic`}
        actions={
          <>
            <PeriodSelector period={period} onChange={setPeriod}
              customFrom={customFrom} customTo={customTo}
              onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
              <Plus className="h-4 w-4" /> Nouveau devis
            </button>
          </>
        }
      />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Devis" value={String(quotes.length)} icon={<FileText className="h-5 w-5" />} accent="primary" />
          <StatCard label="Acceptés / Convertis" value={String(accepted)} icon={<CheckCircle2 className="h-5 w-5" />} accent="success" />
          <StatCard label="Montant filtré" value={formatXOF(total)} accent="accent" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Réf., client…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {(Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[]).map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Réf.</th><th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Créé</th><th className="px-4 py-3">Valide jusqu'au</th>
                  <th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{q.reference}</td>
                    <td className="px-4 py-3 font-medium">{q.customers?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{q.valid_until ? new Date(q.valid_until).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        q.status === "accepted" && "bg-success/15 text-success",
                        q.status === "converted" && "bg-primary/15 text-primary",
                        q.status === "sent" && "bg-accent/25 text-accent-foreground",
                        q.status === "draft" && "bg-muted text-muted-foreground",
                        (q.status === "refused" || q.status === "expired") && "bg-destructive/15 text-destructive",
                      )}>{QUOTE_STATUS_LABEL[q.status]}</span>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(q.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => printQuote(q)} title="Imprimer / PDF"
                          className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted">
                          <Printer className="h-4 w-4" />
                        </button>
                        {canManage && q.status !== "converted" && (
                          <button onClick={() => setConverting(q)} title="Convertir en vente"
                            className="grid h-8 w-8 place-items-center rounded-lg text-primary hover:bg-primary/10">
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button onClick={() => setEditing(q)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                            <button onClick={() => { if (confirm(`Supprimer le devis ${q.reference} ?`)) remove.mutate(q.id); }}
                              className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">Aucun devis</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {(editing || creating) && (
          <QuoteEditor
            initial={editing}
            onClose={() => { setEditing(null); setCreating(false); }}
            onSave={async (input) => {
              try {
                await upsert.mutateAsync(input);
                setEditing(null); setCreating(false);
              } catch (e: any) {
                alert("Erreur enregistrement devis : " + (e?.message ?? "inconnue"));
              }
            }}
          />
        )}
        {converting && (
          <ConvertDialog quote={converting} onClose={() => setConverting(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuoteEditor({ initial, onClose, onSave }: {
  initial: QuoteWithItems | null;
  onClose: () => void;
  onSave: (input: Parameters<ReturnType<typeof useUpsertQuote>["mutateAsync"]>[0]) => void;
}) {
  const formatXOF = useFormatMoney();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const [customerId, setCustomerId] = useState<string | null>(initial?.customer_id ?? null);
  const [validUntil, setValidUntil] = useState(initial?.valid_until?.slice(0, 10)
    ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState(
    initial?.quote_items.map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity, unit_price: l.unit_price })) ?? [],
  );
  const [productSel, setProductSel] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productSel && products.length) setProductSel(products[0].id);
  }, [products, productSel]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const addLine = () => {
    const p = products.find((x) => x.id === productSel);
    if (!p || qty <= 0) return;
    setLines((l) => [...l, { product_id: p.id, name: p.name, quantity: qty, unit_price: p.price }]);
    setQty(1);
  };

  const save = async () => {
    setSaving(true);
    await onSave({
      id: initial?.id,
      reference: initial?.reference,
      customer_id: customerId,
      valid_until: validUntil,
      status: initial?.status,
      items: lines,
    });
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial ? `Modifier ${initial.reference}` : "Nouveau devis"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Client</div>
              <select value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value || null)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="">Sans client</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label><div className="mb-1 text-xs font-semibold text-muted-foreground">Valide jusqu'au</div>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            </label>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Ajouter un article</div>
            <div className="flex gap-2">
              <select value={productSel} onChange={(e) => setProductSel(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm">
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatXOF(p.price)}</option>)}
              </select>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="h-10 w-20 rounded-xl border border-border bg-background px-2 text-center text-sm" />
              <button onClick={addLine} className="rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">Ajouter</button>
            </div>
          </div>

          <div className="rounded-xl border border-border">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Aucun article</div>
            ) : lines.map((l, i) => {
              const image = l.product_id ? products.find((p) => p.id === l.product_id)?.image_url : null;
              return (
                <div key={i} className={cn("flex items-center gap-3 p-3", i > 0 && "border-t border-border/60")}>
                  <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-sm">
                    {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : "📦"}
                  </div>
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.quantity} × {formatXOF(l.unit_price)}</div></div>
                  <div className="tabular text-sm font-bold">{formatXOF(l.quantity * l.unit_price)}</div>
                  <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                    <X className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="tabular font-display text-2xl font-bold">{formatXOF(total)}</span>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={save} disabled={lines.length === 0 || saving} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Étape de paiement avant de finaliser la conversion devis → vente (option
// validée) : on ne fabrique pas silencieusement une vente "payée comptant"
// sans savoir ce qui s'est réellement passé au comptoir.
function ConvertDialog({ quote, onClose }: { quote: QuoteWithItems; onClose: () => void }) {
  const formatXOF = useFormatMoney();
  const createSale = useCreateSale();
  const markConverted = useMarkQuoteConverted();
  const [method, setMethod] = useState<"cash" | "mobile_money" | "card" | "credit">("cash");
  const [paid, setPaid] = useState(String(quote.total));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paidNum = Number(paid) || 0;
  const due = Math.max(0, quote.total - paidNum);

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const sale = await createSale.mutateAsync({
        reference: quote.reference.replace(/^DEV/, "T"),
        customer_id: quote.customer_id,
        items: quote.quote_items.map((it) => ({
          product_id: it.product_id, name: it.name,
          quantity: it.quantity, unit_price: it.unit_price,
        })),
        // "partially_refunded" désigne un remboursement partiel, pas un
        // solde restant à encaisser — une conversion sous-payée est une
        // vente à crédit normale (même convention que Nouvelle vente).
        payment_method: due > 0 ? "credit" : method,
        paid: paidNum,
        notes: `Converti depuis devis ${quote.reference}`,
      });
      await markConverted.mutateAsync({ quoteId: quote.id, saleId: sale.id });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="bg-gradient-to-br from-primary to-primary-glow px-6 py-5 text-primary-foreground">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-80">Convertir {quote.reference} en vente</div>
          <div className="font-display tabular mt-1 text-4xl font-black">{formatXOF(quote.total)}</div>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-4 gap-2">
            {([
              { k: "cash", label: "Espèces" }, { k: "mobile_money", label: "Mobile Money" },
              { k: "card", label: "Carte" }, { k: "credit", label: "Crédit" },
            ] as const).map((m) => (
              <button key={m.k} onClick={() => setMethod(m.k)}
                className={cn("rounded-xl border py-2 text-xs font-semibold",
                  method === m.k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                {m.label}
              </button>
            ))}
          </div>
          <label className="block">
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Montant reçu</div>
            <input type="number" value={paid} onChange={(e) => setPaid(e.target.value)}
              className="tabular h-12 w-full rounded-xl border border-border bg-background px-4 text-xl font-bold outline-none focus:border-primary" />
          </label>
          {due > 0 && (
            <div className="rounded-xl bg-muted p-3 text-sm">
              <span className="font-semibold">Solde dû après conversion : </span>
              <span className="text-destructive">{formatXOF(due)}</span>
            </div>
          )}
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold disabled:opacity-50">Annuler</button>
            <button onClick={confirm} disabled={busy || paidNum < 0} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-success to-primary-glow text-sm font-bold text-primary-foreground disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Valider la conversion
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
