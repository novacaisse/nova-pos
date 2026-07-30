import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/components/app/TeamPage";

export const Route = createFileRoute("/app/hotel/equipe")({
  component: () => (
    <TeamPage
      roles={["owner", "manager", "accountant", "front_desk", "housekeeping"]}
      defaultRole="front_desk"
      title="Équipe"
      subtitle="Utilisateurs et rôles ZegHotel"
      showPermissionsMatrix={false}
    />
  ),
});
