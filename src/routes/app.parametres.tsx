import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Store, Coins, Receipt, ArrowLeftRight, Save, Plus, FileText, Loader2,
  Trash2, Search,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PageSkeleton } from "@/components/app/PageSkeleton";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { AddOrganizationDialog, CURRENCIES } from "@/components/app/AddOrganizationDialog";
import {
  useShopSettings, useUpdateShopSettings, useUpdateShop, useMyRole, useSubscription,
  useProvisionOrganization, useTransferStock, useProducts,
  DEFAULT_TICKET_CONFIG, useFormatMoney, type TicketConfig, type TaxRate, type ProductWithStock, type Subscription,
} from "@/lib/data/hooks";
import { getTrialInfo } from "@/lib/trial";
import { cn, selectOnFocus } from "@/lib/utils";

// Même calcul que la page Abonnement (audit ZegOS Phase 1, LOT C) — avant
// ce correctif, cette liste affichait organizations.plan brut ("Plan
// starter"), qui peut diverger de subscriptions (source de vérité de
// l'état d'abonnement réel) si une formule a été changée manuellement sans
// mettre à jour l'abonnement (voir useChangeOrganizationPlan). Pour
// l'organisation courante, on croise avec subscriptions ; pour les autres
// organisations de la liste (non chargées en détail ici), on retombe sur
// organizations.plan/trial_ends_at seuls — fiables tant qu'aucun changement
// de formule manuel désynchronisé n'a eu lieu dessus.
function planStatusLabel(org: { plan: string; trial_ends_at: string | null }, subscription?: Subscription | null): string {
  const trial = getTrialInfo(org);
  if (trial.onTrial) {
    return trial.expired ? "Essai terminé" : `Essai · ${trial.daysLeft} j restant${trial.daysLeft > 1 ? "s" : ""}`;
  }
  if (subscription && subscription.status !== "active") {
    if (subscription.status === "trialing") return "Essai terminé";
    if (subscription.status === "past_due") return `Plan ${org.plan} · paiement en retard`;
    return `Plan ${org.plan} · ${subscription.status}`;
  }
  return `Plan ${org.plan}`;
}

export const Route = createFileRoute("/app/parametres")({
  // ?openAdd=1 : ouvre directement le formulaire "Ajouter une organisation"
  // — utilisé par le raccourci du même nom dans ShopSelector.tsx, qui
  // redirigeait ici sans jamais l'ouvrir (audit ZegOS Phase 1, LOT D).
  validateSearch: (search: Record<string, unknown>): { openAdd?: boolean } => ({
    openAdd: search.openAdd === true || search.openAdd === "1" ? true : undefined,
  }),
  component: ParametresPage,
});

function ParametresPage() {
  const { openAdd } = Route.useSearch();
  const [tab, setTab] = useState<"shop" | "currency" | "taxes" | "ticket" | "transfer">("shop");
  const { organizations, currentOrganization } = useOrganization();
  const { data: settings, isLoading: settingsLoading } = useShopSettings();
  const { data: currentSubscription } = useSubscription();
  const updateShop = useUpdateShop();
  const updateSettings = useUpdateShopSettings();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager"; // shops_update / shop_settings write

  const [ticket, setTicket] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG);
  const [footer, setFooter] = useState("");
  const [currency, setCurrency] = useState("XOF");
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useProvisionOrganization();

  useEffect(() => {
    if (openAdd) { setTab("shop"); setShowAddShop(true); }
  }, [openAdd]);

  useEffect(() => {
    if (currentOrganization) setCurrency(currentOrganization.currency);
  }, [currentOrganization]);

  useEffect(() => {
    if (!settings) return;
    setTicket((t) => ({ ...t, ...settings.data.ticket }));
    setFooter(settings.receipt_footer ?? "");
    setTaxIncluded(settings.tax_included);
    setTaxRates(settings.data.tax_rates ?? []);
  }, [settings]);

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

  if (!currentOrganization) {
    return <div className="grid h-full place-items-center p-10 text-sm text-muted-foreground">Sélectionnez une organisation.</div>;
  }
  if (settingsLoading) return <PageSkeleton title="Paramètres" subtitle="Configuration ZegCaisse de votre organisation" />;

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration ZegCaisse de votre organisation" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {([
              { k: "shop", label: "Organisation", icon: Store },
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
            <>
              <OrgIdentityTab heading="Informations de l'organisation" />

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Organisations multiples</div>
                  {myRole === "owner" && (
                    <button onClick={() => setShowAddShop(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                  )}
                </div>
                <div className="space-y-2">
                  {organizations.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Store className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.country} · {planStatusLabel(s, s.id === currentOrganization.id ? currentSubscription : undefined)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "currency" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Devise</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Devise utilisée pour l'abonnement et affichée à côté du nom de l'organisation dans le sélecteur.
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
                    <input type="number" onFocus={selectOnFocus} min={0} max={100} value={t.rate} disabled={!canManage}
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
                  {ticket.showLogo && currentOrganization.logo_url && <img src={currentOrganization.logo_url} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />}
                  <div className="text-center">
                    <div className="text-sm font-bold">{currentOrganization.name}</div>
                    {ticket.showAddress && settings?.data.address && <div className="text-xs">{settings.data.address}</div>}
                    {ticket.showPhone && settings?.data.phone && <div className="text-xs">{settings.data.phone}</div>}
                    {ticket.showFiscal && settings?.data.ifu && <div className="text-xs">IFU {settings.data.ifu}</div>}
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
            <TransferPanel organizations={organizations} currentOrganizationId={currentOrganization.id} currentOrganizationName={currentOrganization.name} canManage={canManage} />
          )}
        </div>
      </div>

      {showAddShop && (
        <AddOrganizationDialog
          unitLabel="boutique"
          onClose={() => setShowAddShop(false)}
          onCreate={async (input) => { await createShop.mutateAsync({ app: "pos", ...input }); setShowAddShop(false); }}
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

type TransferOrganization = { id: string; name: string };

function TransferPanel({ organizations, currentOrganizationId, currentOrganizationName, canManage }: {
  organizations: TransferOrganization[]; currentOrganizationId: string; currentOrganizationName: string; canManage: boolean;
}) {
  const formatXOF = useFormatMoney();
  const { data: products = [] } = useProducts();
  const transfer = useTransferStock();
  const otherOrganizations = organizations.filter((s) => s.id !== currentOrganizationId);
  const [toOrganizationId, setToOrganizationId] = useState(otherOrganizations[0]?.id ?? "");
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
    if (!toOrganizationId) { setError("Sélectionnez une organisation de destination."); return; }
    const payload = lines.map(([productId, quantity]) => {
      const p = products.find((x) => x.id === productId)!;
      return { product_id: p.id, sku: p.sku, name: p.name, quantity };
    });
    try {
      const res = await transfer.mutateAsync({ toOrganizationId, lines: payload });
      setResult(res);
      setQty({});
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  if (otherOrganizations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Ajoutez une deuxième organisation (onglet Organisation) pour pouvoir transférer du stock entre elles.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-1 font-display text-lg font-bold">Transfert de stock entre organisations</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Envoie du stock de « {currentOrganizationName} » vers une autre organisation. La correspondance des produits se fait par
        SKU (ou par nom si le SKU est vide) : un article introuvable dans le catalogue de destination sera signalé,
        pas transféré automatiquement.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depuis</div>
          <div className="flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm">{currentOrganizationName}</div>
        </div>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vers</div>
          <select value={toOrganizationId} onChange={(e) => setToOrganizationId(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
            {otherOrganizations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              <input type="number" onFocus={selectOnFocus} min={0} max={p.stock} value={qty[p.id] ?? 0}
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
              Non transféré (aucune correspondance dans l'organisation de destination) : {result.unmatched.join(", ")}
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
