import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store, Coins, Receipt, ArrowLeftRight, Save, Plus, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useShop } from "@/lib/auth/ShopProvider";
import {
  useShopSettings, useUpdateShopSettings, useUpdateShop, useUploadShopLogo, useMyRole,
  DEFAULT_TICKET_CONFIG, type TicketConfig,
} from "@/lib/data/hooks";
import { SHOPS as MOCK_TRANSFER_SHOPS } from "@/lib/mock/session";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/parametres")({
  component: ParametresPage,
});

function ParametresPage() {
  const [tab, setTab] = useState<"shop" | "currency" | "taxes" | "ticket" | "transfer">("shop");
  const { shops, currentShop } = useShop();
  const { data: settings, isLoading: settingsLoading } = useShopSettings();
  const updateShop = useUpdateShop();
  const updateSettings = useUpdateShopSettings();
  const uploadLogo = useUploadShopLogo();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager"; // shops_update / shop_settings write

  const [name, setName] = useState("");
  const [shopExtra, setShopExtra] = useState({
    phone: "", email: "", address: "", rccm: "", ifu: "", facebook: "", instagram: "",
  });
  const [ticket, setTicket] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG);
  const [footer, setFooter] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (currentShop) setName(currentShop.name);
  }, [currentShop]);

  useEffect(() => {
    if (!settings) return;
    setShopExtra((s) => ({ ...s, ...settings.data }));
    setTicket((t) => ({ ...t, ...settings.data.ticket }));
    setFooter(settings.receipt_footer ?? "");
  }, [settings]);

  const onLogo = async (file?: File) => {
    if (!file || !currentShop) return;
    setLogoUploading(true);
    try {
      await uploadLogo.mutateAsync(file);
    } catch (e: any) {
      alert("Erreur upload logo : " + (e?.message ?? "inconnue"));
    } finally {
      setLogoUploading(false);
    }
  };

  const saveShop = async () => {
    if (!currentShop) return;
    try {
      await updateShop.mutateAsync({ name });
      await updateSettings.mutateAsync({ data: { ...(settings?.data ?? {}), ...shopExtra, ticket } });
    } catch (e: any) {
      alert("Erreur enregistrement boutique : " + (e?.message ?? "inconnue"));
    }
  };

  const saveTicket = async () => {
    try {
      await updateSettings.mutateAsync({
        receipt_footer: footer,
        data: { ...(settings?.data ?? {}), ticket },
      });
    } catch (e: any) {
      alert("Erreur enregistrement ticket : " + (e?.message ?? "inconnue"));
    }
  };

  if (!currentShop) {
    return <div className="grid h-full place-items-center p-10 text-sm text-muted-foreground">Sélectionnez une boutique.</div>;
  }

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration de votre boutique" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {([
              { k: "shop", label: "Boutique", icon: Store },
              { k: "currency", label: "Devise", icon: Coins },
              { k: "taxes", label: "Taxes", icon: Receipt },
              { k: "ticket", label: "Ticket de caisse", icon: FileText },
              { k: "transfer", label: "Transfert de stock", icon: ArrowLeftRight },
            ] as const).map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  tab === t.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {tab === "shop" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Informations de la boutique</h2>

              <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border p-4">
                <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted">
                  {logoUploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    : currentShop.logo_url ? <img src={currentShop.logo_url} alt="Logo" className="h-full w-full object-contain" />
                    : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Logo de la boutique</div>
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

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Boutiques multiples</div>
                  <button className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {shops.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Store className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.country} · Plan {s.plan}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canManage && (
                <button onClick={saveShop} disabled={updateShop.isPending || updateSettings.isPending}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
              )}
            </div>
          )}

          {tab === "currency" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Devise et affichage</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Devise principale" options={["FCFA (XOF)", "EUR", "USD", "GHS", "NGN"]} />
                <SelectField label="Position du symbole" options={["Après (500 F)", "Avant ($ 500)"]} />
                <SelectField label="Séparateur milliers" options={["Espace (10 000)", "Virgule (10,000)", "Point (10.000)"]} />
                <Field label="Décimales" defaultValue="0" />
              </div>
            </div>
          )}

          {tab === "taxes" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Taxes appliquées</h2>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Nom</th><th className="px-3 py-2 text-right">Taux</th>
                      <th className="px-3 py-2">Portée</th><th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/60"><td className="px-3 py-2 font-medium">TVA standard</td><td className="tabular px-3 py-2 text-right">18%</td><td className="px-3 py-2 text-xs">Tous produits</td><td className="px-3 py-2"><span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Active</span></td></tr>
                    <tr className="border-t border-border/60"><td className="px-3 py-2 font-medium">TVA réduite</td><td className="tabular px-3 py-2 text-right">5%</td><td className="px-3 py-2 text-xs">Épicerie</td><td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Inactive</span></td></tr>
                  </tbody>
                </table>
              </div>
              <button className="mt-4 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Ajouter une taxe</button>
            </div>
          )}

          {tab === "ticket" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-4 font-display text-lg font-bold">Éditeur de ticket de caisse</h2>
                <div className="space-y-2">
                  {([
                    ["showLogo", "Afficher le logo"], ["showAddress", "Afficher l'adresse"],
                    ["showPhone", "Afficher le téléphone"], ["showFiscal", "Afficher RCCM / IFU"],
                    ["showCashier", "Afficher le caissier"], ["showQr", "Ajouter un QR code (à venir)"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                      <span>{label}</span>
                      <input type="checkbox" checked={!!ticket[k]} disabled={!canManage}
                        onChange={(e) => setTicket({ ...ticket, [k]: e.target.checked })} className="h-5 w-5 accent-primary" />
                    </label>
                  ))}
                  <Field label="Message de remerciement" value={ticket.thanks ?? ""} onChange={(v) => setTicket({ ...ticket, thanks: v })} disabled={!canManage} />
                  <Field label="Pied de page" value={footer} onChange={setFooter} disabled={!canManage} />
                </div>
                {canManage && (
                  <button onClick={saveTicket} disabled={updateSettings.isPending || settingsLoading}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                    <Save className="h-4 w-4" /> Enregistrer
                  </button>
                )}
              </div>

              <div className="sticky top-20">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aperçu</div>
                <div className="rounded-2xl bg-white p-5 text-black shadow-elegant" style={{ fontFamily: "monospace" }}>
                  {ticket.showLogo && currentShop.logo_url && <img src={currentShop.logo_url} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />}
                  <div className="text-center">
                    <div className="text-sm font-bold">{name || currentShop.name}</div>
                    {ticket.showAddress && shopExtra.address && <div className="text-xs">{shopExtra.address}</div>}
                    {ticket.showPhone && shopExtra.phone && <div className="text-xs">{shopExtra.phone}</div>}
                    {ticket.showFiscal && shopExtra.ifu && <div className="text-xs">IFU {shopExtra.ifu}</div>}
                  </div>
                  <hr className="my-2 border-dashed" />
                  <div className="flex justify-between text-xs"><span>Ticket</span><span className="font-bold">T-1234</span></div>
                  {ticket.showCashier && <div className="flex justify-between text-xs"><span>Caissier</span><span>Aïcha K.</span></div>}
                  <hr className="my-2 border-dashed" />
                  <div className="text-xs">Coca-Cola 33cl × 2 · 1 000 F</div>
                  <div className="text-xs">Eau minérale × 1 · 400 F</div>
                  <hr className="my-2 border-dashed" />
                  <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>1 400 F</span></div>
                  <div className="mt-3 text-center text-xs italic">{ticket.thanks}</div>
                  <div className="text-center text-[10px] text-gray-600">{footer}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "transfer" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Transfert de stock entre boutiques</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Depuis" options={MOCK_TRANSFER_SHOPS.map((s) => s.name)} />
                <SelectField label="Vers" options={MOCK_TRANSFER_SHOPS.map((s) => s.name)} />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produits à transférer</div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {PRODUCTS.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-base">{p.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">Stock : {p.stock} · {formatXOF(p.price)}</div>
                      </div>
                      <input type="number" min={0} defaultValue={0} className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <button className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <ArrowLeftRight className="h-4 w-4" /> Créer le transfert
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className, defaultValue, disabled }: { label: string; value?: string; onChange?: (v: string) => void; className?: string; defaultValue?: string; disabled?: boolean }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} defaultValue={defaultValue} onChange={(e) => onChange?.(e.target.value)} disabled={disabled}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
    </label>
  );
}
function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
