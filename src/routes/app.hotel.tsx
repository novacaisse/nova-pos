import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement : /app/hotel/reservations, /app/hotel/rooms,
// /app/hotel/housekeeping et /app/hotel/rapports sont des enfants de cette
// route (imposé par le routing par fichiers dès qu'un segment partage le
// même préfixe) et ne s'afficheront qu'à travers cet <Outlet /> — même
// convention que app.tsx+app.index.tsx et app.produits.tsx+app.produits.index.tsx.
// Le tableau de bord lui-même vit dans app.hotel.index.tsx.
export const Route = createFileRoute("/app/hotel")({
  component: () => <Outlet />,
});
