import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Save, FileText, Package, Plus, Trash2, Loader2, Star, Palette, Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import {
  usePlans, useUpsertPlan, useDeletePlan, useAppSettings, useUploadBrandingAsset,
  type Plan,
} from "@/lib/data/adminHooks";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/parametres")({
  component: AdminParametres,
});

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "formule";

function AdminParametres() {
  const [tab, setTab] = useState<"plans" | "branding" | "landing">("plans");
  const { data: plans = [], isLoading } = usePlans();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration globale de la plateforme"
        actions={tab === "plans" && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle formule
          </button>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {([
            { k: "plans" as const, label: "Formules & tarifs", icon: Package },
            { k: "branding" as const, label: "Marque", icon: Palette },
            { k: "landing" as const, label: "Contenu landing", icon: FileText },
          ]).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "plans" && (
          isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
              {creating && <PlanCard plan={null} onDoneCreating={() => setCreating(false)} />}
            </div>
          )
        )}

        {tab === "branding" && <BrandingTab />}

        {tab === "landing" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4">
              <div className="font-display text-lg font-bold">Contenu de la landing</div>
              <div className="text-xs text-muted-foreground">
                Pas encore connecté à Supabase — ces champs restent statiques (hors périmètre de la demande initiale,
                qui portait sur les formules). Signalez si vous voulez que ce soit une prochaine tâche.
              </div>
            </div>
            <div className="grid gap-4 opacity-60">
              <TextField label="Titre principal (Hero)" defaultValue="La caisse moderne pour vos boutiques." />
              <TextField label="Sous-titre" defaultValue="Point de vente tactile, stock intelligent, rapports IA et paiement mobile money — tout dans une seule application, pensée pour les commerçants d'Afrique de l'Ouest." multiline />
              <TextField label="CTA principal" defaultValue="Essayer 3 jours gratuits" />
              <TextField label="Email de contact" defaultValue="contact@novacaisse.bj" />
            </div>
            <button disabled title="Bientôt disponible" className="mt-5 flex cursor-not-allowed items-center gap-2 rounded-xl bg-muted px-4 py-2 text-sm font-bold text-muted-foreground">
              <Save className="h-4 w-4" /> Publier les modifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onDoneCreating }: { plan: Plan | null; onDoneCreating?: () => void }) {
  const upsert = useUpsertPlan();
  const remove = useDeletePlan();
  const isNew = plan === null;

  const [name, setName] = useState(plan?.name ?? "");
  const [priceMonth, setPriceMonth] = useState(plan?.price_month ?? 0);
  const [priceYear, setPriceYear] = useState(plan?.price_year ?? 0);
  const [features, setFeatures] = useState<string[]>(plan?.features ?? []);
  const [newFeature, setNewFeature] = useState("");
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [isRecommended, setIsRecommended] = useState(plan?.is_recommended ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (plan) {
      setName(plan.name); setPriceMonth(plan.price_month); setPriceYear(plan.price_year);
      setFeatures(plan.features); setIsActive(plan.is_active); setIsRecommended(plan.is_recommended);
    }
  }, [plan]);

  const save = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({
        id: isNew ? slugify(name) : plan!.id,
        name, price_month: priceMonth, price_year: priceYear,
        features, is_active: isActive, is_recommended: isRecommended,
        currency: plan?.currency ?? "XOF",
        limits: plan?.limits ?? {},
        sort_order: plan?.sort_order ?? 99,
      });
      if (isNew) onDoneCreating?.();
    } catch (e: any) {
      alert("Erreur enregistrement formule : " + (e?.message ?? "inconnue"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-5", isActive ? "border-border" : "border-border opacity-60")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la formule"
          className="min-w-0 flex-1 border-b border-transparent bg-transparent font-display text-lg font-bold outline-none focus:border-primary" />
        <button onClick={() => setIsRecommended((v) => !v)} title="Marquer comme recommandée"
          className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", isRecommended ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted")}>
          <Star className="h-3.5 w-3.5" fill={isRecommended ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-3">
        <PriceField label="Prix mensuel" value={priceMonth} onChange={setPriceMonth} />
        <PriceField label="Prix annuel" value={priceYear} onChange={setPriceYear} />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fonctionnalités incluses</div>
        <div className="space-y-1.5">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={f} onChange={(e) => setFeatures((fs) => fs.map((x, j) => j === i ? e.target.value : x))}
                className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
              <button onClick={() => setFeatures((fs) => fs.filter((_, j) => j !== i))} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input value={newFeature} onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newFeature.trim()) { setFeatures((fs) => [...fs, newFeature.trim()]); setNewFeature(""); } }}
              placeholder="Ajouter une fonctionnalité…"
              className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
            <button onClick={() => { if (newFeature.trim()) { setFeatures((fs) => [...fs, newFeature.trim()]); setNewFeature(""); } }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      <label className="mt-4 flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-xs">
        <span>Formule active (visible sur /tarifs)</span>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-primary" />
      </label>

      <div className="mt-5 flex gap-2">
        {isNew ? (
          <button onClick={onDoneCreating} className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold">Annuler</button>
        ) : confirmDelete ? (
          <button onClick={() => remove.mutate(plan!.id)} className="flex-1 rounded-xl bg-destructive py-2 text-xs font-bold text-destructive-foreground">Confirmer la suppression</button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
        <button onClick={save} disabled={!name || saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Enregistrer
        </button>
      </div>
    </div>
  );
}

function PriceField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 pr-12 text-sm font-semibold outline-none focus:border-primary" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">FCFA</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">≈ {formatXOF(value)}</div>
    </label>
  );
}

function BrandingTab() {
  const { data: settings, isLoading } = useAppSettings();
  const upload = useUploadBrandingAsset();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"logo" | "favicon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const pick = async (kind: "logo" | "favicon", file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(kind);
    try {
      await upload.mutateAsync({ kind, file });
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer le fichier.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4">
        <div className="font-display text-lg font-bold">Marque de la plateforme</div>
        <div className="text-xs text-muted-foreground">
          Logo et favicon affichés sur les pages publiques et l'espace boutique (landing, tarifs, connexion,
          inscription, souscription, sidebar) — distinct du logo propre à chaque boutique.
        </div>
      </div>
      {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logo</div>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
              {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <button onClick={() => logoInputRef.current?.click()} disabled={busy === "logo"}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60">
              {busy === "logo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {settings?.logo_url ? "Remplacer" : "Choisir un logo"}
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick("logo", e.target.files?.[0])} />
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favicon</div>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
              {settings?.favicon_url ? <img src={settings.favicon_url} alt="" className="h-8 w-8 object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <button onClick={() => faviconInputRef.current?.click()} disabled={busy === "favicon"}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60">
              {busy === "favicon" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {settings?.favicon_url ? "Remplacer" : "Choisir un favicon"}
            </button>
            <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,image/svg+xml" className="hidden" onChange={(e) => pick("favicon", e.target.files?.[0])} />
          </div>
        </div>
      </div>
      <div className="mt-4 text-[11px] text-muted-foreground">
        Le favicon se met à jour dans les onglets déjà ouverts après quelques secondes ; l'icône utilisée lors de
        l'installation en PWA (écran d'accueil) reste pour l'instant celle empaquetée avec l'application.
      </div>
    </div>
  );
}

function TextField({ label, defaultValue, multiline }: { label: string; defaultValue: string; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {multiline
        ? <textarea rows={3} defaultValue={defaultValue} disabled className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" />
        : <input defaultValue={defaultValue} disabled className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" />
      }
    </label>
  );
}
