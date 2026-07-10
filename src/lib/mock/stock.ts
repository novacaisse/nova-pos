export type StockMoveType = "entree" | "sortie" | "ajustement" | "perte" | "transfert";

export type StockMove = {
  id: string;
  product_id: string;
  product_name: string;
  type: StockMoveType;
  qty: number; // signed
  reason: string;
  user: string;
  created_at: string; // ISO
  reference?: string;
};

export const STOCK_MOVES: StockMove[] = [
  { id: "m1", product_id: "p1", product_name: "Coca-Cola 33cl", type: "entree", qty: 120, reason: "Réception BC-2026-042", user: "Aïcha K.", created_at: "2026-07-09T08:15:00Z", reference: "BC-2026-042" },
  { id: "m2", product_id: "p3", product_name: "Jus d'orange 1L", type: "sortie", qty: -6, reason: "Vente T-2398", user: "Moussa D.", created_at: "2026-07-09T11:22:00Z", reference: "T-2398" },
  { id: "m3", product_id: "p14", product_name: "Papier toilette x4", type: "perte", qty: -2, reason: "Emballage endommagé", user: "Aïcha K.", created_at: "2026-07-08T16:40:00Z" },
  { id: "m4", product_id: "p16", product_name: "Ampoule LED", type: "ajustement", qty: -1, reason: "Inventaire mensuel", user: "Aïcha K.", created_at: "2026-07-08T09:00:00Z" },
  { id: "m5", product_id: "p8", product_name: "Riz parfumé 1kg", type: "entree", qty: 60, reason: "Réception BC-2026-041", user: "Fatou B.", created_at: "2026-07-06T14:10:00Z", reference: "BC-2026-041" },
  { id: "m6", product_id: "p13", product_name: "Dentifrice 75ml", type: "transfert", qty: -10, reason: "Vers Marché Dantokpa", user: "Aïcha K.", created_at: "2026-07-05T10:00:00Z" },
  { id: "m7", product_id: "p5", product_name: "Chips salées 45g", type: "sortie", qty: -4, reason: "Vente T-2395", user: "Ibrahim S.", created_at: "2026-07-05T18:30:00Z", reference: "T-2395" },
  { id: "m8", product_id: "p9", product_name: "Huile végétale 1L", type: "entree", qty: 24, reason: "Réception BC-2026-041", user: "Fatou B.", created_at: "2026-07-06T14:15:00Z" },
];
