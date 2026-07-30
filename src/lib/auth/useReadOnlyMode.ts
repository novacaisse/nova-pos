// Lecture seule à l'expiration de l'essai gratuit (audit ZegOS Phase 1,
// LOT C) — remplace l'ancien comportement de blocage total (redirection
// systématique et sans issue vers /souscription) : l'organisation reste
// consultable (chambres, produits, historique, rapports), seules les
// actions de création/vente/réservation sont bloquées. Basé sur
// organizations.plan/trial_ends_at (lisibles par tous les membres, RLS
// has_organization_access) plutôt que sur subscriptions (lecture réservée
// à owner/manager/accountant) — le mode lecture seule doit s'appliquer à
// tous les rôles, y compris caissier/réceptionniste.
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { getTrialInfo } from "@/lib/trial";

export function useReadOnlyMode(): { readOnly: boolean; reason: string | null } {
  const { currentOrganization } = useOrganization();
  const trial = getTrialInfo(currentOrganization);
  const readOnly = trial.onTrial && trial.expired;
  return {
    readOnly,
    reason: readOnly ? "Essai gratuit terminé — souscrivez à une formule pour reprendre les ventes et réservations." : null,
  };
}
