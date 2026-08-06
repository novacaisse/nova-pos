// Edge Function : create-subscription-payment
// Appelée par le client authentifié (souscription.tsx) avec
// { organization_id, plan_id, period, phone, full_name }.
// - Vérifie server-side que l'appelant est owner/manager de organization_id
//   (ne jamais faire confiance à organization_id envoyé par le client,
//   puisqu'on va écrire ensuite avec le service role, qui contourne la RLS).
// - Crée une ligne subscription_payments (status: pending).
// - Appelle MoneyFusion via un proxy à IP fixe (PAYMENT_PROXY_URL) — le
//   lien API MoneyFusion n'accepte que les requêtes depuis une IP
//   enregistrée sur leur dashboard, jamais directement depuis le navigateur
//   du client (la clé/l'URL API ne doit jamais être exposée côté client).
// - Renvoie { url } : le client redirige le navigateur vers cette URL pour
//   que le client final choisisse lui-même son opérateur Mobile Money sur
//   la page hébergée par MoneyFusion (l'API ne prend pas d'opérateur en
//   paramètre — c'est géré côté MoneyFusion après redirection).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MONEYFUSION_API_URL = Deno.env.get("MONEYFUSION_API_URL")!;
const PAYMENT_PROXY_URL = Deno.env.get("PAYMENT_PROXY_URL")!;
const APP_URL = Deno.env.get("APP_URL")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Le proxy (VPS + Squid) attend l'authentification en Basic Auth séparée
// de l'URL plutôt qu'en userinfo intégré à l'URL — plus fiable avec
// l'implémentation du client HTTP de Deno.
function buildProxyClient(proxyUrl: string) {
  const u = new URL(proxyUrl);
  const basicAuth = u.username
    ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
    : undefined;
  u.username = "";
  u.password = "";
  return Deno.createHttpClient({ proxy: { url: u.toString(), basicAuth } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    // Client scopé à l'utilisateur appelant (RLS active) — sert uniquement
    // à vérifier son identité et son rôle, jamais à écrire.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Session invalide." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const organization_id = body?.organization_id as string | undefined;
    const plan_id = body?.plan_id as string | undefined;
    const period = body?.period as string | undefined;
    const phone = body?.phone as string | undefined;
    const full_name = body?.full_name as string | undefined;

    if (!organization_id || !plan_id || !period || !phone || !full_name) {
      return json({ error: "Paramètres manquants." }, 400);
    }
    if (period !== "month" && period !== "year") {
      return json({ error: "Période invalide." }, 400);
    }

    const { data: membership, error: memberErr } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr || !membership || (membership.role !== "owner" && membership.role !== "manager")) {
      return json({ error: "Action réservée au propriétaire ou gérant de la boutique." }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: plan, error: planErr } = await admin
      .from("plans").select("*").eq("id", plan_id).eq("is_active", true).maybeSingle();
    if (planErr || !plan) return json({ error: "Formule introuvable ou inactive." }, 404);

    // Ne jamais faire confiance au plan_id envoyé par le client seul : l'UI
    // (souscription.index.tsx) ne propose déjà que les formules de l'app
    // de l'établissement actif, mais un appel direct pourrait sinon payer
    // une formule ZegHotel pour une boutique ZegCaisse (ou l'inverse) —
    // account_subscriptions se retrouverait avec le plan_id d'une autre
    // application (Phase 5/moneyfusion.ts en hérite ensuite aveuglément).
    const { data: organization, error: orgErr } = await admin
      .from("organizations").select("app_module, plan, trial_ends_at").eq("id", organization_id).maybeSingle();
    if (orgErr || !organization) return json({ error: "Boutique introuvable." }, 404);
    if (plan.app_module !== organization.app_module) {
      return json({ error: "Cette formule n'est pas disponible pour cette application." }, 400);
    }

    const basePrice = period === "year" ? Number(plan.price_year) : Number(plan.price_month);
    if (!basePrice || basePrice <= 0) return json({ error: "Prix invalide pour cette formule." }, 400);

    // Réduction essai gratuit (5 000 F, toutes devises confondues — même
    // logique que getTrialInfo côté client, jamais recalculée à partir
    // d'un état envoyé par le client) : uniquement si l'organisation est
    // encore en essai ET que trial_ends_at n'est pas dépassé au moment de
    // CET appel serveur — fenêtre de conversion rapide, jamais rejouable
    // après coup ni falsifiable depuis le navigateur.
    const TRIAL_DISCOUNT = 5000;
    const onTrial = organization.plan === "trial"
      && !!organization.trial_ends_at
      && new Date(organization.trial_ends_at).getTime() > Date.now();
    const discount = onTrial ? Math.min(TRIAL_DISCOUNT, basePrice) : 0;
    const totalPrice = basePrice - discount;

    // Réutilise l'unique ligne subscriptions de la boutique (créée à
    // l'inscription) plutôt que d'en créer une nouvelle à chaque paiement.
    const { data: subscription, error: subErr } = await admin
      .from("subscriptions").select("id")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (subErr || !subscription) return json({ error: "Abonnement introuvable pour cette boutique." }, 404);

    const { data: payment, error: payErr } = await admin
      .from("subscription_payments")
      .insert({
        organization_id, subscription_id: subscription.id,
        amount: totalPrice, currency: plan.currency,
        method: "mobile_money", status: "pending", provider: "moneyfusion",
        metadata: { plan_id, period, base_price: basePrice, trial_discount: discount },
      })
      .select().single();
    if (payErr || !payment) {
      console.error("create-subscription-payment: insert payment failed", payErr);
      return json({ error: "Impossible de créer le paiement." }, 500);
    }

    const proxyClient = buildProxyClient(PAYMENT_PROXY_URL);
    let mfData: any = null;
    try {
      const mfRes = await fetch(MONEYFUSION_API_URL, {
        method: "POST",
        client: proxyClient,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalPrice,
          article: [{ [plan.name]: totalPrice }],
          numeroSend: phone,
          nomclient: full_name,
          personal_Info: [{ organization_id, plan_id, period, payment_id: payment.id }],
          return_url: `${APP_URL}/souscription/confirmation?payment_id=${payment.id}`,
          webhook_url: `${SUPABASE_URL}/functions/v1/moneyfusion-webhook`,
        }),
      });
      mfData = await mfRes.json().catch(() => null);
      if (!mfRes.ok || !mfData?.url || !mfData?.token) {
        await admin.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id);
        return json({ error: mfData?.message ?? "Échec de l'initialisation du paiement MoneyFusion." }, 502);
      }
    } catch (e) {
      console.error("create-subscription-payment: appel MoneyFusion échoué", e);
      await admin.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id);
      return json({ error: "Impossible de contacter MoneyFusion." }, 502);
    } finally {
      proxyClient.close();
    }

    await admin.from("subscription_payments")
      .update({ provider_ref: mfData.token }).eq("id", payment.id);

    return json({ url: mfData.url });
  } catch (e) {
    console.error("create-subscription-payment: erreur inattendue", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
