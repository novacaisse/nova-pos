import { supabase } from "@/integrations/supabase/client";

// supabase-js ne met jamais le corps JSON d'une réponse non-2xx dans
// error.message — pour un Edge Function qui répond par ex.
// `403 {"error":"..."}`, error.message reçu côté client est un texte
// générique ("Edge Function returned a non-2xx status code"), jamais le
// vrai message. Le vrai corps n'est lisible que via error.context (le
// Response brut). Sans ce helper, tout échec serveur (rôle refusé, session
// invalide, limite de formule atteinte...) remonte comme un message
// inutile côté UI — bug remonté sur l'impersonation, même défaut présent
// sur create-team-member.
export async function invokeFn<T = any>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) message = parsed.error;
    }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error((data as any).error);
  }
  return data as T;
}
