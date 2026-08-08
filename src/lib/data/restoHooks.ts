// ZegResto — hooks Supabase, multi-tenant (organization_id), même
// conventions que hooks.ts (ZegCaisse) et hotelHooks.ts (ZegHotel) : RLS
// fait foi côté serveur, le filtre organization_id ici est ceinture +
// bretelles. Toutes les tables sont préfixées resto_ (migrations 035-041).
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { playKdsSound } from "@/lib/kdsSound";

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
export type MenuCreneau = "matin" | "midi" | "soir";
export type RestoMenuItem = {
  id: string; organization_id: string; category_id: string | null;
  nom: string; description: string | null; prix: number; photo_url: string | null;
  disponible: boolean; temps_preparation_min: number | null; station: string | null;
  favori_creneaux: MenuCreneau[]; suggestion_ids: string[];
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

// ============ COMMANDES & CUISINE (Phase 2 — flux temps réel ; étapes
// d'envoi cuisine "courses" ajoutées migration 043) ============
export type OrderType = "salle" | "emporter" | "livraison";
export type OrderStatut = "ouverte" | "envoyee" | "servie" | "fermee" | "annulee";
export type OrderLineStatut = "en_attente" | "pret" | "servie" | "annulee";
export type KitchenTicketStatut = "en_attente" | "en_preparation" | "pret";
export type CourseStatut = "brouillon" | "envoyee" | "en_preparation" | "pret" | "servie";

export type RestoOrder = {
  id: string; organization_id: string; table_id: string | null; type: OrderType;
  statut: OrderStatut; server_id: string | null; created_at: string; closed_at: string | null;
  table?: RestoTable | null;
};
export type ChosenModifier = { option_id: string; nom: string; impact_prix: number };
export type RestoOrderCourse = {
  id: string; organization_id: string; order_id: string; ordre: number; nom: string | null;
  statut: CourseStatut; sent_at: string | null; created_at: string;
};
export type RestoOrderItem = {
  id: string; organization_id: string; order_id: string; course_id: string | null; menu_item_id: string | null;
  quantite: number; modifiers_choisis: ChosenModifier[]; statut_ligne: OrderLineStatut;
  prix_unitaire: number; annulation_motif: string | null; created_at: string;
  menu_item?: RestoMenuItem | null;
};
export type RestoKitchenTicket = {
  id: string; organization_id: string; order_id: string; course_id: string | null; statut: KitchenTicketStatut;
  created_at: string; ready_at: string | null;
  order?: RestoOrder | null;
  course?: RestoOrderCourse | null;
};

// Écrans "temps réel" (Commandes, Cuisine) : la RLS suffit à sécuriser
// l'accès, mais rien n'y déclenchait de refetch avant cette Phase 2 — même
// souci que le KDS lui-même. Un seul hook générique, réutilisé par les
// écrans plutôt que dupliqué : s'abonne à un channel Postgres Changes filtré
// par organization_id et appelle `onChange` à chaque événement — chaque
// appelant décide QUELLES query keys invalider (ex. resto_order_items est
// caché par order_id, pas par organization_id : un simple [table,
// organizationId] générique ne matcherait pas ces caches).
// Bug corrigé (V2, crash reproduit en prod) : le topic de canal ne portait
// que `table_${organizationId}`, identique pour tous les composants
// abonnés à la même table — dès que deux composants montés en même temps
// s'abonnent à la même table (ex. depuis la Phase 3, le statut du ticket
// cuisine d'une commande est affiché à la fois dans la carte de la colonne
// de bascule ET dans le panneau de la commande active), le second `.on()`
// tombe sur un canal déjà `subscribe()`-é par le premier et
// realtime-js lève une exception synchrone ("cannot add `postgres_changes`
// callbacks ... after `subscribe()`") depuis l'effet — non rattrapée, elle
// remonte jusqu'à l'errorComponent racine et casse toute la page. `useId()`
// donne à chaque instance de hook (donc chaque composant monté) un topic
// vraiment unique, quel que soit le nombre de composants qui observent la
// même table en parallèle.
function useRestoRealtimeInvalidate(table: string, onChange: () => void) {
  const organizationId = useOrganizationId();
  const instanceId = useId();
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`resto_${table}_${organizationId}_${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
        onChange,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, table, instanceId]);
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
    mutationFn: async (i: { orderId: string; menuItemId: string; quantite: number; modifiers?: ChosenModifier[]; courseId?: string | null }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("add_resto_order_item", {
        p_organization_id: organizationId, p_order_id: i.orderId, p_menu_item_id: i.menuItemId,
        p_quantite: i.quantite, p_modifiers: i.modifiers ?? [], p_course_id: i.courseId ?? null,
      });
      if (error) throw error;
      return data as RestoOrderItem;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_order_items", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_order_courses", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] });
    },
  });
}
// Passe par mark_resto_order_item_statut() (RPC security definer, migration
// 043) — pas d'UPDATE direct : c'est ce qui permet au cook de marquer 'pret'
// sans lui accorder de policy UPDATE large sur resto_order_items (RLS ne
// masque que des lignes, jamais des colonnes ; cf. hotel_guest_contact()).
export function useUpdateRestoOrderItemStatut() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut_ligne, motif }: { id: string; orderId: string; statut_ligne: "pret" | "servie" | "annulee"; motif?: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("mark_resto_order_item_statut", {
        p_organization_id: organizationId, p_item_id: id, p_statut: statut_ligne, p_motif: motif ?? null,
      });
      if (error) throw error;
      return data as RestoOrderItem;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_order_items", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] });
    },
  });
}

// ============ ÉTAPES D'ENVOI CUISINE (courses — migration 043) ============
export function useRestoOrderCourses(orderId: string | null) {
  return useQuery({
    queryKey: ["resto_order_courses", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RestoOrderCourse[]> => {
      const { data, error } = await supabase.from("resto_order_courses")
        .select("*").eq("order_id", orderId!).order("ordre").order("created_at");
      if (error) throw error;
      return data as RestoOrderCourse[];
    },
  });
}
// Création manuelle d'une étape nommée (Entrée/Plat/Dessert...) — l'étape
// par défaut (ordre=1, sans nom) est elle créée implicitement par
// add_resto_order_item() quand aucune étape n'existe encore.
export function useCreateRestoOrderCourse() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, nom, ordre }: { orderId: string; nom?: string; ordre: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_order_courses")
        .insert({ organization_id: organizationId, order_id: orderId, nom: nom ?? null, ordre })
        .select().single();
      if (error) throw error;
      return data as RestoOrderCourse;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["resto_order_courses", vars.orderId] }),
  });
}
// Marquer une étape "servie" une fois apportée à table — UPDATE direct
// (pas de RPC nécessaire : resto_order_courses n'a pas de colonne
// sensible et owner/manager/server ont déjà accès UPDATE par RLS,
// contrairement à resto_order_items qui contient prix_unitaire/quantite).
export function useMarkRestoCourseServed() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId }: { courseId: string; orderId: string }) => {
      const { error } = await supabase.from("resto_order_courses").update({ statut: "servie" }).eq("id", courseId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_order_courses", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
    },
  });
}
// send_resto_course() (RPC security definer) : envoi explicite en cuisine —
// crée/relance le ticket cuisine de l'étape, remplace l'ancien auto-fire à
// l'ajout d'article (V1).
export function useSendRestoCourse() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId }: { courseId: string; orderId: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("send_resto_course", {
        p_organization_id: organizationId, p_course_id: courseId,
      });
      if (error) throw error;
      return data as RestoOrderCourse;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_order_courses", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_orders", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] });
    },
  });
}

// refetchIntervalMs : filet de sécurité si le channel realtime se
// déconnecte, ET mode affichage "mains libres" (écran KDS laissé ouvert
// sans interaction) — configurable depuis resto_settings.kds_auto_refresh_seconds
// (migration 044), 15s par défaut si aucun réglage n'existe encore.
export function useRestoKitchenTickets(refetchIntervalMs = 15_000) {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_kitchen_tickets", () => qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets", organizationId] }));
  return useQuery({
    queryKey: ["resto_kitchen_tickets", organizationId],
    enabled: !!organizationId,
    refetchInterval: refetchIntervalMs,
    queryFn: async (): Promise<RestoKitchenTicket[]> => {
      const { data, error } = await supabase.from("resto_kitchen_tickets")
        .select("*, order:resto_orders(*, table:resto_tables(*)), course:resto_order_courses(*)")
        .eq("organization_id", organizationId!).neq("statut", "pret").order("created_at");
      if (error) throw error;
      return data as RestoKitchenTicket[];
    },
  });
}
// Tickets d'une commande précise (un par étape/course depuis la migration
// 043 — une commande à plusieurs étapes a plusieurs tickets), y compris
// "pret" (contrairement à useRestoKitchenTickets, dédié au KDS qui
// n'affiche que ce qui reste à préparer) — utilisé par l'écran Commandes
// pour savoir, étape par étape, si un plat est prêt à servir.
export function useRestoOrderKitchenTickets(orderId: string | null) {
  const qc = useQueryClient();
  useRestoRealtimeInvalidate("resto_kitchen_tickets", () => qc.invalidateQueries({ queryKey: ["resto_kitchen_tickets_for_order"] }));
  return useQuery({
    queryKey: ["resto_kitchen_tickets_for_order", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RestoKitchenTicket[]> => {
      const { data, error } = await supabase.from("resto_kitchen_tickets")
        .select("*").eq("order_id", orderId!).order("created_at");
      if (error) throw error;
      return data as RestoKitchenTicket[];
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
// organization_id n'est fourni QUE pour une création (rest.id absent) —
// jamais réécrit sur une mise à jour, pour ne pas risquer de "voler" une
// réservation d'un autre établissement vers l'organisation actuellement
// active quand l'appelant est la vue consolidée multi-restaurant (V2,
// chantier 6), qui édite des lignes appartenant à divers organization_id
// tout en gardant une seule organisation "active" au sens de useOrganization().
export function useUpsertRestoReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<RestoReservation> & { nom_client: string; date_heure: string; nombre_couverts: number }) => {
      const { table, organization, ...rest } = r as any;
      if (!rest.id) {
        if (!organizationId) throw new Error("Aucune organisation sélectionnée");
        rest.organization_id = organizationId;
      }
      const { data, error } = await supabase.from("resto_reservations").upsert(rest).select().single();
      if (error) throw error; return data as RestoReservation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resto_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_reservations_consolidated"] });
    },
  });
}
export function useDeleteRestoReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resto_reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resto_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["resto_reservations_consolidated"] });
    },
  });
}

// Vue consolidée multi-restaurant (V2, chantier 6) : un propriétaire de
// plusieurs établissements ZegResto sous le même account_id (regroupement
// déjà natif — provision_organization() ajoute l'utilisateur comme
// organization_members à chaque établissement qu'il crée) peut lister ses
// autres restaurants et voir leurs réservations sans changer d'organisation
// active. Aucune policy RLS nouvelle nécessaire : organizations/resto_reservations
// filtrent déjà par appartenance réelle à organization_members — un
// utilisateur qui n'est PAS membre d'un des établissements du compte ne le
// verrait de toute façon pas apparaître ici. La page publique
// /resto/reserver/$slug reste inchangée (une page par établissement).
export type RestoLinkedOrganization = { id: string; name: string; slug: string };
export function useRestoLinkedOrganizations() {
  const { currentOrganization } = useOrganization();
  return useQuery({
    queryKey: ["resto_linked_organizations", currentOrganization?.account_id],
    enabled: !!currentOrganization?.account_id,
    queryFn: async (): Promise<RestoLinkedOrganization[]> => {
      const { data, error } = await supabase.from("organizations")
        .select("id, name, slug")
        .eq("account_id", currentOrganization!.account_id)
        .eq("app_module", "resto")
        .order("name");
      if (error) throw error;
      return data as RestoLinkedOrganization[];
    },
  });
}
export function useRestoReservationsConsolidated(organizationIds: string[]) {
  const ids = [...organizationIds].sort().join(",");
  return useQuery({
    queryKey: ["resto_reservations_consolidated", ids],
    enabled: organizationIds.length > 0,
    queryFn: async (): Promise<(RestoReservation & { organization?: RestoLinkedOrganization | null })[]> => {
      const { data, error } = await supabase.from("resto_reservations")
        .select("*, table:resto_tables(*), organization:organizations(id,name,slug)")
        .in("organization_id", organizationIds)
        .order("date_heure");
      if (error) throw error;
      return data as (RestoReservation & { organization?: RestoLinkedOrganization | null })[];
    },
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
  loyalty_account_id: string | null; loyalty_discount: number;
  loyalty_points_earned: number; loyalty_points_redeemed: number;
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

// ============ FIDÉLITÉ (migration 045) — identité indépendante de
// ZegResto, clé = numéro de téléphone (pas de FK vers public.customers,
// cf. ARCHITECTURE.md). Solde/écriture jamais en direct côté client au-delà
// de la lecture : tout crédit/débit de points passe par
// apply_resto_bill_loyalty()/add_resto_bill_payment(). ============
export type RestoLoyaltyAccount = {
  id: string; organization_id: string; telephone: string; nom: string | null;
  points_balance: number; created_at: string; updated_at: string;
};
export type RestoLoyaltyTransaction = {
  id: string; organization_id: string; account_id: string; bill_id: string | null;
  type: "earn" | "spend"; points: number; montant: number; created_at: string;
};

// Recherche par téléphone (saisie à la facturation) — null tant qu'aucun
// compte n'existe pour ce numéro (première visite : apply_resto_bill_loyalty()
// en créera un avec un solde à 0).
export function useRestoLoyaltyAccountByPhone(telephone: string | null) {
  const organizationId = useOrganizationId();
  const phone = telephone?.trim() || null;
  return useQuery({
    queryKey: ["resto_loyalty_account_by_phone", organizationId, phone],
    enabled: !!organizationId && !!phone,
    queryFn: async (): Promise<RestoLoyaltyAccount | null> => {
      const { data, error } = await supabase.from("resto_loyalty_accounts")
        .select("*").eq("organization_id", organizationId!).eq("telephone", phone!).maybeSingle();
      if (error) throw error;
      return data as RestoLoyaltyAccount | null;
    },
  });
}
export function useApplyRestoBillLoyalty() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, telephone, nom, redeemPoints }: { billId: string; orderId: string; telephone: string; nom?: string; redeemPoints: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.rpc("apply_resto_bill_loyalty", {
        p_organization_id: organizationId, p_bill_id: billId, p_telephone: telephone,
        p_nom: nom || null, p_redeem_points: redeemPoints,
      });
      if (error) throw error;
      return data as RestoBill;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["resto_bill", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["resto_loyalty_account_by_phone"] });
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

// Indicateurs "période" du tableau de bord (sélecteur universel, même
// pattern que ZegHotel Phase 6) — volontairement séparé de
// useRestoDashboardStats (occupation des tables/commandes en cours restent
// des instantanés "maintenant", jamais dépendants d'une période) et plus
// léger que useRestoReportData (pas de détail par serveur/catégorie/
// ingrédient, juste CA + nombre de commandes pour les cartes du dashboard).
export function useRestoPeriodStats(from: Date, to: Date) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_dashboard_period", organizationId, from.toISOString(), to.toISOString()],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("resto_bills")
        .select("total")
        .eq("organization_id", organizationId!).eq("statut", "payee")
        .gte("created_at", from.toISOString()).lte("created_at", to.toISOString());
      if (error) throw error;
      const bills = data ?? [];
      return {
        revenue: bills.reduce((s, b) => s + Number(b.total), 0),
        orderCount: bills.length,
      };
    },
  });
}

export type RestoReportServerRow = { nom: string; orderCount: number; ca: number };
export type RestoReportCategoryRow = { nom: string; quantite: number; ca: number };
export type RestoReportPeakHour = { hour: number; orderCount: number };
export type RestoReportIngredientRow = { nom: string; unite: string | null; consomme: number; stockActuel: number };
export type RestoReportPreviousPeriod = { revenue: number; orderCount: number; avgTicket: number };

// Rapports enrichis (V2, chantier 7) : au-delà de CA/ticket moyen/temps de
// service/plats vendus (V1), ajoute la répartition par serveur et par
// catégorie de menu, la rotation des tables, les heures de pointe, la
// consommation d'ingrédients (liée aux recettes, comparée au stock actuel
// via stock_levels), et une comparaison avec la période précédente de même
// durée. Toutes les requêtes indépendantes (mouvements de stock, période
// précédente, nombre de tables) partent en parallèle avec la requête des
// commandes fermées ; celles qui en dépendent (articles, noms de serveurs,
// détails produits) suivent dans un second Promise.all une fois les ids
// connus.
export function useRestoReportData(from: Date, to: Date) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_report", organizationId, from.toISOString(), to.toISOString()],
    enabled: !!organizationId,
    queryFn: async () => {
      const orgId = organizationId!;
      const durationMs = Math.max(0, to.getTime() - from.getTime());
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(from.getTime() - durationMs);

      const [ordersRes, movementsRes, prevOrdersRes, tablesCountRes] = await Promise.all([
        supabase.from("resto_orders")
          .select("id, created_at, closed_at, table_id, server_id, resto_bills(total)")
          .eq("organization_id", orgId).eq("statut", "fermee")
          .gte("closed_at", from.toISOString()).lte("closed_at", to.toISOString()),
        supabase.from("stock_movements")
          .select("product_id, quantity")
          .eq("organization_id", orgId).eq("reason", "Recette ZegResto")
          .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
        supabase.from("resto_orders")
          .select("id, resto_bills(total)")
          .eq("organization_id", orgId).eq("statut", "fermee")
          .gte("closed_at", prevFrom.toISOString()).lte("closed_at", prevTo.toISOString()),
        supabase.from("resto_tables").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (prevOrdersRes.error) throw prevOrdersRes.error;
      if (tablesCountRes.error) throw tablesCountRes.error;

      const closedOrders = (ordersRes.data ?? []) as any[];
      const orderIds = closedOrders.map((o) => o.id);
      const serverIds = [...new Set(closedOrders.map((o) => o.server_id).filter(Boolean))] as string[];
      const consumptionByProduct = new Map<string, number>();
      for (const m of movementsRes.data ?? []) {
        consumptionByProduct.set(m.product_id, (consumptionByProduct.get(m.product_id) ?? 0) + Number(m.quantity));
      }
      const productIds = [...consumptionByProduct.keys()];

      const [itemsRes, profilesRes, productsRes, levelsRes] = await Promise.all([
        orderIds.length
          ? supabase.from("resto_order_items")
              .select("menu_item_id, quantite, prix_unitaire, statut_ligne, menu_item:resto_menu_items(nom, category:resto_menu_categories(nom))")
              .in("order_id", orderIds).neq("statut_ligne", "annulee")
          : Promise.resolve({ data: [], error: null }),
        serverIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", serverIds)
          : Promise.resolve({ data: [], error: null }),
        productIds.length
          ? supabase.from("products").select("id, name, unit").in("id", productIds)
          : Promise.resolve({ data: [], error: null }),
        productIds.length
          ? supabase.from("stock_levels").select("product_id, quantity").eq("organization_id", orgId).in("product_id", productIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (levelsRes.error) throw levelsRes.error;
      const items = (itemsRes.data ?? []) as any[];

      const revenue = closedOrders.reduce((s, o) => s + Number(o.resto_bills?.[0]?.total ?? 0), 0);
      const orderCount = closedOrders.length;
      const avgTicket = orderCount > 0 ? revenue / orderCount : 0;
      const serviceDurations = closedOrders
        .filter((o) => o.closed_at)
        .map((o) => (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 60000);
      const avgServiceMin = serviceDurations.length ? serviceDurations.reduce((s, d) => s + d, 0) / serviceDurations.length : 0;

      const byItem = new Map<string, { nom: string; quantite: number; ca: number }>();
      const byCategory = new Map<string, RestoReportCategoryRow>();
      for (const it of items) {
        const key = it.menu_item_id ?? "?";
        const nom = it.menu_item?.nom ?? "Article supprimé";
        const entry = byItem.get(key) ?? { nom, quantite: 0, ca: 0 };
        entry.quantite += Number(it.quantite);
        entry.ca += Number(it.prix_unitaire) * Number(it.quantite);
        byItem.set(key, entry);

        const catNom = it.menu_item?.category?.nom ?? "Sans catégorie";
        const catEntry = byCategory.get(catNom) ?? { nom: catNom, quantite: 0, ca: 0 };
        catEntry.quantite += Number(it.quantite);
        catEntry.ca += Number(it.prix_unitaire) * Number(it.quantite);
        byCategory.set(catNom, catEntry);
      }
      const topItems = [...byItem.values()].sort((a, b) => b.quantite - a.quantite).slice(0, 10);
      const byCategoryRows = [...byCategory.values()].sort((a, b) => b.ca - a.ca);

      const profilesMap = new Map<string, string>((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name || "Sans nom"]));
      const byServerMap = new Map<string, RestoReportServerRow>();
      for (const o of closedOrders) {
        if (!o.server_id) continue;
        const nom = profilesMap.get(o.server_id) ?? "Inconnu";
        const entry = byServerMap.get(o.server_id) ?? { nom, orderCount: 0, ca: 0 };
        entry.orderCount += 1;
        entry.ca += Number(o.resto_bills?.[0]?.total ?? 0);
        byServerMap.set(o.server_id, entry);
      }
      const byServer = [...byServerMap.values()].sort((a, b) => b.ca - a.ca);

      const dineInOrders = closedOrders.filter((o) => o.table_id);
      const tablesTotal = tablesCountRes.count ?? 0;
      const tableTurnover = {
        tablesCount: tablesTotal,
        turnsTotal: dineInOrders.length,
        turnsPerTable: tablesTotal > 0 ? dineInOrders.length / tablesTotal : 0,
      };

      const hourCounts = new Array(24).fill(0);
      for (const o of closedOrders) hourCounts[new Date(o.created_at).getHours()]++;
      const peakHours: RestoReportPeakHour[] = hourCounts.map((orderCount, hour) => ({ hour, orderCount }));

      const productsMap = new Map<string, any>((productsRes.data ?? []).map((p: any) => [p.id, p]));
      const levelsMap = new Map<string, number>((levelsRes.data ?? []).map((l: any) => [l.product_id, Number(l.quantity)]));
      const ingredientConsumption: RestoReportIngredientRow[] = productIds
        .map((pid) => {
          const p = productsMap.get(pid);
          return { nom: p?.name ?? "Produit supprimé", unite: p?.unit ?? null, consomme: consumptionByProduct.get(pid) ?? 0, stockActuel: levelsMap.get(pid) ?? 0 };
        })
        .sort((a, b) => b.consomme - a.consomme);

      const prevOrders = (prevOrdersRes.data ?? []) as any[];
      const prevRevenue = prevOrders.reduce((s, o) => s + Number(o.resto_bills?.[0]?.total ?? 0), 0);
      const prevOrderCount = prevOrders.length;
      const previousPeriod: RestoReportPreviousPeriod = { revenue: prevRevenue, orderCount: prevOrderCount, avgTicket: prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0 };

      return { revenue, orderCount, avgTicket, avgServiceMin, topItems, byServer, byCategory: byCategoryRows, tableTurnover, peakHours, ingredientConsumption, previousPeriod };
    },
  });
}

// Compléments "Rapports par onglet" (mission "Round 2", 4 apps) — séparés
// de useRestoReportData ci-dessus (déjà volumineuse) : revenu par jour
// (onglet Ventes), clients identifiés via le programme de fidélité
// (resto_bills.loyalty_account_id, onglet Clients) et consommation
// d'ingrédients valorisée par fournisseur (products.supplier_id, même
// mouvements de stock que ingredientConsumption ci-dessus mais regroupés
// différemment, onglet Fournisseurs).
export type RestoDailyRevenue = { date: string; ca: number };
export type RestoClientRow = { name: string; visits: number; ca: number };
export type RestoSupplierRow = { name: string; qty: number; ca: number };

export function useRestoReportExtras(from: Date, to: Date) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_report_extras", organizationId, from.toISOString(), to.toISOString()],
    enabled: !!organizationId,
    queryFn: async () => {
      const orgId = organizationId!;
      const [billsRes, movementsRes] = await Promise.all([
        supabase.from("resto_bills")
          .select("total, created_at, loyalty_account_id")
          .eq("organization_id", orgId).eq("statut", "payee")
          .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
        supabase.from("stock_movements")
          .select("product_id, quantity")
          .eq("organization_id", orgId).eq("reason", "Recette ZegResto")
          .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
      ]);
      if (billsRes.error) throw billsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      const bills = (billsRes.data ?? []) as any[];

      const byDayMap = new Map<string, number>();
      for (const b of bills) {
        const day = b.created_at.slice(0, 10);
        byDayMap.set(day, (byDayMap.get(day) ?? 0) + Number(b.total));
      }
      const byDay: RestoDailyRevenue[] = [...byDayMap.entries()].map(([date, ca]) => ({ date, ca })).sort((a, b) => a.date.localeCompare(b.date));

      const accountIds = [...new Set(bills.map((b) => b.loyalty_account_id).filter(Boolean))] as string[];
      const accountsRes = accountIds.length
        ? await supabase.from("resto_loyalty_accounts").select("id, nom, telephone").in("id", accountIds)
        : { data: [], error: null };
      if (accountsRes.error) throw accountsRes.error;
      const accountById = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
      const clientMap = new Map<string, RestoClientRow>();
      for (const b of bills) {
        if (!b.loyalty_account_id) continue;
        const acc = accountById.get(b.loyalty_account_id);
        const name = acc?.nom || acc?.telephone || "Client";
        const entry = clientMap.get(b.loyalty_account_id) ?? { name, visits: 0, ca: 0 };
        entry.visits += 1; entry.ca += Number(b.total);
        clientMap.set(b.loyalty_account_id, entry);
      }
      const byClient = [...clientMap.values()].sort((a, b) => b.ca - a.ca);

      const consumptionByProduct = new Map<string, number>();
      for (const m of movementsRes.data ?? []) {
        consumptionByProduct.set(m.product_id, (consumptionByProduct.get(m.product_id) ?? 0) + Number(m.quantity));
      }
      const productIds = [...consumptionByProduct.keys()];
      const productsRes = productIds.length
        ? await supabase.from("products").select("id, cost, supplier_id").in("id", productIds)
        : { data: [], error: null };
      if (productsRes.error) throw productsRes.error;
      const supplierIdByProduct = new Map((productsRes.data ?? []).map((p: any) => [p.id, p.supplier_id]));
      const costByProduct = new Map((productsRes.data ?? []).map((p: any) => [p.id, Number(p.cost)]));
      const supplierIds = [...new Set([...supplierIdByProduct.values()].filter(Boolean))] as string[];
      const suppliersRes = supplierIds.length
        ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
        : { data: [], error: null };
      if (suppliersRes.error) throw suppliersRes.error;
      const supplierNameById = new Map((suppliersRes.data ?? []).map((s: any) => [s.id, s.name]));
      const supplierMap = new Map<string, RestoSupplierRow>();
      for (const [productId, qty] of consumptionByProduct.entries()) {
        const supplierId = supplierIdByProduct.get(productId);
        if (!supplierId) continue;
        const name = supplierNameById.get(supplierId) ?? "Fournisseur";
        const entry = supplierMap.get(supplierId) ?? { name, qty: 0, ca: 0 };
        entry.qty += qty; entry.ca += qty * (costByProduct.get(productId) ?? 0);
        supplierMap.set(supplierId, entry);
      }
      const bySupplier = [...supplierMap.values()].sort((a, b) => b.ca - a.ca);

      return { byDay, byClient, bySupplier };
    },
  });
}

// Meilleurs mois (12 derniers mois glissants, indépendant du sélecteur de
// période de la page) — même table resto_bills que useRestoReportData,
// requête séparée et volontairement large.
export function useRestoBestMonths() {
  const organizationId = useOrganizationId();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return useQuery({
    queryKey: ["resto_best_months", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("resto_bills")
        .select("total, created_at")
        .eq("organization_id", organizationId!).eq("statut", "payee")
        .gte("created_at", start.toISOString()).lte("created_at", now.toISOString());
      if (error) throw error;
      const map = new Map<string, { key: string; label: string; ca: number }>();
      for (const b of data ?? []) {
        const d = new Date(b.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        const entry = map.get(key) ?? { key, label, ca: 0 };
        entry.ca += Number(b.total);
        map.set(key, entry);
      }
      return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
    },
  });
}

// ============ PARAMÈTRES (resto_settings — migrations 044/045) : réglages
// KDS + fidélité, complétés par le chantier 8 (Ticket & Caisse, Sons &
// Notifications). Ligne créée à la volée par le premier upsert (comme
// hotel_settings) — data null tant que personne n'a encore modifié les
// réglages, valeurs par défaut appliquées côté consommateur. ===
export type RestoSoundChoice = "chime" | "bell" | "soft";
export type RestoSettings = {
  organization_id: string;
  kds_auto_refresh_seconds: number;
  kds_urgency_minutes: number;
  kds_sound_enabled: boolean;
  kds_sound_choice: RestoSoundChoice;
  kds_sound_volume: number;
  loyalty_enabled: boolean;
  loyalty_earn_amount_per_point: number;
  loyalty_redeem_value_per_point: number;
  loyalty_min_points_to_redeem: number;
  cash_float_default: number;
  cash_float_required: boolean;
  reservation_sound_enabled: boolean;
  updated_at: string;
};
export const RESTO_SETTINGS_DEFAULTS: Omit<RestoSettings, "organization_id" | "updated_at"> = {
  kds_auto_refresh_seconds: 15,
  kds_urgency_minutes: 10,
  kds_sound_enabled: true,
  kds_sound_choice: "chime",
  kds_sound_volume: 0.6,
  loyalty_enabled: false,
  loyalty_earn_amount_per_point: 100,
  loyalty_redeem_value_per_point: 1,
  loyalty_min_points_to_redeem: 1,
  cash_float_default: 0,
  cash_float_required: false,
  reservation_sound_enabled: true,
};

export function useRestoSettings() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["resto_settings", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<RestoSettings | null> => {
      const { data, error } = await supabase.from("resto_settings")
        .select("*").eq("organization_id", organizationId!).maybeSingle();
      if (error) throw error;
      return data as RestoSettings | null;
    },
  });
}
export function useUpdateRestoSettings() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<RestoSettings>) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("resto_settings")
        .upsert({ ...s, organization_id: organizationId }).select().single();
      if (error) throw error; return data as RestoSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resto_settings", organizationId] }),
  });
}
// Alerte sonore "nouvelle réservation" (migration 046) — écoute directement
// les événements INSERT (payload disponible, contrairement au pattern
// invalidate-only de useRestoRealtimeInvalidate) pour ne sonner que sur une
// réservation source='public' (une réservation saisie par le staff
// lui-même n'a pas à s'auto-notifier). Réutilise la palette KDS
// (kds_sound_choice/kds_sound_volume) — à appeler une fois depuis l'écran
// Réservations.
export function useRestoNewReservationSoundAlert() {
  const organizationId = useOrganizationId();
  const { data: settingsRow } = useRestoSettings();
  const enabled = settingsRow?.reservation_sound_enabled ?? RESTO_SETTINGS_DEFAULTS.reservation_sound_enabled;
  const soundChoice = settingsRow?.kds_sound_choice ?? RESTO_SETTINGS_DEFAULTS.kds_sound_choice;
  const soundVolume = settingsRow?.kds_sound_volume ?? RESTO_SETTINGS_DEFAULTS.kds_sound_volume;

  useEffect(() => {
    if (!organizationId || !enabled) return;
    const channel = supabase
      .channel(`resto_reservations_sound_${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "resto_reservations", filter: `organization_id=eq.${organizationId}` },
        (payload: any) => {
          if (payload.new?.source === "public") playKdsSound(soundChoice, soundVolume);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId, enabled, soundChoice, soundVolume]);
}
