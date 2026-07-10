export type Promotion = {
  id: string;
  name: string;
  kind: "percent" | "fixed" | "bogo";
  value: number;
  scope: "produit" | "categorie" | "panier";
  target?: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  uses: number;
};

export type LoyaltyTier = {
  id: string;
  name: string;
  min_points: number;
  perk: string;
  color: string;
};

export const PROMOTIONS: Promotion[] = [
  { id: "pr1", name: "Boissons -10%", kind: "percent", value: 10, scope: "categorie", target: "Boissons", starts_at: "2026-07-01", ends_at: "2026-07-31", active: true, uses: 148 },
  { id: "pr2", name: "Riz 1kg à 1000F", kind: "fixed", value: 1000, scope: "produit", target: "Riz parfumé 1kg", starts_at: "2026-07-05", ends_at: "2026-07-15", active: true, uses: 42 },
  { id: "pr3", name: "2 achetés = 1 offert", kind: "bogo", value: 1, scope: "produit", target: "Barre chocolat", starts_at: "2026-06-20", ends_at: "2026-06-30", active: false, uses: 96 },
  { id: "pr4", name: "Panier > 10 000F : -5%", kind: "percent", value: 5, scope: "panier", starts_at: "2026-07-01", ends_at: "2026-12-31", active: true, uses: 312 },
];

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { id: "t1", name: "Bronze", min_points: 0, perk: "1 point par 100F dépensés", color: "#b45309" },
  { id: "t2", name: "Argent", min_points: 500, perk: "-3% permanent", color: "#64748b" },
  { id: "t3", name: "Or", min_points: 2000, perk: "-7% + bon 5 000F offert", color: "#d97706" },
  { id: "t4", name: "Platine", min_points: 5000, perk: "-10% + livraison gratuite", color: "#0891b2" },
];
