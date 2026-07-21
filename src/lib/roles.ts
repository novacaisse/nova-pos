// Rôles réels (enum public.app_role côté Supabase) — remplace la taxonomie
// fictive de l'ancien mock (gerant/vendeur/caissier/super_admin).
export type AppRole = "owner" | "manager" | "cashier" | "stock" | "accountant";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  cashier: "Caissier",
  stock: "Stock",
  accountant: "Comptable",
};
