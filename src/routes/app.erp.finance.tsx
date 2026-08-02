// Finance ZegERP (Frontend Phase 5) — Comptes / Virements / Transactions.
// Aucun rôle nouveau (owner/manager/accountant, validé — pas de trésorier
// séparé, voir ARCHITECTURE_ERP.md).
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, Landmark, ArrowLeftRight, History, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import {
  useErpCashAccounts, useUpsertErpCashAccount, useDeleteErpCashAccount,
  useErpCashTransactions, useCreateErpCashTransaction,
  useErpFundTransfers, useUpsertErpFundTransfer, useConfirmErpFundTransfer,
  type ErpCashAccount, type ErpFundTransfer,
} from "@/lib/data/erpFinanceHooks";

export const Route = createFileRoute("/app/erp/finance")({
  component: ErpFinancePage,
});

const TABS = [
  { k: "comptes", label: "Comptes", icon: Landmark },
  { k: "virements", label: "Virements", icon: ArrowLeftRight },
  { k: "transactions", label: "Transactions", icon: History },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpFinancePage() {
  const [tab, setTab] = useState<TabKey>("comptes");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "accountant";

  return (
    <div>
      <PageHeader title="Finance" subtitle="Comptes caisse/banque, virements internes et transactions" />
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

        {tab === "comptes" && <AccountsTab canManage={canManage} />}
        {tab === "virements" && <TransfersTab canManage={canManage} />}
        {tab === "transactions" && <TransactionsTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ============ Comptes ============
function AccountsTab({ canManage }: { canManage: boolean }) {
  const { data: accounts = [], isLoading } = useErpCashAccounts();
  const upsert = useUpsertErpCashAccount();
  const remove = useDeleteErpCashAccount();
  const formatMoney = useFormatMoney();
  const [editing, setEditing] = useState<ErpCashAccount | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau compte
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun compte pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {a.name}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{a.type === "cash" ? "Caisse" : "Banque"}</span>
                  {!a.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactif</span>}
                </div>
                {a.account_number && <div className="text-xs text-muted-foreground">{a.account_number}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={cn("font-mono font-semibold", a.balance < 0 ? "text-destructive" : "text-foreground")}>{formatMoney(a.balance)}</span>
                {canManage && (
                  <>
                    <button onClick={() => setEditing(a)} className="text-muted-foreground hover:text-primary">Modifier</button>
                    <button onClick={() => { if (confirm(`Supprimer "${a.name}" ?`)) remove.mutate(a.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function AccountDialog({ account, onClose, onSave }: { account: ErpCashAccount | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpCashAccount> }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<"cash" | "bank">(account?.type ?? "cash");
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? "");
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try { await onSave.mutateAsync({ id: account?.id, name: name.trim(), type, account_number: accountNumber.trim() || null, is_active: isActive }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le compte."); }
  };

  return (
    <Dialog title={account ? "Modifier le compte" : "Nouveau compte"} onClose={onClose}>
      <Field label="Nom *" value={name} onChange={setName} placeholder="Ex : Caisse principale" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as "cash" | "bank")} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="cash">Caisse</option><option value="bank">Banque</option>
        </select>
      </label>
      <Field label="Numéro de compte" value={accountNumber} onChange={setAccountNumber} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border" /> Actif
      </label>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!name.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Virements internes ============
function TransfersTab({ canManage }: { canManage: boolean }) {
  const { data: transfers = [], isLoading } = useErpFundTransfers();
  const { data: accounts = [] } = useErpCashAccounts();
  const upsert = useUpsertErpFundTransfer();
  const confirm = useConfirmErpFundTransfer();
  const formatMoney = useFormatMoney();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doConfirm = async (t: ErpFundTransfer) => {
    setError(null);
    try { await confirm.mutateAsync(t.id); }
    catch (e: any) { setError(e?.message ?? "Impossible de confirmer ce virement."); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau virement
          </button>
        </div>
      )}
      <ErrorBanner error={error} />
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun virement pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {transfers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{t.from_account?.name ?? "—"} → {t.to_account?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{t.reference || "Sans référence"} · {formatMoney(t.amount)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", t.status === "confirmed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                  {t.status === "confirmed" ? "Confirmé" : "Brouillon"}
                </span>
                {canManage && t.status === "draft" && (
                  <button onClick={() => doConfirm(t)} disabled={confirm.isPending} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-40">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <TransferCreateDialog accounts={accounts} upsert={upsert} onClose={() => setCreating(false)} />}
    </div>
  );
}
function TransferCreateDialog({ accounts, upsert, onClose }: { accounts: ErpCashAccount[]; upsert: ReturnType<typeof useUpsertErpFundTransfer>; onClose: () => void }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = fromId && toId && fromId !== toId && amount > 0;

  const create = async () => {
    if (!valid) return;
    setError(null);
    try { await upsert.mutateAsync({ from_account_id: fromId, to_account_id: toId, amount, reference: reference.trim() || undefined }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le virement."); }
  };

  return (
    <Dialog title="Nouveau virement" onClose={onClose}>
      <SelectField label="Compte source *" value={fromId} onChange={setFromId} options={accounts} />
      <SelectField label="Compte destination *" value={toId} onChange={setToId} options={accounts.filter((a) => a.id !== fromId)} />
      <NumberField label="Montant *" value={amount} onChange={setAmount} width="w-full" />
      <Field label="Référence" value={reference} onChange={setReference} />
      {fromId && toId && fromId === toId && <div className="text-xs text-destructive">Les comptes source et destination doivent être différents.</div>}
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!valid} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}

// ============ Transactions manuelles ============
function TransactionsTab({ canManage }: { canManage: boolean }) {
  const { data: transactions = [], isLoading } = useErpCashTransactions();
  const { data: accounts = [] } = useErpCashAccounts();
  const formatMoney = useFormatMoney();
  const [creating, setCreating] = useState(false);

  const TYPE_LABEL: Record<string, string> = { in: "Encaissement", out: "Décaissement", transfer_in: "Virement (entrée)", transfer_out: "Virement (sortie)" };
  const isPositive = (t: string) => t === "in" || t === "transfer_in";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvelle transaction
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune transaction pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{t.erp_cash_accounts?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{TYPE_LABEL[t.type]}{t.reference && ` · ${t.reference}`} · {new Date(t.created_at).toLocaleString("fr-FR")}</div>
              </div>
              <span className={cn("shrink-0 font-mono text-sm font-semibold", isPositive(t.type) ? "text-success" : "text-destructive")}>{isPositive(t.type) ? "+" : "-"}{formatMoney(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {creating && <TransactionCreateDialog accounts={accounts} onClose={() => setCreating(false)} />}
    </div>
  );
}
function TransactionCreateDialog({ accounts, onClose }: { accounts: ErpCashAccount[]; onClose: () => void }) {
  const create = useCreateErpCashTransaction();
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = accountId && amount > 0;

  const submit = async () => {
    if (!valid) return;
    setError(null);
    try { await create.mutateAsync({ cash_account_id: accountId, type, amount, reason: reason.trim() || undefined }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer la transaction."); }
  };

  return (
    <Dialog title="Nouvelle transaction" onClose={onClose}>
      <SelectField label="Compte *" value={accountId} onChange={setAccountId} options={accounts} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as "in" | "out")} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="in">Encaissement</option><option value="out">Décaissement</option>
        </select>
      </label>
      <NumberField label="Montant *" value={amount} onChange={setAmount} width="w-full" />
      <Field label="Motif" value={reason} onChange={setReason} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={submit} disabled={!valid} pending={create.isPending} />
    </Dialog>
  );
}

// ============ Composants partagés ============
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">{children}</div>
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
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function NumberField({ label, value, onChange, width = "w-full" }: { label: string; value: number; onChange: (v: number) => void; width?: string }) {
  return (
    <div className={width}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="number" value={value} onFocus={selectOnFocus} onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
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
