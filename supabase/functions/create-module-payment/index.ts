// Edge Function : create-module-payment
// Généralise create-subscription-payment (référence technique imposée par
// la mission) aux 4 modules ZegOS : ZegCaisse (sales), ZegHotel
// (hotel_folios — acompte réservation ET solde folio pointent vers le
// même folio, créé dès create_hotel_reservation()), ZegResto
// (resto_bills), ZegERP (erp_pos_sales, vente 'draft' à finaliser).
//
// Appelée par le client authentifié avec
// { organization_id, app_module, target_id, phone, full_name, kind?, amount? }.
// - target_table est déduit de app_module côté serveur, jamais reçu du
//   client (ferme toute tentative de faire pointer un paiement "pos" vers
//   une ligne resto_bills).
// - Autorisation en deux temps : (1) le client peut lire target_id sous sa
//   propre session (RLS active, userClient) — prouve qu'il est dans la
//   bonne organisation ; (2) has_module_permission() au niveau exact déjà
//   utilisé par l'écriture manuelle équivalente de ce module (ventes/create
//   pour payments_insert, hotel_folios/manage pour hotel_payments_write,
//   resto_paiements/create pour add_resto_bill_payment,
//   erp_pos/manage pour complete_erp_pos_sale) — jamais un niveau générique.
// - Montant TOUJOURS recalculé côté serveur à partir de l'état réel de
//   l'enregistrement cible (service role, jamais celui envoyé par le
//   client) — seule exception : l'acompte ZegHotel, un montant choisi par
//   le client mais plafonné au solde réel restant, jamais au-delà.
// - Même passerelle MoneyFusion (proxy IP fixe) et même webhook partagé
//   (moneyfusion-webhook, étendu pour dispatcher payment_requests en plus
//   de subscription_payments) que le paiement d'abonnement.
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

function buildProxyClient(proxyUrl: string) {
  const u = new URL(proxyUrl);
  const basicAuth = u.username
    ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
    : undefined;
  u.username = "";
  u.password = "";
  return Deno.createHttpClient({ proxy: { url: u.toString(), basicAuth } });
}

type AppModule = "pos" | "hotel" | "resto" | "erp";
const TARGET_TABLE: Record<AppModule, string> = {
  pos: "sales", hotel: "hotel_folios", resto: "resto_bills", erp: "erp_pos_sales",
};
const REQUIRED_PERMISSION: Record<AppModule, { module: string; level: string }> = {
  pos: { module: "ventes", level: "create" },
  hotel: { module: "hotel_folios", level: "manage" },
  resto: { module: "resto_paiements", level: "create" },
  erp: { module: "erp_pos", level: "manage" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Session invalide." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const organization_id = body?.organization_id as string | undefined;
    const app_module = body?.app_module as AppModule | undefined;
    const target_id = body?.target_id as string | undefined;
    const phone = body?.phone as string | undefined;
    const full_name = body?.full_name as string | undefined;
    const kind = (body?.kind as string | undefined) ?? "payment";
    const requestedAmount = typeof body?.amount === "number" ? body.amount : null;

    if (!organization_id || !app_module || !target_id || !phone || !full_name) {
      return json({ error: "Paramètres manquants." }, 400);
    }
    if (!(app_module in TARGET_TABLE)) return json({ error: "Module invalide." }, 400);

    const required = REQUIRED_PERMISSION[app_module];
    const { data: allowed, error: permErr } = await userClient.rpc("has_module_permission", {
      _org_id: organization_id, _module_key: required.module, _level: required.level,
    });
    if (permErr || !allowed) return json({ error: "Action réservée aux rôles autorisés à encaisser sur ce module." }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const target_table = TARGET_TABLE[app_module];

    let amount = 0;
    let label = "Paiement";

    if (app_module === "pos") {
      const { data: sale, error } = await admin.from("sales")
        .select("id, organization_id, reference, total, paid").eq("id", target_id).maybeSingle();
      if (error || !sale || sale.organization_id !== organization_id) return json({ error: "Vente introuvable." }, 404);
      amount = Number(sale.total) - Number(sale.paid);
      if (amount <= 0) return json({ error: "Cette vente est déjà réglée." }, 400);
      label = `Vente ${sale.reference ?? sale.id.slice(0, 8)}`;
    } else if (app_module === "hotel") {
      const { data: folio, error } = await admin.from("hotel_folios")
        .select("id, organization_id, reservation_id").eq("id", target_id).maybeSingle();
      if (error || !folio || folio.organization_id !== organization_id) return json({ error: "Note de séjour introuvable." }, 404);

      const [{ data: charges }, { data: payments }, { data: rooms }] = await Promise.all([
        admin.from("hotel_folio_charges").select("kind, amount, quantity").eq("folio_id", folio.id),
        admin.from("hotel_payments").select("amount, kind").eq("folio_id", folio.id),
        admin.from("hotel_reservation_rooms").select("rate_amount, status").eq("reservation_id", folio.reservation_id),
      ]);
      const hasPostedRoomCharge = (charges ?? []).some((c) => c.kind === "room");
      const roomTotal = hasPostedRoomCharge ? 0 : (rooms ?? [])
        .filter((r) => r.status !== "cancelled" && r.status !== "no_show")
        .reduce((s, r) => s + Number(r.rate_amount), 0);
      const chargesTotal = (charges ?? []).reduce((s, c) => s + Number(c.amount) * c.quantity, 0);
      const grandTotal = roomTotal + chargesTotal;
      const paid = (payments ?? []).reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0);
      const balance = grandTotal - paid;
      if (balance <= 0) return json({ error: "Aucun solde restant à encaisser." }, 400);

      if (kind === "deposit") {
        if (!requestedAmount || requestedAmount <= 0) return json({ error: "Montant d'acompte invalide." }, 400);
        amount = Math.min(requestedAmount, balance);
        label = "Acompte réservation";
      } else {
        amount = balance;
        label = "Solde séjour";
      }
    } else if (app_module === "resto") {
      const { data: bill, error } = await admin.from("resto_bills")
        .select("id, organization_id, total, loyalty_discount, statut").eq("id", target_id).maybeSingle();
      if (error || !bill || bill.organization_id !== organization_id) return json({ error: "Note introuvable." }, 404);
      if (bill.statut === "payee") return json({ error: "Cette note est déjà réglée." }, 400);
      if (bill.statut === "annulee") return json({ error: "Cette note a été annulée." }, 400);
      const { data: bp } = await admin.from("resto_bill_payments")
        .select("montant").eq("bill_id", bill.id).eq("statut", "validee");
      const netTotal = Math.max(Number(bill.total) - Number(bill.loyalty_discount), 0);
      const alreadyPaid = (bp ?? []).reduce((s, p) => s + Number(p.montant), 0);
      amount = netTotal - alreadyPaid;
      if (amount <= 0) return json({ error: "Cette note est déjà réglée." }, 400);
      label = "Note restaurant";
    } else {
      const { data: sale, error } = await admin.from("erp_pos_sales")
        .select("id, organization_id, status, reference").eq("id", target_id).maybeSingle();
      if (error || !sale || sale.organization_id !== organization_id) return json({ error: "Vente introuvable." }, 404);
      if (sale.status !== "draft") return json({ error: "Cette vente a déjà été finalisée ou annulée." }, 400);
      const { data: lines } = await admin.from("erp_pos_sale_lines")
        .select("quantity, unit_price, tax_rate, discount_amount").eq("sale_id", sale.id);
      if (!lines || lines.length === 0) return json({ error: "Aucune ligne pour cette vente." }, 400);
      let subtotal = 0, tax = 0;
      for (const l of lines) {
        const net = Number(l.quantity) * Number(l.unit_price) - Number(l.discount_amount);
        subtotal += net;
        tax += net * (Number(l.tax_rate) / 100);
      }
      amount = subtotal + tax;
      if (amount <= 0) return json({ error: "Montant invalide pour cette vente." }, 400);
      label = `Vente POS ${sale.reference ?? sale.id.slice(0, 8)}`;
    }

    amount = Math.round(amount * 100) / 100;

    const { data: paymentRequest, error: prErr } = await admin.from("payment_requests")
      .insert({
        organization_id, app_module, target_table, target_id,
        amount, status: "pending", provider: "moneyfusion",
        phone, full_name, metadata: { kind, label }, created_by: userId,
      })
      .select().single();
    if (prErr || !paymentRequest) {
      console.error("create-module-payment: insert payment_requests failed", prErr);
      return json({ error: "Impossible de créer la demande de paiement." }, 500);
    }

    const proxyClient = buildProxyClient(PAYMENT_PROXY_URL);
    let mfData: any = null;
    try {
      const mfRes = await fetch(MONEYFUSION_API_URL, {
        method: "POST",
        client: proxyClient,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalPrice: amount,
          article: [{ [label]: amount }],
          numeroSend: phone,
          nomclient: full_name,
          personal_Info: [{ payment_request_id: paymentRequest.id, app_module, target_table, target_id }],
          return_url: `${APP_URL}/app/${app_module}?payment_request_id=${paymentRequest.id}`,
          webhook_url: `${SUPABASE_URL}/functions/v1/moneyfusion-webhook`,
        }),
      });
      mfData = await mfRes.json().catch(() => null);
      if (!mfRes.ok || !mfData?.url || !mfData?.token) {
        await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRequest.id);
        return json({ error: mfData?.message ?? "Échec de l'initialisation du paiement MoneyFusion." }, 502);
      }
    } catch (e) {
      console.error("create-module-payment: appel MoneyFusion échoué", e);
      await admin.from("payment_requests").update({ status: "failed" }).eq("id", paymentRequest.id);
      return json({ error: "Impossible de contacter MoneyFusion." }, 502);
    } finally {
      proxyClient.close();
    }

    await admin.from("payment_requests").update({ provider_ref: mfData.token }).eq("id", paymentRequest.id);

    return json({ url: mfData.url, payment_request_id: paymentRequest.id });
  } catch (e) {
    console.error("create-module-payment: erreur inattendue", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
