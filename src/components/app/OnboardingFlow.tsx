// Écran affiché sur /app quand le compte connecté n'a encore aucune
// organisation — le cas normal pour un compte tout juste créé (email/mot
// de passe ou Google), puisque l'inscription ne fait plus que créer le
// compte utilisateur (voir inscription.tsx). Deux étapes : choix de
// l'application ZegOS, puis configuration spécifique à l'application
// choisie (organisation + responsable — ZegCaisse depuis migration 020d,
// ZegHotel depuis la V1 du module).
//
// ZegCaisse, ZegHotel, ZegResto et ZegERP sont tous réellement fonctionnels
// aujourd'hui, chacun avec son propre formulaire de configuration (pas de
// champs POS-only comme "secteur" dans celui de ZegHotel/ZegResto/ZegERP).
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, AlertCircle, BedDouble, Boxes, Clock, Image as ImageIcon, Loader2, LogOut, Store, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useProvisionOrganization } from "@/lib/data/hooks";

// "Restaurant" et "Beauté" retirés (audit ZegOS v2) : ces secteurs relèvent
// de ZegResto et n'ont pas leur place dans l'inscription ZegCaisse — les
// options restantes couvrent ce que couvre réellement le commerce/détail.
const SECTORS = ["Épicerie", "Supérette", "Boutique de vêtements", "Boulangerie/Pâtisserie", "Pharmacie", "Quincaillerie", "Électronique/Téléphonie", "Librairie/Papeterie", "Autre"];
const COUNTRIES = ["Bénin", "Burkina Faso", "Côte d'Ivoire", "Mali", "Sénégal", "Togo", "Niger", "Guinée"];

const APPS = [
  { key: "pos", name: "ZegCaisse", desc: "Caisse, stock, ventes et facturation", icon: Store, available: true },
  { key: "hotel", name: "ZegHotel", desc: "Réservations, chambres et facturation hôtelière", icon: BedDouble, available: true },
  { key: "resto", name: "ZegResto", desc: "Salle, commandes, cuisine et réservations restaurant", icon: UtensilsCrossed, available: true },
  { key: "erp", name: "ZegERP", desc: "Stock, achats, ventes, finance, comptabilité, RH", icon: Boxes, available: true },
] as const;
type AppKey = (typeof APPS)[number]["key"];

export function OnboardingFlow({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [step, setStep] = useState<"pick-app" | "setup-pos" | "setup-hotel" | "setup-resto" | "setup-erp">("pick-app");

  if (step === "setup-pos") {
    return <PosSetupForm onBack={() => setStep("pick-app")} />;
  }
  if (step === "setup-hotel") {
    return <HotelSetupForm onBack={() => setStep("pick-app")} />;
  }
  if (step === "setup-resto") {
    return <RestoSetupForm onBack={() => setStep("pick-app")} />;
  }
  if (step === "setup-erp") {
    return <ErpSetupForm onBack={() => setStep("pick-app")} />;
  }
  return (
    <AppPicker
      onPick={(key) => setStep(key === "hotel" ? "setup-hotel" : key === "resto" ? "setup-resto" : key === "erp" ? "setup-erp" : "setup-pos")}
      onSignOut={onSignOut}
    />
  );
}

function AppPicker({ onPick, onSignOut }: { onPick: (key: AppKey) => void; onSignOut: () => Promise<void> }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-3xl text-center">
        <h1 className="font-display text-2xl font-bold">Choisissez votre application</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vous pourrez en activer d'autres plus tard pour le même compte.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {APPS.map((app) => (
            <button key={app.key} onClick={app.available ? () => onPick(app.key) : undefined} disabled={!app.available}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-colors",
                app.available
                  ? "border-border bg-card hover:border-primary hover:bg-primary/5 cursor-pointer"
                  : "cursor-not-allowed border-border/60 bg-muted/30 opacity-60",
              )}>
              {!app.available && (
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> Bientôt
                </span>
              )}
              <div className={cn("grid h-14 w-14 place-items-center rounded-2xl", app.available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <app.icon className="h-7 w-7" />
              </div>
              <div className="font-display text-lg font-bold">{app.name}</div>
              <div className="text-xs text-muted-foreground">{app.desc}</div>
            </button>
          ))}
        </div>

        <button onClick={onSignOut} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

function PosSetupForm({ onBack }: { onBack: () => void }) {
  const provision = useProvisionOrganization();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    shop: "", sector: SECTORS[0], country: COUNTRIES[0], city: "",
    phone: "", address: "",
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

  const valid = form.shop && form.city && form.phone;

  const submit = async () => {
    if (!valid || provision.isPending) return;
    setError(null);

    let organization: { id: string };
    try {
      organization = await provision.mutateAsync({
        app: "pos",
        name: form.shop,
        country: form.country,
        currency: "XOF",
        phone: form.phone,
        address: form.address || `${form.city}, ${form.country}`,
      });
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer l'organisation.");
      return;
    }

    // Logo (Supabase Storage — bucket "shop-logos"), au mieux : l'organisation
    // est déjà pleinement fonctionnelle sans logo si ça échoue.
    if (logoFile) {
      const path = `${organization.id}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
        await supabase.from("organizations").update({ logo_url: pub.publicUrl }).eq("id", organization.id);
      }
    }
    // Pas de navigate() : useProvisionOrganization rafraîchit déjà la liste
    // des organisations, /app quitte automatiquement cet écran.
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-elegant">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Changer d'application
        </button>

        <h1 className="mb-1 font-display text-2xl font-bold">Configurez votre organisation ZegCaisse</h1>
        <p className="mb-5 text-sm text-muted-foreground">3 jours d'essai gratuit. Ces informations peuvent être modifiées plus tard.</p>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Logo de l'organisation (optionnel)</div>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              Choisir un fichier
            </label>
            {logoPreview && <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
          </div>
        </div>

        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Votre organisation</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'organisation *" value={form.shop} onChange={set("shop")} placeholder="Ex : Chez Aïcha" />
          <Field label="Téléphone de l'organisation *" value={form.phone} onChange={set("phone")} placeholder="+229 …" />
          <SelectField label="Secteur" value={form.sector} onChange={set("sector")} options={SECTORS} />
          <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
          <Field label="Ville *" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" />
          <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Rue, quartier…" />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={!valid || provision.isPending}
          className={cn(
            "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
            valid && !provision.isPending ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
          )}>
          {provision.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" /></>}
        </button>
      </motion.div>
    </div>
  );
}

// Même structure que PosSetupForm (organisation + logo + responsable) sans
// le champ "Secteur" (retail-only, sans objet pour un hôtel) — libellés
// adaptés. provision_organization() est générique (p_app), aucune
// migration n'est nécessaire pour ce second parcours.
function HotelSetupForm({ onBack }: { onBack: () => void }) {
  const provision = useProvisionOrganization();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", country: COUNTRIES[0], city: "",
    phone: "", address: "",
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

  const valid = form.name && form.city && form.phone;

  const submit = async () => {
    if (!valid || provision.isPending) return;
    setError(null);

    let organization: { id: string };
    try {
      organization = await provision.mutateAsync({
        app: "hotel",
        name: form.name,
        country: form.country,
        currency: "XOF",
        phone: form.phone,
        address: form.address || `${form.city}, ${form.country}`,
      });
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer l'organisation.");
      return;
    }

    if (logoFile) {
      const path = `${organization.id}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
        await supabase.from("organizations").update({ logo_url: pub.publicUrl }).eq("id", organization.id);
      }
    }
    // Pas de navigate() : useProvisionOrganization rafraîchit déjà la liste
    // des organisations ; app.tsx redirige ensuite automatiquement vers
    // /app/hotel puisque cette organisation n'a que "hotel" dans active_apps.
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-elegant">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Changer d'application
        </button>

        <h1 className="mb-1 font-display text-2xl font-bold">Configurez votre établissement ZegHotel</h1>
        <p className="mb-5 text-sm text-muted-foreground">3 jours d'essai gratuit. Ces informations peuvent être modifiées plus tard.</p>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Logo de l'établissement (optionnel)</div>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              Choisir un fichier
            </label>
            {logoPreview && <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
          </div>
        </div>

        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Votre établissement</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'établissement *" value={form.name} onChange={set("name")} placeholder="Ex : Hôtel Le Baobab" />
          <Field label="Téléphone *" value={form.phone} onChange={set("phone")} placeholder="+229 …" />
          <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
          <Field label="Ville *" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" />
          <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Rue, quartier…" />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={!valid || provision.isPending}
          className={cn(
            "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
            valid && !provision.isPending ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
          )}>
          {provision.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" /></>}
        </button>
      </motion.div>
    </div>
  );
}

// Même structure que HotelSetupForm (organisation + logo + responsable),
// libellés adaptés au restaurant. provision_organization() est générique
// (p_app), aucune modification de fonction nécessaire pour ce 3e parcours
// (seul organizations.app_module a dû gagner 'resto' comme valeur possible,
// migration 036).
function RestoSetupForm({ onBack }: { onBack: () => void }) {
  const provision = useProvisionOrganization();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", country: COUNTRIES[0], city: "",
    phone: "", address: "",
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

  const valid = form.name && form.city && form.phone;

  const submit = async () => {
    if (!valid || provision.isPending) return;
    setError(null);

    let organization: { id: string };
    try {
      organization = await provision.mutateAsync({
        app: "resto",
        name: form.name,
        country: form.country,
        currency: "XOF",
        phone: form.phone,
        address: form.address || `${form.city}, ${form.country}`,
      });
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer l'organisation.");
      return;
    }

    if (logoFile) {
      const path = `${organization.id}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
        await supabase.from("organizations").update({ logo_url: pub.publicUrl }).eq("id", organization.id);
      }
    }
    // Pas de navigate() : useProvisionOrganization rafraîchit déjà la liste
    // des organisations ; app.tsx redirige ensuite automatiquement vers
    // /app/resto puisque cette organisation est app_module='resto'.
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-elegant">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Changer d'application
        </button>

        <h1 className="mb-1 font-display text-2xl font-bold">Configurez votre restaurant ZegResto</h1>
        <p className="mb-5 text-sm text-muted-foreground">3 jours d'essai gratuit. Ces informations peuvent être modifiées plus tard.</p>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Logo du restaurant (optionnel)</div>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              Choisir un fichier
            </label>
            {logoPreview && <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
          </div>
        </div>

        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Votre restaurant</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du restaurant *" value={form.name} onChange={set("name")} placeholder="Ex : Chez Fifi" />
          <Field label="Téléphone *" value={form.phone} onChange={set("phone")} placeholder="+229 …" />
          <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
          <Field label="Ville *" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" />
          <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Rue, quartier…" />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={!valid || provision.isPending}
          className={cn(
            "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
            valid && !provision.isPending ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
          )}>
          {provision.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" /></>}
        </button>
      </motion.div>
    </div>
  );
}

// Même structure que RestoSetupForm (organisation + logo + responsable),
// libellés adaptés à une entreprise ZegERP. provision_organization() est
// générique (p_app) : seul organizations.app_module a dû gagner 'erp'
// comme valeur possible (migration 047) — aucune modification de fonction
// nécessaire pour ce 4e parcours.
function ErpSetupForm({ onBack }: { onBack: () => void }) {
  const provision = useProvisionOrganization();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", country: COUNTRIES[0], city: "",
    phone: "", address: "",
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

  const valid = form.name && form.city && form.phone;

  const submit = async () => {
    if (!valid || provision.isPending) return;
    setError(null);

    let organization: { id: string };
    try {
      organization = await provision.mutateAsync({
        app: "erp",
        name: form.name,
        country: form.country,
        currency: "XOF",
        phone: form.phone,
        address: form.address || `${form.city}, ${form.country}`,
      });
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer l'organisation.");
      return;
    }

    if (logoFile) {
      const path = `${organization.id}/logo`;
      const { error: upErr } = await supabase.storage.from("shop-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
        await supabase.from("organizations").update({ logo_url: pub.publicUrl }).eq("id", organization.id);
      }
    }
    // Pas de navigate() : useProvisionOrganization rafraîchit déjà la liste
    // des organisations ; app.tsx redirige ensuite automatiquement vers
    // /app/erp puisque cette organisation est app_module='erp'.
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-elegant">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Changer d'application
        </button>

        <h1 className="mb-1 font-display text-2xl font-bold">Configurez votre organisation ZegERP</h1>
        <p className="mb-5 text-sm text-muted-foreground">3 jours d'essai gratuit. Ces informations peuvent être modifiées plus tard.</p>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Logo de l'organisation (optionnel)</div>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              Choisir un fichier
            </label>
            {logoPreview && <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
          </div>
        </div>

        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Votre organisation</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'organisation *" value={form.name} onChange={set("name")} placeholder="Ex : Groupe Sika" />
          <Field label="Téléphone *" value={form.phone} onChange={set("phone")} placeholder="+229 …" />
          <SelectField label="Pays" value={form.country} onChange={set("country")} options={COUNTRIES} />
          <Field label="Ville *" value={form.city} onChange={set("city")} placeholder="Ex : Cotonou" />
          <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Rue, quartier…" />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={!valid || provision.isPending}
          className={cn(
            "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
            valid && !provision.isPending ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
          )}>
          {provision.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Création…</> : <>Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" /></>}
        </button>
      </motion.div>
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
