// Identité de l'organisation (nom, logo, contact, mentions légales) —
// utilisé comme premier onglet des Paramètres de CHAQUE application ZegOS
// (ZegCaisse : "Organisation" ; ZegHotel : "Établissement"). organizations
// et organization_settings restent des tables partagées au niveau base
// (une seule ligne par organisation, quelle que soit l'application), mais
// chaque application affiche et modifie ces informations depuis son propre
// écran — jamais un écran "Paramètres" commun aux deux.
import { useEffect, useState } from "react";
import { Save, Image as ImageIcon, Loader2, ExternalLink } from "lucide-react";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useShopSettings, useUpdateShopSettings, useUpdateShop, useUploadShopLogo, useMyRole } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export function OrgIdentityTab({ heading = "Informations de l'organisation" }: { heading?: string }) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const updateShop = useUpdateShop();
  const updateSettings = useUpdateShopSettings();
  const uploadLogo = useUploadShopLogo();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";

  const [name, setName] = useState("");
  const [shopExtra, setShopExtra] = useState({
    phone: "", email: "", address: "", rccm: "", ifu: "", facebook: "", instagram: "",
  });
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (currentOrganization) setName(currentOrganization.name);
  }, [currentOrganization]);

  useEffect(() => {
    if (!settings) return;
    setShopExtra((s) => ({ ...s, ...settings.data }));
  }, [settings]);

  if (!currentOrganization) return null;

  const onLogo = async (file?: File) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      await uploadLogo.mutateAsync(file);
    } catch (e: any) {
      alert("Erreur upload logo : " + (e?.message ?? "inconnue"));
    } finally {
      setLogoUploading(false);
    }
  };

  const save = async () => {
    try {
      await updateShop.mutateAsync({ name });
      await updateSettings.mutateAsync({ data: { ...(settings?.data ?? {}), ...shopExtra } });
    } catch (e: any) {
      alert("Erreur enregistrement : " + (e?.message ?? "inconnue"));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 font-display text-lg font-bold">{heading}</h2>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border p-4">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted">
          {logoUploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            : currentOrganization.logo_url ? <img src={currentOrganization.logo_url} alt="Logo" className="h-full w-full object-contain" />
            : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Logo</div>
          <p className="mb-2 text-xs text-muted-foreground">Appliqué automatiquement sur les reçus, factures et devis (PNG/JPG, max 1 Mo).</p>
          {canManage && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                onChange={(e) => onLogo(e.target.files?.[0])} />
              Choisir un fichier
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" value={name} onChange={setName} disabled={!canManage} />
        <Field label="Téléphone" value={shopExtra.phone} onChange={(v) => setShopExtra({ ...shopExtra, phone: v })} disabled={!canManage} />
        <Field label="Email" value={shopExtra.email} onChange={(v) => setShopExtra({ ...shopExtra, email: v })} disabled={!canManage} />
        <Field label="Adresse complète" value={shopExtra.address} onChange={(v) => setShopExtra({ ...shopExtra, address: v })} className="sm:col-span-2" disabled={!canManage} />
        <Field label="RCCM" value={shopExtra.rccm} onChange={(v) => setShopExtra({ ...shopExtra, rccm: v })} disabled={!canManage} />
        <Field label="IFU / N° fiscal" value={shopExtra.ifu} onChange={(v) => setShopExtra({ ...shopExtra, ifu: v })} disabled={!canManage} />
        <Field label="Facebook" value={shopExtra.facebook} onChange={(v) => setShopExtra({ ...shopExtra, facebook: v })} disabled={!canManage} />
        <Field label="Instagram" value={shopExtra.instagram} onChange={(v) => setShopExtra({ ...shopExtra, instagram: v })} disabled={!canManage} />
      </div>

      {/* FNE (facturation électronique normalisée) : spécifique à la DGI
          Côte d'Ivoire, sans objet pour les organisations des autres pays
          couverts (COUNTRIES, AddOrganizationDialog.tsx) — masqué sinon. */}
      {currentOrganization.country === "Côte d'Ivoire" && (
        <a href="https://www.services.fne.dgi.gouv.ci/fr" target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm hover:border-primary hover:bg-primary/5">
          <span>
            <span className="font-semibold">Facture Normalisée Électronique (FNE)</span>
            <span className="block text-xs text-muted-foreground">Portail officiel DGI Côte d'Ivoire — facturation électronique normalisée.</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
        </a>
      )}

      {canManage && (
        <button onClick={save} disabled={updateShop.isPending || updateSettings.isPending}
          className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          <Save className="h-4 w-4" /> Enregistrer
        </button>
      )}
    </div>
  );
}

function Field({ label, value, onChange, className, disabled }: { label: string; value?: string; onChange?: (v: string) => void; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
    </label>
  );
}
