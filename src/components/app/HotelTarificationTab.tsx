// Onglet "Tarification Hôtel" dans Paramètres — page dédiée pour que
// owner/manager pilotent seuls toute la tarification ZegHotel (prix de
// base, grilles saisonnières, plans tarifaires, taxe de séjour, devise
// secondaire) et les comptes entreprise, sans dépendre du support.
import { useState } from "react";
import { Plus, Trash2, Loader2, Save, Building2 } from "lucide-react";
import { useFormatMoney } from "@/lib/data/hooks";
import {
  useHotelRoomTypes, useUpsertHotelRoomType,
  useHotelSeasonalRates, useUpsertHotelSeasonalRate, useDeleteHotelSeasonalRate,
  useHotelRatePlans, useUpsertHotelRatePlan, useDeleteHotelRatePlan,
  useHotelSettings, useUpdateHotelSettings,
  useHotelCorporateAccounts, useUpsertHotelCorporateAccount, useDeleteHotelCorporateAccount,
} from "@/lib/data/hotelHooks";

const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function HotelTarificationTab() {
  const formatMoney = useFormatMoney();
  const { data: roomTypes = [] } = useHotelRoomTypes();
  const upsertType = useUpsertHotelRoomType();
  const [prices, setPrices] = useState<Record<string, number>>({});

  const priceFor = (id: string, current: number) => prices[id] ?? current;
  const savePrice = (id: string) => {
    const rt = roomTypes.find((t) => t.id === id);
    if (!rt || prices[id] === undefined || prices[id] === rt.base_price) return;
    upsertType.mutate({ id, name: rt.name, base_price: prices[id] });
  };

  const { data: seasonalRates = [] } = useHotelSeasonalRates();
  const upsertSeasonal = useUpsertHotelSeasonalRate();
  const deleteSeasonal = useDeleteHotelSeasonalRate();
  const [newSeasonal, setNewSeasonal] = useState({ room_type_id: "", name: "", start_date: "", end_date: "", price_override: 0 });

  const { data: ratePlans = [] } = useHotelRatePlans();
  const upsertPlan = useUpsertHotelRatePlan();
  const deletePlan = useDeleteHotelRatePlan();
  const [newPlan, setNewPlan] = useState({ room_type_id: "", name: "", includes_breakfast: false, refundable: true, price_adjustment_pct: 0 });

  const { data: settings } = useHotelSettings();
  const updateSettings = useUpdateHotelSettings();
  const [cityTaxEnabled, setCityTaxEnabled] = useState(settings?.city_tax_enabled ?? false);
  const [cityTaxAmount, setCityTaxAmount] = useState(settings?.city_tax_amount ?? 0);
  const [secondaryCurrency, setSecondaryCurrency] = useState(settings?.secondary_currency ?? "");

  const { data: corporateAccounts = [] } = useHotelCorporateAccounts();
  const upsertCorporate = useUpsertHotelCorporateAccount();
  const deleteCorporate = useDeleteHotelCorporateAccount();
  const [newCorporate, setNewCorporate] = useState({ name: "", contact_name: "", contact_email: "", negotiated_discount_pct: 0 });

  if (roomTypes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Créez d'abord vos types de chambres depuis Hôtel &gt; Chambres pour configurer la tarification.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Prix de base par type de chambre</h2>
        <p className="mb-4 text-xs text-muted-foreground">Prix par nuit, avant tarifs saisonniers ou plans tarifaires.</p>
        <div className="space-y-2">
          {roomTypes.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-border/60 p-3">
              <span className="flex-1 text-sm font-medium">{t.name}</span>
              <input type="number" className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={priceFor(t.id, t.base_price)}
                onChange={(e) => setPrices((p) => ({ ...p, [t.id]: Number(e.target.value) }))} />
              <button onClick={() => savePrice(t.id)} disabled={upsertType.isPending || prices[t.id] === undefined || prices[t.id] === t.base_price}
                className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary disabled:opacity-30"><Save className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Grilles saisonnières</h2>
        <p className="mb-4 text-xs text-muted-foreground">Remplace le prix de base sur une période donnée (haute saison, événements…).</p>
        <div className="mb-3 space-y-2">
          {seasonalRates.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
              <span>{roomTypes.find((t) => t.id === s.room_type_id)?.name ?? "—"} · {s.name || "Sans nom"} · {new Date(s.start_date).toLocaleDateString("fr-FR")} → {new Date(s.end_date).toLocaleDateString("fr-FR")}</span>
              <span className="flex items-center gap-3 font-semibold">{formatMoney(s.price_override ?? 0)}
                <button onClick={() => deleteSeasonal.mutate(s.id)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <select value={newSeasonal.room_type_id} onChange={(e) => setNewSeasonal((s) => ({ ...s, room_type_id: e.target.value }))} className={inp}>
            <option value="">Type…</option>{roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input placeholder="Nom" value={newSeasonal.name} onChange={(e) => setNewSeasonal((s) => ({ ...s, name: e.target.value }))} className={inp} />
          <input type="date" value={newSeasonal.start_date} onChange={(e) => setNewSeasonal((s) => ({ ...s, start_date: e.target.value }))} className={inp} />
          <input type="date" value={newSeasonal.end_date} onChange={(e) => setNewSeasonal((s) => ({ ...s, end_date: e.target.value }))} className={inp} />
          <div className="flex gap-2">
            <input type="number" placeholder="Prix" value={newSeasonal.price_override} onChange={(e) => setNewSeasonal((s) => ({ ...s, price_override: Number(e.target.value) }))} className={inp} />
            <button disabled={!newSeasonal.room_type_id || !newSeasonal.start_date || !newSeasonal.end_date || upsertSeasonal.isPending}
              onClick={() => { upsertSeasonal.mutate(newSeasonal); setNewSeasonal({ room_type_id: "", name: "", start_date: "", end_date: "", price_override: 0 }); }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Plans tarifaires</h2>
        <p className="mb-4 text-xs text-muted-foreground">Ex. « Petit-déjeuner inclus », « Non-remboursable -10% ».</p>
        <div className="mb-3 space-y-2">
          {ratePlans.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
              <span>{roomTypes.find((t) => t.id === p.room_type_id)?.name ?? "—"} · {p.name} {p.includes_breakfast && "· PDJ inclus"} {!p.refundable && "· Non remboursable"}</span>
              <span className="flex items-center gap-3 font-semibold">{p.price_adjustment_pct > 0 ? "+" : ""}{p.price_adjustment_pct}%
                <button onClick={() => deletePlan.mutate(p.id)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <select value={newPlan.room_type_id} onChange={(e) => setNewPlan((s) => ({ ...s, room_type_id: e.target.value }))} className={inp}>
            <option value="">Type…</option>{roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input placeholder="Nom du plan" value={newPlan.name} onChange={(e) => setNewPlan((s) => ({ ...s, name: e.target.value }))} className={inp} />
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={newPlan.includes_breakfast} onChange={(e) => setNewPlan((s) => ({ ...s, includes_breakfast: e.target.checked }))} /> PDJ inclus</label>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={newPlan.refundable} onChange={(e) => setNewPlan((s) => ({ ...s, refundable: e.target.checked }))} /> Remboursable</label>
          <div className="flex gap-2">
            <input type="number" placeholder="% ajust." value={newPlan.price_adjustment_pct} onChange={(e) => setNewPlan((s) => ({ ...s, price_adjustment_pct: Number(e.target.value) }))} className={inp} />
            <button disabled={!newPlan.room_type_id || !newPlan.name.trim() || upsertPlan.isPending}
              onClick={() => { upsertPlan.mutate(newPlan); setNewPlan({ room_type_id: "", name: "", includes_breakfast: false, refundable: true, price_adjustment_pct: 0 }); }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold">Taxe de séjour & devise secondaire</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cityTaxEnabled} onChange={(e) => setCityTaxEnabled(e.target.checked)} /> Taxe de séjour activée</label>
          <input type="number" disabled={!cityTaxEnabled} placeholder="Montant / nuit / pers." value={cityTaxAmount} onChange={(e) => setCityTaxAmount(Number(e.target.value))} className={inp} />
          <input placeholder="Devise secondaire (ex. EUR)" value={secondaryCurrency} onChange={(e) => setSecondaryCurrency(e.target.value.toUpperCase())} className={inp} />
        </div>
        <button onClick={() => updateSettings.mutate({ city_tax_enabled: cityTaxEnabled, city_tax_amount: cityTaxAmount, secondary_currency: secondaryCurrency || null })}
          disabled={updateSettings.isPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold"><Building2 className="h-5 w-5 text-primary" /> Comptes entreprise / groupe</h2>
        <p className="mb-4 text-xs text-muted-foreground">Tarifs négociés pour vos clients entreprise récurrents.</p>
        <div className="mb-3 space-y-2">
          {corporateAccounts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
              <span>{c.name} {c.contact_name && `· ${c.contact_name}`}</span>
              <span className="flex items-center gap-3 font-semibold">-{c.negotiated_discount_pct}%
                <button onClick={() => deleteCorporate.mutate(c.id)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input placeholder="Nom entreprise" value={newCorporate.name} onChange={(e) => setNewCorporate((s) => ({ ...s, name: e.target.value }))} className={inp} />
          <input placeholder="Contact" value={newCorporate.contact_name} onChange={(e) => setNewCorporate((s) => ({ ...s, contact_name: e.target.value }))} className={inp} />
          <input placeholder="Email" value={newCorporate.contact_email} onChange={(e) => setNewCorporate((s) => ({ ...s, contact_email: e.target.value }))} className={inp} />
          <div className="flex gap-2">
            <input type="number" placeholder="Remise %" value={newCorporate.negotiated_discount_pct} onChange={(e) => setNewCorporate((s) => ({ ...s, negotiated_discount_pct: Number(e.target.value) }))} className={inp} />
            <button disabled={!newCorporate.name.trim() || upsertCorporate.isPending}
              onClick={() => { upsertCorporate.mutate(newCorporate); setNewCorporate({ name: "", contact_name: "", contact_email: "", negotiated_discount_pct: 0 }); }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
