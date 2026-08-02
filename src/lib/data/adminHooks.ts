// Hooks Super Admin — cross-organisations, distincts de hooks.ts (qui
// filtre toujours par organization_id courant). La RLS (migration 005)
// fait l'essentiel du travail de sécurité ici : ces requêtes ne renvoient
// quoi que ce soit que si l'utilisateur connecté est dans public.super_admins.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
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
// limits.ai_credits : 0 ou absent = illimité. limits.modules : urls de
// modules inclus (cf. PLAN_MODULES) — absent ou vide = aucune restriction
// (comportement par défaut, rétrocompatible avec les formules créées avant
// l'ajout de ce champ, Bloc 27). L'ancien limits.max_users (organisation) a
// été retiré au Phase 3 : remplacé par la colonne physique max_users
// ci-dessous, désormais au niveau du compte (account_subscriptions).
export type PlanLimits = { ai_credits?: number; modules?: string[] };
export type Plan = {
  id: string; name: string;
  price_month: number; price_year: number; currency: string;
  features: string[]; limits: PlanLimits;
  is_active: boolean; is_recommended: boolean; sort_order: number;
  created_at: string;
  // Colonnes physiques ajoutées par la migration 021 (restructuration
  // compte/établissements), saisies depuis l'admin (Phase 3) : app_module
  // distingue une formule ZegCaisse d'une formule ZegHotel ; max_establishments
  // et max_users bornent le compte (account_subscriptions) pour cette app.
  // null = illimité / non assignée.
  app_module: "pos" | "hotel" | "resto" | "erp" | null;
  max_establishments: number | null;
  max_users: number | null;
};

// Modules "métier" pouvant être inclus/exclus par formule, par application
// (Phase 4) — le tableau de bord, l'équipe et les paramètres restent
// toujours accessibles dans les deux apps (gestion du compte, jamais
// verrouillables par une formule).
export const POS_MODULES: { url: string; label: string }[] = [
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

export const HOTEL_MODULES: { url: string; label: string }[] = [
  { url: "/app/hotel/reservations", label: "Réservations" },
  { url: "/app/hotel/rooms", label: "Chambres" },
  { url: "/app/hotel/housekeeping", label: "Housekeeping" },
  { url: "/app/hotel/maintenance", label: "Maintenance" },
  { url: "/app/hotel/clients", label: "Clients" },
  { url: "/app/hotel/corporate", label: "Comptes entreprise" },
  { url: "/app/hotel/pos-interne", label: "Point de vente interne" },
  { url: "/app/hotel/rapports", label: "Rapports" },
  { url: "/app/hotel/canaux", label: "Canaux de distribution" },
];

export const RESTO_MODULES: { url: string; label: string }[] = [
  { url: "/app/resto/salle", label: "Salle" },
  { url: "/app/resto/commandes", label: "Commandes" },
  { url: "/app/resto/cuisine", label: "Cuisine (KDS)" },
  { url: "/app/resto/menu", label: "Menu" },
  { url: "/app/resto/reservations", label: "Réservations" },
  { url: "/app/resto/rapports", label: "Rapports" },
];

// Construit au fil des phases du chantier frontend ZegERP (Phase 1 :
// Produits + Stock) — même logique incrémentale que RESTO_MODULES en son
// temps, un module n'y entre que lorsque son écran existe réellement.
export const ERP_MODULES: { url: string; label: string }[] = [
  { url: "/app/erp/produits", label: "Produits" },
  { url: "/app/erp/stock", label: "Stock" },
  { url: "/app/erp/achats", label: "Achats" },
  { url: "/app/erp/ventes", label: "Ventes" },
  { url: "/app/erp/pos", label: "POS" },
  { url: "/app/erp/finance", label: "Finance" },
  { url: "/app/erp/comptabilite", label: "Comptabilité" },
  { url: "/app/erp/rh", label: "RH" },
];

// Point d'entrée unique pour récupérer le catalogue de modules bridables
// d'une application — jamais d'import direct de POS_MODULES/HOTEL_MODULES/
// RESTO_MODULES/ERP_MODULES en dehors de ce fichier et du formulaire
// d'édition (admin.formules.tsx), pour éviter qu'un des catalogues reste
// câblé en dur ailleurs (c'est exactement le bug corrigé en Phase 4 :
// AppSidebar/BottomNav ne vérifiaient jusqu'ici que POS_MODULES, y compris
// côté ZegHotel).
export function getModulesForApp(appModule: "pos" | "hotel" | "resto" | "erp" | null | undefined): { url: string; label: string }[] {
  if (appModule === "hotel") return HOTEL_MODULES;
  if (appModule === "resto") return RESTO_MODULES;
  if (appModule === "erp") return ERP_MODULES;
  return POS_MODULES;
}

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

// useCurrentPlan()/useCurrentPlanModules() ont déménagé dans accountHooks.ts
// (Phase 4) : la formule active se résout désormais via account_subscriptions
// (compte + app_module), pas via organizations.plan (champ legacy par
// établissement, abandonné pour cet usage depuis la Phase 3 ailleurs dans
// l'app — ce fichier avait été oublié).

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
// organizations.logo_url (propre à chaque organisation).
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

// ============ ORGANISATIONS (toutes, cross-tenant) ============
export type AdminOrganization = {
  id: string; name: string; slug: string; owner_id: string;
  country: string; currency: string; plan: string;
  trial_ends_at: string | null; suspended: boolean; created_at: string;
  owner_profile: { full_name: string | null; phone: string | null } | null;
  owner_email: string | null;
};

export function useAdminOrganizations() {
  return useQuery({
    queryKey: ["admin_organizations"],
    queryFn: async (): Promise<AdminOrganization[]> => {
      const { data: organizations, error } = await supabase.from("organizations")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const ownerIds = [...new Set((organizations ?? []).map((o: any) => o.owner_id))];
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
      return (organizations ?? []).map((o: any) => ({
        ...o,
        owner_profile: profiles[o.owner_id] ?? null,
        owner_email: emails[o.owner_id] ?? null,
      }));
    },
  });
}

// ============ COMPTES (cross-tenant, Phase 11) ============
// Jusqu'ici, aucun écran admin ne montrait accounts/account_subscriptions
// — pourtant l'unité de facturation réelle depuis la Phase 1 — Emmanuel ne
// pouvait voir "ce compte possède N établissements sur telle app, avec tel
// abonnement" sans accès direct à la base. RLS déjà en place depuis la
// Phase 1 (accounts_select_admin/account_subscriptions_select_admin,
// is_super_admin()) — aucune nouvelle policy nécessaire pour cet écran.
export type AdminAccountSubscription = {
  app_module: "pos" | "hotel" | "resto" | "erp"; plan_id: string; status: string;
  trial_ends_at: string | null; current_period_end: string | null;
};
export type AdminAccount = {
  id: string; owner_id: string; name: string; created_at: string;
  owner_profile: { full_name: string | null; phone: string | null } | null;
  owner_email: string | null;
  subscriptions: AdminAccountSubscription[];
  establishment_counts: Partial<Record<"pos" | "hotel" | "resto" | "erp", number>>;
};

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin_accounts"],
    queryFn: async (): Promise<AdminAccount[]> => {
      const { data: accounts, error } = await supabase.from("accounts")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const accountIds = (accounts ?? []).map((a: any) => a.id);
      const ownerIds = [...new Set((accounts ?? []).map((a: any) => a.owner_id))];

      let profiles: Record<string, any> = {};
      let emails: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", ownerIds);
        profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
        const { data: emailRows } = await supabase.rpc("admin_get_user_emails", { _user_ids: ownerIds });
        emails = Object.fromEntries((emailRows ?? []).map((r: any) => [r.user_id, r.email]));
      }

      const subsByAccount: Record<string, AdminAccountSubscription[]> = {};
      const countsByAccount: Record<string, Partial<Record<"pos" | "hotel" | "resto" | "erp", number>>> = {};
      if (accountIds.length) {
        const { data: subs } = await supabase.from("account_subscriptions")
          .select("account_id, app_module, plan_id, status, trial_ends_at, current_period_end").in("account_id", accountIds);
        for (const s of (subs ?? []) as any[]) {
          (subsByAccount[s.account_id] ??= []).push(s);
        }
        const { data: orgs } = await supabase.from("organizations").select("account_id, app_module").in("account_id", accountIds);
        for (const o of (orgs ?? []) as any[]) {
          const byApp = (countsByAccount[o.account_id] ??= {});
          byApp[o.app_module as "pos" | "hotel" | "resto" | "erp"] = (byApp[o.app_module as "pos" | "hotel" | "resto" | "erp"] ?? 0) + 1;
        }
      }

      return (accounts ?? []).map((a: any) => ({
        ...a,
        owner_profile: profiles[a.owner_id] ?? null,
        owner_email: emails[a.owner_id] ?? null,
        subscriptions: subsByAccount[a.id] ?? [],
        establishment_counts: countsByAccount[a.id] ?? {},
      }));
    },
  });
}

// ============ RÉCONCILIATION (cross-tenant, Phase 11 partie 2) ============
// Depuis la Phase 1, chaque établissement garde son ancien état
// (organizations.plan/trial_ends_at + table subscriptions), conservé pour
// compatibilité pendant que account_subscriptions (par compte + app) est
// devenu la source de vérité réelle du gating/des limites. Les deux
// peuvent en théorie diverger (bug futur, migration partielle, écriture
// oubliée) sans que personne ne le remarque — cet écran liste les
// établissements dont organizations.plan ne correspond plus au plan de
// account_subscriptions pour le même compte + application, pour repérer
// une dérive avant qu'elle ne cause un problème de facturation. Lecture
// seule : la correction reste manuelle (SQL direct), volontairement pas
// automatisée ici tant qu'aucune dérive réelle n'a été observée.
export type ReconciliationRow = {
  organization_id: string; organization_name: string;
  account_id: string | null; account_name: string | null;
  app_module: string | null;
  org_plan: string; org_trial_ends_at: string | null;
  sub_plan_id: string | null; sub_status: string | null; sub_trial_ends_at: string | null;
  issue: string;
};

export function useAdminReconciliation() {
  return useQuery({
    queryKey: ["admin_reconciliation"],
    queryFn: async (): Promise<ReconciliationRow[]> => {
      const { data: orgs, error } = await supabase.from("organizations")
        .select("id, name, account_id, app_module, plan, trial_ends_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const accountIds = [...new Set((orgs ?? []).map((o: any) => o.account_id).filter(Boolean))];
      let accountNames: Record<string, string> = {};
      const subsByKey: Record<string, any> = {};
      if (accountIds.length) {
        const { data: accounts } = await supabase.from("accounts").select("id, name").in("id", accountIds);
        accountNames = Object.fromEntries((accounts ?? []).map((a: any) => [a.id, a.name]));
        const { data: subs } = await supabase.from("account_subscriptions")
          .select("account_id, app_module, plan_id, status, trial_ends_at").in("account_id", accountIds);
        for (const s of (subs ?? []) as any[]) subsByKey[`${s.account_id}:${s.app_module}`] = s;
      }

      const rows: ReconciliationRow[] = [];
      for (const o of (orgs ?? []) as any[]) {
        const sub = o.account_id ? subsByKey[`${o.account_id}:${o.app_module}`] : undefined;
        let issue: string | null = null;
        if (!o.account_id) issue = "Aucun compte rattaché (account_id manquant).";
        else if (!sub) issue = "Aucun abonnement compte (account_subscriptions) pour ce couple compte/application.";
        else if (sub.plan_id !== o.plan) issue = `Formule différente : établissement "${o.plan}" vs compte "${sub.plan_id}".`;
        if (!issue) continue;
        rows.push({
          organization_id: o.id, organization_name: o.name,
          account_id: o.account_id, account_name: o.account_id ? (accountNames[o.account_id] ?? null) : null,
          app_module: o.app_module, org_plan: o.plan, org_trial_ends_at: o.trial_ends_at,
          sub_plan_id: sub?.plan_id ?? null, sub_status: sub?.status ?? null, sub_trial_ends_at: sub?.trial_ends_at ?? null,
          issue,
        });
      }
      return rows;
    },
  });
}

// ============ JOURNAL D'IMPERSONATION (cross-tenant, Phase 11) ============
// admin_impersonations est écrit depuis la Phase "Bloc 9"/audit-impersonate
// mais n'a jamais eu d'écran de lecture — Emmanuel ne pouvait pas auditer
// "qui a impersonné qui, quand" sans accès SQL direct, malgré une table
// prévue précisément pour ça.
export type AdminImpersonation = {
  id: string; admin_user_id: string; target_user_id: string;
  organization_id: string | null; created_at: string;
  admin_email: string | null;
  target_email: string | null; target_full_name: string | null;
  organization_name: string | null;
};

export function useAdminImpersonations() {
  return useQuery({
    queryKey: ["admin_impersonations"],
    queryFn: async (): Promise<AdminImpersonation[]> => {
      const { data: rows, error } = await supabase.from("admin_impersonations")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;

      const userIds = [...new Set((rows ?? []).flatMap((r: any) => [r.admin_user_id, r.target_user_id]))];
      const orgIds = [...new Set((rows ?? []).map((r: any) => r.organization_id).filter(Boolean))];

      let emails: Record<string, string> = {};
      let profiles: Record<string, any> = {};
      let orgNames: Record<string, string> = {};
      if (userIds.length) {
        const { data: emailRows } = await supabase.rpc("admin_get_user_emails", { _user_ids: userIds });
        emails = Object.fromEntries((emailRows ?? []).map((r: any) => [r.user_id, r.email]));
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }
      if (orgIds.length) {
        const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds as string[]);
        orgNames = Object.fromEntries((orgs ?? []).map((o: any) => [o.id, o.name]));
      }

      return (rows ?? []).map((r: any) => ({
        ...r,
        admin_email: emails[r.admin_user_id] ?? null,
        target_email: emails[r.target_user_id] ?? null,
        target_full_name: profiles[r.target_user_id]?.full_name ?? null,
        organization_name: r.organization_id ? (orgNames[r.organization_id] ?? null) : null,
      }));
    },
  });
}

export function useSuspendOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) => {
      const { error } = await supabase.from("organizations").update({ suspended }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_organizations"] }),
  });
}

// RPC security definer (migration 023) plutôt qu'écriture directe depuis le
// client : garde aussi account_subscriptions (compte + app_module) en phase
// avec organizations.trial_ends_at, même classe de correctif que la Phase 5
// côté paiement — sans ça, la page Abonnement/le gating de modules
// restaient figés sur l'ancien essai malgré la prolongation.
export function useExtendTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const { error } = await supabase.rpc("admin_extend_trial", { p_organization_id: id, p_days: days });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_organizations"] }),
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organizations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_organizations"] }),
  });
}

// Changement de formule forcé par le Super Admin (ex. downgrade manuel,
// correction après un paiement validé à la main).
//
// RPC security definer (migration 023) : la version précédente écrivait
// directement organizations.plan puis subscriptions depuis le client pour
// rester synchronisée (audit ZegOS Phase 1, LOT C) — mais les policies RLS
// de `subscriptions` (owner/manager de LA boutique, jamais is_super_admin())
// faisaient silencieusement échouer/no-opper cette seconde écriture dès
// qu'un Super Admin (rarement membre de la boutique d'un client) l'utilisait.
// La RPC, exécutée avec les privilèges de la fonction après vérification
// is_super_admin() server-side, écrit organizations.plan, subscriptions ET
// account_subscriptions (compte + app_module — sinon la page Abonnement/le
// gating de modules restent figés sur l'ancienne formule, même bug que la
// Phase 5 côté paiement réel) dans une seule transaction.
export function useChangeOrganizationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      const { error } = await supabase.rpc("admin_change_organization_plan", { p_organization_id: id, p_plan: plan });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_organizations"] }),
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
    mutationFn: async (input: { target_user_id: string; organization_id?: string }) =>
      invokeFn<{ action_link: string }>("admin-impersonate", input),
  });
}

// ============ ABONNEMENTS / FACTURATION (cross-tenant) ============
export type AdminSubscription = {
  id: string; organization_id: string; plan: string; status: string;
  amount: number; currency: string; current_period_end: string | null;
  created_at: string; organizations: { name: string } | null;
};

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ["admin_subscriptions"],
    queryFn: async (): Promise<AdminSubscription[]> => {
      const { data, error } = await supabase.from("subscriptions")
        .select("*, organizations(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminSubscription[];
    },
  });
}

export type AdminPayment = {
  id: string; organization_id: string; subscription_id: string;
  amount: number; currency: string; method: string; status: string;
  provider: string | null; paid_at: string | null; created_at: string;
  metadata: Record<string, any>; organizations: { name: string } | null;
};

export function useAdminPayments(limit = 300) {
  return useQuery({
    queryKey: ["admin_payments", limit],
    queryFn: async (): Promise<AdminPayment[]> => {
      const { data, error } = await supabase.from("subscription_payments")
        .select("*, organizations(name)").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as AdminPayment[];
    },
  });
}

// Validation manuelle par le Super Admin (RPC admin_set_payment_status,
// migration 020e) — filet de sécurité si la vérification automatique
// MoneyFusion reste bloquée sur "pending" (proxy/API jamais indéfiniment
// fiable). Répercute côté abonnement/organisation exactement comme le
// ferait la vérification automatique.
export function useAdminSetPaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "paid" | "failed" }) => {
      const { error } = await supabase.rpc("admin_set_payment_status", { p_payment_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_payments"] });
      qc.invalidateQueries({ queryKey: ["admin_organizations"] });
    },
  });
}

// ============ SUPPORT (partagé organisation + admin) ============
export type SupportTicket = {
  id: string; organization_id: string; created_by: string; subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string; updated_at: string;
  organizations?: { name: string } | null;
};
export type SupportMessage = {
  id: string; ticket_id: string; author_id: string; is_admin: boolean;
  body: string; created_at: string;
};

export function useSupportTickets(scope: "mine" | "all", organizationId?: string | null) {
  return useQuery({
    queryKey: ["support_tickets", scope, organizationId],
    enabled: scope === "all" || !!organizationId,
    queryFn: async (): Promise<SupportTicket[]> => {
      let q = supabase.from("support_tickets").select("*, organizations(name)").order("created_at", { ascending: false });
      if (scope === "mine" && organizationId) q = q.eq("organization_id", organizationId);
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
    mutationFn: async ({ organizationId, subject, message }: { organizationId: string; subject: string; message: string }): Promise<SupportTicket> => {
      if (!user) throw new Error("Non authentifié");
      const { data: ticket, error } = await supabase.from("support_tickets")
        .insert({ organization_id: organizationId, created_by: user.id, subject }).select().single();
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
