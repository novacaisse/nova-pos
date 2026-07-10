export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city: string;
  total_spent: number;
  visits: number;
  loyalty_points: number;
  credit_balance: number; // > 0 => doit à la boutique
  last_visit: string;
  tags: string[];
};

export const CUSTOMERS: Customer[] = [
  { id: "cu1", name: "Mme Diallo", phone: "+229 97 12 34 56", email: "diallo@mail.com", city: "Cotonou", total_spent: 148500, visits: 24, loyalty_points: 1485, credit_balance: 0, last_visit: "2026-07-08", tags: ["VIP", "Fidèle"] },
  { id: "cu2", name: "Kofi Ent.", phone: "+229 96 45 78 90", city: "Porto-Novo", total_spent: 892300, visits: 61, loyalty_points: 8923, credit_balance: 12500, last_visit: "2026-07-09", tags: ["Pro", "Crédit"] },
  { id: "cu3", name: "Ecole St-Paul", phone: "+229 95 11 22 33", city: "Cotonou", total_spent: 320800, visits: 12, loyalty_points: 3208, credit_balance: 0, last_visit: "2026-07-05", tags: ["Institution"] },
  { id: "cu4", name: "M. Adjovi", phone: "+229 97 88 44 22", city: "Abomey", total_spent: 45200, visits: 8, loyalty_points: 452, credit_balance: 3200, last_visit: "2026-06-28", tags: ["Crédit"] },
  { id: "cu5", name: "Restaurant Sika", phone: "+229 96 66 77 88", city: "Cotonou", total_spent: 620400, visits: 40, loyalty_points: 6204, credit_balance: 0, last_visit: "2026-07-09", tags: ["Pro", "VIP"] },
  { id: "cu6", name: "Ama K.", phone: "+229 95 33 44 55", city: "Cotonou", total_spent: 28900, visits: 5, loyalty_points: 289, credit_balance: 0, last_visit: "2026-07-02", tags: [] },
  { id: "cu7", name: "Boubacar S.", phone: "+229 97 55 66 77", city: "Parakou", total_spent: 76400, visits: 14, loyalty_points: 764, credit_balance: 5400, last_visit: "2026-07-01", tags: ["Crédit"] },
  { id: "cu8", name: "Fatou N.", phone: "+229 96 99 00 11", city: "Cotonou", total_spent: 210500, visits: 33, loyalty_points: 2105, credit_balance: 0, last_visit: "2026-07-09", tags: ["Fidèle"] },
];
