// Module Clients ZegHotel (Phase 2) — vue CRM des hotel_guests indépendante
// d'une réservation particulière : historique des séjours, total dépensé,
// dernière visite (hotel_guest_summary(), migration 029). Accessible à
// owner/manager/front_desk (accountant/housekeeping n'ont plus accès aux
// données d'identité depuis le durcissement RLS de la Phase 1, migration
// 028 — masqué dans la nav pour eux, cf. AppSidebar.tsx/BottomNav.tsx).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus, Phone, Mail, MapPin, X, IdCard, CalendarDays, Save, Trash2, Edit3, Loader2, BedDouble } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney } from "@/lib/data/hooks";
import {
  useHotelGuests, useUpsertHotelGuest, useDeleteHotelGuest, useHotelGuestSummaries, useHotelGuestStays,
  type HotelGuest,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/clients")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: HotelClientsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "À venir", confirmed: "Confirmée", checked_in: "En cours",
  checked_out: "Terminé", cancelled: "Annulée", no_show: "No-show",
};

function HotelClientsPage() {
  const formatMoney = useFormatMoney();
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [selected, setSelected] = useState<HotelGuest | null>(null);
  const [edit, setEdit] = useState<Partial<HotelGuest> | null>(null);
  const [del, setDel] = useState<HotelGuest | null>(null);

  const { data: guests = [], isLoading } = useHotelGuests(query);
  const { data: summaries = {} } = useHotelGuestSummaries();
  const upsert = useUpsertHotelGuest();
  const remove = useDeleteHotelGuest();

  const totalSpent = Object.values(summaries).reduce((s, g) => s + g.total_spent, 0);
  const totalStays = Object.values(summaries).reduce((s, g) => s + g.total_stays, 0);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${guests.length} client${guests.length > 1 ? "s" : ""} — historique des séjours et coordonnées`}
        actions={
          <button onClick={() => setEdit({ full_name: "" })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouveau client
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Clients" value={String(guests.length)} icon={<IdCard className="h-5 w-5" />} accent="primary" />
          <StatCard label="Séjours (hors annulés)" value={String(totalStays)} icon={<BedDouble className="h-5 w-5" />} accent="accent" />
          <StatCard label="Total facturé" value={formatMoney(totalSpent)} icon={<CalendarDays className="h-5 w-5" />} accent="success" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, téléphone, email…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : guests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="text-sm text-muted-foreground">Aucun client pour l'instant.</div>
            <button onClick={() => setEdit({ full_name: "" })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {guests.map((g) => {
              const summary = summaries[g.id];
              return (
                <div key={g.id} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-elegant">
                  <div className="flex items-start gap-3">
                    <button onClick={() => setSelected(g)} className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
                      {g.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </button>
                    <button onClick={() => setSelected(g)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-semibold">{g.full_name}</div>
                      <div className="text-xs text-muted-foreground">{g.phone ?? g.email ?? "—"}</div>
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => setEdit(g)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => setDel(g)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
                    <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Séjours</div><div className="tabular text-sm font-bold">{summary?.total_stays ?? 0}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total facturé</div><div className="tabular text-sm font-bold text-success">{formatMoney(summary?.total_spent ?? 0)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && <GuestDetailModal guest={selected} onClose={() => setSelected(null)} />}
      {edit && (
        <GuestDialog initial={edit} onClose={() => setEdit(null)}
          onSave={async (g) => { await upsert.mutateAsync(g as any); setEdit(null); }} />
      )}
      {del && (
        <ConfirmDialog title={`Supprimer ${del.full_name} ?`} onClose={() => setDel(null)}
          onConfirm={async () => {
            try { await remove.mutateAsync(del.id); setDel(null); }
            catch (e: any) { alert(e?.message?.includes("foreign key") ? "Ce client a un historique de réservations, suppression impossible." : (e?.message ?? "Erreur")); }
          }} />
      )}
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </div>
    </div>
  );
}

function GuestDetailModal({ guest, onClose }: { guest: HotelGuest; onClose: () => void }) {
  const formatMoney = useFormatMoney();
  const { data: stays = [], isLoading } = useHotelGuestStays(guest.id);

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-sm font-bold text-primary-foreground">
            {guest.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-tight">{guest.full_name}</div>
            {guest.nationality && <div className="text-xs text-muted-foreground">{guest.nationality}</div>}
          </div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {guest.phone && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {guest.phone}</div>}
          {guest.email && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {guest.email}</div>}
          {guest.address && <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm sm:col-span-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {guest.address}</div>}
          {guest.id_document_type && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm sm:col-span-2">
              <IdCard className="h-4 w-4 text-muted-foreground" /> {guest.id_document_type}{guest.id_document_number ? ` — ${guest.id_document_number}` : ""}
            </div>
          )}
          {guest.date_of_birth && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Né(e) le {new Date(guest.date_of_birth).toLocaleDateString("fr-FR")}
            </div>
          )}
        </div>

        {guest.notes && <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{guest.notes}</div>}

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <BedDouble className="h-3.5 w-3.5" /> Historique des séjours
          </div>
          {isLoading ? (
            <div className="grid place-items-center rounded-xl border border-border bg-card p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : stays.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">Aucun séjour pour l'instant.</div>
          ) : (
            <div className="space-y-2">
              {stays.map((s) => (
                <div key={s.reservation_id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">
                      {new Date(s.check_in).toLocaleDateString("fr-FR")}
                      {s.billing_unit === "night" && s.check_out !== s.check_in ? ` → ${new Date(s.check_out).toLocaleDateString("fr-FR")}` : ""}
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      s.status === "checked_out" && "bg-success/15 text-success",
                      s.status === "cancelled" && "bg-destructive/15 text-destructive",
                      s.status === "no_show" && "bg-destructive/15 text-destructive",
                      (s.status === "pending" || s.status === "confirmed" || s.status === "checked_in") && "bg-accent/20 text-accent-foreground",
                    )}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{s.billing_unit === "hour" ? "Formule horaire" : "Nuitée"}</span>
                    <span className="tabular font-bold text-foreground">{formatMoney(s.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function GuestDialog({ initial, onClose, onSave }: { initial: Partial<HotelGuest>; onClose: () => void; onSave: (g: Partial<HotelGuest> & { full_name: string }) => Promise<void> }) {
  const [form, setForm] = useState<Partial<HotelGuest>>(initial);
  const [saving, setSaving] = useState(false);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial.id ? "Modifier client" : "Nouveau client"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom complet *</div><input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Email</div><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nationalité</div><input value={form.nationality ?? ""} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Date de naissance</div><input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value || null })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Type de pièce</div>
          <select value={form.id_document_type ?? ""} onChange={(e) => setForm({ ...form, id_document_type: e.target.value || null })} className={inp}>
            <option value="">—</option>
            <option value="CNI">CNI</option>
            <option value="Passeport">Passeport</option>
            <option value="Permis de conduire">Permis de conduire</option>
            <option value="Autre">Autre</option>
          </select>
        </label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">N° de pièce</div><input value={form.id_document_number ?? ""} onChange={(e) => setForm({ ...form, id_document_number: e.target.value })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Adresse</div><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex gap-2 pt-1 sm:col-span-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.full_name?.trim() || saving}
            onClick={async () => { setSaving(true); try { await onSave(form as Partial<HotelGuest> & { full_name: string }); } finally { setSaving(false); } }}
            className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onClose} w="max-w-sm">
      <div className="p-6">
        <div className="font-display text-lg font-bold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">Supprimer</button>
        </div>
      </div>
    </Overlay>
  );
}
