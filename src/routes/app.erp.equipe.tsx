import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/components/app/TeamPage";

// Les 3 rôles spécifiques ZegERP (buyer/salesperson/hr_manager) sont
// proposés dès maintenant même si leurs modules respectifs (Achats/Ventes/
// RH) n'ont pas encore d'écran — inviter un collaborateur avec le bon rôle
// ne doit pas attendre que l'écran correspondant existe, la RLS est déjà
// en place (migrations 049/051/056) et rendra ses droits opérants dès que
// l'écran suit.
export const Route = createFileRoute("/app/erp/equipe")({
  component: () => (
    <TeamPage
      roles={["owner", "manager", "accountant", "stock", "cashier", "buyer", "salesperson", "hr_manager"]}
      defaultRole="stock"
      title="Équipe"
      subtitle="Utilisateurs et rôles ZegERP"
      showPermissionsMatrix={false}
    />
  ),
});
