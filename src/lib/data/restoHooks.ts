// ZegResto — hooks Supabase, multi-tenant (organization_id), même
// conventions que hooks.ts (ZegCaisse) et hotelHooks.ts (ZegHotel) : RLS
// fait foi côté serveur, le filtre organization_id ici est ceinture +
// bretelles. Toutes les tables sont préfixées resto_ (migrations 035-041).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id ?? null;
}

// ============ TYPES ============
export type RestoZone = {
  id: string; organization_id: string; nom: string; ordre: number; created_at: string;
};
export type TableStatut = "libre" | "occupee" | "reservee" | "nettoyage";
export type RestoTable = {
  id: string; organization_id: string; zone_id: string | null; numero: string;
  capacite: number; statut: TableStatut; position_x: number; position_y: number;
  created_at: string;
  zone?: RestoZone | null;
};
export type RestoMenuCategory = {
  id: string; organization_id: string; nom: string; ordre: number; created_at: string;
};
export type RestoMenuItem = {
  id: string; organization_id: string; category_id: string | null;
  nom: string; description: string | null; prix: number; photo_url: string | null;
  disponible: boolean; temps_preparation_min: number | null; station: string | null;
  created_at: string;
};
export type RestoModifier = {
  id: string; organization_id: string; nom: string; created_at: string;
};
export type RestoModifierOption = {
  id: string; modifier_id: string; nom: string; impact_prix: number; created_at: string;
};

// ============ ZONES ============
export function useRestoZones() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_zones", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoZone[]> => {
      const { data, error } = await supabase.from("resto_zones")
        .select("*").eq("organization_id", organizationId!).order("ordre");
      if (error) throw error;
      return data as RestoZone[];
    },
  });
}
export function useUpsertRestoZone() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (z: Partial<RestoZone> & { nom: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_zones")
        .upsert({ ...z, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_zones", organizationId] }),
  });
}
export function useDeleteRestoZone() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_zones", organizationId] }),
  });
}

// ============ TABLES ============
export function useRestoTables() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_tables", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoTable[]> => {
      const { data, error } = await supabase.from("resto_tables")
        .select("*, zone:resto_zones(*)").eq("organization_id", organizationId!).order("numero");
      if (error) throw error;
      return data as RestoTable[];
    },
  });
}
export function useUpsertRestoTable() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<RestoTable> & { numero: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { zone, ...rest } = t as any;
      const { data, error } = await supabase.from("resto_tables")
        .upsert({ ...rest, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_tables", organizationId] }),
  });
}
export function useUpdateRestoTableStatut() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: TableStatut }) => {
      const { error } = await supabase.from("resto_tables").update({ statut }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_tables", organizationId] }),
  });
}
export function useDeleteRestoTable() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_tables", organizationId] }),
  });
}

// ============ MENU : CATÉGORIES ============
export function useRestoMenuCategories() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_menu_categories", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoMenuCategory[]> => {
      const { data, error } = await supabase.from("resto_menu_categories")
        .select("*").eq("organization_id", organizationId!).order("ordre");
      if (error) throw error;
      return data as RestoMenuCategory[];
    },
  });
}
export function useUpsertRestoMenuCategory() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<RestoMenuCategory> & { nom: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_menu_categories")
        .upsert({ ...c, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_menu_categories", organizationId] }),
  });
}
export function useDeleteRestoMenuCategory() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_menu_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_menu_categories", organizationId] }),
  });
}

// ============ MENU : ARTICLES ============
export function useRestoMenuItems() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_menu_items", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoMenuItem[]> => {
      const { data, error } = await supabase.from("resto_menu_items")
        .select("*").eq("organization_id", organizationId!).order("nom");
      if (error) throw error;
      return data as RestoMenuItem[];
    },
  });
}
export function useUpsertRestoMenuItem() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: Partial<RestoMenuItem> & { nom: string; prix: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_menu_items")
        .upsert({ ...i, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_menu_items", organizationId] }),
  });
}
export function useDeleteRestoMenuItem() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_menu_items", organizationId] }),
  });
}

// ============ MODIFICATEURS ============
export function useRestoModifiers() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_modifiers", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoModifier[]> => {
      const { data, error } = await supabase.from("resto_modifiers")
        .select("*").eq("organization_id", organizationId!).order("nom");
      if (error) throw error;
      return data as RestoModifier[];
    },
  });
}
export function useUpsertRestoModifier() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Partial<RestoModifier> & { nom: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_modifiers")
        .upsert({ ...m, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_modifiers", organizationId] }),
  });
}
export function useDeleteRestoModifier() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_modifiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_modifiers", organizationId] }),
  });
}

export function useRestoModifierOptions(modifierId: string | null) {
  return useQuery({
    queryKey: ["resto_modifier_options", modifierId],
    enabled: !!modifierId,
    queryFn: async (): Promise<RestoModifierOption[]> => {
      const { data, error } = await supabase.from("resto_modifier_options")
        .select("*").eq("modifier_id", modifierId!).order("nom");
      if (error) throw error;
      return data as RestoModifierOption[];
    },
  });
}
export function useUpsertRestoModifierOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Partial<RestoModifierOption> & { modifier_id: string; nom: string }) => {
      const { data, error } = await supabase.from("resto_modifier_options").upsert(o).select().single();
      if (error) throw error; return data;
    },
    onSuccess: (data: any) => qc.invalidateQueries({ queryKey: ["resto_modifier_options", data.modifier_id] }),
  });
}
export function useDeleteRestoModifierOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; modifierId: string }) => {
      const { error } = await supabase.from("resto_modifier_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_modifier_options", vars.modifierId] }),
  });
}

// Modificateurs assignés à un article de menu (table de liaison) — lus/
// écrits directement, pas de RPC nécessaire (deux inserts/deletes simples,
// pas d'invariant transactionnel à protéger).
export function useRestoMenuItemModifiers(menuItemId: string | null) {
  return useQuery({
    queryKey: ["resto_menu_item_modifiers", menuItemId],
    enabled: !!menuItemId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("resto_menu_item_modifiers")
        .select("modifier_id").eq("menu_item_id", menuItemId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.modifier_id as string);
    },
  });
}
export function useSetRestoMenuItemModifiers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ menuItemId, modifierIds }: { menuItemId: string; modifierIds: string[] }) => {
      const { error: delErr } = await supabase.from("resto_menu_item_modifiers").delete().eq("menu_item_id", menuItemId);
      if (delErr) throw delErr;
      if (modifierIds.length) {
        const { error: insErr } = await supabase.from("resto_menu_item_modifiers")
          .insert(modifierIds.map((modifier_id) => ({ menu_item_id: menuItemId, modifier_id })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_menu_item_modifiers", vars.menuItemId] }),
  });
}
