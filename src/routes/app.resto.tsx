import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement — même convention que app.hotel.tsx : les
// enfants (/app/resto/salle, /app/resto/commandes, etc.) s'affichent à
// travers cet <Outlet />. Le tableau de bord vit dans app.resto.index.tsx.
export const Route = createFileRoute("/app/resto")({
  head: () => ({ meta: [{ title: "ZegResto" }] }),
  component: () => <Outlet />,
});
