// Edge Function : moneyfusion-webhook
// Endpoint public appelé directement par MoneyFusion (payin.session.pending
// /completed/cancelled). Aucune session utilisateur Supabase ici — tout se
// fait via le service role.
//
// Sécurité : la documentation MoneyFusion fournie ne décrit aucun mécanisme
// de signature pour vérifier l'authenticité d'un appel webhook. On ne fait
// donc JAMAIS confiance au statut annoncé dans le corps de la requête reçue
// — ce webhook sert uniquement de déclencheur pour notre propre vérification
// auprès de MoneyFusion (GET paiementNotif/{token}, via le même proxy à IP
// fixe), seule source de vérité retenue pour marquer un paiement "payé".
// Un tiers qui devinerait l'URL du webhook ne peut donc pas fabriquer un
// faux paiement à lui seul : il faudrait que MoneyFusion confirme aussi
// via l'endpoint de vérification.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMENT_PROXY_URL = Deno.env.get("PAYMENT_PROXY_URL")!;

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
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Selon les événements MoneyFusion (payin.session.*), le token de
  // dédoublonnage peut arriver sous des clés légèrement différentes selon
  // le champ documenté ("tokenPay") — on couvre les deux noms plausibles.
  const token = payload?.tokenPay ?? payload?.token ?? payload?.data?.tokenPay;
  if (!token) {
    console.error("moneyfusion-webhook: token manquant dans le payload", payload);
    return new Response("Missing token", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: payment, error: payErr } = await admin
    .from("subscription_payments").select("*").eq("provider_ref", token).maybeSingle();
  if (payErr || !payment) {
    console.error("moneyfusion-webhook: paiement introuvable pour token", token);
    return new Response("ok", { status: 200 }); // pas de retry en boucle sur un token inconnu
  }

  // Dédoublonnage : déjà traité de façon définitive (MoneyFusion peut
  // envoyer plusieurs notifications pour la même transaction).
  if (payment.status === "paid" || payment.status === "failed") {
    return new Response("ok", { status: 200 });
  }

  // Vérification authoritative auprès de MoneyFusion (jamais le corps du
  // webhook), via le même proxy à IP fixe.
  const proxyClient = buildProxyClient(PAYMENT_PROXY_URL);
  let statusData: any;
  try {
    const res = await fetch(`https://www.pay.moneyfusion.net/paiementNotif/${token}`, {
      client: proxyClient,
    });
    statusData = await res.json();
  } catch (e) {
    console.error("moneyfusion-webhook: vérification MoneyFusion échouée", e);
    return new Response("ok", { status: 200 }); // MoneyFusion réessaiera l'appel webhook
  } finally {
    proxyClient.close();
  }

  const realStatus = statusData?.data?.statut as string | undefined; // "pending" | "failure" | "no paid" | "paid"
  const meta = (payment.metadata ?? {}) as { plan_id?: string; period?: "month" | "year" };

  if (realStatus === "paid") {
    await admin.from("subscription_payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        metadata: { ...meta, moyen: statusData?.data?.moyen ?? null },
      })
      .eq("id", payment.id);

    const periodDays = meta.period === "year" ? 365 : 30;
    const currentPeriodEnd = new Date(Date.now() + periodDays * 86400000).toISOString();

    if (meta.plan_id) {
      await admin.from("subscriptions")
        .update({ status: "active", plan: meta.plan_id, current_period_end: currentPeriodEnd })
        .eq("id", payment.subscription_id);

      // Garde shops.plan cohérent avec le nouvel abonnement payant — sinon
      // le garde-fou d'essai expiré (app.tsx, basé sur shops.plan/
      // trial_ends_at) pourrait continuer à bloquer un client qui vient de
      // payer, puisqu'il n'a jamais lu subscriptions directement.
      await admin.from("shops").update({ plan: meta.plan_id }).eq("id", payment.shop_id);
    }
  } else if (realStatus === "failure" || realStatus === "no paid") {
    await admin.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id);
  }
  // "pending" (ou statut inconnu) : rien à faire, on attend une notification suivante.

  return new Response("ok", { status: 200 });
});
