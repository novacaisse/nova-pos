// Statut dérivé d'une boutique côté Super Admin — partagé entre Dashboard,
// Boutiques et Abonnements pour ne pas dupliquer la même logique 3 fois.
import type { AdminShop, AdminSubscription } from "@/lib/data/adminHooks";

export type ShopStatus = "active" | "essai" | "expiree" | "suspendue";

export const STATUS_META: Record<ShopStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-success/15 text-success" },
  essai: { label: "Essai", color: "bg-accent/25 text-accent-foreground" },
  expiree: { label: "Expirée", color: "bg-destructive/15 text-destructive" },
  suspendue: { label: "Suspendue", color: "bg-muted text-muted-foreground" },
};

export function shopStatus(shop: AdminShop, sub?: AdminSubscription): ShopStatus {
  if (shop.suspended) return "suspendue";
  if (sub?.status === "active") return "active";
  if (shop.plan === "trial") {
    return shop.trial_ends_at && new Date(shop.trial_ends_at) < new Date() ? "expiree" : "essai";
  }
  return "expiree";
}
