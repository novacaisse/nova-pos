import type { Role } from "./session";

export type PermAction = "view" | "edit" | "delete";
export const PERM_ACTIONS: { key: PermAction; label: string }[] = [
  { key: "view", label: "Voir" },
  { key: "edit", label: "Modifier" },
  { key: "delete", label: "Supprimer" },
];

export const PERM_MODULES = [
  "Caisse", "Ventes", "Devis", "Produits", "Stock", "Fournisseurs",
  "Clients", "Promotions", "Dépenses", "Rapports", "Équipe", "Paramètres",
] as const;
export type PermModule = (typeof PERM_MODULES)[number];

export type PermMatrix = Record<PermModule, Record<PermAction, boolean>>;

function makeMatrix(fn: (mod: PermModule, act: PermAction) => boolean): PermMatrix {
  return Object.fromEntries(
    PERM_MODULES.map((m) => [
      m,
      Object.fromEntries(PERM_ACTIONS.map(({ key }) => [key, fn(m, key)])) as Record<PermAction, boolean>,
    ]),
  ) as PermMatrix;
}

export const ROLE_MATRIX: Record<Role, PermMatrix> = {
  gerant: makeMatrix(() => true),
  super_admin: makeMatrix(() => true),
  vendeur: makeMatrix((m, a) => {
    if (["Équipe", "Paramètres", "Rapports"].includes(m)) return false;
    if (m === "Fournisseurs" || m === "Promotions" || m === "Dépenses") return a === "view";
    if (a === "delete") return false;
    return true;
  }),
  caissier: makeMatrix((m, a) => {
    if (["Caisse", "Ventes", "Clients"].includes(m)) return a !== "delete";
    if (m === "Produits") return a === "view";
    return false;
  }),
};
