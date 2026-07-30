import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FocusEvent } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// À passer en onFocus sur un <input type="number"> dont la valeur par
// défaut est 0 — sans ça, taper "5" après focus insère le caractère après
// le "0" existant au lieu de le remplacer, donnant "05" à l'écran (la
// valeur enregistrée reste correcte, seul l'affichage pendant la saisie
// est trompeur). Sélectionner tout le contenu au focus fait que la
// première frappe remplace la valeur entière, comme attendu.
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.target.select();
}
