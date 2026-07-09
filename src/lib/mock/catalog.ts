// Mock data "Supabase-ready" — les shapes reflètent les tables prévues.

export type UUID = string;

export type Category = {
  id: UUID;
  name: string;
  color: string; // token hex-like just for chip
};

export type Product = {
  id: UUID;
  sku: string;
  name: string;
  category_id: UUID;
  price: number; // XOF
  stock: number;
  unit: string;
  emoji: string;
};

export type CartLine = {
  product_id: UUID;
  name: string;
  unit_price: number;
  quantity: number;
};

export const CATEGORIES: Category[] = [
  { id: "c1", name: "Boissons", color: "#0891b2" },
  { id: "c2", name: "Snacks", color: "#d97706" },
  { id: "c3", name: "Épicerie", color: "#16a34a" },
  { id: "c4", name: "Hygiène", color: "#7c3aed" },
  { id: "c5", name: "Maison", color: "#db2777" },
];

export const PRODUCTS: Product[] = [
  { id: "p1", sku: "BOI-001", name: "Coca-Cola 33cl", category_id: "c1", price: 500, stock: 48, unit: "unité", emoji: "🥤" },
  { id: "p2", sku: "BOI-002", name: "Eau minérale 1.5L", category_id: "c1", price: 400, stock: 120, unit: "unité", emoji: "💧" },
  { id: "p3", sku: "BOI-003", name: "Jus d'orange 1L", category_id: "c1", price: 1500, stock: 18, unit: "unité", emoji: "🧃" },
  { id: "p4", sku: "BOI-004", name: "Café expresso", category_id: "c1", price: 800, stock: 200, unit: "tasse", emoji: "☕" },
  { id: "p5", sku: "SNK-001", name: "Chips salées 45g", category_id: "c2", price: 350, stock: 64, unit: "sachet", emoji: "🥔" },
  { id: "p6", sku: "SNK-002", name: "Barre chocolat", category_id: "c2", price: 600, stock: 30, unit: "unité", emoji: "🍫" },
  { id: "p7", sku: "SNK-003", name: "Biscuit sec 200g", category_id: "c2", price: 750, stock: 22, unit: "paquet", emoji: "🍪" },
  { id: "p8", sku: "EPI-001", name: "Riz parfumé 1kg", category_id: "c3", price: 1200, stock: 55, unit: "kg", emoji: "🍚" },
  { id: "p9", sku: "EPI-002", name: "Huile végétale 1L", category_id: "c3", price: 1800, stock: 40, unit: "L", emoji: "🫒" },
  { id: "p10", sku: "EPI-003", name: "Tomate concentrée", category_id: "c3", price: 500, stock: 80, unit: "boîte", emoji: "🥫" },
  { id: "p11", sku: "EPI-004", name: "Sucre 1kg", category_id: "c3", price: 900, stock: 45, unit: "kg", emoji: "🧂" },
  { id: "p12", sku: "HYG-001", name: "Savon Marseille", category_id: "c4", price: 700, stock: 60, unit: "pièce", emoji: "🧼" },
  { id: "p13", sku: "HYG-002", name: "Dentifrice 75ml", category_id: "c4", price: 1500, stock: 28, unit: "tube", emoji: "🪥" },
  { id: "p14", sku: "HYG-003", name: "Papier toilette x4", category_id: "c4", price: 2000, stock: 15, unit: "paquet", emoji: "🧻" },
  { id: "p15", sku: "MAI-001", name: "Éponge x3", category_id: "c5", price: 500, stock: 90, unit: "paquet", emoji: "🧽" },
  { id: "p16", sku: "MAI-002", name: "Ampoule LED", category_id: "c5", price: 2500, stock: 12, unit: "unité", emoji: "💡" },
];

export function formatXOF(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}
