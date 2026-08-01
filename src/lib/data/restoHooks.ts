// ZegResto — hooks Supabase, multi-tenant (organization_id), même
// conventions que hooks.ts (ZegCaisse) et hotelHooks.ts (ZegHotel) : RLS
// fait foi côté serveur, le filtre organization_id ici est ceinture +
// bretelles. Toutes les tables sont préfixées resto_ (migrations 035-041).
import { useEffect } from "react";
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

// ============ COMMANDES & CUISINE (Phase 2 — flux temps réel) ============
export type OrderType = "salle" | "emporter" | "livraison";
export type OrderStatut = "ouverte" | "envoyee" | "servie" | "fermee" | "annulee";
export type OrderLineStatut = "en_attente" | "servie" | "annulee";
export type KitchenTicketStatut = "en_attente" | "en_preparation" | "pret";

export type RestoOrder = {
  id: string; organization_id: string; table_id: string | null; type: OrderType;
  statut: OrderStatut; server_id: string | null; created_at: string; closed_at: string | null;
  table?: RestoTable | null;
};
export type ChosenModifier = { option_id: string; nom: string; impact_prix: number };
export type RestoOrderItem = {
  id: string; organization_id: string; order_id: string; menu_item_id: string | null;
  quantite: number; modifiers_choisis: ChosenModifier[]; statut_ligne: OrderLineStatut;
  prix_unitaire: number; created_at: string;
  menu_item?: RestoMenuItem | null;
};
export type RestoKitchenTicket = {
  id: string; organization_id: string; order_id: string; statut: KitchenTicketStatut;
  created_at: string; ready_at: string | null;
  order?: RestoOrder | null;
};

// Écrans "temps réel" (Commandes, Cuisine) : la RLS suffit à sécuriser
// l'accès, mais rien n'y déclenchait de refetch avant cette Phase 2 — même
// souci que le KDS lui-même. Un seul hook générique, réutilisé par les
// écrans plutôt que dupliqué : s'abonne à un channel Postgres Changes filtré
// par organization_id et appelle `onChange` à chaque événement — chaque
// appelant décide QUELLES query keys invalider (ex. resto_order_items est
// caché par order_id, pas par organization_id : un simple [table,
// organizationId] générique ne matcherait pas ces caches).
function useRestoRealtimeInvalidate(table: string, onChange: () => void) {
  const organizationId = useOrganizationId();
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`resto_${table}_${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
        onChange,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, table]);
}

export function useRestoOrders(includeClosed = false) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_orders", () => qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] }));
  useRestoRealtimeInvalidate("resto_order_items", () => {
    qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
    qc.invalidateQueries({ queryKey: ["resto_order_items"] });
  });
  return useQuery({
    queryKey: ["resto_orders", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoOrder[]> => {
      let q = supabase.from("resto_orders").select("*, table:resto_tables(*)").eq("organization_id", organizationId!);
      if (!includeClosed) q = q.not("statut", "in", "(fermee,annulee)");
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data as RestoOrder[];
    },
  });
}
export function useUpsertRestoOrder() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Partial<RestoOrder> & { type: OrderType }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { table, ...rest } = o as any;
      const { data, error } = await supabase.from("resto_orders")
        .upsert({ ...rest, organization_id: organizationId }).select().single();
      if (error) throw error; return data as RestoOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] }),
  });
}

export function useRestoOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["resto_order_items", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RestoOrderItem[]> => {
      const { data, error } = await supabase.from("resto_order_items")
        .select("*, menu_item:resto_menu_items(*)").eq("order_id", orderId!).order("created_at");
      if (error) throw error;
      return data as RestoOrderItem[];
    },
  });
}
export function useAddRestoOrderItem() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { orderId: string; menuItemId: string; quantite: number; modifiers?: ChosenModifier[] }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("add_resto_order_item", {
        p_organization_id: organizationId, p_order_id: i.orderId, p_menu_item_id: i.menuItemId,
        p_quantite: i.quantite, p_modifiers: i.modifiers ?? [],
      });
      if (error) throw error;
      return data as RestoOrderItem;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_order_items", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] });
    },
  });
}
export function useUpdateRestoOrderItemStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut_ligne }: { id: string; orderId: string; statut_ligne: OrderLineStatut }) => {
      const { error } = await supabase.from("resto_order_items").update({ statut_ligne }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_order_items", vars.orderId] }),
  });
}

export function useRestoKitchenTickets() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_kitchen_tickets", () => qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] }));
  return useQuery({
    queryKey: ["resto_kitchen_tickets", organizationId],
    enabled: !!organizationId,
    refetchInterval: 15_000, // filet de sécurité si le channel realtime se déconnecte
    queryFn: async (): Promise<RestoKitchenTicket[]> => {
      const { data, error } = await supabase.from("resto_kitchen_tickets")
        .select("*, order:resto_orders(*, table:resto_tables(*))")
        .eq("organization_id", organizationId!).neq("statut", "pret").order("created_at");
      if (error) throw error;
      return data as RestoKitchenTicket[];
    },
  });
}
// Ticket d'une commande précise, y compris "pret" (contrairement à
// useRestoKitchenTickets, dédié au KDS qui n'affiche que ce qui reste à
// préparer) — utilisé par l'écran Commandes pour savoir si un plat est
// prêt à servir.
export function useRestoOrderKitchenTicket(orderId: string | null) {
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_kitchen_tickets", () => qc.invalidateQueries({ queryKey: ["resto_kitchen_ticket_for_order"] }));
  return useQuery({
    queryKey: ["resto_kitchen_ticket_for_order", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RestoKitchenTicket | null> => {
      const { data, error } = await supabase.from("resto_kitchen_tickets")
        .select("*").eq("order_id", orderId!).maybeSingle();
      if (error) throw error;
      return data as RestoKitchenTicket | null;
    },
  });
}
export function useUpdateKitchenTicketStatut() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: KitchenTicketStatut }) => {
      const { error } = await supabase.from("resto_kitchen_tickets")
        .update({ statut, ready_at: statut === "pret" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] }),
  });
}
