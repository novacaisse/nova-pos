// Module FNE dédié (mission "mise à jour ZegHotel", item 9 — présent sur les
// 4 apps, PAS un onglet de Paramètres comme avant). Portée volontairement
// réduite à un lien direct vers le portail officiel DGI (décision produit
// explicite : "Lien direct vers le portail FNE", pas d'intégration API DGI).
// Spécifique à la DGI Côte d'Ivoire — sans objet pour les organisations des
// autres pays couverts (COUNTRIES, AddOrganizationDialog.tsx), même garde
// que l'ancien bloc dans OrgIdentityTab.tsx.
import { ExternalLink, FileCheck2, ShieldCheck, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

const FNE_URL = "https://www.services.fne.dgi.gouv.ci/fr";

export function FnePage() {
  const { currentOrganization } = useOrganization();
  const isIvorian = currentOrganization?.country === "Côte d'Ivoire";

  return (
    <div>
      <PageHeader title="Facture FNE" subtitle="Facturation Normalisée Électronique — portail officiel DGI" />
      <div className="p-4 sm:p-8">
        {!isIvorian ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            La FNE est spécifique à la Direction Générale des Impôts de Côte d'Ivoire — non applicable au pays de votre organisation ({currentOrganization?.country ?? "—"}).
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileCheck2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">Facture Normalisée Électronique</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              La FNE est obligatoire pour les entreprises ivoiriennes soumises à la certification électronique de leurs
              factures auprès de la DGI. Le portail officiel gère l'inscription, la certification de votre matériel et
              le suivi de vos factures normalisées — indépendamment de zegOS.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Certification de vos factures directement auprès de la DGI.
              </li>
              <li className="flex items-start gap-2.5">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Suivi de vos déclarations depuis n'importe quel appareil.
              </li>
            </ul>
            <a href={FNE_URL} target="_blank" rel="noopener noreferrer"
              className="mt-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90">
              Accéder au portail FNE <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-3 text-center text-xs text-muted-foreground">services.fne.dgi.gouv.ci</p>
          </div>
        )}
      </div>
    </div>
  );
}
