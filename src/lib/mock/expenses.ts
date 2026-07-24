export type Expense = {
  id: string;
  label: string;
  category: string;
  amount: number;
  date: string;
  method: string;
  note?: string;
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Locaux", "Utilités", "Personnel", "Transport",
  "Marketing", "Consommables", "Logiciel", "Taxes", "Autre",
];

export const EXPENSES: Expense[] = [
  { id: "e1", label: "Loyer boutique", category: "Locaux", amount: 150000, date: "2026-07-01", method: "Virement" },
  { id: "e2", label: "Facture SBEE", category: "Utilités", amount: 42000, date: "2026-07-03", method: "Mobile Money" },
  { id: "e3", label: "Salaire Moussa", category: "Personnel", amount: 85000, date: "2026-07-05", method: "Espèces" },
  { id: "e4", label: "Sachets emballage", category: "Consommables", amount: 12500, date: "2026-07-07", method: "Espèces" },
  { id: "e5", label: "Abonnement ZegCaisse", category: "Logiciel", amount: 19000, date: "2026-07-01", method: "Mobile Money" },
  { id: "e6", label: "Livraison Cotonou", category: "Transport", amount: 6500, date: "2026-07-06", method: "Espèces" },
  { id: "e7", label: "Pub Facebook", category: "Marketing", amount: 25000, date: "2026-07-04", method: "Carte" },
];
