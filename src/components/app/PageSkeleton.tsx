// Skeleton de page générique — évite le flash de contenu vide ("Aucun
// produit", "0F") qui s'affichait avant les vraies données sur Rapports,
// Ventes, Produits, Fournisseurs, Caisse, Paramètres (audit ZegOS Phase 1,
// LOT E) : ces pages calculaient déjà leurs totaux/KPI à partir des
// valeurs par défaut ([]) des hooks React Query AVANT que isLoading ne
// devienne false, sans jamais bloquer ce rendu initial. Un simple
// early-return sur isLoading, placé après tous les hooks du composant,
// suffit à le remplacer par cet état de chargement explicite.
import { PageHeader } from "@/components/app/PageHeader";

export function PageSkeleton({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div>
      {title && <PageHeader title={title} subtitle={subtitle} />}
      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}
