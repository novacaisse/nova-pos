// Canaux de distribution ZegHotel (Phase 8) — hotel_channels existait déjà
// depuis 020g ("structure seule, hors scope V1"). Décision produit
// confirmée avec Emmanuel : pas de vraie intégration API (Booking.com,
// Expedia, etc.) dans cette phase — uniquement une gestion manuelle par
// canal (nom, notes, tarif spécifique optionnel saisi à la main).
// Aucun rattachement réservation ↔ canal ici : ça attendra l'intégration
// réelle.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Radio, Plus, X, Trash2, Save, Loader2, Info } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import { useHotelChannels, useUpsertHotelChannel, useDeleteHotelChannel, type HotelChannel } from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/canaux")({
  component: ChannelsPage,
});

function ChannelsPage() {
  const formatMoney = useFormatMoney();
  const { data: channels = [], isLoading } = useHotelChannels();
  const upsert = useUpsertHotelChannel();
  const remove = useDeleteHotelChannel();
  const [edit, setEdit] = useState<Partial<HotelChannel> | null>(null);

  return (
    <div>
      <PageHeader
        title="Canaux de distribution"
        subtitle="Booking.com, Expedia, agences... — suivi manuel, sans synchronisation automatique"
        actions={
          <button onClick={() => setEdit({ name: "", is_active: true })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau canal
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          Gestion manuelle des canaux : aucune synchronisation automatique des réservations ou des tarifs.
          Renseignez ici les canaux que vous utilisez, avec un tarif spécifique éventuel à appliquer manuellement lors de la saisie d'une réservation issue de ce canal.
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Radio className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-40" />
            <div className="text-sm text-muted-foreground">Aucun canal enregistré pour l'instant.</div>
            <button onClick={() => setEdit({ name: "", is_active: true })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {channels.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <Radio className="h-4 w-4 shrink-0 text-muted-foreground" /> {c.name}
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        c.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                        {c.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                    {c.external_id && <div className="mt-0.5 truncate text-xs text-muted-foreground">Réf. externe : {c.external_id}</div>}
                    {c.manual_rate != null && <div className="mt-0.5 text-xs text-muted-foreground">Tarif spécifique : <span className="font-semibold text-foreground">{formatMoney(c.manual_rate)}</span></div>}
                    {c.notes && <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">{c.notes}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setEdit(c)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Save className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm(`Supprimer le canal ${c.name} ?`)) remove.mutate(c.id); }} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <ChannelDialog initial={edit} onClose={() => setEdit(null)}
          onSave={async (c) => { await upsert.mutateAsync(c); setEdit(null); }} />
      )}
    </div>
  );
}

function ChannelDialog({ initial, onClose, onSave }: {
  initial: Partial<HotelChannel>; onClose: () => void; onSave: (c: Partial<HotelChannel> & { name: string }) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<HotelChannel>>(initial);
  const [saving, setSaving] = useState(false);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">{initial.id ? "Modifier le canal" : "Nouveau canal"}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom du canal *</div><input placeholder="Ex. Booking.com" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Réf. / identifiant externe</div><input value={form.external_id ?? ""} onChange={(e) => setForm({ ...form, external_id: e.target.value })} className={inp} /></label>
          <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tarif spécifique (optionnel)</div><input type="number" onFocus={selectOnFocus} value={form.manual_rate ?? ""} onChange={(e) => setForm({ ...form, manual_rate: e.target.value === "" ? null : Number(e.target.value) })} className={inp} /></label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-border" />
            <span className="text-xs font-semibold uppercase text-muted-foreground">Canal actif</span>
          </label>
          <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={3} placeholder="Conditions, commission, contact..." value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          <div className="flex gap-2 pt-1 sm:col-span-2">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button disabled={!form.name?.trim() || saving}
              onClick={async () => { setSaving(true); try { await onSave(form as Partial<HotelChannel> & { name: string }); } finally { setSaving(false); } }}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
