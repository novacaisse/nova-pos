import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Image as ImageIcon, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/app/BrandLogo";

export const Route = createFileRoute("/inscription")({
  head: () => ({ meta: [{ title: "Créer un compte — NovaCaisse" }] }),
  component: InscriptionPage,
});


const SECTORS = ["Épicerie", "Superette", "Restaurant", "Boulangerie", "Mode", "Pharmacie", "Quincaillerie", "Beauté", "Autre"];
const COUNTRIES = ["Bénin", "Burkina Faso", "Côte d'Ivoire", "Mali", "Sénégal", "Togo", "Niger", "Guinée"];

function InscriptionPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    shop: "", sector: SECTORS[0], country: COUNTRIES[0], city: "",
    phone: "", address: "", name: "", ownerPhone: "", email: "", password: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onLogo = (file?: File) => {
    if (!file) return;
    setLogoFile(file);
    const r = new FileReader();
    r.onload = () => setLogoPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const valid = form.shop && form.city && form.phone && form.name && form.email && form.password.length >= 6;

  const submit = async () => {
    if (!valid || loading) return;
    setError(null);
    setLoading(true);

    // 1. Créer le compte auth
    const { error: signErr } = await signUp(form.email.trim(), form.password, form.name);
    if (signErr) { setError(signErr); setLoading(false); return; }

    // 2. Attendre une session (nécessaire à complete_signup, qui s'appuie
    // sur auth.uid() — ne devrait plus jamais se produire, confirmation
    // email désactivée sur ce projet, mais on garde le filet de sécurité).
    const { data: sessData } = await supabase.auth.getSession();
    if (!sessData.session) {
      setError("Compte créé. Vérifiez votre email pour confirmer, puis connectez-vous.");
      setLoading(false);
      setTimeout(() => navigate({ to: "/connexion" }), 2000);
      return;
    }

    // 3. Boutique + appartenance owner + abonnement d'essai + coordonnées,
    // en une seule transaction atomique côté serveur (migration 009) — soit
    // tout réussit, soit rien n'est créé, plus de séquence pouvant
    // s'interrompre à mi-chemin.
    const { data: organization, error: rpcErr } = await supabase.rpc("complete_signup", {
      p_shop_name: form.shop,
      p_country: form.country,
      p_currency: "XOF",
      p_shop_phone: form.phone,
      p_address: form.address || `${form.city}, ${form.country}`,
      p_owner_phone: form.ownerPhone || null,
    });
    if (rpcErr || !organization) {
      setError(rpcErr?.message ?? "Impossible de créer la boutique.");
      setLoading(false); return;
    }
    const organizationId = (organization as { id: string }).id;

    // 4. Logo (Supabase Storage — bucket "shop-logos"), au mieux : la
    // boutique est déjà pleinement fonctionnelle sans logo si ça échoue.
    if (logoFile) {
      const path = `${organizationId}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
        await supabase.from("organizations").update({ logo_url: pub.publicUrl }).eq("id", organizationId);
      }
    }

    // 5. Préférences locales (UI uniquement)
    if (typeof window !== "undefined") {
      localStorage.setItem("novacaisse.currentShopId", organizationId);
    }
    navigate({ to: "/app" });
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto flex items-center gap-2.5">
          <BrandLogo className="h-11 w-11 shadow-glow" iconClassName="h-5 w-5" />
          <span className="font-display text-2xl font-bold">NovaCaisse</span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-border bg-card p-7 shadow-elegant">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div className="text-sm">
              <div className="font-bold text-primary">3 jours d'essai gratuit</div>
              <div className="text-xs text-muted-foreground">Aucune carte requise. Configurez votre boutique en une seule fois.</div>
            </div>
          </div>

          <h1 className="mb-5 font-display text-2xl font-bold">Créez votre compte</h1>

          <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
              {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Logo de la boutique (optionnel)</div>
              <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                Choisir un fichier
              </label>
              {logoPreview && <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
            </div>
          </div>

          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Votre boutique</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom de la boutique *" value={form.shop} onChange={set("shop")} placeholder="Ex : Chez Aïcha" />
            <Field label="Téléphone boutique *" value={form.phone} onChange={set("phone")} placeholder="+229 …" />
            <SelectField label="Secteur" value={form.sector} onChange={set("sector")} options={SECTORS} />
            <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
            <Field label="Ville *" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" />
            <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Rue, quartier…" />
          </div>

          <div className="mt-5 mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Vous (gérant)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom complet *" value={form.name} onChange={set("name")} />
            <Field label="Téléphone personnel" value={form.ownerPhone} onChange={set("ownerPhone")} />
            <Field label="Email *" type="email" value={form.email} onChange={set("email")} />
            <Field label="Mot de passe *" type="password" value={form.password} onChange={set("password")} />
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button onClick={submit} disabled={!valid || loading}
            className={cn(
              "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
              valid && !loading ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
            )}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" /></>}
          </button>


          <div className="mt-4 text-center text-xs text-muted-foreground">
            Déjà un compte ? <Link to="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function SelectField({ label, options, ...props }: { label: string; options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
