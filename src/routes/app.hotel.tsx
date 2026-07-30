import { createFileRoute, Outlet } from "@tanstack/react-router";

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
  component: () => <Outlet />,
});
