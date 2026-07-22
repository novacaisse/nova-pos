import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement : /app/ventes/nouvelle est un enfant de cette
// route (routing par fichiers) et ne s'affichera qu'à travers cet <Outlet />
// — même pattern que app.produits.tsx/app.produits.index.tsx (voir ce
// commit-là pour le bug que cette structure évite dès le départ ici).
// La liste elle-même vit dans app.ventes.index.tsx.
export const Route = createFileRoute("/app/ventes")({
  component: () => <Outlet />,
});
