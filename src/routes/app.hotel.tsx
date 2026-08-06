import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { HotelOnboardingGate } from "@/components/app/HotelOnboardingGate";

// Route de layout uniquement : /app/hotel/reservations, /app/hotel/rooms,
// /app/hotel/housekeeping et /app/hotel/rapports sont des enfants de cette
// route (imposé par le routing par fichiers dès qu'un segment partage le
// même préfixe) et ne s'afficheront qu'à travers cet <Outlet /> — même
// convention que app.tsx+app.index.tsx et app.produits.tsx+app.produits.index.tsx.
// Le tableau de bord lui-même vit dans app.hotel.index.tsx.
export const Route = createFileRoute("/app/hotel")({
  // Titre d'onglet dédié pour tout /app/hotel/* — sans lui, ces pages
  // héritaient du titre "ZegCaisse" fixé par le layout parent /app
  // (app.tsx), qui ne changeait jamais en naviguant dans ZegHotel (audit
  // ZegOS Phase 1, LOT E).
  head: () => ({ meta: [{ title: "ZegHotel" }] }),
  component: HotelLayout,
});

// Onboarding obligatoire (migration 082) : tant qu'aucune chambre n'a été
// créée pour cette organisation, tout /app/hotel/* (y compris le dashboard)
// est remplacé par le wizard — jamais juste grisé, cf. AUDIT_ZEGHOTEL_
// FINALISATION_2026-08.md §3. currentOrganization peut être temporairement
// celui d'une autre app pendant une bascule (ShopSelector) ; on ne bloque
// que si app_module==='hotel' est confirmé, jamais sur un état transitoire.
function HotelLayout() {
  const { currentOrganization, loading } = useOrganization();
  if (loading || !currentOrganization) return <Outlet />;
  if (currentOrganization.app_module === "hotel" && !currentOrganization.hotel_onboarding_completed) {
    return <HotelOnboardingGate />;
  }
  return <Outlet />;
}
