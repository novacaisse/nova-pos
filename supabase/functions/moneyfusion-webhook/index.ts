// Edge Function : moneyfusion-webhook
// Endpoint public appelé directement par MoneyFusion (payin.session.pending
// /completed/cancelled). Aucune session utilisateur Supabase ici — tout se
// fait via le service role. Vérification JWT désactivée pour cette
// fonction (voir supabase/config.toml) : MoneyFusion n'envoie aucun
// header Authorization Supabase, un projet avec la vérification JWT
// activée par défaut rejette l'appel en 401 avant même d'exécuter ce
// code — cause probable du bug "paiement bloqué en attente indéfiniment"
// constaté sur un vrai paiement.
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
//
// Second filet : ce webhook n'étant peut-être appelé qu'une fois par
// MoneyFusion (événement d'initiation, jamais de rappel à la résolution),
// on ne compte plus uniquement dessus — voir check-subscription-payment,
// appelée activement par la page de confirmation pendant qu'elle poll.
import { adminClient, verifyAndApplyPayment, type SubscriptionPaymentRow } from "../_shared/moneyfusion.ts";

const PAYMENT_PROXY_URL = Deno.env.get("PAYMENT_PROXY_URL")!;

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

  const admin = adminClient();

  const { data: payment, error: payErr } = await admin
    .from("subscription_payments").select("*").eq("provider_ref", token).maybeSingle();
  if (payErr || !payment) {
    console.error("moneyfusion-webhook: paiement introuvable pour token", token);
    return new Response("ok", { status: 200 }); // pas de retry en boucle sur un token inconnu
  }

  await verifyAndApplyPayment(admin, payment as SubscriptionPaymentRow, PAYMENT_PROXY_URL);

  return new Response("ok", { status: 200 });
});
