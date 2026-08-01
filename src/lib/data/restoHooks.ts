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

// ============ RÉSERVATIONS (Phase 3 — staff ; le formulaire public
// /resto/reserver/$slug est hors contexte organisation, il n'utilise pas
// ce fichier — voir directement resto.reserver.$slug.tsx) ============
export type ReservationStatut = "pending" | "confirmee" | "annulee" | "honoree";
export type RestoReservation = {
  id: string; organization_id: string; table_id: string | null;
  nom_client: string; telephone_client: string | null; date_heure: string;
  nombre_couverts: number; statut: ReservationStatut; source: "staff" | "public";
  notes: string | null; created_at: string;
  table?: RestoTable | null;
};
export function useRestoReservations() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_reservations", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoReservation[]> => {
      const { data, error } = await supabase.from("resto_reservations")
        .select("*, table:resto_tables(*)").eq("organization_id", organizationId!).order("date_heure");
      if (error) throw error;
      return data as RestoReservation[];
    },
  });
}
export function useUpsertRestoReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<RestoReservation> & { nom_client: string; date_heure: string; nombre_couverts: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { table, ...rest } = r as any;
      const { data, error } = await supabase.from("resto_reservations")
        .upsert({ ...rest, organization_id: organizationId }).select().single();
      if (error) throw error; return data as RestoReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_reservations", organizationId] }),
  });
}
export function useDeleteRestoReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_reservations", organizationId] }),
  });
}

// ============ RECETTES (Phase 4 — ingrédients = produits ZegCaisse
// existants, cf. migration 040 pour la justification de ce choix) ============
export type RestoRecipeIngredient = {
  id: string; recipe_id: string; ingredient_ref: string; quantite: number; unite: string | null;
  product?: { id: string; name: string } | null;
};
export type RestoRecipe = { id: string; organization_id: string; menu_item_id: string };

export function useRestoRecipe(menuItemId: string | null) {
  return useQuery({
    queryKey: ["resto_recipe", menuItemId],
    enabled: !!menuItemId,
    queryFn: async (): Promise<{ recipe: RestoRecipe | null; ingredients: RestoRecipeIngredient[] }> => {
      const { data: recipe, error } = await supabase.from("resto_recipes")
        .select("*").eq("menu_item_id", menuItemId!).maybeSingle();
      if (error) throw error;
      if (!recipe) return { recipe: null, ingredients: [] };
      const { data: ingredients, error: ingErr } = await supabase.from("resto_recipe_ingredients")
        .select("*, product:products(id, name)").eq("recipe_id", (recipe as any).id).order("created_at");
      if (ingErr) throw ingErr;
      return { recipe: recipe as RestoRecipe, ingredients: (ingredients ?? []) as RestoRecipeIngredient[] };
    },
  });
}
// Crée la recette au premier ingrédient ajouté (get-or-create implicite) —
// resto_recipes n'a de sens que comme parent de ses lignes d'ingrédients,
// jamais créée "vide" depuis l'UI.
export function useAddRecipeIngredient() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ menuItemId, ingredientRef, quantite, unite }: { menuItemId: string; ingredientRef: string; quantite: number; unite?: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      let { data: recipe } = await supabase.from("resto_recipes").select("id").eq("menu_item_id", menuItemId).maybeSingle();
      if (!recipe) {
        const { data: created, error: createErr } = await supabase.from("resto_recipes")
          .insert({ organization_id: organizationId, menu_item_id: menuItemId }).select("id").single();
        if (createErr) throw createErr;
        recipe = created;
      }
      const { error } = await supabase.from("resto_recipe_ingredients")
        .insert({ recipe_id: (recipe as any).id, ingredient_ref: ingredientRef, quantite, unite: unite || null });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_recipe", vars.menuItemId] }),
  });
}
export function useDeleteRecipeIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; menuItemId: string }) => {
      const { error } = await supabase.from("resto_recipe_ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_recipe", vars.menuItemId] }),
  });
}

// ============ FACTURATION (Phase 5 — notes, partage, paiements) ============
export type BillStatut = "ouverte" | "payee" | "annulee";
export type SplitMode = "aucun" | "egal" | "detaille";
export type PaymentMethode = "mobile_money" | "cash" | "carte";
export type RestoBill = {
  id: string; order_id: string; organization_id: string; total: number;
  statut: BillStatut; split_mode: SplitMode; created_at: string;
};
export type RestoBillSplit = { id: string; organization_id: string; bill_id: string; split_index: number; montant: number };
export type RestoBillPayment = {
  id: string; organization_id: string; bill_id: string; split_id: string | null;
  methode: PaymentMethode; montant: number; statut: "validee" | "annulee"; created_at: string;
};

export function useRestoBill(orderId: string | null) {
  return useQuery({
    queryKey: ["resto_bill", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RestoBill | null> => {
      const { data, error } = await supabase.from("resto_bills").select("*").eq("order_id", orderId!).maybeSingle();
      if (error) throw error;
      return data as RestoBill | null;
    },
  });
}
export function useCreateRestoBill() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, splitMode, splitCount }: { orderId: string; splitMode: SplitMode; splitCount?: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("create_resto_bill", {
        p_organization_id: organizationId, p_order_id: orderId, p_split_mode: splitMode, p_split_count: splitCount ?? null,
      });
      if (error) throw error;
      return data as RestoBill;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_bill", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
    },
  });
}
export function useRestoBillSplits(billId: string | null) {
  return useQuery({
    queryKey: ["resto_bill_splits", billId],
    enabled: !!billId,
    queryFn: async (): Promise<RestoBillSplit[]> => {
      const { data, error } = await supabase.from("resto_bill_splits").select("*").eq("bill_id", billId!).order("split_index");
      if (error) throw error;
      return data as RestoBillSplit[];
    },
  });
}
export function useRestoBillPayments(billId: string | null) {
  return useQuery({
    queryKey: ["resto_bill_payments", billId],
    enabled: !!billId,
    queryFn: async (): Promise<RestoBillPayment[]> => {
      const { data, error } = await supabase.from("resto_bill_payments").select("*").eq("bill_id", billId!).order("created_at");
      if (error) throw error;
      return data as RestoBillPayment[];
    },
  });
}
export function useSetRestoBillSplitItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, assignments }: { billId: string; assignments: { order_item_id: string; split_index: number }[] }) => {
      const { error } = await supabase.rpc("set_resto_bill_split_items", { p_bill_id: billId, p_assignments: assignments });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_bill_splits", vars.billId] }),
  });
}
export function useAddRestoBillPayment() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, montant, methode, splitId }: { billId: string; montant: number; methode: PaymentMethode; splitId?: string }) => {
      const { data, error } = await supabase.rpc("add_resto_bill_payment", {
        p_bill_id: billId, p_montant: montant, p_methode: methode, p_split_id: splitId ?? null,
      });
      if (error) throw error;
      return data as RestoBill;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_bill_payments", vars.billId] });
      qc.invalidateQueries({ queryKey: ["resto_bill_splits", vars.billId] });
      qc.invalidateQueries({ queryKey: ["resto_bill"] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_tables", organizationId] });
    },
  });
}

// ============ DASHBOARD & RAPPORTS (Phase 6) ============
export function useRestoDashboardStats() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_orders", () => qc.invalidateQueries({ queryKey: ["resto_dashboard", organizationId] }));
  return useQuery({
    queryKey: ["resto_dashboard", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30_000, // filet de sécurité si le channel realtime se déconnecte

    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [tablesRes, openOrdersRes, todayBillsRes, pendingResRes] = await Promise.all([
        supabase.from("resto_tables").select("statut").eq("organization_id", organizationId!),
        supabase.from("resto_orders").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId!).not("statut", "in", "(fermee,annulee)"),
        supabase.from("resto_bills").select("total, order_id")
          .eq("organization_id", organizationId!).eq("statut", "payee").gte("created_at", todayStart.toISOString()),
        supabase.from("resto_reservations").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId!).eq("statut", "pending"),
      ]);
      const tables = tablesRes.data ?? [];
      const bills = todayBillsRes.data ?? [];
      return {
        tablesTotal: tables.length,
        tablesOccupied: tables.filter((t: any) => t.statut === "occupee").length,
        openOrders: openOrdersRes.count ?? 0,
        revenueToday: bills.reduce((s: number, b: any) => s + Number(b.total), 0),
        ordersToday: bills.length,
        pendingReservations: pendingResRes.count ?? 0,
      };
    },
  });
}

export function useRestoReportData(from: Date, to: Date) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_report", organizationId, from.toISOString(), to.toISOString()],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data: orders, error } = await supabase.from("resto_orders")
        .select("id, created_at, closed_at, resto_bills(total)")
        .eq("organization_id", organizationId!).eq("statut", "fermee")
        .gte("closed_at", from.toISOString()).lte("closed_at", to.toISOString());
      if (error) throw error;
      const closedOrders = (orders ?? []) as any[];
      const orderIds = closedOrders.map((o) => o.id);

      let items: any[] = [];
      if (orderIds.length) {
        const { data, error: itemsErr } = await supabase.from("resto_order_items")
          .select("menu_item_id, quantite, prix_unitaire, statut_ligne, menu_item:resto_menu_items(nom)")
          .in("order_id", orderIds).neq("statut_ligne", "annulee");
        if (itemsErr) throw itemsErr;
        items = data ?? [];
      }

      const revenue = closedOrders.reduce((s, o) => s + Number(o.resto_bills?.[0]?.total ?? 0), 0);
      const orderCount = closedOrders.length;
      const avgTicket = orderCount > 0 ? revenue / orderCount : 0;
      const serviceDurations = closedOrders
        .filter((o) => o.closed_at)
        .map((o) => (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 60000);
      const avgServiceMin = serviceDurations.length ? serviceDurations.reduce((s, d) => s + d, 0) / serviceDurations.length : 0;

      const byItem = new Map<string, { nom: string; quantite: number; ca: number }>();
      for (const it of items) {
        const key = it.menu_item_id ?? "?";
        const nom = it.menu_item?.nom ?? "Article supprimé";
        const entry = byItem.get(key) ?? { nom, quantite: 0, ca: 0 };
        entry.quantite += Number(it.quantite);
        entry.ca += Number(it.prix_unitaire) * Number(it.quantite);
        byItem.set(key, entry);
      }
      const topItems = [...byItem.values()].sort((a, b) => b.quantite - a.quantite).slice(0, 10);

      return { revenue, orderCount, avgTicket, avgServiceMin, topItems };
    },
  });
}
