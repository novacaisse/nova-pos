// Abonnement/limites par compte (Phases 1-3, restructuration
// compte/établissements) : un account_subscriptions par (account_id,
// app_module), dont la formule (plans.max_establishments/max_users) borne
// le nombre d'établissements et de membres cumulés sur TOUTES les
// organisations du compte pour cette app — pas seulement l'organisation
// courante. Remplace, pour l'affichage et les limites, l'ancien modèle par
// organisation (organizations.plan/subscriptions), qui reste écrit en base
// pour compat mais n'est plus lu ici.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { usePlans, type Plan } from "@/lib/data/adminHooks";

export type AccountSubscription = {
  id: string;
  account_id: string;
  app_module: "pos" | "hotel";
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

// Account_subscriptions du compte + app_module actifs — source d'affichage
// pour la page Abonnement (Phase 3) et les limites d'équipe/établissements.
export function useCurrentAccountSubscription() {
  const { currentOrganization } = useOrganization();
  const accountId = currentOrganization?.account_id ?? null;
  const appModule = currentOrganization?.app_module ?? null;
  return useQuery({
    queryKey: ["account_subscription", accountId, appModule],
    enabled: !!accountId && !!appModule,
    queryFn: async (): Promise<AccountSubscription | null> => {
      const { data, error } = await supabase.from("account_subscriptions")
        .select("*").eq("account_id", accountId!).eq("app_module", appModule!).maybeSingle();
      if (error) throw error;
      return data as AccountSubscription | null;
    },
  });
}

// Formule active du compte courant (compte + app_module), résolue via
// account_subscriptions.plan_id — remplace, depuis la Phase 4, l'ancienne
// lecture par organizations.plan (champ legacy par établissement). Base
// commune pour useCurrentPlanModules (nav) et useAccountMemberLimit
// (Équipe) ci-dessous.
export function useCurrentPlan(): Plan | null {
  const { data: subscription } = useCurrentAccountSubscription();
  const { data: plans = [] } = usePlans();
  return plans.find((p) => p.id === subscription?.plan_id) ?? null;
}

// Modules inclus dans la formule active — null = aucune restriction
// (formule sans `modules` défini, ou en attente de chargement). Utilisé par
// AppSidebar/BottomNav pour masquer les modules non inclus dans la formule
// active (avec le catalogue de la bonne application, cf. getModulesForApp),
// en plus des restrictions par rôle déjà en place (HIDDEN_FOR).
export function useCurrentPlanModules(): string[] | null {
  const plan = useCurrentPlan();
  const modules = plan?.limits.modules;
  return modules && modules.length > 0 ? modules : null;
}

// Effectif cumulé de l'équipe sur toutes les organisations du compte pour
// l'app_module courant, comparé à la limite de la formule de
// l'account_subscription correspondante — utilisé par Équipe pour bloquer
// "+ Ajouter un membre" avant même d'appeler create-team-member (qui fait
// respecter la même règle server-side, seule source de vérité réelle).
export function useAccountMemberLimit() {
  const { currentOrganization, organizations } = useOrganization();
  const accountId = currentOrganization?.account_id ?? null;
  const appModule = currentOrganization?.app_module ?? null;
  const plan = useCurrentPlan();

  const sameAppOrgIds = organizations
    .filter((o) => o.account_id === accountId && o.app_module === appModule)
    .map((o) => o.id);

  const { data: memberCount = 0 } = useQuery({
    queryKey: ["account_member_count", accountId, appModule, sameAppOrgIds.join(",")],
    enabled: sameAppOrgIds.length > 0,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase.from("organization_members")
        .select("id", { count: "exact", head: true }).in("organization_id", sameAppOrgIds);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const maxUsers = plan?.max_users ?? null;
  return { maxUsers, memberCount, planName: plan?.name ?? null };
}
