// Notifications envoyées par Digitorizon (éditeur de NovaCaisse).
// Distinctes des alertes internes de stock (module Stock).

export type DigitorizonNotifKind = "announce" | "billing" | "update" | "tip";

export type DigitorizonNotification = {
  id: string;
  kind: DigitorizonNotifKind;
  title: string;
  body: string;
  created_at: string; // ISO
  read: boolean;
  cta_label?: string;
  cta_href?: string;
};

export const NOTIFICATIONS: DigitorizonNotification[] = [
  {
    id: "n1",
    kind: "billing",
    title: "Votre abonnement Pro se renouvelle dans 5 jours",
    body: "Prochain prélèvement le 15 juillet : 19 000 FCFA via Mobile Money.",
    created_at: "2026-07-10T08:30:00Z",
    read: false,
    cta_label: "Gérer l'abonnement",
    cta_href: "/app/abonnement",
  },
  {
    id: "n2",
    kind: "update",
    title: "Nouveau — module Devis disponible",
    body: "Créez vos devis et convertissez-les en facture en un clic.",
    created_at: "2026-07-09T14:12:00Z",
    read: false,
    cta_label: "Découvrir",
    cta_href: "/app/devis",
  },
  {
    id: "n3",
    kind: "announce",
    title: "Maintenance planifiée dimanche 3h→4h",
    body: "Interruption courte du service pendant la maintenance des serveurs.",
    created_at: "2026-07-07T09:00:00Z",
    read: true,
  },
  {
    id: "n4",
    kind: "tip",
    title: "Astuce : activez le raccourci F1 pour la caisse",
    body: "Passez à la caisse en une seule touche depuis n'importe où.",
    created_at: "2026-07-05T11:00:00Z",
    read: true,
  },
];
