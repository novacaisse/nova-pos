// Edge Function : admin-impersonate
// "Se connecter en tant que" depuis Boutiques (Super Admin). Vérifie
// server-side (jamais côté UI seul) que l'appelant est super admin,
// journalise l'accès dans admin_impersonations (sans notifier le owner —
// confirmé : traçabilité interne uniquement, usage support), puis génère
// un lien de connexion à usage unique via le service role.
//
// Limite acceptée : suivre ce lien fait du navigateur la session de
// l'utilisateur ciblé. Revenir à sa propre session Super Admin nécessite
// de se déconnecter puis se reconnecter — pas de multi-session dans un
// même navigateur avec cette approche minimale.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = Deno.env.get("APP_URL")!;

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

    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_super_admin");
    if (adminErr || !isAdmin) return json({ error: "Accès réservé au Super Admin." }, 403);

    const body = await req.json().catch(() => null);
    const target_user_id = body?.target_user_id as string | undefined;
    const organization_id = body?.organization_id as string | undefined;
    if (!target_user_id) return json({ error: "target_user_id manquant." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(target_user_id);
    if (targetErr || !targetUser?.user?.email) return json({ error: "Utilisateur cible introuvable." }, 404);

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.user.email,
      options: { redirectTo: `${APP_URL}/app` },
    });
    if (linkErr || !linkData) {
      console.error("admin-impersonate: generateLink a échoué", linkErr);
      return json({ error: "Impossible de générer le lien de connexion." }, 500);
    }

    // Journal d'audit — pas de notification au owner (confirmé).
    await admin.from("admin_impersonations").insert({
      admin_user_id: userData.user.id,
      target_user_id,
      organization_id: organization_id ?? null,
    });

    return json({ action_link: linkData.properties.action_link });
  } catch (e) {
    console.error("admin-impersonate: erreur inattendue", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
