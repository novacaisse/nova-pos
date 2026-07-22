import { createFileRoute, Outlet } from "@tanstack/react-router";

// Route de layout uniquement : /souscription/confirmation est un enfant de
// cette route (imposé par le routing par fichiers) et ne s'affichait jamais
// avant ce correctif — il manquait cet <Outlet />, donc le retour de paiement
// MoneyFusion (redirection externe vers /souscription/confirmation) restait
// bloqué sur l'écran de récap/paiement au lieu d'afficher la confirmation.
// Le formulaire de souscription lui-même vit dans souscription.index.tsx.
export const Route = createFileRoute("/souscription")({
  component: () => <Outlet />,
});
