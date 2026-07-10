// Mock boutiques (tenants) pour le super admin. Structure Supabase-ready.

export type TenantStatus = "active" | "essai" | "expiree" | "suspendue";
export type PlanId = "starter" | "pro" | "business";

export type Tenant = {
  id: string;
  shop_name: string;
  owner_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  plan: PlanId;
  status: TenantStatus;
  created_at: string; // ISO
  last_payment_at: string | null;
  next_renewal_at: string | null;
  mrr: number; // en FCFA
  users_count: number;
  shops_count: number;
};

export const TENANTS: Tenant[] = [
  { id: "t1", shop_name: "Boutique Cotonou Centre", owner_name: "Aïcha Koudoro", email: "aicha@cotonoucentre.bj", phone: "+229 97 00 11 22", country: "Bénin", city: "Cotonou", plan: "pro", status: "active", created_at: "2025-11-14", last_payment_at: "2026-07-01", next_renewal_at: "2026-08-01", mrr: 19000, users_count: 5, shops_count: 2 },
  { id: "t2", shop_name: "Marché Dantokpa Épicerie", owner_name: "Kwame Adjoa", email: "kwame@dantokpa.bj", phone: "+229 96 45 12 88", country: "Bénin", city: "Cotonou", plan: "starter", status: "active", created_at: "2026-01-08", last_payment_at: "2026-07-05", next_renewal_at: "2026-08-05", mrr: 9000, users_count: 2, shops_count: 1 },
  { id: "t3", shop_name: "Kiosque Ouaga Zone 4", owner_name: "Fatimata Sawadogo", email: "fati@kiosque-ouaga.bf", phone: "+226 70 12 55 40", country: "Burkina Faso", city: "Ouagadougou", plan: "pro", status: "essai", created_at: "2026-07-02", last_payment_at: null, next_renewal_at: "2026-07-16", mrr: 0, users_count: 3, shops_count: 1 },
  { id: "t4", shop_name: "Superette Abidjan Riviera", owner_name: "Yao N'Guessan", email: "yao@abidjanriviera.ci", phone: "+225 07 88 44 21", country: "Côte d'Ivoire", city: "Abidjan", plan: "business", status: "active", created_at: "2025-08-22", last_payment_at: "2026-07-01", next_renewal_at: "2026-08-01", mrr: 39000, users_count: 14, shops_count: 4 },
  { id: "t5", shop_name: "Pharmacie du Plateau", owner_name: "Mireille Dossou", email: "mireille@pharmaplateau.bj", phone: "+229 95 23 78 10", country: "Bénin", city: "Porto-Novo", plan: "pro", status: "expiree", created_at: "2025-09-10", last_payment_at: "2026-05-01", next_renewal_at: "2026-06-01", mrr: 0, users_count: 4, shops_count: 1 },
  { id: "t6", shop_name: "Boulangerie La Baguette", owner_name: "Serge Attindéhou", email: "serge@labaguette.bj", phone: "+229 97 66 33 21", country: "Bénin", city: "Cotonou", plan: "starter", status: "suspendue", created_at: "2026-02-14", last_payment_at: "2026-04-14", next_renewal_at: "2026-05-14", mrr: 0, users_count: 2, shops_count: 1 },
  { id: "t7", shop_name: "Quincaillerie Lomé Nord", owner_name: "Ayélé Amoussou", email: "ayele@quincaillerie-lome.tg", phone: "+228 90 44 77 11", country: "Togo", city: "Lomé", plan: "pro", status: "active", created_at: "2026-03-18", last_payment_at: "2026-07-03", next_renewal_at: "2026-08-03", mrr: 19000, users_count: 6, shops_count: 2 },
  { id: "t8", shop_name: "Boutique Mode Karim", owner_name: "Karim Traoré", email: "karim@modekarim.ml", phone: "+223 76 21 44 99", country: "Mali", city: "Bamako", plan: "starter", status: "essai", created_at: "2026-07-07", last_payment_at: null, next_renewal_at: "2026-07-21", mrr: 0, users_count: 1, shops_count: 1 },
  { id: "t9", shop_name: "Restaurant Le Saveur", owner_name: "Nadège Houngbédji", email: "nadege@lesaveur.bj", phone: "+229 94 88 12 33", country: "Bénin", city: "Cotonou", plan: "business", status: "active", created_at: "2025-06-01", last_payment_at: "2026-07-01", next_renewal_at: "2026-08-01", mrr: 39000, users_count: 11, shops_count: 3 },
  { id: "t10", shop_name: "Épicerie Fine Dakar", owner_name: "Ousmane Fall", email: "ousmane@epicerie-dakar.sn", phone: "+221 77 555 22 10", country: "Sénégal", city: "Dakar", plan: "pro", status: "active", created_at: "2026-04-25", last_payment_at: "2026-07-01", next_renewal_at: "2026-08-01", mrr: 19000, users_count: 4, shops_count: 1 },
  { id: "t11", shop_name: "Salon Beauté Awa", owner_name: "Awa Diallo", email: "awa@salonbeaute.sn", phone: "+221 78 902 44 77", country: "Sénégal", city: "Thiès", plan: "starter", status: "active", created_at: "2026-06-12", last_payment_at: "2026-07-12", next_renewal_at: "2026-08-12", mrr: 9000, users_count: 2, shops_count: 1 },
  { id: "t12", shop_name: "Magasin Électro Plus", owner_name: "Ibrahim Sanogo", email: "ibrahim@electroplus.ci", phone: "+225 05 32 11 88", country: "Côte d'Ivoire", city: "Yamoussoukro", plan: "pro", status: "essai", created_at: "2026-07-09", last_payment_at: null, next_renewal_at: "2026-07-23", mrr: 0, users_count: 2, shops_count: 1 },
];

export const TENANT_STATUS_META: Record<TenantStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-success/15 text-success" },
  essai: { label: "Essai", color: "bg-accent/25 text-accent-foreground" },
  expiree: { label: "Expirée", color: "bg-destructive/15 text-destructive" },
  suspendue: { label: "Suspendue", color: "bg-muted text-muted-foreground" },
};

export const PLAN_LABEL: Record<PlanId, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

// Historique de paiement mocké par boutique
export type PaymentRow = {
  id: string;
  tenant_id: string;
  amount: number;
  method: "Orange Money" | "MTN MoMo" | "Moov Money" | "Wave" | "Carte";
  status: "reussi" | "echoue" | "en_attente";
  ref: string;
  created_at: string;
};

export const PAYMENTS: PaymentRow[] = [
  { id: "p1", tenant_id: "t1", amount: 19000, method: "Orange Money", status: "reussi", ref: "MF-6A21F0", created_at: "2026-07-01T08:14:00Z" },
  { id: "p2", tenant_id: "t2", amount: 9000, method: "MTN MoMo", status: "reussi", ref: "MF-6A22B1", created_at: "2026-07-05T10:02:00Z" },
  { id: "p3", tenant_id: "t4", amount: 39000, method: "Wave", status: "reussi", ref: "MF-6A2301", created_at: "2026-07-01T09:41:00Z" },
  { id: "p4", tenant_id: "t5", amount: 19000, method: "Orange Money", status: "echoue", ref: "MF-6A2455", created_at: "2026-06-01T18:23:00Z" },
  { id: "p5", tenant_id: "t7", amount: 19000, method: "Moov Money", status: "reussi", ref: "MF-6A2560", created_at: "2026-07-03T14:11:00Z" },
  { id: "p6", tenant_id: "t9", amount: 39000, method: "Wave", status: "reussi", ref: "MF-6A2611", created_at: "2026-07-01T11:07:00Z" },
  { id: "p7", tenant_id: "t10", amount: 19000, method: "Carte", status: "reussi", ref: "MF-6A2701", created_at: "2026-07-01T07:32:00Z" },
  { id: "p8", tenant_id: "t11", amount: 9000, method: "Orange Money", status: "reussi", ref: "MF-6A2812", created_at: "2026-07-12T15:44:00Z" },
  { id: "p9", tenant_id: "t6", amount: 9000, method: "MTN MoMo", status: "echoue", ref: "MF-6A2900", created_at: "2026-05-14T12:22:00Z" },
  { id: "p10", tenant_id: "t3", amount: 19000, method: "Orange Money", status: "en_attente", ref: "MF-6A2A11", created_at: "2026-07-10T09:15:00Z" },
];

// Revenu mensuel 12 mois (FCFA)
export const MONTHLY_REVENUE: { month: string; amount: number }[] = [
  { month: "Août 25", amount: 145000 },
  { month: "Sept 25", amount: 168000 },
  { month: "Oct 25", amount: 192000 },
  { month: "Nov 25", amount: 221000 },
  { month: "Déc 25", amount: 243000 },
  { month: "Jan 26", amount: 268000 },
  { month: "Fév 26", amount: 289000 },
  { month: "Mars 26", amount: 312000 },
  { month: "Avr 26", amount: 336000 },
  { month: "Mai 26", amount: 358000 },
  { month: "Juin 26", amount: 371000 },
  { month: "Juil 26", amount: 396000 },
];

// Inscriptions 30 derniers jours
export const SIGNUPS_30D: { day: string; count: number }[] = Array.from({ length: 30 }, (_, i) => ({
  day: `J-${29 - i}`,
  count: Math.max(0, Math.round(3 + Math.sin(i / 3) * 2 + (i % 5 === 0 ? 4 : 0))),
}));
