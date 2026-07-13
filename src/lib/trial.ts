// Essai gratuit — calculé côté client à partir de shops.plan / shops.trial_ends_at
// (Supabase), jamais depuis le localStorage : un champ local est modifiable par
// l'utilisateur (DevTools, vidage du cache) et permettrait de contourner
// indéfiniment la fin de l'essai gratuit.
export type TrialInfo = { onTrial: boolean; expired: boolean; daysLeft: number };

export function getTrialInfo(
  shop: { plan: string; trial_ends_at: string | null } | null | undefined,
): TrialInfo {
  if (!shop || shop.plan !== "trial" || !shop.trial_ends_at) {
    return { onTrial: false, expired: false, daysLeft: 0 };
  }
  const msLeft = new Date(shop.trial_ends_at).getTime() - Date.now();
  return {
    onTrial: true,
    expired: msLeft <= 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
  };
}
