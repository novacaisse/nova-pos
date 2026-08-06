import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement — même convention que app.produits.tsx.
export const Route = createFileRoute("/app/hotel/produits")({
  component: () => <Outlet />,
});
