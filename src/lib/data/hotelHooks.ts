// ZegHotel — hooks Supabase, multi-tenant (organization_id), même
// conventions que src/lib/data/hooks.ts (ZegCaisse) : RLS fait foi côté
// serveur, le filtre organization_id ici est ceinture + bretelles.
// Toutes les tables sont préfixées hotel_ (migrations 020f-020j).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id ?? null;
}

// ============ TYPES ============
export type HotelRoomType = {
  id: string; organization_id: string; name: string; description: string | null;
  capacity_adults: number; capacity_children: number; amenities: string[];
  base_price: number; image_url: string | null; created_at: string;
};
export type HousekeepingStatus = "clean" | "dirty" | "inspected" | "out_of_service";
export type HotelRoom = {
  id: string; organization_id: string; room_type_id: string; number: string;
  floor: string | null; housekeeping_status: HousekeepingStatus; notes: string | null;
  created_at: string;
  // Présent quand la requête joint hotel_room_types (cas le plus courant) —
  // optionnel pour couvrir les rares lectures brutes de hotel_rooms seul.
  room_type?: HotelRoomType | null;
};
export type BillingUnit = "night" | "hour";
export type HotelRatePlan = {
  id: string; organization_id: string; room_type_id: string; name: string;
  includes_breakfast: boolean; refundable: boolean; price_adjustment_pct: number;
  // Nuitée ET horaire coexistent (ZegHotel Phase 1) — hourly_rate requis
  // si billing_unit = 'hour' (imposé en base, migration 028).
  billing_unit: BillingUnit; hourly_rate: number | null;
  created_at: string;
};
export type HotelSeasonalRate = {
  id: string; organization_id: string; room_type_id: string; name: string | null;
  start_date: string; end_date: string; price_override: number | null;
  days_of_week: number[] | null; created_at: string;
};
export type HotelRateRestriction = {
  id: string; organization_id: string; room_type_id: string | null;
  start_date: string; end_date: string; min_stay: number | null;
  stop_sell: boolean; closed_to_arrival: boolean; created_at: string;
};
export type HotelCorporateAccount = {
  id: string; organization_id: string; name: string; contact_name: string | null;
  contact_email: string | null; contact_phone: string | null;
  negotiated_discount_pct: number; billing_terms: string | null; created_at: string;
};
export type HotelSettings = {
  organization_id: string; secondary_currency: string | null;
  city_tax_enabled: boolean; city_tax_amount: number;
  default_cancellation_policy: string | null;
  occupancy_pricing_enabled: boolean; occupancy_pricing_threshold_pct: number;
  occupancy_pricing_adjustment_pct: number; updated_at: string;
};
export type HotelChannel = {
  id: string; organization_id: string; name: string; is_active: boolean;
  external_id: string | null; created_at: string;
};
export type HotelGuest = {
  id: string; organization_id: string; full_name: string; email: string | null;
  phone: string | null; id_document_type: string | null; id_document_number: string | null;
  nationality: string | null; address: string | null; notes: string | null; created_at: string;
  // Recommandé par rapport à un âge stocké, qui deviendrait faux avec le
  // temps (ZegHotel Phase 1).
  date_of_birth: string | null;
};
// Lecture "contact seul" (hotel_guest_contact(), migration 028) : pour les
// rôles qui n'ont pas besoin des données d'identité (CNI/passeport/
// adresse/date de naissance) — accountant en particulier. Masquage fait
// en SQL (security definer), pas seulement côté client.
export type HotelGuestContact = {
  id: string; organization_id: string; full_name: string; email: string | null;
  phone: string | null; nationality: string | null; notes: string | null; created_at: string;
};
export type ReservationStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type HotelReservation = {
  id: string; organization_id: string; guest_id: string; corporate_account_id: string | null;
  check_in: string; check_out: string; status: ReservationStatus;
  rate_plan_id: string | null; channel: string; adults: number; children: number;
  notes: string | null; created_by: string | null; created_at: string;
  cancelled_at: string | null; cancellation_reason: string | null;
  // Nuitée ET horaire (ZegHotel Phase 1, migration 028) — check_in/check_out
  // (date) restent la source de vérité "jour occupé" pour tout le reste du
  // système (dashboard, rapports, moteur de tarification) quel que soit
  // billing_unit. check_in_at/check_out_at = heures prévues (horaire
  // uniquement) ; actual_* = heures réelles, posées au check-in/check-out,
  // utilisées pour calculer la charge horaire réelle au check-out.
  billing_unit: BillingUnit;
  check_in_at: string | null; check_out_at: string | null;
  actual_check_in_at: string | null; actual_check_out_at: string | null;
};
export type HotelReservationRoom = {
  id: string; organization_id: string; reservation_id: string; room_id: string;
  rate_amount: number; check_in: string; check_out: string; status: ReservationStatus;
  created_at: string;
  billing_unit: BillingUnit; check_in_at: string | null; check_out_at: string | null;
  // Figé à la réservation (indépendant d'un changement ultérieur de la
  // formule tarifaire) — sert au calcul de la charge réelle au check-out.
  hourly_rate: number | null;
};
export type FolioStatus = "open" | "closed";
export type HotelFolio = {
  id: string; organization_id: string; reservation_id: string; status: FolioStatus;
  opened_at: string; closed_at: string | null; created_at: string;
  // Facturation différée (ZegHotel Phase 4, migration 031).
  billed_to_corporate: boolean; corporate_paid_at: string | null;
};
export type FolioChargeKind = "room" | "extra" | "penalty" | "tax" | "discount";
export type HotelFolioCharge = {
  id: string; organization_id: string; folio_id: string; kind: FolioChargeKind;
  description: string; amount: number; quantity: number; charge_date: string;
  created_by: string | null; created_at: string;
};
export type HotelPaymentMethod = "cash" | "mobile_money" | "card" | "bank_transfer";
export type HotelPaymentKind = "deposit" | "payment" | "refund";
export type HotelPayment = {
  id: string; organization_id: string; folio_id: string; amount: number;
  method: HotelPaymentMethod; kind: HotelPaymentKind; reference: string | null;
  created_by: string | null; created_at: string;
};
export type HousekeepingTaskKind = "cleaning" | "turnover" | "inspection";
export type HousekeepingTaskStatus = "pending" | "in_progress" | "done";
export type HotelHousekeepingTask = {
  id: string; organization_id: string; room_id: string; task_date: string;
  kind: HousekeepingTaskKind; status: HousekeepingTaskStatus;
  assigned_to: string | null; notes: string | null; created_at: string; completed_at: string | null;
};
export type MaintenancePriority = "low" | "normal" | "high" | "urgent";
export type MaintenanceStatus = "open" | "in_progress" | "resolved";
export type HotelMaintenanceTicket = {
  id: string; organization_id: string; room_id: string; title: string; description: string | null;
  status: MaintenanceStatus; priority: MaintenancePriority; reported_by: string | null;
  created_at: string; resolved_at: string | null;
};

// ============ ROOM TYPES ============
export function useHotelRoomTypes() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_room_types", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelRoomType[]> => {
      const { data, error } = await supabase.from("hotel_room_types")
        .select("*").eq("organization_id", organizationId!).order("base_price");
      if (error) throw error;
      return data as HotelRoomType[];
    },
  });
}
export function useUpsertHotelRoomType() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<HotelRoomType> & { name: string; base_price: number }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_room_types")
        .upsert({ ...t, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_room_types", organizationId] }),
  });
}
export function useDeleteHotelRoomType() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_room_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_room_types", organizationId] }),
  });
}

// ============ ROOMS ============
export function useHotelRooms() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_rooms", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<(HotelRoom & { room_type: HotelRoomType | null })[]> => {
      const { data, error } = await supabase.from("hotel_rooms")
        .select("*, room_type:hotel_room_types(*)").eq("organization_id", organizationId!).order("number");
      if (error) throw error;
      return data as any;
    },
  });
}
export function useUpsertHotelRoom() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<HotelRoom> & { number: string; room_type_id: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_rooms")
        .upsert({ ...r, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] }),
  });
}
export function useDeleteHotelRoom() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] }),
  });
}
export function useSetRoomHousekeepingStatus() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: HousekeepingStatus }) => {
      const { error } = await supabase.from("hotel_rooms").update({ housekeeping_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_housekeeping_tasks", organizationId] });
    },
  });
}

// ============ RATE PLANS ============
export function useHotelRatePlans() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_rate_plans", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelRatePlan[]> => {
      const { data, error } = await supabase.from("hotel_rate_plans")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as HotelRatePlan[];
    },
  });
}
export function useUpsertHotelRatePlan() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<HotelRatePlan> & { name: string; room_type_id: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_rate_plans")
        .upsert({ ...p, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_plans", organizationId] }),
  });
}
export function useDeleteHotelRatePlan() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_rate_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_plans", organizationId] }),
  });
}

// ============ SEASONAL RATES ============
export function useHotelSeasonalRates() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_seasonal_rates", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelSeasonalRate[]> => {
      const { data, error } = await supabase.from("hotel_seasonal_rates")
        .select("*").eq("organization_id", organizationId!).order("start_date");
      if (error) throw error;
      return data as HotelSeasonalRate[];
    },
  });
}
export function useUpsertHotelSeasonalRate() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<HotelSeasonalRate> & { room_type_id: string; start_date: string; end_date: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_seasonal_rates")
        .upsert({ ...s, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_seasonal_rates", organizationId] }),
  });
}
export function useDeleteHotelSeasonalRate() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_seasonal_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_seasonal_rates", organizationId] }),
  });
}

// ============ RATE RESTRICTIONS ============
export function useHotelRateRestrictions() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_rate_restrictions", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelRateRestriction[]> => {
      const { data, error } = await supabase.from("hotel_rate_restrictions")
        .select("*").eq("organization_id", organizationId!).order("start_date");
      if (error) throw error;
      return data as HotelRateRestriction[];
    },
  });
}
export function useUpsertHotelRateRestriction() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<HotelRateRestriction> & { start_date: string; end_date: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_rate_restrictions")
        .upsert({ ...r, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_restrictions", organizationId] }),
  });
}
export function useDeleteHotelRateRestriction() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_rate_restrictions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_rate_restrictions", organizationId] }),
  });
}

// ============ CORPORATE ACCOUNTS ============
export function useHotelCorporateAccounts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_corporate_accounts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelCorporateAccount[]> => {
      const { data, error } = await supabase.from("hotel_corporate_accounts")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as HotelCorporateAccount[];
    },
  });
}
export function useUpsertHotelCorporateAccount() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<HotelCorporateAccount> & { name: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_corporate_accounts")
        .upsert({ ...c, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_corporate_accounts", organizationId] }),
  });
}
export function useDeleteHotelCorporateAccount() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_corporate_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_corporate_accounts", organizationId] }),
  });
}

// ============ SETTINGS (tarification) ============
export function useHotelSettings() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_settings", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelSettings | null> => {
      const { data, error } = await supabase.from("hotel_settings")
        .select("*").eq("organization_id", organizationId!).maybeSingle();
      if (error) throw error;
      return data as HotelSettings | null;
    },
  });
}
export function useUpdateHotelSettings() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<HotelSettings>) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_settings")
        .upsert({ ...s, organization_id: organizationId }).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_settings", organizationId] }),
  });
}

// ============ CHANNELS (structure V1) ============
export function useHotelChannels() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_channels", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelChannel[]> => {
      const { data, error } = await supabase.from("hotel_channels")
        .select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return data as HotelChannel[];
    },
  });
}

// ============ GUESTS ============
export function useHotelGuests(search?: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_guests", organizationId, search ?? ""],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelGuest[]> => {
      let q = supabase.from("hotel_guests").select("*").eq("organization_id", organizationId!);
      if (search?.trim()) q = q.or(`full_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      const { data, error } = await q.order("full_name").limit(50);
      if (error) throw error;
      return data as HotelGuest[];
    },
  });
}
// Lecture "contact seul" (nom/email/téléphone) via hotel_guest_contact()
// (migration 028) — pour les contextes accessibles à accountant (dashboard
// arrivées/départs) qui n'ont pas besoin des données d'identité
// (CNI/passeport/adresse/date de naissance), désormais réservées à
// owner/manager/front_desk directement sur hotel_guests.
export function useHotelGuestContacts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_guest_contacts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelGuestContact[]> => {
      const { data, error } = await supabase.rpc("hotel_guest_contact", { _organization_id: organizationId! });
      if (error) throw error;
      return (data ?? []) as HotelGuestContact[];
    },
  });
}
export function useUpsertHotelGuest() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: Partial<HotelGuest> & { full_name: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data, error } = await supabase.from("hotel_guests")
        .upsert({ ...g, organization_id: organizationId }).select().single();
      if (error) throw error; return data as HotelGuest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_guests", organizationId] }),
  });
}
// on delete restrict sur hotel_reservations.guest_id : la suppression
// échoue (erreur remontée à l'appelant) si le client a au moins une
// réservation — voulu, un client avec un historique de séjours ne doit
// pas pouvoir disparaître silencieusement (facturation/rapports).
export function useDeleteHotelGuest() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hotel_guests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_guests", organizationId] }),
  });
}

// ============ MODULE CLIENTS (ZegHotel Phase 2) ============
// hotel_guest_summary() (migration 029) agrège côté serveur (nombre de
// séjours, total dépensé, dernière arrivée) — évite de faire remonter tous
// les folios/charges de l'établissement au client pour calculer des
// totaux qui grossissent avec l'historique.
export type HotelGuestSummary = {
  guest_id: string; total_stays: number; total_spent: number; last_check_in: string | null;
};
export function useHotelGuestSummaries() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_guest_summary", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Record<string, HotelGuestSummary>> => {
      const { data, error } = await supabase.rpc("hotel_guest_summary", { _organization_id: organizationId! });
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as HotelGuestSummary[]).map((s) => [s.guest_id, s]));
    },
  });
}
export type HotelGuestStay = {
  reservation_id: string; check_in: string; check_out: string; status: ReservationStatus;
  billing_unit: BillingUnit; total: number;
};
export function useHotelGuestStays(guestId: string | null) {
  return useQuery({
    queryKey: ["hotel_guest_stays", guestId],
    enabled: !!guestId,
    queryFn: async (): Promise<HotelGuestStay[]> => {
      const { data: reservations, error } = await supabase.from("hotel_reservations")
        .select("id, check_in, check_out, status, billing_unit")
        .eq("guest_id", guestId!).order("check_in", { ascending: false });
      if (error) throw error;
      const reservationIds = (reservations ?? []).map((r: any) => r.id);
      if (!reservationIds.length) return [];

      const { data: folios, error: folioErr } = await supabase.from("hotel_folios")
        .select("id, reservation_id").in("reservation_id", reservationIds);
      if (folioErr) throw folioErr;
      const folioIdByReservation = new Map<string, string>((folios ?? []).map((f: any) => [f.reservation_id, f.id]));
      const folioIds = (folios ?? []).map((f: any) => f.id);

      const totalByFolio = new Map<string, number>();
      if (folioIds.length) {
        const { data: charges, error: chargesErr } = await supabase.from("hotel_folio_charges")
          .select("folio_id, amount, quantity").in("folio_id", folioIds);
        if (chargesErr) throw chargesErr;
        for (const c of (charges ?? []) as any[]) {
          totalByFolio.set(c.folio_id, (totalByFolio.get(c.folio_id) ?? 0) + c.amount * c.quantity);
        }
      }

      return (reservations ?? []).map((r: any) => ({
        reservation_id: r.id, check_in: r.check_in, check_out: r.check_out, status: r.status, billing_unit: r.billing_unit,
        total: totalByFolio.get(folioIdByReservation.get(r.id) ?? "") ?? 0,
      }));
    },
  });
}

// ============ RESERVATIONS ============
export type HotelReservationRow = HotelReservation & {
  guest: HotelGuest | null;
  reservation_rooms: (HotelReservationRoom & { room: HotelRoom | null })[];
};

// Fenêtre du calendrier : toute réservation qui chevauche [start, end].
export function useHotelReservations(rangeStart: string, rangeEnd: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_reservations", organizationId, rangeStart, rangeEnd],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelReservationRow[]> => {
      const { data, error } = await supabase.from("hotel_reservations")
        .select("*, guest:hotel_guests(*), reservation_rooms:hotel_reservation_rooms(*, room:hotel_rooms(*))")
        .eq("organization_id", organizationId!)
        .lt("check_in", rangeEnd).gt("check_out", rangeStart)
        .order("check_in");
      if (error) throw error;
      return data as any;
    },
  });
}
export function useHotelReservation(id: string | null) {
  return useQuery({
    queryKey: ["hotel_reservation", id],
    enabled: !!id,
    queryFn: async (): Promise<HotelReservationRow> => {
      const { data, error } = await supabase.from("hotel_reservations")
        .select("*, guest:hotel_guests(*), reservation_rooms:hotel_reservation_rooms(*, room:hotel_rooms(*, room_type:hotel_room_types(*)))")
        .eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
  });
}

export type CreateReservationInput = {
  guest_id: string; check_in: string; check_out: string;
  rate_plan_id?: string | null; corporate_account_id?: string | null;
  channel?: string; adults?: number; children?: number; notes?: string;
  // rate_amount null = pas de saisie manuelle par la réception : le
  // serveur calcule le tarif définitif (tarif saisonnier + formule
  // tarifaire, migration 027). Un nombre = override manuel explicite,
  // toujours prioritaire.
  rooms: { room_id: string; rate_amount: number | null }[];
  // Requis uniquement si la formule tarifaire choisie est horaire
  // (billing_unit = 'hour', ZegHotel Phase 1) — le serveur les impose
  // (migration 028), non nécessaires pour une réservation nuitée.
  check_in_at?: string | null; check_out_at?: string | null;
};
// RPC atomique (migration 027) plutôt que 3 écritures client séparées
// (hotel_reservations, hotel_reservation_rooms, hotel_folios) : vérifie
// aussi les restrictions (séjour minimum/stop-vente/fermé à l'arrivée,
// jusqu'ici configurables en Paramètres > Tarification mais jamais
// appliquées) avant toute écriture, et calcule le tarif via le tarif
// saisonnier + la formule tarifaire si la réception n'a pas saisi de prix
// manuel — jusqu'ici le prix venait uniquement de room_type.base_price,
// la formule tarifaire choisie n'étant enregistrée que pour l'affichage.
export function useCreateHotelReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      if (!input.rooms.length) throw new Error("Sélectionnez au moins une chambre.");
      const { data, error } = await supabase.rpc("create_hotel_reservation", {
        p_organization_id: organizationId,
        p_guest_id: input.guest_id,
        p_check_in: input.check_in,
        p_check_out: input.check_out,
        p_rooms: input.rooms,
        p_rate_plan_id: input.rate_plan_id ?? null,
        p_corporate_account_id: input.corporate_account_id ?? null,
        p_channel: input.channel ?? "direct",
        p_adults: input.adults ?? 1,
        p_children: input.children ?? 0,
        p_notes: input.notes ?? null,
        p_check_in_at: input.check_in_at ?? null,
        p_check_out_at: input.check_out_at ?? null,
      });
      if (error) throw error;
      return data as HotelReservation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] });
    },
  });
}

export function useUpdateHotelReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<HotelReservation> & { id: string }) => {
      const { error } = await supabase.from("hotel_reservations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["hotel_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_reservation", vars.id] });
    },
  });
}

// Check-in : bascule la réservation (le trigger BDD répercute sur les
// lignes hotel_reservation_rooms) ET poste la charge "chambre" dans le
// folio — avant ce correctif, le tarif de la chambre n'était JAMAIS
// facturé (seuls les extras ajoutés manuellement dans le folio comptaient),
// d'où un solde à 0F systématique au check-out et des rapports d'occupation/
// ADR/RevPAR à 0 (ils lisent hotel_reservation_rooms.rate_amount, mais le
// folio — source de vérité pour la facturation — restait vide). Idempotent
// (vérifie qu'aucune charge "room" n'existe déjà) pour rester sûr même en
// cas de nouvel appel. Correctif purement applicatif — le check-in ne
// transite que par ce hook, pas besoin de trigger SQL.
//
// Poste aussi la taxe de séjour si hotel_settings.city_tax_enabled (jusqu'ici
// configurable en Paramètres > Tarification mais jamais réellement
// facturée nulle part) : city_tax_amount par personne (adultes + enfants de
// la réservation) et par nuit, une ligne par chambre — même granularité que
// la charge "room" ci-dessus. Le mode de calcul exact (par personne, par
// chambre, plafonné...) varie selon la réglementation locale ; à ajuster
// dans ce hook si celui d'Emmanuel diffère.
//
// Nuitée ET horaire (ZegHotel Phase 1, migration 028) : une réservation
// horaire n'a généralement pas d'heure de départ connue à l'avance — la
// charge chambre n'est donc PAS postée ici pour elle (ni la taxe de
// séjour, un concept nuitée par personne/par nuit qui ne s'applique pas à
// un passage horaire), seulement actual_check_in_at est enregistré ; le
// montant réel est calculé et posté au check-out (useCheckOutReservation)
// à partir de la durée effectivement écoulée.
export function useCheckInReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { error: resErr } = await supabase.from("hotel_reservations")
        .update({ status: "checked_in", actual_check_in_at: new Date().toISOString() }).eq("id", id);
      if (resErr) throw resErr;

      const { data: reservation, error: reservationErr } = await supabase.from("hotel_reservations")
        .select("adults, children, billing_unit").eq("id", id).maybeSingle();
      if (reservationErr) throw reservationErr;
      if (reservation?.billing_unit === "hour") return;

      const { data: folio, error: folioErr } = await supabase.from("hotel_folios")
        .select("id").eq("reservation_id", id).maybeSingle();
      if (folioErr) throw folioErr;
      if (!folio) return;

      const { data: existingRoomCharges, error: existErr } = await supabase.from("hotel_folio_charges")
        .select("id").eq("folio_id", folio.id).eq("kind", "room").limit(1);
      if (existErr) throw existErr;
      if (existingRoomCharges && existingRoomCharges.length > 0) return;

      const { data: settings, error: settingsErr } = await supabase.from("hotel_settings")
        .select("city_tax_enabled, city_tax_amount").eq("organization_id", organizationId).maybeSingle();
      if (settingsErr) throw settingsErr;

      const { data: rooms, error: roomsErr } = await supabase.from("hotel_reservation_rooms")
        .select("*, room:hotel_rooms(number, room_type:hotel_room_types(name))")
        .eq("reservation_id", id);
      if (roomsErr) throw roomsErr;

      const occupants = Math.max(1, (reservation?.adults ?? 1) + (reservation?.children ?? 0));
      const charges = (rooms ?? []).flatMap((rr: any) => {
        const nights = Math.max(1, Math.round((new Date(rr.check_out).getTime() - new Date(rr.check_in).getTime()) / 86400000));
        const roomLabel = `Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""}`.trim();
        const lines = [{
          organization_id: organizationId, folio_id: folio.id, kind: "room" as FolioChargeKind,
          description: roomLabel, amount: rr.rate_amount / nights, quantity: nights, charge_date: rr.check_in,
        }];
        if (settings?.city_tax_enabled && settings.city_tax_amount > 0) {
          lines.push({
            organization_id: organizationId, folio_id: folio.id, kind: "tax" as FolioChargeKind,
            description: `Taxe de séjour — ${roomLabel}`, amount: settings.city_tax_amount,
            quantity: nights * occupants, charge_date: rr.check_in,
          });
        }
        return lines;
      });
      if (charges.length) {
        const { error: insErr } = await supabase.from("hotel_folio_charges").insert(charges);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["hotel_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_reservation", id] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" });
    },
  });
}

// Check-out : bascule la réservation ET marque les chambres occupées
// "dirty" (elles ont besoin d'un ménage avant la prochaine arrivée) — la
// clôture financière du folio reste une action explicite séparée
// (useCloseFolio), pour laisser la réception encaisser un solde en retard
// avant de fermer la note.
//
// Horaire (ZegHotel Phase 1, migration 028) : c'est ICI, et seulement ici,
// que la charge chambre est calculée et postée pour une réservation
// horaire — à partir de la durée réellement écoulée entre
// actual_check_in_at et maintenant, arrondie à l'heure supérieure (1h
// minimum facturée ; règle documentée, pas encore configurable par
// établissement). hourly_rate est celui figé sur hotel_reservation_rooms
// à la réservation (indépendant d'un changement ultérieur de la formule
// tarifaire) — pas une relecture de hotel_rate_plans.hourly_rate.
export function useCheckOutReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const nowIso = new Date().toISOString();
      const { data: reservation, error: resSelErr } = await supabase.from("hotel_reservations")
        .select("billing_unit, actual_check_in_at").eq("id", id).maybeSingle();
      if (resSelErr) throw resSelErr;

      const { error: resErr } = await supabase.from("hotel_reservations")
        .update({ status: "checked_out", actual_check_out_at: nowIso }).eq("id", id);
      if (resErr) throw resErr;

      if (reservation?.billing_unit === "hour" && reservation.actual_check_in_at) {
        const { data: folio, error: folioErr } = await supabase.from("hotel_folios")
          .select("id").eq("reservation_id", id).maybeSingle();
        if (folioErr) throw folioErr;
        if (folio) {
          const { data: existingRoomCharges, error: existErr } = await supabase.from("hotel_folio_charges")
            .select("id").eq("folio_id", folio.id).eq("kind", "room").limit(1);
          if (existErr) throw existErr;
          if (!existingRoomCharges || existingRoomCharges.length === 0) {
            const { data: chargeRooms, error: chargeRoomsErr } = await supabase.from("hotel_reservation_rooms")
              .select("hourly_rate, room:hotel_rooms(number, room_type:hotel_room_types(name))")
              .eq("reservation_id", id);
            if (chargeRoomsErr) throw chargeRoomsErr;

            const elapsedMs = new Date(nowIso).getTime() - new Date(reservation.actual_check_in_at).getTime();
            const billedHours = Math.max(1, Math.ceil(elapsedMs / 3_600_000));
            const charges = (chargeRooms ?? []).map((rr: any) => ({
              organization_id: organizationId, folio_id: folio.id, kind: "room" as FolioChargeKind,
              description: `Chambre ${rr.room?.number ?? "—"} — ${rr.room?.room_type?.name ?? ""}`.trim(),
              amount: rr.hourly_rate ?? 0, quantity: billedHours, charge_date: nowIso.slice(0, 10),
            }));
            if (charges.length) {
              const { error: insErr } = await supabase.from("hotel_folio_charges").insert(charges);
              if (insErr) throw insErr;
            }
          }
        }
      }

      const { data: rooms, error: roomsErr } = await supabase.from("hotel_reservation_rooms")
        .select("room_id").eq("reservation_id", id);
      if (roomsErr) throw roomsErr;
      const roomIds = (rooms ?? []).map((r: any) => r.room_id);
      if (roomIds.length) {
        const { error: dirtyErr } = await supabase.from("hotel_rooms")
          .update({ housekeeping_status: "dirty" }).in("id", roomIds).neq("housekeeping_status", "out_of_service");
        if (dirtyErr) throw dirtyErr;
      }
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["hotel_reservations", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_reservation", id] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" });
    },
  });
}

export function useCancelReservation() {
  const update = useUpdateHotelReservation();
  return (id: string, reason?: string) =>
    update.mutateAsync({ id, status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason ?? null });
}

// ============ FOLIOS / CHARGES / PAYMENTS ============
export type HotelFolioDetail = HotelFolio & {
  charges: HotelFolioCharge[]; payments: HotelPayment[];
};
export function useHotelFolio(reservationId: string | null) {
  return useQuery({
    queryKey: ["hotel_folio", reservationId],
    enabled: !!reservationId,
    queryFn: async (): Promise<HotelFolioDetail | null> => {
      const { data: folio, error } = await supabase.from("hotel_folios")
        .select("*").eq("reservation_id", reservationId!).maybeSingle();
      if (error) throw error;
      if (!folio) return null;
      const [{ data: charges, error: chErr }, { data: payments, error: payErr }] = await Promise.all([
        supabase.from("hotel_folio_charges").select("*").eq("folio_id", folio.id).order("charge_date"),
        supabase.from("hotel_payments").select("*").eq("folio_id", folio.id).order("created_at"),
      ]);
      if (chErr) throw chErr;
      if (payErr) throw payErr;
      return { ...folio, charges: (charges ?? []) as HotelFolioCharge[], payments: (payments ?? []) as HotelPayment[] };
    },
  });
}
export function useAddFolioCharge() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { folio_id: string; kind: FolioChargeKind; description: string; amount: number; quantity?: number; charge_date?: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { error } = await supabase.from("hotel_folio_charges").insert({ ...c, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" }),
  });
}
export function useAddFolioPayment() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { folio_id: string; amount: number; method: HotelPaymentMethod; kind?: HotelPaymentKind; reference?: string }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { error } = await supabase.from("hotel_payments").insert({ ...p, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" }),
  });
}
export function folioBalance(folio: HotelFolioDetail): number {
  const charges = folio.charges.reduce((s, c) => s + c.amount * c.quantity, 0);
  const paid = folio.payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  return charges - paid;
}
// Recalcule le solde depuis la base (pas depuis l'objet folio déjà en
// mémoire côté client) avant de clôturer — sans ce garde-fous, une note
// pouvait être clôturée avec un solde positif sans confirmation ni blocage,
// le client quittant en devant de l'argent qu'on considère ensuite comme
// réglé. Une note avec un solde à régler autrement (remise, perte
// commerciale) doit d'abord recevoir une charge "discount" qui l'amène à 0
// — pas de clôture forcée en dehors de ce chemin.
//
// billToCorporate (ZegHotel Phase 4, migration 031) : seule exception au
// solde-à-zéro — une réservation rattachée à un compte entreprise peut être
// clôturée avec un solde positif restant, marqué "à facturer à
// l'entreprise" (billed_to_corporate). Un solde négatif (trop perçu) reste
// bloqué dans tous les cas, facturation différée ou non.
export function useCloseFolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ folioId, billToCorporate }: { folioId: string; billToCorporate?: boolean }) => {
      const chargesRes = await supabase.from("hotel_folio_charges").select("amount, quantity").eq("folio_id", folioId);
      if (chargesRes.error) throw chargesRes.error;
      const paymentsRes = await supabase.from("hotel_payments").select("amount, kind").eq("folio_id", folioId);
      if (paymentsRes.error) throw paymentsRes.error;
      const charges = (chargesRes.data ?? []) as { amount: number; quantity: number }[];
      const payments = (paymentsRes.data ?? []) as { amount: number; kind: HotelPaymentKind }[];
      const totalCharges = charges.reduce((s, c) => s + Number(c.amount) * Number(c.quantity), 0);
      const totalPaid = payments.reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0);
      const balance = totalCharges - totalPaid;
      const canBillCorporate = billToCorporate && balance > 0;
      if (Math.round(balance) !== 0 && !canBillCorporate) {
        throw new Error(`Impossible de clôturer : solde non nul (${balance > 0 ? "reste dû" : "trop perçu"}). Encaissez le solde ou ajoutez une charge d'ajustement avant de clôturer.`);
      }

      const { error } = await supabase.from("hotel_folios")
        .update({ status: "closed", closed_at: new Date().toISOString(), billed_to_corporate: !!canBillCorporate })
        .eq("id", folioId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" || q.queryKey[0] === "hotel_corporate_invoices" }),
  });
}

// Règlement d'une facture entreprise en attente (ZegHotel Phase 4) : si un
// solde reste dû, enregistre un hotel_payments (bank_transfer) pour le
// montant restant — folioBalance() retombe alors naturellement à 0, aucun
// cas particulier ailleurs — puis marque corporate_paid_at (marqueur
// en attente/réglé pour le relevé mensuel).
export function useMarkCorporateInvoicePaid() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (folioId: string) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const chargesRes = await supabase.from("hotel_folio_charges").select("amount, quantity").eq("folio_id", folioId);
      if (chargesRes.error) throw chargesRes.error;
      const paymentsRes = await supabase.from("hotel_payments").select("amount, kind").eq("folio_id", folioId);
      if (paymentsRes.error) throw paymentsRes.error;
      const charges = (chargesRes.data ?? []) as { amount: number; quantity: number }[];
      const payments = (paymentsRes.data ?? []) as { amount: number; kind: HotelPaymentKind }[];
      const totalCharges = charges.reduce((s, c) => s + Number(c.amount) * Number(c.quantity), 0);
      const totalPaid = payments.reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0);
      const balance = totalCharges - totalPaid;
      if (balance > 0) {
        const { error: payErr } = await supabase.from("hotel_payments").insert({
          organization_id: organizationId, folio_id: folioId, amount: balance,
          method: "bank_transfer", kind: "payment", reference: "Règlement compte entreprise",
        });
        if (payErr) throw payErr;
      }
      const { error } = await supabase.from("hotel_folios")
        .update({ corporate_paid_at: new Date().toISOString() }).eq("id", folioId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_folio" || q.queryKey[0] === "hotel_corporate_invoices" }),
  });
}

// Liste des notes facturées à un compte entreprise (ZegHotel Phase 4) —
// noms de clients via hotel_guest_contact() (pas un embed direct sur
// hotel_guests) : cet écran reste accessible à accountant, qui n'a plus
// accès aux données d'identité depuis le durcissement RLS de la Phase 1.
export type HotelCorporateInvoice = {
  folio_id: string; reservation_id: string; corporate_account_id: string | null;
  guest_name: string; check_out: string; closed_at: string | null;
  total: number; corporate_paid_at: string | null;
};
export function useHotelCorporateInvoices() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_corporate_invoices", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<HotelCorporateInvoice[]> => {
      const { data: folios, error } = await supabase.from("hotel_folios")
        .select("id, reservation_id, closed_at, corporate_paid_at")
        .eq("organization_id", organizationId!).eq("billed_to_corporate", true)
        .order("closed_at", { ascending: false });
      if (error) throw error;
      const folioIds = (folios ?? []).map((f: any) => f.id);
      if (!folioIds.length) return [];
      const reservationIds = (folios ?? []).map((f: any) => f.reservation_id);

      const [{ data: reservations, error: resErr }, { data: charges, error: chErr }, { data: payments, error: payErr }, { data: guestContacts, error: guestErr }] = await Promise.all([
        supabase.from("hotel_reservations").select("id, guest_id, corporate_account_id, check_out").in("id", reservationIds),
        supabase.from("hotel_folio_charges").select("folio_id, amount, quantity").in("folio_id", folioIds),
        supabase.from("hotel_payments").select("folio_id, amount, kind").in("folio_id", folioIds),
        supabase.rpc("hotel_guest_contact", { _organization_id: organizationId! }),
      ]);
      if (resErr) throw resErr;
      if (chErr) throw chErr;
      if (payErr) throw payErr;
      if (guestErr) throw guestErr;

      const reservationById = new Map<string, any>((reservations ?? []).map((r: any) => [r.id, r]));
      const guestNameById = new Map(((guestContacts ?? []) as HotelGuestContact[]).map((g) => [g.id, g.full_name]));
      const totalByFolio = new Map<string, number>();
      for (const c of (charges ?? []) as any[]) totalByFolio.set(c.folio_id, (totalByFolio.get(c.folio_id) ?? 0) + c.amount * c.quantity);
      for (const p of (payments ?? []) as any[]) {
        const delta = p.kind === "refund" ? p.amount : -p.amount;
        totalByFolio.set(p.folio_id, (totalByFolio.get(p.folio_id) ?? 0) + delta);
      }

      return (folios ?? []).flatMap((f: any) => {
        const r = reservationById.get(f.reservation_id);
        if (!r) return [];
        return [{
          folio_id: f.id, reservation_id: f.reservation_id, corporate_account_id: r.corporate_account_id,
          guest_name: guestNameById.get(r.guest_id) ?? "—", check_out: r.check_out, closed_at: f.closed_at,
          total: totalByFolio.get(f.id) ?? 0, corporate_paid_at: f.corporate_paid_at,
        }];
      });
    },
  });
}

// ============ HOUSEKEEPING ============
export function useHotelHousekeepingTasks(date: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_housekeeping_tasks", organizationId, date],
    enabled: !!organizationId,
    queryFn: async (): Promise<(HotelHousekeepingTask & { room: HotelRoom | null })[]> => {
      const { data, error } = await supabase.from("hotel_housekeeping_tasks")
        .select("*, room:hotel_rooms(*)").eq("organization_id", organizationId!).eq("task_date", date)
        .order("created_at");
      if (error) throw error;
      return data as any;
    },
  });
}
// Génère les tâches du jour : une tâche "turnover" pour chaque chambre
// marquée "dirty" qui n'a pas déjà de tâche ouverte ce jour-là — évite les
// doublons si le bouton est cliqué deux fois.
export function useGenerateHousekeepingTasks() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data: dirtyRooms, error: roomsErr } = await supabase.from("hotel_rooms")
        .select("id").eq("organization_id", organizationId).eq("housekeeping_status", "dirty");
      if (roomsErr) throw roomsErr;
      const { data: existing, error: existErr } = await supabase.from("hotel_housekeeping_tasks")
        .select("room_id").eq("organization_id", organizationId).eq("task_date", date).neq("status", "done");
      if (existErr) throw existErr;
      const existingRoomIds = new Set((existing ?? []).map((t: any) => t.room_id));
      const toCreate = (dirtyRooms ?? []).filter((r: any) => !existingRoomIds.has(r.id));
      if (!toCreate.length) return 0;
      const { error: insErr } = await supabase.from("hotel_housekeeping_tasks").insert(
        toCreate.map((r: any) => ({ organization_id: organizationId, room_id: r.id, task_date: date, kind: "turnover" as const })),
      );
      if (insErr) throw insErr;
      return toCreate.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_housekeeping_tasks", organizationId] }),
  });
}
export function useUpdateHousekeepingTaskStatus() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: HousekeepingTaskStatus }) => {
      const patch: any = { status };
      if (status === "done") patch.completed_at = new Date().toISOString();
      const { data: task, error } = await supabase.from("hotel_housekeeping_tasks").update(patch).eq("id", id).select().single();
      if (error) throw error;
      if (status === "done") {
        const { error: roomErr } = await supabase.from("hotel_rooms").update({ housekeeping_status: "clean" }).eq("id", task.room_id);
        if (roomErr) throw roomErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_housekeeping_tasks", organizationId] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms", organizationId] });
    },
  });
}

// ============ MAINTENANCE ============
export function useHotelMaintenanceTickets() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_maintenance_tickets", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<(HotelMaintenanceTicket & { room: HotelRoom | null })[]> => {
      const { data, error } = await supabase.from("hotel_maintenance_tickets")
        .select("*, room:hotel_rooms(*)").eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any;
    },
  });
}
export function useCreateMaintenanceTicket() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { room_id: string; title: string; description?: string; priority?: MaintenancePriority }) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { error } = await supabase.from("hotel_maintenance_tickets").insert({ ...t, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_maintenance_tickets", organizationId] }),
  });
}
export function useUpdateMaintenanceTicket() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<HotelMaintenanceTicket> & { id: string }) => {
      if (patch.status === "resolved" && !patch.resolved_at) patch.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("hotel_maintenance_tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotel_maintenance_tickets", organizationId] }),
  });
}

// ============ DASHBOARD ============
export type HotelDashboardReservation = HotelReservation & { guest: HotelGuestContact | null };

export function useHotelDashboardStats(today: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_dashboard", organizationId, today],
    enabled: !!organizationId,
    queryFn: async () => {
      // Bug corrigé : la 4e requête (nuitées en cours) est en head:true —
      // Supabase renvoie alors data: null (aucune ligne, juste le compte) —
      // elle était destructurée en { data: inHouse } au lieu de
      // { count: occupied }. `inHouse.count` sur un null jetait une
      // exception à chaque appel, faisant échouer TOUTE la requête
      // silencieusement (React Query gardait `stats` à undefined) — d'où
      // le "0/0 chambres" permanent malgré totalRooms correctement récupéré
      // juste au-dessus dans le même Promise.all.
      //
      // guest:hotel_guests(*) remplacé par hotel_guest_contact() (migration
      // 028) : ce tableau de bord est accessible à accountant, qui n'a plus
      // accès à hotel_guests en RLS depuis le durcissement des données
      // d'identité — l'embed PostgREST renverrait guest: null pour lui
      // sinon (RLS bloque la ligne entière, pas seulement les colonnes
      // sensibles), faisant disparaître le nom du client sur le dashboard.
      const [{ count: totalRooms }, { data: arrivals }, { data: departures }, { count: occupied }, { data: guestContacts }] = await Promise.all([
        supabase.from("hotel_rooms").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!),
        supabase.from("hotel_reservations").select("*").eq("organization_id", organizationId!)
          .eq("check_in", today).in("status", ["pending", "confirmed"]),
        supabase.from("hotel_reservations").select("*").eq("organization_id", organizationId!)
          .eq("check_out", today).eq("status", "checked_in"),
        supabase.from("hotel_reservations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!)
          .eq("status", "checked_in").lte("check_in", today).gt("check_out", today),
        supabase.rpc("hotel_guest_contact", { _organization_id: organizationId! }),
      ]);
      const guestById = new Map((guestContacts ?? []).map((g: HotelGuestContact) => [g.id, g]));
      const withGuest = (rows: any[] | null): HotelDashboardReservation[] =>
        (rows ?? []).map((r) => ({ ...r, guest: guestById.get(r.guest_id) ?? null }));
      return {
        totalRooms: totalRooms ?? 0,
        occupied: occupied ?? 0,
        occupancyPct: totalRooms ? Math.round(((occupied ?? 0) / totalRooms) * 100) : 0,
        arrivals: withGuest(arrivals),
        departures: withGuest(departures),
      };
    },
  });
}

// ============ AUDIT DE NUIT ============
// Rollover de fin de journée : toute réservation encore "pending"/"confirmed"
// dont l'arrivée était aujourd'hui et qui n'a jamais été check-in est
// requalifiée "no_show" (la nuit est passée, la chambre n'a pas été prise) —
// libère la contrainte d'exclusion pour de nouvelles réservations sur ces
// dates. Le CA d'hébergement étant porté par hotel_reservation_rooms.rate_amount
// (montant total du séjour, pas un montant par nuit), il n'y a pas de charge
// "room" à re-poster jour par jour ici.
export function useRunNightAudit() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (today: string) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      const { data: noShows, error: selErr } = await supabase.from("hotel_reservations")
        .select("id").eq("organization_id", organizationId).eq("check_in", today).in("status", ["pending", "confirmed"]);
      if (selErr) throw selErr;
      const ids = (noShows ?? []).map((r: any) => r.id);
      if (ids.length) {
        const { error: updErr } = await supabase.from("hotel_reservations")
          .update({ status: "no_show" }).in("id", ids);
        if (updErr) throw updErr;
      }
      return { noShowCount: ids.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "hotel_reservations" || q.queryKey[0] === "hotel_dashboard" });
    },
  });
}
