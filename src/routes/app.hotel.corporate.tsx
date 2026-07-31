// Module Comptes entreprise & agences ZegHotel (Phase 4) — hotel_corporate_accounts
// existait déjà côté Paramètres > Tarification (remise négociée, conditions
// de facturation) ; cette vue dédiée ajoute le suivi réel des factures en
// attente/réglées (facturation différée, migration 031) et un relevé
// mensuel par compte.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Plus, X, Trash2, Save, Receipt, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import {
  useHotelCorporateAccounts, useUpsertHotelCorporateAccount, useDeleteHotelCorporateAccount,
  useHotelCorporateInvoices, useMarkCorporateInvoicePaid,
  type HotelCorporateAccount, type HotelCorporateInvoice,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/corporate")({
  component: CorporatePage,
});

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function CorporatePage() {
  const formatMoney = useFormatMoney();
  const { data: accounts = [], isLoading: loadingAccounts } = useHotelCorporateAccounts();
  const { data: invoices = [], isLoading: loadingInvoices } = useHotelCorporateInvoices();
  const upsert = useUpsertHotelCorporateAccount();
  const remove = useDeleteHotelCorporateAccount();
  const markPaid = useMarkCorporateInvoicePaid();

  const [edit, setEdit] = useState<Partial<HotelCorporateAccount> | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const pending = invoices.filter((i) => !i.corporate_paid_at);
  const pendingTotal = pending.reduce((s, i) => s + i.total, 0);

  const invoicesByAccount = useMemo(() => {
    const map = new Map<string, HotelCorporateInvoice[]>();
    for (const inv of invoices) {
      if (!inv.corporate_account_id) continue;
      (map.get(inv.corporate_account_id) ?? map.set(inv.corporate_account_id, []).get(inv.corporate_account_id)!).push(inv);
    }
    return map;
  }, [invoices]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  return (
    <div>
      <PageHeader
        title="Comptes entreprise & agences"
        subtitle="Facturation différée par compte — relevé mensuel"
        actions={
          <button onClick={() => setEdit({ name: "" })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau compte
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Comptes entreprise" value={String(accounts.length)} icon={<Building2 className="h-5 w-5" />} accent="primary" />
          <StatCard label="Factures en attente" value={String(pending.length)} icon={<Clock className="h-5 w-5" />} accent="destructive" />
          <StatCard label="Montant en attente" value={formatMoney(pendingTotal)} icon={<Receipt className="h-5 w-5" />} accent="accent" />
        </div>

        {loadingAccounts ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="text-sm text-muted-foreground">Aucun compte entreprise pour l'instant.</div>
            <button onClick={() => setEdit({ name: "" })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((a) => {
              const accInvoices = invoicesByAccount.get(a.id) ?? [];
              const accPending = accInvoices.filter((i) => !i.corporate_paid_at);
              const accPendingTotal = accPending.reduce((s, i) => s + i.total, 0);
              return (
                <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setSelectedAccountId(a.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-muted-foreground shrink-0" /> {a.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{a.contact_name ?? "—"} {a.contact_email ? `· ${a.contact_email}` : ""}</div>
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => setEdit(a)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Save className="h-4 w-4" /></button>
                      <button onClick={() => { if (confirm(`Supprimer ${a.name} ?`)) remove.mutate(a.id); }} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                    <div><div className="uppercase tracking-wider text-muted-foreground">Remise</div><div className="tabular font-bold">{a.negotiated_discount_pct}%</div></div>
                    <div><div className="uppercase tracking-wider text-muted-foreground">Factures dues</div><div className="tabular font-bold">{accPending.length}</div></div>
                    <div><div className="uppercase tracking-wider text-muted-foreground">Montant dû</div><div className={cn("tabular font-bold", accPendingTotal > 0 ? "text-destructive" : "text-success")}>{formatMoney(accPendingTotal)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Receipt className="h-4 w-4" /> Factures en attente
          </div>
          {loadingInvoices ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : pending.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm text-success">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> Aucune facture en attente.
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((inv) => (
                <InvoiceRow key={inv.folio_id} invoice={inv} accountName={accounts.find((a) => a.id === inv.corporate_account_id)?.name ?? "—"}
                  onMarkPaid={() => markPaid.mutate(inv.folio_id)} busy={markPaid.isPending} formatMoney={formatMoney} />
              ))}
            </div>
          )}
        </div>
      </div>

      {edit && (
        <CorporateDialog initial={edit} onClose={() => setEdit(null)}
          onSave={async (a) => { await upsert.mutateAsync(a); setEdit(null); }} />
      )}
      {selectedAccount && (
        <StatementModal account={selectedAccount} invoices={invoicesByAccount.get(selectedAccount.id) ?? []}
          onClose={() => setSelectedAccountId(null)} formatMoney={formatMoney} />
      )}
    </div>
  );
}

function InvoiceRow({ invoice, accountName, onMarkPaid, busy, formatMoney }: {
  invoice: HotelCorporateInvoice; accountName: string; onMarkPaid: () => void; busy: boolean; formatMoney: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="truncate font-semibold">{accountName} — {invoice.guest_name}</div>
        <div className="text-xs text-muted-foreground">
          Départ {new Date(invoice.check_out).toLocaleDateString("fr-FR")}
          {invoice.closed_at && ` · clôturée le ${new Date(invoice.closed_at).toLocaleDateString("fr-FR")}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="tabular font-bold text-destructive">{formatMoney(invoice.total)}</span>
        <button disabled={busy} onClick={onMarkPaid}
          className="flex items-center gap-1 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success hover:bg-success/20 disabled:opacity-40">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Marquer réglé
        </button>
      </div>
    </div>
  );
}

function StatementModal({ account, invoices, onClose, formatMoney }: {
  account: HotelCorporateAccount; invoices: HotelCorporateInvoice[]; onClose: () => void; formatMoney: (n: number) => string;
}) {
  const byMonth = useMemo(() => {
    const map = new Map<string, HotelCorporateInvoice[]>();
    for (const inv of invoices) {
      const key = monthKey(inv.closed_at ?? inv.check_out);
      (map.get(key) ?? map.set(key, []).get(key)!).push(inv);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [invoices]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Relevé — {account.name}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {byMonth.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune facture pour ce compte.</div>
          ) : (
            byMonth.map(([key, monthInvoices]) => {
              const total = monthInvoices.reduce((s, i) => s + i.total, 0);
              const monthPending = monthInvoices.filter((i) => !i.corporate_paid_at).reduce((s, i) => s + i.total, 0);
              return (
                <div key={key} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-bold capitalize">
                    <span>{monthLabel(key)}</span>
                    <span>{formatMoney(total)}</span>
                  </div>
                  <div className="space-y-1">
                    {monthInvoices.map((inv) => (
                      <div key={inv.folio_id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{inv.guest_name} — {new Date(inv.check_out).toLocaleDateString("fr-FR")}</span>
                        <span className={cn("tabular", !inv.corporate_paid_at && "font-semibold text-destructive")}>{formatMoney(inv.total)}</span>
                      </div>
                    ))}
                  </div>
                  {monthPending > 0 && (
                    <div className="mt-2 border-t border-border pt-2 text-xs font-semibold text-destructive">Reste dû : {formatMoney(monthPending)}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function CorporateDialog({ initial, onClose, onSave }: {
  initial: Partial<HotelCorporateAccount>; onClose: () => void; onSave: (a: Partial<HotelCorporateAccount> & { name: string }) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<HotelCorporateAccount>>(initial);
  const [saving, setSaving] = useState(false);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial.id ? "Modifier le compte" : "Nouveau compte entreprise"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom de l'entreprise *</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Contact</div><input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div><input value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Email</div><input value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Remise négociée (%)</div><input type="number" onFocus={selectOnFocus} value={form.negotiated_discount_pct ?? 0} onChange={(e) => setForm({ ...form, negotiated_discount_pct: Number(e.target.value) })} className={inp} /></label>
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Conditions de facturation</div><textarea rows={2} value={form.billing_terms ?? ""} onChange={(e) => setForm({ ...form, billing_terms: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          <div className="flex gap-2 pt-1 sm:col-span-2">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button disabled={!form.name?.trim() || saving}
              onClick={async () => { setSaving(true); try { await onSave(form as Partial<HotelCorporateAccount> & { name: string }); } finally { setSaving(false); } }}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
