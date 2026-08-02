// Data layer ZegERP — module 10/10 : Administration (migration 060).
// Une seule ligne par organisation, pas créée automatiquement à la
// provision (pas de trigger dédié) — le frontend fait un upsert au premier
// enregistrement, même principe que organization_settings (useShopSettings/
// useUpdateShopSettings dans hooks.ts). Lecture élargie à accountant
// (numérotation facture/devis + mois de clôture fiscal) ; écriture
// réservée owner/manager côté RLS.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

export type ErpSettings = {
  organization_id: string;
  default_warehouse_id: string | null;
  invoice_prefix: string;
  quote_prefix: string;
  fiscal_year_start_month: number;
};

const EMPTY_ERP_SETTINGS: Omit<ErpSettings, "organization_id"> = {
  default_warehouse_id: null, invoice_prefix: "FAC-", quote_prefix: "DEV-", fiscal_year_start_month: 1,
};

export function useErpSettings() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_settings", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpSettings> => {
      const { data, error } = await supabase.from("erp_settings").select("*").eq("organization_id", organizationId!).maybeSingle();
      if (error) throw error;
      return (data as ErpSettings | null) ?? { organization_id: organizationId!, ...EMPTY_ERP_SETTINGS };
    },
  });
}

export function useUpdateErpSettings() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<ErpSettings, "organization_id">>) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("erp_settings").upsert({ organization_id: organizationId, ...patch }, { onConflict: "organization_id" }).select().single();
      if (error) throw error;
      return data as ErpSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_settings", organizationId] }),
  });
}
