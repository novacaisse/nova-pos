import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement — même convention que app.hotel.tsx/app.resto.tsx :
// les enfants (/app/erp/produits, /app/erp/stock, etc.) s'affichent à
// travers cet <Outlet />. Le tableau de bord vit dans app.erp.index.tsx.
export const Route = createFileRoute("/app/erp")({
  head: () => ({ meta: [{ title: "ZegERP" }] }),
  component: () => <Outlet />,
});
