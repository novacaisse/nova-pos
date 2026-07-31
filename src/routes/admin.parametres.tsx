import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Save, FileText, Palette, Image as ImageIcon, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAppSettings, useUploadBrandingAsset } from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/parametres")({
  component: AdminParametres,
});

function AdminParametres() {
  // Les formules vivent désormais sur leur propre page (/admin/formules,
  // Phase 4) — plus assez de place pour un simple onglet une fois les
  // catalogues de modules par application et les limites ajoutés.
  const [tab, setTab] = useState<"branding" | "landing">("branding");

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration globale de la plateforme" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {([
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
              <TextField label="Titre principal (Hero)" defaultValue="La caisse moderne pour vos organisations." />
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
          Logo et favicon affichés sur les pages publiques et l'espace organisation (landing, tarifs, connexion,
          inscription, souscription, sidebar) — distinct du logo propre à chaque organisation.
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
