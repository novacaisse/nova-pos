export type Plan = {
  id: "starter" | "pro" | "business";
  name: string;
  price_month: number;
  features: string[];
  limits: { shops: number | "∞"; users: number | "∞"; products: number | "∞" };
  recommended?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter", name: "Starter", price_month: 9000,
    features: ["1 boutique", "2 utilisateurs", "Caisse + Produits + Stock", "Assistance email"],
    limits: { shops: 1, users: 2, products: 500 },
  },
  {
    id: "pro", name: "Pro", price_month: 19000, recommended: true,
    features: ["3 boutiques", "10 utilisateurs", "Tous modules + Rapports avancés", "Assistant IA (500 req/mois)", "Support prioritaire"],
    limits: { shops: 3, users: 10, products: 5000 },
  },
  {
    id: "business", name: "Business", price_month: 39000,
    features: ["Boutiques illimitées", "Utilisateurs illimités", "IA illimitée + API", "Support téléphonique 7j/7", "Formation dédiée"],
    limits: { shops: "∞", users: "∞", products: "∞" },
  },
];
