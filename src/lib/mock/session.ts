// Mock session utilisateur + boutiques (à remplacer par Supabase auth).

export type Role = "gerant" | "vendeur" | "caissier" | "super_admin";

export type Shop = {
  id: string;
  name: string;
  city: string;
  plan: "starter" | "pro" | "business";
};

export type SessionUser = {
  id: string;
  full_name: string;
  role: Role;
  avatar_initials: string;
  active_shop_id: string;
};

export const SHOPS: Shop[] = [
  { id: "s1", name: "Boutique Cotonou Centre", city: "Cotonou", plan: "pro" },
  { id: "s2", name: "Marché Dantokpa", city: "Cotonou", plan: "starter" },
];

export const CURRENT_USER: SessionUser = {
  id: "u1",
  full_name: "Aïcha K.",
  role: "gerant",
  avatar_initials: "AK",
  active_shop_id: "s1",
};

export const MODULES = [
  { key: "tableau-bord", label: "Tableau de bord", icon: "LayoutDashboard", path: "/app" },
  { key: "caisse", label: "Point de vente", icon: "ScanBarcode", path: "/app/caisse" },
  { key: "produits", label: "Produits", icon: "Package", path: "/app/produits" },
  { key: "stock", label: "Stock", icon: "Warehouse", path: "/app/stock" },
  { key: "ventes", label: "Ventes", icon: "Receipt", path: "/app/ventes" },
  { key: "clients", label: "Clients", icon: "Users", path: "/app/clients" },
  { key: "fournisseurs", label: "Fournisseurs", icon: "Truck", path: "/app/fournisseurs" },
  { key: "depenses", label: "Dépenses", icon: "Wallet", path: "/app/depenses" },
  { key: "rapports", label: "Rapports", icon: "BarChart3", path: "/app/rapports" },
  { key: "equipe", label: "Équipe", icon: "UsersRound", path: "/app/equipe" },
  { key: "promotions", label: "Promotions", icon: "Tag", path: "/app/promotions" },
  { key: "notifications", label: "Notifications", icon: "Bell", path: "/app/notifications" },
  { key: "parametres", label: "Paramètres", icon: "Settings", path: "/app/parametres" },
] as const;
