// Gestion locale de l'essai gratuit (3 jours). Sera remplacé par une colonne Supabase.
const KEY = "nc_trial_started_at";
const DURATION_DAYS = 3;

export function startTrial() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, new Date().toISOString());
  }
}

export function getTrialInfo(): { active: boolean; daysLeft: number; startedAt: string | null } {
  if (typeof window === "undefined") return { active: true, daysLeft: DURATION_DAYS, startedAt: null };
  const started = localStorage.getItem(KEY);
  if (!started) return { active: true, daysLeft: DURATION_DAYS, startedAt: null };
  const startedAt = new Date(started);
  const elapsedMs = Date.now() - startedAt.getTime();
  const daysLeft = Math.max(0, DURATION_DAYS - Math.floor(elapsedMs / 86_400_000));
  return { active: daysLeft > 0, daysLeft, startedAt: started };
}

export function resetTrial() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
