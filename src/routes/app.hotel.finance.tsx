// Module Finance ZegHotel (mission "Round 2 ZegHotel", Phase C — scope
// confirmé : version simplifiée, PAS de duplication du Finance+Comptabilité
// complet de ZegERP, migrations 054-057 : pas de grand livre, pas de plan
// comptable, pas de virements inter-comptes).
//
// Deux volets : comptes de trésorerie déclarés (purement informatifs,
// migration 090) et rapprochements périodiques — le solde théorique
// (computeTreasurySystemTotal, hotelHooks.ts) est calculé à partir des
// données déjà collectées ailleurs (hotel_payments, hotel_pos_sales,
// expenses) par méthode de paiement, mappée sur le type de compte
// (cash → "Espèces", tout le reste → "Banque"). Approximatif par nature
// (une même méthode peut recouvrir plusieurs comptes bancaires réels) —
// présenté comme tel à l'écran, pas comme un rapprochement comptable strict.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Landmark, Wallet2, Plus, X, Save, Trash2, Loader2, Scale, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PeriodSelector, periodRange, type Period } from "@/components/app/PeriodSelector";
import { useFormatMoney, useMyRole, useExpenses } from "@/lib/data/hooks";
import {
  useHotelTreasuryAccounts, useUpsertHotelTreasuryAccount, useDeleteHotelTreasuryAccount,
  useHotelTreasuryReconciliations, useCreateHotelTreasuryReconciliation, useDeleteHotelTreasuryReconciliation,
  useHotelPaymentsInRange, useHotelPosSales, computeTreasurySystemTotal,
  type HotelTreasuryAccount, type TreasuryAccountType,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/finance")({
  component: HotelFinancePage,
});

const TYPE_LABEL: Record<TreasuryAccountType, string> = { cash: "Caisse", bank: "Banque" };

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function HotelFinancePage() {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const { data: accounts = [], isLoading } = useHotelTreasuryAccounts();
  const [editAccount, setEditAccount] = useState<Partial<HotelTreasuryAccount> | null>(null);
  const [delAccount, setDelAccount] = useState<HotelTreasuryAccount | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const activeAccountId = selectedAccountId || accounts[0]?.id || "";
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const totalOpeningBalance = accounts.reduce((s, a) => s + a.opening_balance, 0);

  return (
    <div>
      <PageHeader title="Finance" subtitle="Trésorerie et rapprochements — comptes déclarés, soldes indicatifs"
        actions={canManage && (
          <button onClick={() => setEditAccount({ name: "", type: "cash", opening_balance: 0 })}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau compte
          </button>
        )} />

      <div className="space-y-5 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Comptes déclarés" value={String(accounts.length)} icon={<Landmark className="h-5 w-5" />} accent="primary" />
          <StatCard label="Solde d'ouverture cumulé" value={formatMoney(totalOpeningBalance)} icon={<Wallet2 className="h-5 w-5" />} accent="accent" />
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="text-sm text-muted-foreground">Aucun compte de trésorerie déclaré.</div>
            {canManage && (
              <button onClick={() => setEditAccount({ name: "", type: "cash", opening_balance: 0 })}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                <Plus className="h-4 w-4" /> Déclarer un compte
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelectedAccountId(a.id)}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                    a.id === activeAccountId ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted")}>
                  {a.type === "cash" ? <Wallet2 className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  {a.name}
                  {canManage && (
                    <span className="ml-1 flex items-center gap-1">
                      <span onClick={(e) => { e.stopPropagation(); setEditAccount(a); }}
                        className="grid h-5 w-5 place-items-center rounded hover:bg-muted-foreground/10">✎</span>
                      <span onClick={(e) => { e.stopPropagation(); setDelAccount(a); }}
                        className="grid h-5 w-5 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeAccount && <AccountReconciliationPanel account={activeAccount} canManage={canManage} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {editAccount && (
          <AccountDialog initial={editAccount} onClose={() => setEditAccount(null)} />
        )}
        {delAccount && (
          <ConfirmDialog title={`Supprimer le compte « ${delAccount.name} » ?`} onClose={() => setDelAccount(null)} accountId={delAccount.id} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function AccountDialog({ initial, onClose }: { initial: Partial<HotelTreasuryAccount>; onClose: () => void }) {
  const upsert = useUpsertHotelTreasuryAccount();
  const [form, setForm] = useState<Partial<HotelTreasuryAccount>>(initial);
  const isNew = !initial.id;
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.name?.trim()) { setError("Le nom du compte est requis."); return; }
    try {
      await upsert.mutateAsync({ ...form, name: form.name.trim(), type: form.type ?? "cash", opening_balance: Number(form.opening_balance || 0) });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{isNew ? "Nouveau compte" : "Modifier le compte"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div>
          <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Caisse principale, Compte Ecobank…" className={inp} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Type</div>
            <select value={form.type ?? "cash"} onChange={(e) => setForm({ ...form, type: e.target.value as TreasuryAccountType })} className={inp}>
              <option value="cash">Caisse (espèces)</option>
              <option value="bank">Banque</option>
            </select></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Solde d'ouverture</div>
            <input type="number" onFocus={selectOnFocus} value={form.opening_balance ?? 0} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} className={inp} /></label>
        </div>
        <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">N° de compte (optionnel)</div>
          <input value={form.account_number ?? ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className={inp} /></label>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={submit} disabled={upsert.isPending}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, onClose, accountId }: { title: string; onClose: () => void; accountId: string }) {
  const remove = useDeleteHotelTreasuryAccount();
  return (
    <Overlay onClose={onClose} w="max-w-sm">
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">Les rapprochements déjà enregistrés pour ce compte seront aussi supprimés. Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={async () => { await remove.mutateAsync(accountId); onClose(); }}
            className="h-11 flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">Supprimer</button>
        </div>
      </div>
    </Overlay>
  );
}

function AccountReconciliationPanel({ account, canManage }: { account: HotelTreasuryAccount; canManage: boolean }) {
  const formatMoney = useFormatMoney();
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from: fromDate, to: toDate } = periodRange(period, customFrom, customTo);
  const rangeStart = toISO(fromDate);
  const rangeEnd = toISO(toDate);

  const { data: payments = [] } = useHotelPaymentsInRange(rangeStart, rangeEnd);
  const { data: posSales = [] } = useHotelPosSales({ from: fromDate.toISOString(), to: toDate.toISOString() });
  const { data: allExpenses = [] } = useExpenses();
  const expensesInRange = useMemo(() => allExpenses.filter((e) => {
    const d = new Date(e.paid_at + "T12:00:00"); return d >= fromDate && d <= toDate;
  }), [allExpenses, fromDate, toDate]);

  const systemTotal = useMemo(() => computeTreasurySystemTotal(account.type, payments, posSales, expensesInRange),
    [account.type, payments, posSales, expensesInRange]);

  const [statementAmount, setStatementAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const create = useCreateHotelTreasuryReconciliation();
  const remove = useDeleteHotelTreasuryReconciliation();
  const { data: history = [] } = useHotelTreasuryReconciliations(account.id);

  const difference = statementAmount - systemTotal;

  const submit = async () => {
    await create.mutateAsync({
      account_id: account.id, period_start: rangeStart, period_end: rangeEnd,
      system_total: systemTotal, statement_amount: statementAmount, notes: notes.trim() || undefined,
    });
    setStatementAmount(0); setNotes("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Rapprocher — {account.name} ({TYPE_LABEL[account.type]})</div>
          <PeriodSelector period={period} onChange={setPeriod}
            customFrom={customFrom} customTo={customTo}
            onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Solde théorique (système)</div>
            <div className="tabular mt-1 text-lg font-bold">{formatMoney(systemTotal)}</div>
          </div>
          <label className="block rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Montant compté / relevé</div>
            <input type="number" onFocus={selectOnFocus} value={statementAmount}
              onChange={(e) => setStatementAmount(Number(e.target.value))}
              disabled={!canManage}
              className="tabular mt-1 w-full bg-transparent text-center text-lg font-bold outline-none disabled:opacity-60" />
          </label>
          <div className={cn("rounded-xl border p-3 text-center",
            Math.abs(difference) < 1 ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10")}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Écart</div>
            <div className={cn("tabular mt-1 flex items-center justify-center gap-1.5 text-lg font-bold",
              Math.abs(difference) < 1 ? "text-success" : "text-destructive")}>
              {Math.abs(difference) < 1 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {formatMoney(difference)}
            </div>
          </div>
        </div>
        {canManage && (
          <>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optionnel)…"
              className="mt-3 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            <button onClick={submit} disabled={create.isPending}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />} Enregistrer le rapprochement
            </button>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold">Historique des rapprochements</div>
        {history.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Aucun rapprochement enregistré pour ce compte.</div>
        ) : (
          <div className="space-y-1">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{new Date(r.period_start).toLocaleDateString("fr-FR")} — {new Date(r.period_end).toLocaleDateString("fr-FR")}</div>
                  {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("tabular text-xs font-bold", Math.abs(r.difference) < 1 ? "text-success" : "text-destructive")}>
                    {formatMoney(r.difference)}
                  </span>
                  {canManage && (
                    <button onClick={() => remove.mutate(r.id)} className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
