// Logique partagée entre moneyfusion-webhook (déclenché par MoneyFusion,
// passif — dépend de leur fiabilité à rappeler notre webhook) et
// check-subscription-payment (déclenché activement par la page de
// confirmation pendant qu'elle poll, pour ne plus dépendre uniquement de
// ce webhook — voir le bug "paiement bloqué en attente indéfiniment").
// Un seul et même code de vérification/mise à jour, pour ne jamais avoir
// deux implémentations qui divergent silencieusement.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function buildProxyClient(proxyUrl: string) {
  const u = new URL(proxyUrl);
  const basicAuth = u.username
    ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
    : undefined;
  u.username = "";
  u.password = "";
  return Deno.createHttpClient({ proxy: { url: u.toString(), basicAuth } });
}

export type SubscriptionPaymentRow = {
  id: string;
  organization_id: string;
  subscription_id: string;
  provider_ref: string | null;
  status: string;
  metadata: { plan_id?: string; period?: "month" | "year" } | null;
};

// Vérifie le statut réel auprès de MoneyFusion (jamais le corps d'un
// webhook, seule source de vérité) et applique la mise à jour si le
// paiement vient de se résoudre. Retourne le statut final connu.
export async function verifyAndApplyPayment(
  admin: SupabaseClient,
  payment: SubscriptionPaymentRow,
  proxyUrl: string,
): Promise<string> {
  if (payment.status === "paid" || payment.status === "failed") {
    return payment.status;
  }
  if (!payment.provider_ref) {
    return payment.status;
  }

  const proxyClient = buildProxyClient(proxyUrl);
  let statusData: any;
  try {
    const res = await fetch(`https://www.pay.moneyfusion.net/paiementNotif/${payment.provider_ref}`, {
      client: proxyClient,
    });
    // Le corps est loggé même sur un statut HTTP non-2xx : un paiement qui
    // reste "pending" indéfiniment est le symptôme visible côté client,
    // mais la cause (proxy down, réponse MoneyFusion inattendue, format
    // de réponse différent de celui documenté) n'est visible que dans ces
    // logs — jamais vérifié en conditions réelles avant ce déploiement
    // (voir db/AUDIT-SECURITE.md §12).
    const rawBody = await res.text();
    if (!res.ok) {
      console.error(`verifyAndApplyPayment: MoneyFusion a répondu ${res.status} pour le paiement ${payment.id}`, rawBody);
      return payment.status;
    }
    try {
      statusData = JSON.parse(rawBody);
    } catch {
      console.error(`verifyAndApplyPayment: réponse MoneyFusion non-JSON pour le paiement ${payment.id}`, rawBody);
      return payment.status;
    }
  } catch (e) {
    console.error(`verifyAndApplyPayment: appel MoneyFusion (fetch/proxy) échoué pour le paiement ${payment.id}`, e);
    return payment.status;
  } finally {
    proxyClient.close();
  }

  const realStatus = statusData?.data?.statut as string | undefined; // "pending" | "failure" | "no paid" | "paid"
  const meta = payment.metadata ?? {};

  if (realStatus !== "paid" && realStatus !== "failure" && realStatus !== "no paid" && realStatus !== "pending") {
    console.error(`verifyAndApplyPayment: statut MoneyFusion inattendu pour le paiement ${payment.id}`, statusData);
  }

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
      await admin.from("organizations").update({ plan: meta.plan_id }).eq("id", payment.organization_id);

      // Restructuration compte/établissements (Phases 1-4) : account_subscriptions
      // (compte + app_module), pas organizations/subscriptions ci-dessus, est la
      // source lue par la page Abonnement, le gating de modules (useCurrentPlan)
      // et l'enforcement des limites max_establishments/max_users — sans cette
      // mise à jour, un paiement réel restait invisible partout où ça compte,
      // silencieusement.
      const { data: organization, error: orgErr } = await admin.from("organizations")
        .select("account_id, app_module").eq("id", payment.organization_id).maybeSingle();
      if (orgErr || !organization) {
        console.error(`verifyAndApplyPayment: organisation introuvable pour le paiement ${payment.id}, account_subscriptions non mis à jour`, orgErr);
      } else {
        const { error: acctSubErr } = await admin.from("account_subscriptions")
          .upsert({
            account_id: organization.account_id,
            app_module: organization.app_module,
            plan_id: meta.plan_id,
            status: "active",
            trial_ends_at: null,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          }, { onConflict: "account_id,app_module" });
        if (acctSubErr) {
          console.error(`verifyAndApplyPayment: échec de la mise à jour account_subscriptions pour le paiement ${payment.id}`, acctSubErr);
        }
      }
    }
    return "paid";
  }

  if (realStatus === "failure" || realStatus === "no paid") {
    await admin.from("subscription_payments").update({ status: "failed" }).eq("id", payment.id);
    return "failed";
  }

  return "pending";
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
