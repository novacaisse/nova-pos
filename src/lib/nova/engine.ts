// Moteur de réponses "mock amélioré" de Nova — pas de vraie IA connectée
// (décision validée : ouvrir une intégration LLM nécessite une infra de
// coûts/quotas qui n'existe pas encore). Ce moteur reste utile en attendant :
// il répond avec de vraies données de la boutique courante plutôt que du
// texte statique, sur un jeu de sujets reconnus par mots-clés.
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { formatMoney, type Sale, type SaleItem, type ProductWithStock, type Customer, type Expense } from "@/lib/data/hooks";

export type NovaContext = {
  shopName: string;
  currency: string | null | undefined;
  sales: (Sale & { sale_items: SaleItem[] })[];
  products: ProductWithStock[];
  customers: Customer[];
  expenses: Expense[];
};

export const NOVA_SUGGESTIONS = [
  "Ventes du jour",
  "Top produits",
  "Rupture de stock",
  "Créances clients",
  "Dépenses du mois",
];

function fmt(ctx: NovaContext, n: number) {
  return formatMoney(n, ctx.currency);
}

function isRevenue(s: Sale) {
  return s.status === "completed" || s.status === "partially_refunded";
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function matches(q: string, ...keywords: string[]) {
  return keywords.some((k) => q.includes(k));
}

export function answerNova(question: string, ctx: NovaContext): string {
  const q = norm(question);

  if (matches(q, "bonjour", "salut", "hello", "coucou", "bonsoir")) {
    return `Bonjour 👋 Je suis Nova, l'assistant de ${ctx.shopName}. Demandez-moi les ventes du jour, le top produits, les ruptures de stock, les créances clients ou les dépenses du mois.`;
  }

  if (matches(q, "vente du jour", "ventes du jour", "ca du jour", "chiffre d'affaires du jour", "chiffre daffaires du jour")) {
    const today = startOfDay(new Date());
    const todaySales = ctx.sales.filter((s) => isRevenue(s) && new Date(s.created_at) >= today);
    if (todaySales.length === 0) return "Aucune vente enregistrée aujourd'hui pour l'instant.";
    const total = todaySales.reduce((s, x) => s + Number(x.total), 0);
    return `Aujourd'hui : ${todaySales.length} vente${todaySales.length > 1 ? "s" : ""} pour ${fmt(ctx, total)} de chiffre d'affaires.`;
  }

  if (matches(q, "top produit", "meilleur produit", "produit qui se vend", "best-seller", "bestseller", "produits les plus vendus")) {
    const since = subDays(new Date(), 30);
    const agg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of ctx.sales) {
      if (!isRevenue(s) || new Date(s.created_at) < since) continue;
      for (const it of s.sale_items) {
        const key = it.product_id ?? it.name;
        const cur = agg.get(key) ?? { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += Number(it.total);
        agg.set(key, cur);
      }
    }
    const top = [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 3);
    if (top.length === 0) return "Pas assez de ventes sur les 30 derniers jours pour établir un classement.";
    return `Top produits (30 derniers jours) :\n${top.map((p, i) => `${i + 1}. ${p.name} — ${p.qty} vendus, ${fmt(ctx, p.revenue)}`).join("\n")}`;
  }

  if (matches(q, "rupture", "stock bas", "stock faible", "reapprovisionner", "réapprovisionner", "manque de stock")) {
    const active = ctx.products.filter((p) => p.is_active);
    const outOfStock = active.filter((p) => p.stock <= 0);
    const low = active.filter((p) => p.stock > 0 && p.stock <= p.low_stock_threshold);
    if (outOfStock.length === 0 && low.length === 0) return "Aucune rupture ni stock bas détecté actuellement — tout est vert. ✅";
    const parts: string[] = [];
    if (outOfStock.length) parts.push(`En rupture (${outOfStock.length}) : ${outOfStock.slice(0, 5).map((p) => p.name).join(", ")}${outOfStock.length > 5 ? "…" : ""}`);
    if (low.length) parts.push(`Stock bas (${low.length}) : ${low.slice(0, 5).map((p) => p.name).join(", ")}${low.length > 5 ? "…" : ""}`);
    return parts.join("\n");
  }

  if (matches(q, "creance", "créance", "credit client", "crédit client", "qui me doit", "dette")) {
    const debtors = ctx.customers
      .filter((c) => Number(c.credit_balance) > 0)
      .sort((a, b) => Number(b.credit_balance) - Number(a.credit_balance));
    if (debtors.length === 0) return "Aucun client n'a de créance en cours. 👍";
    const total = debtors.reduce((s, c) => s + Number(c.credit_balance), 0);
    const topNames = debtors.slice(0, 3).map((c) => `${c.name} (${fmt(ctx, Number(c.credit_balance))})`).join(", ");
    return `${debtors.length} client${debtors.length > 1 ? "s" : ""} avec une créance, pour un total de ${fmt(ctx, total)}.\nLes plus importantes : ${topNames}.`;
  }

  if (matches(q, "depense", "dépense")) {
    const since = startOfMonth(new Date());
    const monthExpenses = ctx.expenses.filter((e) => new Date(e.paid_at) >= since);
    if (monthExpenses.length === 0) return "Aucune dépense enregistrée ce mois-ci.";
    const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    return `${monthExpenses.length} dépense${monthExpenses.length > 1 ? "s" : ""} ce mois-ci pour ${fmt(ctx, total)}.`;
  }

  if (matches(q, "aide", "capacit", "que peux-tu", "quoi faire", "help")) {
    return `Je peux répondre à des questions sur : ${NOVA_SUGGESTIONS.join(", ").toLowerCase()}. Posez votre question en langage naturel.`;
  }

  return "Je suis encore un assistant simplifié (pas de vraie IA connectée pour l'instant) : je peux répondre sur les ventes du jour, le top produits, les ruptures de stock, les créances clients ou les dépenses du mois. Essayez de reformuler autour de l'un de ces sujets.";
}
