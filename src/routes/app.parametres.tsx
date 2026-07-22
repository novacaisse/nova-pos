import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Store, Coins, Receipt, ArrowLeftRight, Save, Plus, Image as ImageIcon, FileText, Loader2,
  X, Trash2, Search, Check,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useShop } from "@/lib/auth/ShopProvider";
import {
  useShopSettings, useUpdateShopSettings, useUpdateShop, useUploadShopLogo, useMyRole,
  useCreateAdditionalShop, useTransferStock, useProducts,
  DEFAULT_TICKET_CONFIG, useFormatMoney, type TicketConfig, type TaxRate, type ProductWithStock,
} from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

const CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GHS", "NGN"];
const COUNTRIES = ["Bénin", "Togo", "Côte d'Ivoire", "Sénégal", "Burkina Faso", "Mali", "Niger", "Guinée", "Cameroun"];

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
  const [currency, setCurrency] = useState("XOF");
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useCreateAdditionalShop();

  useEffect(() => {
    if (currentShop) { setName(currentShop.name); setCurrency(currentShop.currency); }
  }, [currentShop]);

  useEffect(() => {
    if (!settings) return;
    setShopExtra((s) => ({ ...s, ...settings.data }));
    setTicket((t) => ({ ...t, ...settings.data.ticket }));
    setFooter(settings.receipt_footer ?? "");
    setTaxIncluded(settings.tax_included);
    setTaxRates(settings.data.tax_rates ?? []);
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

  const saveCurrency = async () => {
    try {
      await updateShop.mutateAsync({ currency });
    } catch (e: any) {
      alert("Erreur enregistrement devise : " + (e?.message ?? "inconnue"));
    }
  };

  const saveTaxes = async () => {
    try {
      await updateSettings.mutateAsync({
        tax_included: taxIncluded,
        data: { ...(settings?.data ?? {}), tax_rates: taxRates },
      });
    } catch (e: any) {
      alert("Erreur enregistrement taxes : " + (e?.message ?? "inconnue"));
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
                  {myRole === "owner" && (
                    <button onClick={() => setShowAddShop(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                  )}
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
              <h2 className="mb-4 font-display text-lg font-bold">Devise</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Devise utilisée pour l'abonnement et affichée à côté du nom de la boutique dans le sélecteur.
                Les montants dans l'app restent formatés en F (XOF) partout — changer la devise ici ne reformate pas
                encore l'affichage des montants dans toute l'application.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Devise principale</div>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canManage}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              {canManage && (
                <button onClick={saveCurrency} disabled={updateShop.isPending}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
              )}
            </div>
          )}

          {tab === "taxes" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Taxes</h2>

              <label className="mb-4 flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span>Prix affichés taxes incluses</span>
                <input type="checkbox" checked={taxIncluded} disabled={!canManage}
                  onChange={(e) => setTaxIncluded(e.target.checked)} className="h-5 w-5 accent-primary" />
              </label>

              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taux de taxe</div>
              <div className="space-y-2">
                {taxRates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    Aucun taux défini. Le taux par produit se règle individuellement dans la fiche Produit.
                  </div>
                )}
                {taxRates.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                    <input value={t.name} disabled={!canManage}
                      onChange={(e) => setTaxRates((r) => r.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Nom (ex. TVA standard)"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-60" />
                    <input type="number" min={0} max={100} value={t.rate} disabled={!canManage}
                      onChange={(e) => setTaxRates((r) => r.map((x, idx) => idx === i ? { ...x, rate: Number(e.target.value) || 0 } : x))}
                      className="tabular h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm disabled:opacity-60" />
                    <span className="text-xs text-muted-foreground">%</span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={t.active} disabled={!canManage}
                        onChange={(e) => setTaxRates((r) => r.map((x, idx) => idx === i ? { ...x, active: e.target.checked } : x))}
                        className="h-4 w-4 accent-primary" /> Active
                    </label>
                    {canManage && (
                      <button onClick={() => setTaxRates((r) => r.filter((_, idx) => idx !== i))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>

              {canManage && (
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => setTaxRates((r) => [...r, { id: crypto.randomUUID(), name: "", rate: 0, active: true }])}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Ajouter un taux</button>
                  <button onClick={saveTaxes} disabled={updateSettings.isPending}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                    <Save className="h-4 w-4" /> Enregistrer
                  </button>
                </div>
              )}
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
            <TransferPanel shops={shops} currentShopId={currentShop.id} currentShopName={currentShop.name} canManage={canManage} />
          )}
        </div>
      </div>

      {showAddShop && (
        <AddShopDialog
          onClose={() => setShowAddShop(false)}
          onCreate={async (input) => { await createShop.mutateAsync(input); setShowAddShop(false); }}
          pending={createShop.isPending}
        />
      )}
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

function AddShopDialog({ onClose, onCreate, pending }: {
  onClose: () => void; onCreate: (input: { name: string; country: string; currency: string }) => Promise<void>; pending: boolean;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [currency, setCurrency] = useState("XOF");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onCreate({ name: name.trim(), country, currency });
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Ajouter une boutique</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom de la boutique *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pays</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Devise</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Nouvelle boutique en période d'essai, avec son propre abonnement — comme à l'inscription.
          </p>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!name.trim() || pending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer la boutique
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type TransferShop = { id: string; name: string };

function TransferPanel({ shops, currentShopId, currentShopName, canManage }: {
  shops: TransferShop[]; currentShopId: string; currentShopName: string; canManage: boolean;
}) {
  const formatXOF = useFormatMoney();
  const { data: products = [] } = useProducts();
  const transfer = useTransferStock();
  const otherShops = shops.filter((s) => s.id !== currentShopId);
  const [toShopId, setToShopId] = useState(otherShops[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ transferred: number; unmatched: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, query]);

  const lines = Object.entries(qty).filter(([, q]) => q > 0);

  const submit = async () => {
    setError(null); setResult(null);
    if (!toShopId) { setError("Sélectionnez une boutique de destination."); return; }
    const payload = lines.map(([productId, quantity]) => {
      const p = products.find((x) => x.id === productId)!;
      return { product_id: p.id, sku: p.sku, name: p.name, quantity };
    });
    try {
      const res = await transfer.mutateAsync({ toShopId, lines: payload });
      setResult(res);
      setQty({});
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  if (otherShops.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Ajoutez une deuxième boutique (onglet Boutique) pour pouvoir transférer du stock entre elles.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-1 font-display text-lg font-bold">Transfert de stock entre boutiques</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Envoie du stock de « {currentShopName} » vers une autre boutique. La correspondance des produits se fait par
        SKU (ou par nom si le SKU est vide) : un article introuvable dans le catalogue de destination sera signalé,
        pas transféré automatiquement.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depuis</div>
          <div className="flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm">{currentShopName}</div>
        </div>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vers</div>
          <select value={toShopId} onChange={(e) => setToShopId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
            {otherShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">Stock : {p.stock} · {formatXOF(Number(p.price))}</div>
              </div>
              <input type="number" min={0} max={p.stock} value={qty[p.id] ?? 0}
                onChange={(e) => setQty((q) => ({ ...q, [p.id]: Math.max(0, Math.min(p.stock, Number(e.target.value) || 0)) }))}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm" />
            </div>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Aucun produit.</div>}
        </div>
      </div>

      {result && (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-3 text-xs text-success">
          {result.transferred} article{result.transferred > 1 ? "s" : ""} transféré{result.transferred > 1 ? "s" : ""}.
          {result.unmatched.length > 0 && (
            <div className="mt-1 text-warning-foreground">
              Non transféré (aucune correspondance dans la boutique de destination) : {result.unmatched.join(", ")}
            </div>
          )}
        </div>
      )}
      {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

      {canManage && (
        <button onClick={submit} disabled={lines.length === 0 || transfer.isPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
          {transfer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} Créer le transfert
        </button>
      )}
    </div>
  );
}
