// Rôles réels (enum public.app_role côté Supabase) — remplace la taxonomie
// fictive de l'ancien mock (gerant/vendeur/caissier/super_admin).
// front_desk/housekeeping (migration 020f) sont spécifiques à ZegHotel ;
// server/cook (migration 035) sont spécifiques à ZegResto ; buyer/
// salesperson/hr_manager (migrations 049/051/056) sont spécifiques à
// ZegERP — owner/manager/accountant sont partagés entre les quatre
// applications, et stock/cashier sont réutilisés tels quels par ZegERP
// (voir ARCHITECTURE_ERP.md, section "Rôles ZegERP").
export type AppRole = "owner" | "manager" | "cashier" | "stock" | "accountant" | "front_desk" | "housekeeping" | "server" | "cook" | "buyer" | "salesperson" | "hr_manager";

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
  buyer: "Acheteur",
  salesperson: "Commercial",
  hr_manager: "RH",
};
