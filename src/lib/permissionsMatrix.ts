import type { AppRole } from "./roles";

// Reflet en lecture seule de la matrice RLS réelle (migration 002 +
// db/AUDIT-SECURITE.md section 4). Il n'existe pas de table de permissions
// configurable côté Supabase — ces droits sont fixés par les policies RLS,
// identiques pour toutes les boutiques. À maintenir en synchronisation
// manuelle avec ces deux sources si une future migration change la matrice.
export type PermRow = { table: string; label: string; cells: Record<AppRole, string> };

export const PERMISSIONS_MATRIX: PermRow[] = [
  { table: "categories", label: "Catégories", cells: { owner: "SIUD", manager: "SIUD", cashier: "S", stock: "SIUD", accountant: "S" } },
  { table: "products", label: "Produits", cells: { owner: "SIUD", manager: "SIUD", cashier: "S", stock: "SIUD", accountant: "S" } },
  { table: "suppliers", label: "Fournisseurs", cells: { owner: "SIUD", manager: "SIUD", cashier: "—", stock: "S", accountant: "S" } },
  { table: "customers", label: "Clients", cells: { owner: "SIUD", manager: "SIUD", cashier: "SIU", stock: "—", accountant: "S" } },
  { table: "stock_levels", label: "Niveaux de stock", cells: { owner: "S", manager: "S", cashier: "S", stock: "S", accountant: "S" } },
  { table: "stock_movements", label: "Mouvements de stock", cells: { owner: "SI", manager: "SI", cashier: "S, I (vente uniquement)", stock: "SI", accountant: "S" } },
  { table: "sales", label: "Ventes", cells: { owner: "SIUD", manager: "SIUD", cashier: "SI", stock: "—", accountant: "S" } },
  { table: "sale_items", label: "Lignes de vente", cells: { owner: "SIUD", manager: "SIUD", cashier: "SI", stock: "—", accountant: "S" } },
  { table: "payments", label: "Paiements", cells: { owner: "SIUD", manager: "SIUD", cashier: "SI", stock: "—", accountant: "S" } },
  { table: "quotes", label: "Devis", cells: { owner: "SIUD", manager: "SIUD", cashier: "SI", stock: "—", accountant: "S" } },
  { table: "quote_items", label: "Lignes de devis", cells: { owner: "SIUD", manager: "SIUD", cashier: "SI", stock: "—", accountant: "S" } },
  { table: "expenses", label: "Dépenses", cells: { owner: "SIUD", manager: "SIUD", cashier: "—", stock: "—", accountant: "SIUD" } },
  { table: "notifications", label: "Notifications", cells: { owner: "SIUD", manager: "SIUD", cashier: "SIUD", stock: "SIUD", accountant: "SIUD" } },
  { table: "subscriptions", label: "Abonnement", cells: { owner: "SIUD", manager: "SIUD", cashier: "—", stock: "—", accountant: "S" } },
  { table: "organization_settings", label: "Paramètres boutique", cells: { owner: "SIUD", manager: "SIUD", cashier: "S", stock: "S", accountant: "S" } },
];
