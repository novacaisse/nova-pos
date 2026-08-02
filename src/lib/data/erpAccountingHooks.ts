// Data layer ZegERP — module 6/10 : Comptabilité (migration 055). Aucun
// rôle nouveau (owner/manager/accountant, même périmètre que Finance).
// Saisie manuelle en V1 (aucune écriture générée automatiquement depuis
// Achats/Ventes/Finance).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

// ============ Types ============
export type ErpChartAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type ErpChartOfAccount = {
  id: string; organization_id: string; parent_id: string | null; code: string; name: string;
  type: ErpChartAccountType; is_active: boolean; created_at: string;
};
export type ErpAccountingJournal = { id: string; organization_id: string; code: string; name: string; created_at: string };
export type ErpAccountingPeriodStatus = "open" | "closed";
export type ErpAccountingPeriod = {
  id: string; organization_id: string; label: string; start_date: string; end_date: string;
  status: ErpAccountingPeriodStatus; closed_at: string | null; created_at: string;
};
export type ErpJournalEntryStatus = "draft" | "posted";
export type ErpJournalEntry = {
  id: string; organization_id: string; journal_id: string; entry_date: string; reference: string | null;
  description: string | null; status: ErpJournalEntryStatus; created_at: string; posted_at: string | null;
  erp_accounting_journals: { name: string; code: string } | null;
};
export type ErpJournalEntryLine = {
  id: string; organization_id: string; entry_id: string; account_id: string; debit: number; credit: number; label: string | null;
  erp_chart_of_accounts: { code: string; name: string } | null;
};
export type ErpBankReconciliationStatus = "in_progress" | "completed";
export type ErpBankReconciliation = {
  id: string; organization_id: string; cash_account_id: string; statement_date: string;
  statement_balance: number; reconciled_balance: number | null; status: ErpBankReconciliationStatus;
  notes: string | null; created_at: string; completed_at: string | null;
  erp_cash_accounts: { name: string } | null;
};

// ============ Plan comptable ============
export function useErpChartOfAccounts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_chart_of_accounts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpChartOfAccount[]> => {
      const { data, error } = await supabase.from("erp_chart_of_accounts").select("*").eq("organization_id", organizationId!).order("code");
      if (error) throw error;
      return (data ?? []) as ErpChartOfAccount[];
    },
  });
}
export function useUpsertErpChartOfAccount() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; code: string; name: string; type: ErpChartAccountType; is_active?: boolean }) => {
      const { data, error } = await supabase.from("erp_chart_of_accounts").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpChartOfAccount;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_chart_of_accounts", organizationId] }),
  });
}
export function useDeleteErpChartOfAccount() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_chart_of_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_chart_of_accounts", organizationId] }),
  });
}

// ============ Journaux ============
export function useErpAccountingJournals() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_accounting_journals", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpAccountingJournal[]> => {
      const { data, error } = await supabase.from("erp_accounting_journals").select("*").eq("organization_id", organizationId!).order("code");
      if (error) throw error;
      return (data ?? []) as ErpAccountingJournal[];
    },
  });
}
export function useUpsertErpAccountingJournal() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; code: string; name: string }) => {
      const { data, error } = await supabase.from("erp_accounting_journals").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpAccountingJournal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_accounting_journals", organizationId] }),
  });
}
export function useDeleteErpAccountingJournal() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_accounting_journals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_accounting_journals", organizationId] }),
  });
}

// ============ Périodes comptables ============
export function useErpAccountingPeriods() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_accounting_periods", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpAccountingPeriod[]> => {
      const { data, error } = await supabase.from("erp_accounting_periods").select("*").eq("organization_id", organizationId!).order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpAccountingPeriod[];
    },
  });
}
export function useUpsertErpAccountingPeriod() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; start_date: string; end_date: string }) => {
      const { data, error } = await supabase.from("erp_accounting_periods").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpAccountingPeriod;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_accounting_periods", organizationId] }),
  });
}
// Clôture/réouverture : simple UPDATE direct (aucun mouvement de stock/cash
// généré par ce changement de statut lui-même — voir migration 055). L'effet
// de blocage se joue au niveau des policies erp_journal_entries, pas ici.
export function useToggleErpAccountingPeriod() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, close }: { id: string; close: boolean }) => {
      const { error } = await supabase.from("erp_accounting_periods")
        .update(close ? { status: "closed", closed_at: new Date().toISOString() } : { status: "open", closed_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_accounting_periods", organizationId] }),
  });
}

// ============ Écritures comptables (partie double) ============
export function useErpJournalEntries() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_journal_entries", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpJournalEntry[]> => {
      const { data, error } = await supabase.from("erp_journal_entries")
        .select("*, erp_accounting_journals(name, code)").eq("organization_id", organizationId!).order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpJournalEntry[];
    },
  });
}
export function useErpJournalEntryLines(entryId: string | null) {
  return useQuery({
    queryKey: ["erp_journal_entry_lines", entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<ErpJournalEntryLine[]> => {
      const { data, error } = await supabase.from("erp_journal_entry_lines").select("*, erp_chart_of_accounts(code, name)").eq("entry_id", entryId!);
      if (error) throw error;
      return (data ?? []) as unknown as ErpJournalEntryLine[];
    },
  });
}
export function useUpsertErpJournalEntry() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { journal_id: string; entry_date: string; reference?: string; description?: string }) => {
      const { data, error } = await supabase.from("erp_journal_entries").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpJournalEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_journal_entries", organizationId] }),
  });
}
export function useUpsertErpJournalEntryLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entry_id: string; account_id: string; debit: number; credit: number; label?: string }) => {
      const { data, error } = await supabase.from("erp_journal_entry_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpJournalEntryLine;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_journal_entry_lines", vars.entry_id] }),
  });
}
export function useDeleteErpJournalEntryLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; entryId: string }) => {
      const { error } = await supabase.from("erp_journal_entry_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_journal_entry_lines", vars.entryId] }),
  });
}
export function useDeleteErpJournalEntry() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_journal_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_journal_entries", organizationId] }),
  });
}
// post_erp_journal_entry() (RPC security definer, migration 055) : vérifie
// l'équilibre débit = crédit et la non-clôture de la période — jamais
// d'écriture directe de `status`.
export function usePostErpJournalEntry() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.rpc("post_erp_journal_entry", { p_organization_id: organizationId, p_entry_id: entryId });
      if (error) throw error;
      return data as ErpJournalEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_journal_entries", organizationId] }),
  });
}

// ============ Rapprochements bancaires ============
export function useErpBankReconciliations() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_bank_reconciliations", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpBankReconciliation[]> => {
      const { data, error } = await supabase.from("erp_bank_reconciliations")
        .select("*, erp_cash_accounts(name)").eq("organization_id", organizationId!).order("statement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpBankReconciliation[];
    },
  });
}
export function useErpBankReconciliationLines(reconciliationId: string | null) {
  return useQuery({
    queryKey: ["erp_bank_reconciliation_lines", reconciliationId],
    enabled: !!reconciliationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_bank_reconciliation_lines")
        .select("*, erp_cash_transactions(type, amount, reference, created_at)").eq("reconciliation_id", reconciliationId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
export function useUpsertErpBankReconciliation() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cash_account_id: string; statement_date: string; statement_balance: number; notes?: string }) => {
      const { data, error } = await supabase.from("erp_bank_reconciliations").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpBankReconciliation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_bank_reconciliations", organizationId] }),
  });
}
export function useAddErpBankReconciliationLine() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reconciliation_id: string; cash_transaction_id: string }) => {
      const { data, error } = await supabase.from("erp_bank_reconciliation_lines").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_bank_reconciliation_lines", vars.reconciliation_id] }),
  });
}
export function useRemoveErpBankReconciliationLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; reconciliationId: string }) => {
      const { error } = await supabase.from("erp_bank_reconciliation_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_bank_reconciliation_lines", vars.reconciliationId] }),
  });
}
// complete_erp_bank_reconciliation() (RPC security definer, migration 055) :
// recalcule reconciled_balance à partir des lignes pointées.
export function useCompleteErpBankReconciliation() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reconciliationId: string) => {
      const { data, error } = await supabase.rpc("complete_erp_bank_reconciliation", { p_organization_id: organizationId, p_reconciliation_id: reconciliationId });
      if (error) throw error;
      return data as ErpBankReconciliation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_bank_reconciliations", organizationId] }),
  });
}
