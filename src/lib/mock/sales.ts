// Ventes mockées "Supabase-ready".
export type PaymentMethod = "cash" | "mobile" | "card" | "credit";

export type SaleLine = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
};

export type Sale = {
  id: string;
  ticket: string;
  created_at: string; // ISO
  cashier: string;
  customer?: string;
  payment: PaymentMethod;
  lines: SaleLine[];
  total: number;
  status: "paid" | "refunded" | "partial_refund" | "pending";
};

function iso(daysAgo: number, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const CASHIERS = ["Aïcha K.", "Moussa D.", "Fatou B.", "Ibrahim S."];
const CUSTOMERS = ["Comptoir", "Mme Diallo", "Kofi Ent.", "Ecole St-Paul", "M. Adjovi"];
const METHODS: PaymentMethod[] = ["cash", "mobile", "card", "credit"];

const SAMPLE_LINES: SaleLine[][] = [
  [{ product_id: "p1", name: "Coca-Cola 33cl", qty: 6, unit_price: 500 },
   { product_id: "p5", name: "Chips salées 45g", qty: 4, unit_price: 350 }],
  [{ product_id: "p8", name: "Riz parfumé 1kg", qty: 2, unit_price: 1200 },
   { product_id: "p9", name: "Huile végétale 1L", qty: 1, unit_price: 1800 }],
  [{ product_id: "p4", name: "Café expresso", qty: 3, unit_price: 800 }],
  [{ product_id: "p13", name: "Dentifrice 75ml", qty: 1, unit_price: 1500 },
   { product_id: "p12", name: "Savon Marseille", qty: 3, unit_price: 700 }],
  [{ product_id: "p16", name: "Ampoule LED", qty: 2, unit_price: 2500 }],
  [{ product_id: "p2", name: "Eau minérale 1.5L", qty: 12, unit_price: 400 }],
  [{ product_id: "p6", name: "Barre chocolat", qty: 8, unit_price: 600 },
   { product_id: "p7", name: "Biscuit sec 200g", qty: 2, unit_price: 750 }],
];

export const SALES: Sale[] = Array.from({ length: 48 }).map((_, i) => {
  const lines = SAMPLE_LINES[i % SAMPLE_LINES.length];
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const days = Math.floor(i / 6);
  return {
    id: `sale-${i + 1}`,
    ticket: `T-${String(2400 - i).padStart(4, "0")}`,
    created_at: iso(days, 9 + (i % 10), (i * 13) % 60),
    cashier: CASHIERS[i % CASHIERS.length],
    customer: i % 3 === 0 ? CUSTOMERS[i % CUSTOMERS.length] : undefined,
    payment: METHODS[i % METHODS.length],
    lines,
    total,
    status: i % 11 === 0 ? "refunded" : i % 17 === 0 ? "partial_refund" : "paid",
  };
});

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Espèces",
  mobile: "Mobile Money",
  card: "Carte",
  credit: "Crédit",
};
