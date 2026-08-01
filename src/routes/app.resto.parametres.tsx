// Paramètres ZegResto. V1 : Restaurant (identité + multi-établissements) +
// Zones. V2 (chantier 8) : Ticket & Caisse (réutilise organization_settings,
// déjà partagé par tout ZegOS — cf. OrgIdentityTab et ZegCaisse app.parametres.tsx
// — + fond de caisse, réglage de configuration uniquement, pas un suivi de
// session complet, cf. migration 046), Cuisine/KDS (auto-refresh, seuil
// d'urgence), Sons & Notifications (nouveau ticket / nouvelle réservation),
// Fidélité (taux de conversion des points) — toutes ces valeurs vivent sur
// resto_settings (migrations 044-046), aucune n'est codée en dur.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed, LayoutGrid, Trash2, Receipt, Volume2, Gift, ChefHat, Save } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgIdentityTab } from "@/components/app/OrgIdentityTab";
import { AddOrganizationDialog } from "@/components/app/AddOrganizationDialog";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { useMyRole, useProvisionOrganization, useShopSettings, useUpdateShopSettings, DEFAULT_TICKET_CONFIG, type TicketConfig } from "@/lib/data/hooks";
import {
  useRestoZones, useUpsertRestoZone, useDeleteRestoZone,
  useRestoSettings, useUpdateRestoSettings, RESTO_SETTINGS_DEFAULTS, type RestoSoundChoice,
} from "@/lib/data/restoHooks";
import { playKdsSound } from "@/lib/kdsSound";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/resto/parametres")({
  // ?openAdd=1 : ouvre directement le formulaire "Ajouter un restaurant" —
  // même mécanique que /app/parametres et /app/hotel/parametres, utilisée
  // par le raccourci du même nom dans ShopSelector.tsx en contexte ZegResto.
  validateSearch: (search: Record<string, unknown>): { openAdd?: boolean } => ({
    openAdd: search.openAdd === true || search.openAdd === "1" ? true : undefined,
  }),
  component: RestoParametresPage,
});

const TABS = [
  { k: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { k: "zones", label: "Zones", icon: LayoutGrid },
  { k: "ticket", label: "Ticket & Caisse", icon: Receipt },
  { k: "cuisine", label: "Cuisine (KDS)", icon: ChefHat },
  { k: "sons", label: "Sons & Notifications", icon: Volume2 },
  { k: "fidelite", label: "Fidélité", icon: Gift },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function RestoParametresPage() {
  const { openAdd } = Route.useSearch();
  const { organizations } = useOrganization();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const [tab, setTab] = useState<TabKey>("restaurant");
  const [showAddShop, setShowAddShop] = useState(false);
  const createShop = useProvisionOrganization();

  useEffect(() => {
    if (openAdd) { setTab("restaurant"); setShowAddShop(true); }
  }, [openAdd]);

  // Seuls les restaurants ZegResto du compte — jamais les boutiques
  // ZegCaisse ni les établissements ZegHotel, même partageant le même
  // propriétaire (isolation, même pattern que app.hotel.parametres.tsx).
  const restoOrgs = organizations.filter((s) => s.app_module === "resto");

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration ZegResto de votre restaurant" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  tab === t.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {tab === "restaurant" && (
            <>
              <OrgIdentityTab heading="Informations du restaurant" />

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Restaurants multiples</div>
                  {myRole === "owner" && (
                    <button onClick={() => setShowAddShop(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                  )}
                </div>
                <div className="space-y-2">
                  {restoOrgs.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><UtensilsCrossed className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.country} · Plan {s.plan}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === "zones" && <ZonesTab />}
          {tab === "ticket" && <TicketCaisseTab canManage={canManage} />}
          {tab === "cuisine" && <CuisineTab canManage={canManage} />}
          {tab === "sons" && <SonsTab canManage={canManage} />}
          {tab === "fidelite" && <FideliteTab canManage={canManage} />}
        </div>
      </div>

      {showAddShop && (
        <AddOrganizationDialog
          unitLabel="restaurant"
          onClose={() => setShowAddShop(false)}
          onCreate={async (input) => { await createShop.mutateAsync({ app: "resto", ...input }); setShowAddShop(false); }}
          pending={createShop.isPending}
        />
      )}
    </div>
  );
}

// Gestion des zones existe déjà en contexte (onglets du plan de salle,
// /app/resto/salle) — cette vue Paramètres est l'équivalent "liste admin"
// classique, plus adaptée pour renommer/réordonner sans manipuler le
// canvas. Les deux écrans lisent/écrivent la même table resto_zones.
function ZonesTab() {
  const { data: zones = [] } = useRestoZones();
  const upsert = useUpsertRestoZone();
  const remove = useDeleteRestoZone();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ nom: name.trim(), ordre: zones.length });
    setName("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 font-semibold">Zones de salle</div>
      <div className="mb-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ex. Terrasse, Salle principale…" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        <button onClick={add} disabled={!name.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      {zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucune zone — le plan de salle en aura besoin pour placer des tables.</div>
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
              <span className="font-semibold">{z.nom}</span>
              <button onClick={() => { if (confirm(`Supprimer la zone ${z.nom} ?`)) remove.mutate(z.id); }} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ticket imprimé (en-tête/pied de page/mentions légales) : réutilise
// organization_settings + data.ticket, exactement comme ZegCaisse
// (app.parametres.tsx) — table socle partagée par toute application ZegOS,
// déjà alimentée par OrgIdentityTab pour adresse/téléphone/IFU. Fond de
// caisse : nouveau, propre à ZegResto (resto_settings, migration 046).
function TicketCaisseTab({ canManage }: { canManage: boolean }) {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const updateSettings = useUpdateShopSettings();
  const { data: restoSettingsRow } = useRestoSettings();
  const updateRestoSettings = useUpdateRestoSettings();
  const restoSettings = { ...RESTO_SETTINGS_DEFAULTS, ...restoSettingsRow };

  const [ticket, setTicket] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG);
  const [footer, setFooter] = useState("");
  const [cashFloat, setCashFloat] = useState(0);
  const [cashFloatRequired, setCashFloatRequired] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTicket((t) => ({ ...t, ...settings.data.ticket }));
    setFooter(settings.receipt_footer ?? "");
  }, [settings]);
  useEffect(() => {
    setCashFloat(restoSettings.cash_float_default);
    setCashFloatRequired(restoSettings.cash_float_required);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoSettingsRow]);

  const saveTicket = async () => {
    try {
      await updateSettings.mutateAsync({ receipt_footer: footer, data: { ...(settings?.data ?? {}), ticket } });
    } catch (e: any) { alert("Erreur enregistrement ticket : " + (e?.message ?? "inconnue")); }
  };
  const saveCaisse = async () => {
    try {
      await updateRestoSettings.mutateAsync({ cash_float_default: cashFloat, cash_float_required: cashFloatRequired });
    } catch (e: any) { alert("Erreur enregistrement caisse : " + (e?.message ?? "inconnue")); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Éditeur de ticket de caisse</h2>
          <div className="space-y-2">
            {([
              ["showLogo", "Afficher le logo"], ["showAddress", "Afficher l'adresse"],
              ["showPhone", "Afficher le téléphone"], ["showFiscal", "Afficher RCCM / IFU"],
              ["showCashier", "Afficher le serveur"], ["showQr", "Ajouter un QR code (à venir)"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span>{label}</span>
                <input type="checkbox" checked={!!ticket[k]} disabled={!canManage}
                  onChange={(e) => setTicket({ ...ticket, [k]: e.target.checked })} className="h-5 w-5 accent-primary" />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message de remerciement</span>
              <input value={ticket.thanks ?? ""} disabled={!canManage} onChange={(e) => setTicket({ ...ticket, thanks: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pied de page (mentions légales)</span>
              <input value={footer} disabled={!canManage} onChange={(e) => setFooter(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
            </label>
          </div>
          {canManage && (
            <button onClick={saveTicket} disabled={updateSettings.isPending}
              className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              <Save className="h-4 w-4" /> Enregistrer
            </button>
          )}
        </div>

        <div className="sticky top-20">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aperçu</div>
          <div className="rounded-2xl bg-white p-5 text-black shadow-elegant" style={{ fontFamily: "monospace" }}>
            {ticket.showLogo && currentOrganization?.logo_url && <img src={currentOrganization.logo_url} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />}
            <div className="text-center">
              <div className="text-sm font-bold">{currentOrganization?.name}</div>
              {ticket.showAddress && settings?.data.address && <div className="text-xs">{settings.data.address}</div>}
              {ticket.showPhone && settings?.data.phone && <div className="text-xs">{settings.data.phone}</div>}
              {ticket.showFiscal && settings?.data.ifu && <div className="text-xs">IFU {settings.data.ifu}</div>}
            </div>
            <hr className="my-2 border-dashed" />
            <div className="flex justify-between text-xs"><span>Table 4</span><span className="font-bold">C-1234</span></div>
            {ticket.showCashier && <div className="flex justify-between text-xs"><span>Serveur</span><span>Aïcha K.</span></div>}
            <hr className="my-2 border-dashed" />
            <div className="text-xs">Poulet braisé × 2 · 6 000 F</div>
            <div className="text-xs">Jus de bissap × 2 · 1 000 F</div>
            <hr className="my-2 border-dashed" />
            <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>7 000 F</span></div>
            <div className="mt-3 text-center text-xs italic">{ticket.thanks}</div>
            <div className="text-center text-[10px] text-gray-600">{footer}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Fond de caisse</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Réglage de configuration uniquement — pas un suivi de session avec journal d'écarts (aucune fonctionnalité de ce type n'existe encore ailleurs dans ZegOS).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Montant par défaut à l'ouverture</span>
            <input type="number" min={0} value={cashFloat} disabled={!canManage} onChange={(e) => setCashFloat(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            <span>Ouverture de caisse obligatoire</span>
            <input type="checkbox" checked={cashFloatRequired} disabled={!canManage}
              onChange={(e) => setCashFloatRequired(e.target.checked)} className="h-5 w-5 accent-primary" />
          </label>
        </div>
        {canManage && (
          <button onClick={saveCaisse} disabled={updateRestoSettings.isPending}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}

function CuisineTab({ canManage }: { canManage: boolean }) {
  const { data: settingsRow } = useRestoSettings();
  const update = useUpdateRestoSettings();
  const settings = { ...RESTO_SETTINGS_DEFAULTS, ...settingsRow };
  const [refresh, setRefresh] = useState(settings.kds_auto_refresh_seconds);
  const [urgency, setUrgency] = useState(settings.kds_urgency_minutes);

  useEffect(() => { setRefresh(settings.kds_auto_refresh_seconds); setUrgency(settings.kds_urgency_minutes); }, [settingsRow]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try { await update.mutateAsync({ kds_auto_refresh_seconds: refresh, kds_urgency_minutes: urgency }); }
    catch (e: any) { alert("Erreur enregistrement : " + (e?.message ?? "inconnue")); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-1 font-display text-lg font-bold">Écran cuisine (KDS)</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        L'auto-actualisation est un filet de sécurité si la connexion temps réel décroche, et permet un affichage "mains libres" sur un écran dédié en cuisine.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intervalle d'auto-actualisation</span>
          <select value={refresh} disabled={!canManage} onChange={(e) => setRefresh(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60">
            {[10, 15, 30].map((s) => <option key={s} value={s}>{s} secondes</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seuil d'urgence (ticket surligné après)</span>
          <input type="number" min={1} value={urgency} disabled={!canManage} onChange={(e) => setUrgency(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
          <span className="mt-1 block text-xs text-muted-foreground">minutes écoulées depuis l'envoi</span>
        </label>
      </div>
      {canManage && (
        <button onClick={save} disabled={update.isPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          <Save className="h-4 w-4" /> Enregistrer
        </button>
      )}
    </div>
  );
}

const SOUND_LABEL: Record<RestoSoundChoice, string> = { chime: "Carillon", bell: "Cloche", soft: "Doux" };

function SonsTab({ canManage }: { canManage: boolean }) {
  const { data: settingsRow } = useRestoSettings();
  const update = useUpdateRestoSettings();
  const settings = { ...RESTO_SETTINGS_DEFAULTS, ...settingsRow };
  const [kdsSoundEnabled, setKdsSoundEnabled] = useState(settings.kds_sound_enabled);
  const [reservationSoundEnabled, setReservationSoundEnabled] = useState(settings.reservation_sound_enabled);
  const [soundChoice, setSoundChoice] = useState<RestoSoundChoice>(settings.kds_sound_choice);
  const [volume, setVolume] = useState(settings.kds_sound_volume);

  useEffect(() => {
    setKdsSoundEnabled(settings.kds_sound_enabled);
    setReservationSoundEnabled(settings.reservation_sound_enabled);
    setSoundChoice(settings.kds_sound_choice);
    setVolume(settings.kds_sound_volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsRow]);

  const save = async () => {
    try {
      await update.mutateAsync({
        kds_sound_enabled: kdsSoundEnabled, reservation_sound_enabled: reservationSoundEnabled,
        kds_sound_choice: soundChoice, kds_sound_volume: volume,
      });
    } catch (e: any) { alert("Erreur enregistrement : " + (e?.message ?? "inconnue")); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 font-display text-lg font-bold">Sons & Notifications</h2>
      <div className="space-y-2">
        <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
          <span>Alerte sonore — nouveau ticket cuisine</span>
          <input type="checkbox" checked={kdsSoundEnabled} disabled={!canManage} onChange={(e) => setKdsSoundEnabled(e.target.checked)} className="h-5 w-5 accent-primary" />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
          <span>Alerte sonore — nouvelle réservation en ligne</span>
          <input type="checkbox" checked={reservationSoundEnabled} disabled={!canManage} onChange={(e) => setReservationSoundEnabled(e.target.checked)} className="h-5 w-5 accent-primary" />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Son</span>
          <div className="flex gap-2">
            <select value={soundChoice} disabled={!canManage} onChange={(e) => setSoundChoice(e.target.value as RestoSoundChoice)}
              className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60">
              {(["chime", "bell", "soft"] as const).map((s) => <option key={s} value={s}>{SOUND_LABEL[s]}</option>)}
            </select>
            <button type="button" onClick={() => playKdsSound(soundChoice, volume)}
              className="rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted">Tester</button>
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume ({Math.round(volume * 100)}%)</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} disabled={!canManage} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-primary" />
        </label>
      </div>

      {canManage && (
        <button onClick={save} disabled={update.isPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          <Save className="h-4 w-4" /> Enregistrer
        </button>
      )}
    </div>
  );
}

function FideliteTab({ canManage }: { canManage: boolean }) {
  const { data: settingsRow } = useRestoSettings();
  const update = useUpdateRestoSettings();
  const settings = { ...RESTO_SETTINGS_DEFAULTS, ...settingsRow };
  const [enabled, setEnabled] = useState(settings.loyalty_enabled);
  const [earnAmount, setEarnAmount] = useState(settings.loyalty_earn_amount_per_point);
  const [redeemValue, setRedeemValue] = useState(settings.loyalty_redeem_value_per_point);
  const [minRedeem, setMinRedeem] = useState(settings.loyalty_min_points_to_redeem);

  useEffect(() => {
    setEnabled(settings.loyalty_enabled);
    setEarnAmount(settings.loyalty_earn_amount_per_point);
    setRedeemValue(settings.loyalty_redeem_value_per_point);
    setMinRedeem(settings.loyalty_min_points_to_redeem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsRow]);

  const save = async () => {
    try {
      await update.mutateAsync({
        loyalty_enabled: enabled, loyalty_earn_amount_per_point: Math.max(0.01, earnAmount),
        loyalty_redeem_value_per_point: Math.max(0, redeemValue), loyalty_min_points_to_redeem: Math.max(0, Math.round(minRedeem)),
      });
    } catch (e: any) { alert("Erreur enregistrement : " + (e?.message ?? "inconnue")); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 font-display text-lg font-bold">Programme de fidélité</h2>
      <label className="mb-4 flex items-center justify-between rounded-xl border border-border p-3 text-sm">
        <span>Activer le programme de fidélité</span>
        <input type="checkbox" checked={enabled} disabled={!canManage} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-primary" />
      </label>
      <div className={cn("grid gap-4 sm:grid-cols-3", !enabled && "opacity-50")}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Montant dépensé par point</span>
          <input type="number" min={0.01} step={0.01} value={earnAmount} disabled={!canManage || !enabled} onChange={(e) => setEarnAmount(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
          <span className="mt-1 block text-xs text-muted-foreground">1 point gagné tous les X dépensés</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valeur d'un point en remise</span>
          <input type="number" min={0} step={0.01} value={redeemValue} disabled={!canManage || !enabled} onChange={(e) => setRedeemValue(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minimum de points échangeables</span>
          <input type="number" min={0} value={minRedeem} disabled={!canManage || !enabled} onChange={(e) => setMinRedeem(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
        </label>
      </div>
      {canManage && (
        <button onClick={save} disabled={update.isPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          <Save className="h-4 w-4" /> Enregistrer
        </button>
      )}
    </div>
  );
}
