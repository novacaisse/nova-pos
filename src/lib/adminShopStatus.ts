// Statut dérivé d'une organisation côté Super Admin — partagé entre
// Dashboard, Boutiques et Abonnements pour ne pas dupliquer la même
// logique 3 fois.
import type { AdminOrganization, AdminSubscription } from "@/lib/data/adminHooks";

export type OrganizationStatus = "active" | "essai" | "expiree" | "suspendue";

export const STATUS_META: Record<OrganizationStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-success/15 text-success" },
  essai: { label: "Essai", color: "bg-accent/25 text-accent-foreground" },
  expiree: { label: "Expirée", color: "bg-destructive/15 text-destructive" },
  suspendue: { label: "Suspendue", color: "bg-muted text-muted-foreground" },
};

export function organizationStatus(organization: AdminOrganization, sub?: AdminSubscription): OrganizationStatus {
  if (organization.suspended) return "suspendue";
  if (sub?.status === "active") return "active";
  if (organization.plan === "trial") {
    return organization.trial_ends_at && new Date(organization.trial_ends_at) < new Date() ? "expiree" : "essai";
  }
  return "expiree";
}
