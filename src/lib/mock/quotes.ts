// Devis mockés — structure "Supabase-ready".
export type QuoteLine = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct?: number;
};

export type Quote = {
  id: string;
  ref: string;
  customer: string;
  created_at: string;
  valid_until: string;
  status: "brouillon" | "envoye" | "accepte" | "refuse" | "converti";
  lines: QuoteLine[];
  total: number;
  notes?: string;
  converted_invoice?: string;
};

export const QUOTES: Quote[] = [
  {
    id: "q1", ref: "DEV-2026-011", customer: "Kofi Ent.",
    created_at: "2026-07-05", valid_until: "2026-08-04", status: "envoye",
    lines: [
      { product_id: "p8", name: "Riz parfumé 1kg", qty: 50, unit_price: 1200 },
      { product_id: "p9", name: "Huile végétale 1L", qty: 20, unit_price: 1800 },
    ],
    total: 50 * 1200 + 20 * 1800,
  },
  {
    id: "q2", ref: "DEV-2026-010", customer: "Ecole St-Paul",
    created_at: "2026-07-02", valid_until: "2026-08-01", status: "accepte",
    lines: [{ product_id: "p2", name: "Eau minérale 1.5L", qty: 200, unit_price: 400 }],
    total: 200 * 400,
  },
  {
    id: "q3", ref: "DEV-2026-009", customer: "Restaurant Sika",
    created_at: "2026-06-28", valid_until: "2026-07-28", status: "converti",
    lines: [{ product_id: "p4", name: "Café expresso", qty: 100, unit_price: 800 }],
    total: 80000, converted_invoice: "F-2026-042",
  },
  {
    id: "q4", ref: "DEV-2026-008", customer: "Mme Diallo",
    created_at: "2026-06-25", valid_until: "2026-07-25", status: "brouillon",
    lines: [{ product_id: "p16", name: "Ampoule LED", qty: 12, unit_price: 2500 }],
    total: 30000,
  },
];

export const QUOTE_STATUS_LABEL: Record<Quote["status"], string> = {
  brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté",
  refuse: "Refusé", converti: "Converti",
};
