import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/components/app/TeamPage";

export const Route = createFileRoute("/app/resto/equipe")({
  component: () => (
    <TeamPage
      roles={["owner", "manager", "accountant", "server", "cook"]}
      defaultRole="server"
      title="Équipe"
      subtitle="Utilisateurs et rôles ZegResto"
      showPermissionsMatrix={false}
      customRolesAppModule="resto"
    />
  ),
});
