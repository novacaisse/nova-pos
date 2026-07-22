// Edge Function : create-team-member
// Remplace le flux "la personne crée son propre compte via /rejoindre,
// puis le owner l'ajoute par email" — le owner crée directement le compte
// (email + mot de passe + rôle) depuis Équipe. Appelée par le client
// authentifié avec { shop_id, email, password, full_name, phone, address, role }.
// - Vérifie server-side que l'appelant est owner de shop_id (jamais faire
//   confiance à shop_id envoyé par le client, puisqu'on écrit ensuite avec
//   le service role, qui contourne la RLS).
// - Fait respecter plans.limits.users (nombre de shop_members déjà dans la
//   boutique vs. limite de la formule active) — jamais uniquement côté UI.
// - Si l'email existe déjà (compte créé via une inscription indépendante,
//   ou déjà membre d'une autre boutique), on rattache ce compte existant
//   plutôt que d'échouer — pas de mot de passe à définir dans ce cas.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VALID_ROLES = ["owner", "manager", "cashier", "stock", "accountant"];

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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Session invalide." }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => null);
    const shop_id = body?.shop_id as string | undefined;
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    const password = body?.password as string | undefined;
    const full_name = (body?.full_name as string | undefined)?.trim();
    const phone = body?.phone as string | undefined;
    const address = body?.address as string | undefined;
    const role = body?.role as string | undefined;

    if (!shop_id || !email || !full_name || !role) {
      return json({ error: "Paramètres manquants." }, 400);
    }
    if (!VALID_ROLES.includes(role)) return json({ error: "Rôle invalide." }, 400);

    const { data: membership, error: memberErr } = await userClient
      .from("shop_members").select("role").eq("shop_id", shop_id).eq("user_id", callerId).maybeSingle();
    if (memberErr || !membership || membership.role !== "owner") {
      return json({ error: "Action réservée au propriétaire de la boutique." }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: shop, error: shopErr } = await admin.from("shops").select("plan").eq("id", shop_id).maybeSingle();
    if (shopErr || !shop) return json({ error: "Boutique introuvable." }, 404);

    const { count: memberCount, error: countErr } = await admin
      .from("shop_members").select("id", { count: "exact", head: true }).eq("shop_id", shop_id);
    if (countErr) return json({ error: "Impossible de vérifier l'effectif." }, 500);

    const { data: plan } = await admin.from("plans").select("limits").eq("id", shop.plan).maybeSingle();
    const userLimit = (plan?.limits as Record<string, unknown> | null)?.users;
    if (typeof userLimit === "number" && (memberCount ?? 0) >= userLimit) {
      return json({ error: `Limite d'utilisateurs atteinte pour votre formule (${userLimit} maximum). Passez à une formule supérieure pour en ajouter.` }, 403);
    }

    // Compte déjà existant ? On le rattache plutôt que d'échouer.
    let targetUserId: string | null = null;
    const { data: existingId } = await admin.rpc("find_user_id_by_email", { _email: email });
    if (existingId) {
      targetUserId = existingId as string;
    } else {
      if (!password || password.length < 6) {
        return json({ error: "Mot de passe requis (6 caractères minimum) pour un nouveau compte." }, 400);
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name },
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? "Impossible de créer le compte." }, 400);
      }
      targetUserId = created.user.id;
    }

    const { error: memberInsertErr } = await admin.from("shop_members")
      .insert({ shop_id, user_id: targetUserId, role });
    if (memberInsertErr) {
      if ((memberInsertErr as any).code === "23505") {
        return json({ error: "Cette personne fait déjà partie de l'équipe." }, 409);
      }
      return json({ error: "Impossible d'ajouter ce membre." }, 500);
    }

    await admin.from("profiles").update({
      full_name, ...(phone ? { phone } : {}), ...(address ? { address } : {}),
    }).eq("id", targetUserId);

    return json({ user_id: targetUserId });
  } catch (e) {
    console.error("create-team-member: erreur inattendue", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
