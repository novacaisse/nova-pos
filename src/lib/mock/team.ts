import type { Role } from "./session";

export type TeamMember = {
  id: string;
  full_name: string;
  role: Role;
  email: string;
  phone: string;
  active: boolean;
  last_login: string;
  initials: string;
  shop_ids: string[];
};

export type ActivityLog = {
  id: string;
  user: string;
  action: string;
  target: string;
  at: string;
  kind: "vente" | "stock" | "produit" | "auth" | "parametre";
};

export const TEAM: TeamMember[] = [
  { id: "u1", full_name: "Aïcha K.", role: "gerant", email: "aicha@novacaisse.bj", phone: "+229 97 00 11 22", active: true, last_login: "2026-07-10T08:12:00Z", initials: "AK", shop_ids: ["s1", "s2"] },
  { id: "u2", full_name: "Moussa D.", role: "caissier", email: "moussa@novacaisse.bj", phone: "+229 96 33 44 55", active: true, last_login: "2026-07-10T07:45:00Z", initials: "MD", shop_ids: ["s1"] },
  { id: "u3", full_name: "Fatou B.", role: "vendeur", email: "fatou@novacaisse.bj", phone: "+229 95 66 77 88", active: true, last_login: "2026-07-09T18:22:00Z", initials: "FB", shop_ids: ["s1"] },
  { id: "u4", full_name: "Ibrahim S.", role: "caissier", email: "ibra@novacaisse.bj", phone: "+229 97 11 22 33", active: false, last_login: "2026-06-28T12:00:00Z", initials: "IS", shop_ids: ["s2"] },
];

export const ACTIVITY: ActivityLog[] = [
  { id: "a1", user: "Moussa D.", action: "a encaissé", target: "T-2400 · 5 400 F", at: "2026-07-10T08:12:00Z", kind: "vente" },
  { id: "a2", user: "Aïcha K.", action: "a modifié", target: "Produit · Coca-Cola 33cl", at: "2026-07-10T07:55:00Z", kind: "produit" },
  { id: "a3", user: "Fatou B.", action: "a réceptionné", target: "BC-2026-041", at: "2026-07-09T15:30:00Z", kind: "stock" },
  { id: "a4", user: "Aïcha K.", action: "s'est connectée", target: "Web · Cotonou", at: "2026-07-09T08:00:00Z", kind: "auth" },
  { id: "a5", user: "Aïcha K.", action: "a créé une promo", target: "Boissons -10%", at: "2026-07-01T10:15:00Z", kind: "parametre" },
  { id: "a6", user: "Ibrahim S.", action: "a annulé", target: "T-2385", at: "2026-06-28T17:44:00Z", kind: "vente" },
];

export const ROLE_LABEL: Record<Role, string> = {
  gerant: "Gérant",
  vendeur: "Vendeur",
  caissier: "Caissier",
  super_admin: "Super admin",
};

export const MODULES_PERMS = [
  "Caisse", "Ventes", "Produits", "Stock", "Fournisseurs",
  "Clients", "Promotions", "Rapports", "Équipe", "Paramètres",
] as const;

export const DEFAULT_PERMS: Record<Role, Record<string, boolean>> = {
  gerant: Object.fromEntries(MODULES_PERMS.map((m) => [m, true])) as Record<string, boolean>,
  vendeur: {
    Caisse: true, Ventes: true, Produits: true, Stock: true,
    Fournisseurs: false, Clients: true, Promotions: false,
    Rapports: false, Équipe: false, Paramètres: false,
  },
  caissier: {
    Caisse: true, Ventes: true, Produits: false, Stock: false,
    Fournisseurs: false, Clients: true, Promotions: false,
    Rapports: false, Équipe: false, Paramètres: false,
  },
  super_admin: Object.fromEntries(MODULES_PERMS.map((m) => [m, true])) as Record<string, boolean>,
};
