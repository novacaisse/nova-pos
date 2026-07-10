import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, ArrowRight, Image as ImageIcon, Sparkles } from "lucide-react";
import { startTrial } from "@/lib/trial";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inscription")({
  head: () => ({ meta: [{ title: "Créer un compte — NovaCaisse" }] }),
  component: InscriptionPage,
});

const SECTORS = ["Épicerie", "Superette", "Restaurant", "Boulangerie", "Mode", "Pharmacie", "Quincaillerie", "Beauté", "Autre"];
const COUNTRIES = ["Bénin", "Burkina Faso", "Côte d'Ivoire", "Mali", "Sénégal", "Togo", "Niger", "Guinée"];

function InscriptionPage() {
  const navigate = useNavigate();
  const [logo, setLogo] = useState<string | null>(null);
  const [form, setForm] = useState({
    shop: "", sector: SECTORS[0], country: COUNTRIES[0], city: "",
    phone: "", address: "", name: "", ownerPhone: "", email: "", password: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onLogo = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setLogo(r.result as string);
    r.readAsDataURL(file);
  };

  const valid = form.shop && form.city && form.phone && form.name && form.email && form.password;

  const submit = () => {
    if (!valid) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("nc_shop_name", form.shop);
      localStorage.setItem("nc_shop_phone", form.phone);
      localStorage.setItem("nc_shop_address", form.address || `${form.city}, ${form.country}`);
      if (logo) localStorage.setItem("nc_shop_logo", logo);
      localStorage.setItem("nc_show_pwa_banner", "1");
    }
    startTrial();
    navigate({ to: "/app" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
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
              {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Logo de la boutique (optionnel)</div>
              <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                Choisir un fichier
              </label>
              {logo && <button onClick={() => setLogo(null)} className="ml-2 text-xs text-destructive hover:underline">Retirer</button>}
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

          <button onClick={submit} disabled={!valid}
            className={cn(
              "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-bold shadow-elegant transition-opacity",
              valid ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" : "cursor-not-allowed bg-muted text-muted-foreground",
            )}>
            Démarrer mon essai gratuit <ArrowRight className="h-4 w-4" />
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
