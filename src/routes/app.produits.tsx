import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement : /app/produits/nouveau et /app/produits/$productId
// sont des enfants de cette route (imposé par le routing par fichiers dès qu'un
// segment partage le même préfixe) et ne s'afficheront qu'à travers cet <Outlet />.
// La liste elle-même vit dans app.produits.index.tsx (même convention que
// app.tsx + app.index.tsx pour /app).
export const Route = createFileRoute("/app/produits")({
  component: () => <Outlet />,
});
