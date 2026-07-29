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
export type HotelRatePlan = {
  id: string; organization_id: string; room_type_id: string; name: string;
  includes_breakfast: boolean; refundable: boolean; price_adjustment_pct: number;
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
};
export type ReservationStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type HotelReservation = {
  id: string; organization_id: string; guest_id: string; corporate_account_id: string | null;
  check_in: string; check_out: string; status: ReservationStatus;
  rate_plan_id: string | null; channel: string; adults: number; children: number;
  notes: string | null; created_by: string | null; created_at: string;
  cancelled_at: string | null; cancellation_reason: string | null;
};
export type HotelReservationRoom = {
  id: string; organization_id: string; reservation_id: string; room_id: string;
  rate_amount: number; check_in: string; check_out: string; status: ReservationStatus;
  created_at: string;
};
export type FolioStatus = "open" | "closed";
export type HotelFolio = {
  id: string; organization_id: string; reservation_id: string; status: FolioStatus;
  opened_at: string; closed_at: string | null; created_at: string;
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
  rooms: { room_id: string; rate_amount: number }[];
};
export function useCreateHotelReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      if (!organizationId) throw new Error("Aucune organisation sélectionnée");
      if (!input.rooms.length) throw new Error("Sélectionnez au moins une chambre.");
      const { data: reservation, error: resErr } = await supabase.from("hotel_reservations").insert({
        organization_id: organizationId, guest_id: input.guest_id,
        check_in: input.check_in, check_out: input.check_out,
        rate_plan_id: input.rate_plan_id ?? null, corporate_account_id: input.corporate_account_id ?? null,
        channel: input.channel ?? "direct", adults: input.adults ?? 1, children: input.children ?? 0,
        notes: input.notes ?? null,
      }).select().single();
      if (resErr) throw resErr;

      const { error: roomsErr } = await supabase.from("hotel_reservation_rooms").insert(
        input.rooms.map((r) => ({
          organization_id: organizationId, reservation_id: reservation.id,
          room_id: r.room_id, rate_amount: r.rate_amount,
        })),
      );
      if (roomsErr) throw roomsErr;

      const { error: folioErr } = await supabase.from("hotel_folios").insert({
        organization_id: organizationId, reservation_id: reservation.id,
      });
      if (folioErr) throw folioErr;

      return reservation as HotelReservation;
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
// lignes hotel_reservation_rooms). Le statut chambre n'a pas à changer ici
// (elle est déjà "clean"/"inspected" avant l'arrivée).
export function useCheckInReservation() {
  const update = useUpdateHotelReservation();
  return (id: string) => update.mutateAsync({ id, status: "checked_in" });
}

// Check-out : bascule la réservation ET marque les chambres occupées
// "dirty" (elles ont besoin d'un ménage avant la prochaine arrivée) — la
// clôture financière du folio reste une action explicite séparée
// (useCloseFolio), pour laisser la réception encaisser un solde en retard
// avant de fermer la note.
export function useCheckOutReservation() {
  const organizationId = useOrganizationId(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: resErr } = await supabase.from("hotel_reservations").update({ status: "checked_out" }).eq("id", id);
      if (resErr) throw resErr;
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
export function useCloseFolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (folioId: string) => {
      const { error } = await supabase.from("hotel_folios")
        .update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", folioId);
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
export function useHotelDashboardStats(today: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["hotel_dashboard", organizationId, today],
    enabled: !!organizationId,
    queryFn: async () => {
      const [{ count: totalRooms }, { data: arrivals }, { data: departures }, { data: inHouse }] = await Promise.all([
        supabase.from("hotel_rooms").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!),
        supabase.from("hotel_reservations").select("*, guest:hotel_guests(*)").eq("organization_id", organizationId!)
          .eq("check_in", today).in("status", ["pending", "confirmed"]),
        supabase.from("hotel_reservations").select("*, guest:hotel_guests(*)").eq("organization_id", organizationId!)
          .eq("check_out", today).eq("status", "checked_in"),
        supabase.from("hotel_reservations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId!)
          .eq("status", "checked_in").lte("check_in", today).gt("check_out", today),
      ]);
      const occupied = inHouse.count ?? 0;
      return {
        totalRooms: totalRooms ?? 0,
        occupied,
        occupancyPct: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
        arrivals: (arrivals ?? []) as HotelReservationRow[],
        departures: (departures ?? []) as HotelReservationRow[],
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
