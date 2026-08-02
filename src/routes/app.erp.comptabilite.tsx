// Comptabilité ZegERP (Frontend Phase 6) — Plan comptable / Journaux /
// Périodes / Écritures / Rapprochements. Aucun rôle nouveau (owner/manager/
// accountant). L'équilibre débit=crédit et le blocage sur période clôturée
// sont vérifiés côté serveur (post_erp_journal_entry()) — jamais fait
// confiance au calcul client seul, qui n'est là que pour le confort de saisie.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, BookOpen, FolderTree, CalendarClock, ListChecks, Landmark, Lock, Unlock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole, useFormatMoney } from "@/lib/data/hooks";
import { cn, selectOnFocus } from "@/lib/utils";
import { useErpCashAccounts, useErpCashTransactions } from "@/lib/data/erpFinanceHooks";
import {
  useErpChartOfAccounts, useUpsertErpChartOfAccount, useDeleteErpChartOfAccount,
  useErpAccountingJournals, useUpsertErpAccountingJournal, useDeleteErpAccountingJournal,
  useErpAccountingPeriods, useUpsertErpAccountingPeriod, useToggleErpAccountingPeriod,
  useErpJournalEntries, useErpJournalEntryLines, useUpsertErpJournalEntry, useUpsertErpJournalEntryLine,
  useDeleteErpJournalEntryLine, useDeleteErpJournalEntry, usePostErpJournalEntry,
  useErpBankReconciliations, useErpBankReconciliationLines, useUpsertErpBankReconciliation,
  useAddErpBankReconciliationLine, useRemoveErpBankReconciliationLine, useCompleteErpBankReconciliation,
  type ErpChartOfAccount, type ErpChartAccountType, type ErpAccountingJournal, type ErpJournalEntry, type ErpBankReconciliation,
} from "@/lib/data/erpAccountingHooks";

export const Route = createFileRoute("/app/erp/comptabilite")({
  component: ErpComptabilitePage,
});

const TABS = [
  { k: "plan", label: "Plan comptable", icon: FolderTree },
  { k: "journaux", label: "Journaux", icon: BookOpen },
  { k: "periodes", label: "Périodes", icon: CalendarClock },
  { k: "ecritures", label: "Écritures", icon: ListChecks },
  { k: "rapprochements", label: "Rapprochements", icon: Landmark },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpComptabilitePage() {
  const [tab, setTab] = useState<TabKey>("ecritures");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "accountant";

  return (
    <div>
      <PageHeader title="Comptabilité" subtitle="Plan comptable, journaux, périodes, écritures et rapprochements" />
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

        {tab === "plan" && <ChartOfAccountsTab canManage={canManage} />}
        {tab === "journaux" && <JournalsTab canManage={canManage} />}
        {tab === "periodes" && <PeriodsTab canManage={canManage} />}
        {tab === "ecritures" && <EntriesTab canManage={canManage} />}
        {tab === "rapprochements" && <ReconciliationsTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ============ Plan comptable ============
const ACCOUNT_TYPE_LABEL: Record<ErpChartAccountType, string> = { asset: "Actif", liability: "Passif", equity: "Capitaux propres", revenue: "Produit", expense: "Charge" };
function ChartOfAccountsTab({ canManage }: { canManage: boolean }) {
  const { data: accounts = [], isLoading } = useErpChartOfAccounts();
  const upsert = useUpsertErpChartOfAccount();
  const remove = useDeleteErpChartOfAccount();
  const [editing, setEditing] = useState<ErpChartOfAccount | null | "new">(null);

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
              <div className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{a.code}</span> <span className="font-medium">{a.name}</span></div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</span>
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
      {editing && <ChartAccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function ChartAccountDialog({ account, onClose, onSave }: { account: ErpChartOfAccount | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpChartOfAccount> }) {
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<ErpChartAccountType>(account?.type ?? "expense");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!code.trim() || !name.trim()) return;
    setError(null);
    try { await onSave.mutateAsync({ id: account?.id, code: code.trim(), name: name.trim(), type }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le compte."); }
  };

  return (
    <Dialog title={account ? "Modifier le compte" : "Nouveau compte"} onClose={onClose}>
      <Field label="Code SYSCOHADA *" value={code} onChange={setCode} placeholder="Ex : 601000" />
      <Field label="Libellé *" value={name} onChange={setName} placeholder="Ex : Achats de marchandises" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as ErpChartAccountType)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!code.trim() || !name.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Journaux ============
function JournalsTab({ canManage }: { canManage: boolean }) {
  const { data: journals = [], isLoading } = useErpAccountingJournals();
  const upsert = useUpsertErpAccountingJournal();
  const remove = useDeleteErpAccountingJournal();
  const [editing, setEditing] = useState<ErpAccountingJournal | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau journal
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : journals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun journal pour l'instant. (Suggestion SYSCOHADA : VE vente, AC achat, BQ banque, CA caisse, OD opérations diverses)</div>
      ) : (
        <div className="divide-y divide-border">
          {journals.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div><span className="font-mono text-xs text-muted-foreground">{j.code}</span> <span className="font-medium">{j.name}</span></div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(j)} className="text-muted-foreground hover:text-primary">Modifier</button>
                  <button onClick={() => { if (confirm(`Supprimer "${j.name}" ?`)) remove.mutate(j.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <JournalDialog journal={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function JournalDialog({ journal, onClose, onSave }: { journal: ErpAccountingJournal | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpAccountingJournal> }) {
  const [code, setCode] = useState(journal?.code ?? "");
  const [name, setName] = useState(journal?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!code.trim() || !name.trim()) return;
    setError(null);
    try { await onSave.mutateAsync({ id: journal?.id, code: code.trim(), name: name.trim() }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le journal."); }
  };

  return (
    <Dialog title={journal ? "Modifier le journal" : "Nouveau journal"} onClose={onClose}>
      <Field label="Code *" value={code} onChange={setCode} placeholder="Ex : VE" />
      <Field label="Nom *" value={name} onChange={setName} placeholder="Ex : Journal des ventes" />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!code.trim() || !name.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Périodes ============
function PeriodsTab({ canManage }: { canManage: boolean }) {
  const { data: periods = [], isLoading } = useErpAccountingPeriods();
  const upsert = useUpsertErpAccountingPeriod();
  const toggle = useToggleErpAccountingPeriod();
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvelle période
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : periods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune période pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.start_date} → {p.end_date}</div></div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", p.status === "closed" ? "bg-muted text-muted-foreground" : "bg-success/15 text-success")}>
                  {p.status === "closed" ? "Clôturée" : "Ouverte"}
                </span>
                {canManage && (
                  <button onClick={() => toggle.mutate({ id: p.id, close: p.status === "open" })} disabled={toggle.isPending}
                    className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-40">
                    {p.status === "open" ? <><Lock className="h-3.5 w-3.5" /> Clôturer</> : <><Unlock className="h-3.5 w-3.5" /> Rouvrir</>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <PeriodCreateDialog upsert={upsert} onClose={() => setCreating(false)} />}
    </div>
  );
}
function PeriodCreateDialog({ upsert, onClose }: { upsert: ReturnType<typeof useUpsertErpAccountingPeriod>; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = label.trim() && startDate && endDate && endDate >= startDate;

  const create = async () => {
    if (!valid) return;
    setError(null);
    try { await upsert.mutateAsync({ label: label.trim(), start_date: startDate, end_date: endDate }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la période."); }
  };

  return (
    <Dialog title="Nouvelle période" onClose={onClose}>
      <Field label="Libellé *" value={label} onChange={setLabel} placeholder="Ex : Janvier 2026" />
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Début *" value={startDate} onChange={setStartDate} />
        <DateField label="Fin *" value={endDate} onChange={setEndDate} />
      </div>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!valid} pending={upsert.isPending} />
    </Dialog>
  );
}

// ============ Écritures (partie double) ============
function EntriesTab({ canManage }: { canManage: boolean }) {
  const { data: entries = [], isLoading } = useErpJournalEntries();
  const { data: journals = [] } = useErpAccountingJournals();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpJournalEntry | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} disabled={journals.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            <Plus className="h-4 w-4" /> Nouvelle écriture
          </button>
        </div>
      )}
      {journals.length === 0 && canManage && (
        <div className="mb-3 rounded-xl border border-dashed border-warning/40 bg-warning/5 p-3 text-xs text-warning">Créez d'abord un journal (onglet Journaux).</div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune écriture pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((e) => (
            <button key={e.id} onClick={() => setSelected(e)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0">
                <div className="font-medium">{e.erp_accounting_journals?.code ?? "—"} · {e.reference || e.description || "Sans référence"}</div>
                <div className="text-xs text-muted-foreground">{e.entry_date}</div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", e.status === "posted" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {e.status === "posted" ? "Comptabilisée" : "Brouillon"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <EntryCreateDialog journals={journals} onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); setSelected(e); }} />}
      {selected && <EntryDetailDialog entry={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function EntryCreateDialog({ journals, onClose, onCreated }: { journals: ErpAccountingJournal[]; onClose: () => void; onCreated: (e: ErpJournalEntry) => void }) {
  const upsert = useUpsertErpJournalEntry();
  const [journalId, setJournalId] = useState(journals[0]?.id ?? "");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!journalId || !entryDate) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ journal_id: journalId, entry_date: entryDate, reference: reference.trim() || undefined, description: description.trim() || undefined })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer l'écriture."); }
  };

  return (
    <Dialog title="Nouvelle écriture" onClose={onClose}>
      <SelectField label="Journal *" value={journalId} onChange={setJournalId} options={journals.map((j) => ({ id: j.id, name: `${j.code} — ${j.name}` }))} />
      <DateField label="Date *" value={entryDate} onChange={setEntryDate} />
      <Field label="Référence" value={reference} onChange={setReference} />
      <Field label="Description" value={description} onChange={setDescription} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!journalId || !entryDate} pending={upsert.isPending} label="Créer le brouillon" />
    </Dialog>
  );
}
function EntryDetailDialog({ entry, canManage, onClose }: { entry: ErpJournalEntry; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpJournalEntryLines(entry.id);
  const { data: accounts = [] } = useErpChartOfAccounts();
  const addLine = useUpsertErpJournalEntryLine();
  const removeLine = useDeleteErpJournalEntryLine();
  const post = usePostErpJournalEntry();
  const formatMoney = useFormatMoney();
  const [accountId, setAccountId] = useState("");
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isDraft = entry.status === "draft";

  const add = async () => {
    if (!accountId || amount <= 0) return;
    setError(null);
    try {
      await addLine.mutateAsync({ entry_id: entry.id, account_id: accountId, debit: side === "debit" ? amount : 0, credit: side === "credit" ? amount : 0, label: label.trim() || undefined });
      setAccountId(""); setAmount(0); setLabel("");
    } catch (e: any) { setError(e?.message ?? "Impossible d'ajouter la ligne."); }
  };
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const doPost = async () => {
    setError(null);
    try { await post.mutateAsync(entry.id); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de comptabiliser cette écriture."); }
  };

  return (
    <Dialog title={`${entry.erp_accounting_journals?.code ?? "—"} — ${entry.reference || entry.description || "Sans référence"}`} onClose={onClose} wide>
      {isDraft && canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compte</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="w-28">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sens</span>
            <select value={side} onChange={(e) => setSide(e.target.value as "debit" | "credit")} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="debit">Débit</option><option value="credit">Crédit</option>
            </select>
          </div>
          <NumberField label="Montant" value={amount} onChange={setAmount} width="w-24" />
          <button onClick={add} disabled={!accountId || amount <= 0 || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune ligne pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.erp_chart_of_accounts?.code ?? "—"} — {l.erp_chart_of_accounts?.name ?? "—"}</span>
              <div className="flex items-center gap-3">
                <span className="w-20 text-right font-mono text-xs">{l.debit > 0 ? formatMoney(l.debit) : ""}</span>
                <span className="w-20 text-right font-mono text-xs">{l.credit > 0 ? formatMoney(l.credit) : ""}</span>
                {isDraft && canManage && <button onClick={() => removeLine.mutate({ id: l.id, entryId: entry.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-6 pt-2 text-sm font-semibold">
            <span>Débit : {formatMoney(totalDebit)}</span>
            <span>Crédit : {formatMoney(totalCredit)}</span>
            {!balanced && <span className="text-destructive">Déséquilibrée</span>}
          </div>
        </div>
      )}
      <ErrorBanner error={error} />
      {isDraft && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={doPost} disabled={!balanced || post.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {post.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Comptabiliser
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ============ Rapprochements bancaires ============
function ReconciliationsTab({ canManage }: { canManage: boolean }) {
  const { data: reconciliations = [], isLoading } = useErpBankReconciliations();
  const { data: accounts = [] } = useErpCashAccounts();
  const formatMoney = useFormatMoney();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ErpBankReconciliation | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau rapprochement
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : reconciliations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun rapprochement pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {reconciliations.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <div className="min-w-0"><div className="font-medium">{r.erp_cash_accounts?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.statement_date} · Relevé {formatMoney(r.statement_balance)}</div></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {r.status === "completed" ? "Clôturé" : "En cours"}
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <ReconciliationCreateDialog accounts={accounts} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setSelected(r); }} />}
      {selected && <ReconciliationDetailDialog reconciliation={selected} canManage={canManage} onClose={() => setSelected(null)} />}
    </div>
  );
}
function ReconciliationCreateDialog({ accounts, onClose, onCreated }: { accounts: { id: string; name: string }[]; onClose: () => void; onCreated: (r: ErpBankReconciliation) => void }) {
  const upsert = useUpsertErpBankReconciliation();
  const [accountId, setAccountId] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!accountId || !statementDate) return;
    setError(null);
    try { onCreated(await upsert.mutateAsync({ cash_account_id: accountId, statement_date: statementDate, statement_balance: statementBalance })); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer le rapprochement."); }
  };

  return (
    <Dialog title="Nouveau rapprochement" onClose={onClose}>
      <SelectField label="Compte *" value={accountId} onChange={setAccountId} options={accounts} />
      <DateField label="Date du relevé *" value={statementDate} onChange={setStatementDate} />
      <NumberField label="Solde du relevé" value={statementBalance} onChange={setStatementBalance} width="w-full" />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!accountId || !statementDate} pending={upsert.isPending} />
    </Dialog>
  );
}
function ReconciliationDetailDialog({ reconciliation, canManage, onClose }: { reconciliation: ErpBankReconciliation; canManage: boolean; onClose: () => void }) {
  const { data: lines = [], isLoading } = useErpBankReconciliationLines(reconciliation.id);
  const { data: transactions = [] } = useErpCashTransactions(reconciliation.cash_account_id);
  const addLine = useAddErpBankReconciliationLine();
  const removeLine = useRemoveErpBankReconciliationLine();
  const complete = useCompleteErpBankReconciliation();
  const formatMoney = useFormatMoney();
  const [transactionId, setTransactionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isInProgress = reconciliation.status === "in_progress";
  const pointedIds = new Set(lines.map((l: any) => l.cash_transaction_id));
  const available = transactions.filter((t) => !pointedIds.has(t.id));

  const add = async () => {
    if (!transactionId) return;
    setError(null);
    try { await addLine.mutateAsync({ reconciliation_id: reconciliation.id, cash_transaction_id: transactionId }); setTransactionId(""); }
    catch (e: any) { setError(e?.message ?? "Impossible de pointer cette transaction."); }
  };
  const doComplete = async () => {
    setError(null);
    try { await complete.mutateAsync(reconciliation.id); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de clôturer ce rapprochement."); }
  };

  return (
    <Dialog title={`${reconciliation.erp_cash_accounts?.name ?? "—"} — ${reconciliation.statement_date}`} onClose={onClose} wide>
      {isInProgress && canManage && (
        <div className="flex items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pointer une transaction</span>
            <select value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>
              {available.map((t) => <option key={t.id} value={t.id}>{t.reference || t.type} — {formatMoney(t.amount)} ({new Date(t.created_at).toLocaleDateString("fr-FR")})</option>)}
            </select>
          </div>
          <button onClick={add} disabled={!transactionId || addLine.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune transaction pointée pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {lines.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.erp_cash_transactions?.reference || l.erp_cash_transactions?.type}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{formatMoney(l.erp_cash_transactions?.amount ?? 0)}</span>
                {isInProgress && canManage && <button onClick={() => removeLine.mutate({ id: l.id, reconciliationId: reconciliation.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {reconciliation.reconciled_balance != null && (
        <div className="text-sm">Solde pointé : <span className="font-semibold">{formatMoney(reconciliation.reconciled_balance)}</span> (relevé : {formatMoney(reconciliation.statement_balance)})</div>
      )}
      <ErrorBanner error={error} />
      {isInProgress && canManage && (
        <div className="flex justify-end pt-2">
          <button onClick={doComplete} disabled={complete.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {complete.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Clôturer le rapprochement
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
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
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
