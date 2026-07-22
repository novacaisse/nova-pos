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
  shop_id: string;
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
    statusData = await res.json();
  } catch (e) {
    console.error("verifyAndApplyPayment: vérification MoneyFusion échouée", e);
    return payment.status;
  } finally {
    proxyClient.close();
  }

  const realStatus = statusData?.data?.statut as string | undefined; // "pending" | "failure" | "no paid" | "paid"
  const meta = payment.metadata ?? {};

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
      await admin.from("shops").update({ plan: meta.plan_id }).eq("id", payment.shop_id);
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
