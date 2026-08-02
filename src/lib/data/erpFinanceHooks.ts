// Data layer ZegERP — module 5/10 : Finance (migration 054). Aucun rôle
// nouveau (owner/manager/accountant uniquement, validé — pas de trésorier
// séparé). Solde jamais écrit directement côté client : erp_cash_account_
// balances n'a aucune policy insert/update/delete, maintenue exclusivement
// par apply_erp_cash_transaction() (trigger).
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

function useErpRealtimeInvalidate(table: string, onChange: () => void) {
  const organizationId = useOrganizationId();
  const instanceId = useId();
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`erp_${table}_${organizationId}_${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, table, instanceId]);
}

// ============ Types ============
export type ErpCashAccount = {
  id: string; organization_id: string; name: string; type: "cash" | "bank";
  account_number: string | null; is_active: boolean; created_at: string;
  balance: number;
};
export type ErpFundTransferStatus = "draft" | "confirmed";
export type ErpFundTransfer = {
  id: string; organization_id: string; from_account_id: string; to_account_id: string; amount: number;
  reference: string | null; notes: string | null; status: ErpFundTransferStatus; created_at: string; confirmed_at: string | null;
  from_account: { name: string } | null; to_account: { name: string } | null;
};
export type ErpCashTransactionType = "in" | "out" | "transfer_in" | "transfer_out";
export type ErpCashTransaction = {
  id: string; organization_id: string; cash_account_id: string; type: ErpCashTransactionType;
  amount: number; reference: string | null; reason: string | null; created_at: string;
  erp_cash_accounts: { name: string } | null;
};

// ============ Comptes caisse/banque (jointure avec le solde, maintenu par
// trigger — jamais écrit directement) ============
export function useErpCashAccounts() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_cash_account_balances", () => qc.invalidateQueries({ queryKey: ["erp_cash_accounts", organizationId] }));
  return useQuery({
    queryKey: ["erp_cash_accounts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCashAccount[]> => {
      const { data, error } = await supabase.from("erp_cash_accounts").select("*, erp_cash_account_balances(balance)").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((a) => ({ ...a, balance: a.erp_cash_account_balances?.[0]?.balance ?? 0 })) as ErpCashAccount[];
    },
  });
}
export function useUpsertErpCashAccount() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; type: "cash" | "bank"; account_number?: string | null; is_active?: boolean }) => {
      const { data, error } = await supabase.from("erp_cash_accounts").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCashAccount;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_cash_accounts", organizationId] }),
  });
}
export function useDeleteErpCashAccount() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_cash_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_cash_accounts", organizationId] }),
  });
}

// ============ Transactions manuelles (in/out directes — transfer_in/out
// exclus, réservés à confirm_erp_fund_transfer()) ============
export function useErpCashTransactions(accountId?: string) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_cash_transactions", () => qc.invalidateQueries({ queryKey: ["erp_cash_transactions", organizationId] }));
  return useQuery({
    queryKey: ["erp_cash_transactions", organizationId, accountId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpCashTransaction[]> => {
      let q = supabase.from("erp_cash_transactions").select("*, erp_cash_accounts(name)").eq("organization_id", organizationId!);
      if (accountId) q = q.eq("cash_account_id", accountId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ErpCashTransaction[];
    },
  });
}
export function useCreateErpCashTransaction() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cash_account_id: string; type: "in" | "out"; amount: number; reference?: string; reason?: string }) => {
      const { data, error } = await supabase.from("erp_cash_transactions").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpCashTransaction;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_cash_transactions", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_cash_accounts", organizationId] });
    },
  });
}

// ============ Virements internes ============
export function useErpFundTransfers() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useErpRealtimeInvalidate("erp_fund_transfers", () => qc.invalidateQueries({ queryKey: ["erp_fund_transfers", organizationId] }));
  return useQuery({
    queryKey: ["erp_fund_transfers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpFundTransfer[]> => {
      const { data, error } = await supabase.from("erp_fund_transfers")
        .select("*, from_account:erp_cash_accounts!erp_fund_transfers_from_account_id_fkey(name), to_account:erp_cash_accounts!erp_fund_transfers_to_account_id_fkey(name)")
        .eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpFundTransfer[];
    },
  });
}
export function useUpsertErpFundTransfer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { from_account_id: string; to_account_id: string; amount: number; reference?: string; notes?: string }) => {
      const { data, error } = await supabase.from("erp_fund_transfers").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpFundTransfer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_fund_transfers", organizationId] }),
  });
}
// confirm_erp_fund_transfer() (RPC security definer, migration 054) : crée
// la paire transfer_out/transfer_in — jamais d'écriture directe de `status`.
export function useConfirmErpFundTransfer() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase.rpc("confirm_erp_fund_transfer", { p_organization_id: organizationId, p_transfer_id: transferId });
      if (error) throw error;
      return data as ErpFundTransfer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp_fund_transfers", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_cash_accounts", organizationId] });
      qc.invalidateQueries({ queryKey: ["erp_cash_transactions", organizationId] });
    },
  });
}
