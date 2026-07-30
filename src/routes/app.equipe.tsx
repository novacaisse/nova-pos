import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/components/app/TeamPage";

export const Route = createFileRoute("/app/equipe")({
  component: () => (
    <TeamPage
      roles={["owner", "manager", "accountant", "cashier", "stock"]}
      defaultRole="cashier"
      title="Équipe"
      subtitle="Utilisateurs, rôles et permissions ZegCaisse"
      showPermissionsMatrix
    />
  ),
});
