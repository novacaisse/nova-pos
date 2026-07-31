// Rôles réels (enum public.app_role côté Supabase) — remplace la taxonomie
// fictive de l'ancien mock (gerant/vendeur/caissier/super_admin).
// front_desk/housekeeping (migration 020f) sont spécifiques à ZegHotel ;
// server/cook (migration 035) sont spécifiques à ZegResto — owner/manager/
// accountant sont partagés entre les trois applications.
export type AppRole = "owner" | "manager" | "cashier" | "stock" | "accountant" | "front_desk" | "housekeeping" | "server" | "cook";

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  cashier: "Caissier",
  stock: "Stock",
  accountant: "Comptable",
  front_desk: "Réceptionniste",
  housekeeping: "Gouvernante",
  server: "Serveur",
  cook: "Cuisinier",
};
