// Génération de SKU/code-barres par défaut — dépannage rapide pour un
// commerçant qui n'a pas déjà ses propres références, pas une nomenclature
// métier stricte.

export function generateSku(name: string, categoryName?: string): string {
  const base = (categoryName?.trim() || name.trim() || "PRD").replace(/[^a-zA-Z]/g, "");
  const prefix = (base.slice(0, 3) || "PRD").toUpperCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${suffix}`;
}

// EAN-13 valide (12 chiffres aléatoires + clé de contrôle calculée),
// suffisant pour scanner/imprimer une étiquette interne — pas un vrai code
// attribué par GS1.
export function generateBarcode(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return [...digits, check].join("");
}
