// Edge Function : check-subscription-payment
// Appelée par le client authentifié (souscription.confirmation.tsx) pendant
// qu'il attend la résolution d'un paiement — vérifie ACTIVEMENT le statut
// auprès de MoneyFusion au lieu d'attendre passivement un webhook qui n'est
// peut-être envoyé qu'une seule fois par MoneyFusion (à l'initiation,
// jamais à la résolution). Corrige le bug "paiement bloqué en attente
// indéfiniment" constaté sur un vrai paiement, indépendamment de la
// fiabilité du webhook lui-même (voir moneyfusion-webhook et
// supabase/config.toml pour l'autre cause probable : vérification JWT
// activée par défaut, qui bloquait aussi les appels de MoneyFusion).
//
// Réutilise verifyAndApplyPayment (supabase/functions/_shared/moneyfusion.ts),
// le même code que le webhook, pour ne jamais avoir deux implémentations
// qui divergent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, verifyAndApplyPayment, type SubscriptionPaymentRow } from "../_shared/moneyfusion.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYMENT_PROXY_URL = Deno.env.get("PAYMENT_PROXY_URL")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    // Client scopé à l'utilisateur : la RLS (has_shop_access) garantit
    // qu'on ne peut lire/vérifier qu'un paiement d'une boutique à laquelle
    // on appartient — jamais confiance dans un payment_id arbitraire sans
    // ce filtre.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => null);
    const payment_id = body?.payment_id as string | undefined;
    if (!payment_id) return json({ error: "payment_id manquant." }, 400);

    const { data: payment, error: payErr } = await userClient
      .from("subscription_payments").select("*").eq("id", payment_id).maybeSingle();
    if (payErr || !payment) return json({ error: "Paiement introuvable." }, 404);

    const admin = adminClient();
    const status = await verifyAndApplyPayment(admin, payment as SubscriptionPaymentRow, PAYMENT_PROXY_URL);

    return json({ status });
  } catch (e) {
    console.error("check-subscription-payment: erreur inattendue", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
