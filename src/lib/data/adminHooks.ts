// Hooks Super Admin — cross-boutiques, distincts de hooks.ts (qui filtre
// toujours par shop_id courant). La RLS (migration 005) fait l'essentiel du
// travail de sécurité ici : ces requêtes ne renvoient quoi que ce soit que
// si l'utilisateur connecté est dans public.super_admins.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShop } from "@/lib/auth/ShopProvider";
import { invokeFn } from "@/lib/data/invokeFn";

export function useIsSuperAdmin() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["is_super_admin", user?.id],
    enabled: !loading && !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_super_admin");
      if (error) throw error;
      return !!data;
    },
  });
}

// ============ PLANS (catalogue public + CMS admin) ============
// Une seule requête pour les deux usages : la RLS renvoie automatiquement
// les formules inactives en plus si l'appelant est super admin (OR des
// deux policies), donc pas besoin d'un hook séparé pour le CMS.
// limits.max_users / limits.ai_credits : 0 ou absent = illimité.
// limits.modules : urls de modules inclus (cf. PLAN_MODULES) — absent ou
// vide = aucune restriction (comportement par défaut, rétrocompatible
// avec les formules créées avant l'ajout de ce champ, Bloc 27).
export type PlanLimits = { max_users?: number; ai_credits?: number; modules?: string[] };
export type Plan = {
  id: string; name: string;
  price_month: number; price_year: number; currency: string;
  features: string[]; limits: PlanLimits;
  is_active: boolean; is_recommended: boolean; sort_order: number;
  created_at: string;
};

// Modules "métier" pouvant être inclus/exclus par formule — le tableau de
// bord, l'équipe et les paramètres restent toujours accessibles (gestion
// du compte, jamais verrouillable par une formule).
export const PLAN_MODULES: { url: string; label: string }[] = [
  { url: "/app/caisse", label: "Point de vente" },
  { url: "/app/ventes", label: "Ventes" },
  { url: "/app/devis", label: "Devis" },
  { url: "/app/clients", label: "Clients" },
  { url: "/app/produits", label: "Produits" },
  { url: "/app/stock", label: "Stock" },
  { url: "/app/fournisseurs", label: "Fournisseurs" },
  { url: "/app/depenses", label: "Dépenses" },
  { url: "/app/rapports", label: "Rapports" },
  { url: "/app/nova", label: "Nova IA" },
];

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Plan> & { id: string; name: string }) => {
      const { data, error } = await supabase.from("plans").upsert(input).select().single();
      if (error) throw error;
      return data as Plan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

// Formule de la boutique courante (recherchée dans plans par shops.plan) —
// null tant que non chargée ou si le plan n'existe plus. Base commune pour
// useCurrentPlanModules (nav) et l'enforcement du nombre de comptes max
// (Équipe), Bloc 27.
export function useCurrentPlan(): Plan | null {
  const { currentShop } = useShop();
  const { data: plans = [] } = usePlans();
  return plans.find((p) => p.id === currentShop?.plan) ?? null;
}

// Modules inclus dans la formule de la boutique courante — null = aucune
// restriction (formule sans `modules` défini, ou en attente de chargement).
// Utilisé par AppSidebar/BottomNav (Bloc 27) pour masquer les modules non
// inclus dans la formule active, en plus des restrictions par rôle déjà
// en place (HIDDEN_FOR).
export function useCurrentPlanModules(): string[] | null {
  const plan = useCurrentPlan();
  const modules = plan?.limits.modules;
  return modules && modules.length > 0 ? modules : null;
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

// ============ BRANDING GLOBAL (logo/favicon plateforme) ============
// Table singleton (migration 019) — lecture publique (anon inclus : landing,
// connexion, inscription), écriture réservée au Super Admin. Distinct de
// shops.logo_url (propre à chaque boutique).
export type AppSettings = { logo_url: string | null; favicon_url: string | null };

export function useAppSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from("app_settings").select("logo_url, favicon_url").eq("id", true).single();
      if (error) throw error;
      return data as AppSettings;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const { error } = await supabase.from("app_settings").update(patch).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings"] }),
  });
}

// Upload logo/favicon (bucket "app-branding", migration 019 — public en
// lecture, écriture Super Admin uniquement). Un fichier fixe par usage
// ("logo" / "favicon", écrasé à chaque upload), met à jour app_settings.
export function useUploadBrandingAsset() {
  const updateSettings = useUpdateAppSettings();
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: "logo" | "favicon"; file: File }): Promise<string> => {
      const { error: upErr } = await supabase.storage.from("app-branding")
        .upload(kind, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("app-branding").getPublicUrl(kind);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await updateSettings.mutateAsync(kind === "logo" ? { logo_url: url } : { favicon_url: url });
      return url;
    },
  });
}

// ============ BOUTIQUES (toutes, cross-tenant) ============
export type AdminShop = {
  id: string; name: string; slug: string; owner_id: string;
  country: string; currency: string; plan: string;
  trial_ends_at: string | null; suspended: boolean; created_at: string;
  owner_profile: { full_name: string | null; phone: string | null } | null;
  owner_email: string | null;
};

export function useAdminShops() {
  return useQuery({
    queryKey: ["admin_shops"],
    queryFn: async (): Promise<AdminShop[]> => {
      const { data: shops, error } = await supabase.from("shops")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const ownerIds = [...new Set((shops ?? []).map((s: any) => s.owner_id))];
      let profiles: Record<string, any> = {};
      let emails: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("id, full_name, phone").in("id", ownerIds);
        profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
        // Fonction ajoutée en migration 008 — dégrade sans erreur si elle
        // n'est pas encore déployée (email simplement vide dans ce cas).
        const { data: emailRows } = await supabase.rpc("admin_get_user_emails", { _user_ids: ownerIds });
        emails = Object.fromEntries((emailRows ?? []).map((r: any) => [r.user_id, r.email]));
      }
      return (shops ?? []).map((s: any) => ({
        ...s,
        owner_profile: profiles[s.owner_id] ?? null,
        owner_email: emails[s.owner_id] ?? null,
      }));
    },
  });
}

export function useSuspendShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) => {
      const { error } = await supabase.from("shops").update({ suspended }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_shops"] }),
  });
}

export function useExtendTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const { data: shop, error: shopErr } = await supabase.from("shops")
        .select("trial_ends_at").eq("id", id).single();
      if (shopErr) throw shopErr;
      const now = new Date();
      const base = shop.trial_ends_at && new Date(shop.trial_ends_at) > now ? new Date(shop.trial_ends_at) : now;
      base.setDate(base.getDate() + days);
      const { error } = await supabase.from("shops")
        .update({ trial_ends_at: base.toISOString(), plan: "trial" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_shops"] }),
  });
}

export function useDeleteShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_shops"] }),
  });
}

// "Se connecter en tant que" — passe par l'Edge Function admin-impersonate
// (vérifie is_super_admin server-side, journalise dans admin_impersonations,
// génère un lien de connexion via le service role). Après avoir suivi le
// lien, le navigateur devient la session de l'utilisateur ciblé : revenir
// à sa propre session admin nécessite de se déconnecter puis se
// reconnecter (limite acceptée, pas de multi-session dans ce navigateur).
export function useImpersonate() {
  return useMutation({
    mutationFn: async (input: { target_user_id: string; shop_id?: string }) =>
      invokeFn<{ action_link: string }>("admin-impersonate", input),
  });
}

// ============ ABONNEMENTS / FACTURATION (cross-tenant) ============
export type AdminSubscription = {
  id: string; shop_id: string; plan: string; status: string;
  amount: number; currency: string; current_period_end: string | null;
  created_at: string; shops: { name: string } | null;
};

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ["admin_subscriptions"],
    queryFn: async (): Promise<AdminSubscription[]> => {
      const { data, error } = await supabase.from("subscriptions")
        .select("*, shops(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminSubscription[];
    },
  });
}

export type AdminPayment = {
  id: string; shop_id: string; subscription_id: string;
  amount: number; currency: string; method: string; status: string;
  provider: string | null; paid_at: string | null; created_at: string;
  metadata: Record<string, any>; shops: { name: string } | null;
};

export function useAdminPayments(limit = 300) {
  return useQuery({
    queryKey: ["admin_payments", limit],
    queryFn: async (): Promise<AdminPayment[]> => {
      const { data, error } = await supabase.from("subscription_payments")
        .select("*, shops(name)").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as AdminPayment[];
    },
  });
}

// ============ SUPPORT (partagé boutique + admin) ============
export type SupportTicket = {
  id: string; shop_id: string; created_by: string; subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string; updated_at: string;
  shops?: { name: string } | null;
};
export type SupportMessage = {
  id: string; ticket_id: string; author_id: string; is_admin: boolean;
  body: string; created_at: string;
};

export function useSupportTickets(scope: "mine" | "all", shopId?: string | null) {
  return useQuery({
    queryKey: ["support_tickets", scope, shopId],
    enabled: scope === "all" || !!shopId,
    queryFn: async (): Promise<SupportTicket[]> => {
      let q = supabase.from("support_tickets").select("*, shops(name)").order("created_at", { ascending: false });
      if (scope === "mine" && shopId) q = q.eq("shop_id", shopId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

export function useSupportMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ["support_messages", ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await supabase.from("support_messages")
        .select("*").eq("ticket_id", ticketId!).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ shopId, subject, message }: { shopId: string; subject: string; message: string }): Promise<SupportTicket> => {
      if (!user) throw new Error("Non authentifié");
      const { data: ticket, error } = await supabase.from("support_tickets")
        .insert({ shop_id: shopId, created_by: user.id, subject }).select().single();
      if (error) throw error;
      const { error: msgErr } = await supabase.from("support_messages")
        .insert({ ticket_id: ticket.id, author_id: user.id, is_admin: false, body: message });
      if (msgErr) throw msgErr;
      return ticket as SupportTicket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support_tickets"] }),
  });
}

export function useSendSupportMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ ticketId, body, isAdmin }: { ticketId: string; body: string; isAdmin: boolean }) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("support_messages")
        .insert({ ticket_id: ticketId, author_id: user.id, is_admin: isAdmin, body });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["support_messages", vars.ticketId] }),
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportTicket["status"] }) => {
      const { error } = await supabase.from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support_tickets"] }),
  });
}
