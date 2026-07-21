import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Tag, Percent, Gift, Trophy, Sparkles, Edit3, Trash2, X, Save } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { LOYALTY_TIERS } from "@/lib/mock/promotions";
import { usePromotions, useUpsertPromotion, useDeletePromotion, useMyRole, formatXOF, type Promotion } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/promotions")({
  component: PromotionsPage,
});

function PromotionsPage() {
  const [tab, setTab] = useState<"promos" | "loyalty">("promos");
  const { data: promos = [], isLoading } = usePromotions();
  const upsert = useUpsertPromotion();
  const remove = useDeletePromotion();
  const [edit, setEdit] = useState<Partial<Promotion> | null>(null);
  const [del, setDel] = useState<Promotion | null>(null);
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager"; // cashier/accountant : lecture seule

  const active = promos.filter((p) => p.is_active).length;

  return (
    <div>
      <PageHeader
        title="Promotions & Fidélité"
        subtitle="Remises, offres et programme client"
        actions={canManage && (
          <button onClick={() => setEdit({ name: "", kind: "percent", value: 10, is_active: true })} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle promotion
          </button>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Promotions actives" value={String(active)} icon={<Tag className="h-5 w-5" />} accent="primary" />
          <StatCard label="Total promotions" value={String(promos.length)} icon={<Sparkles className="h-5 w-5" />} accent="accent" />
          <StatCard label="Paliers fidélité" value={String(LOYALTY_TIERS.length)} icon={<Trophy className="h-5 w-5" />} accent="success" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["promos", "loyalty"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "promos" ? "Promotions" : "Programme fidélité"}
            </button>
          ))}
        </div>

        {tab === "promos" ? (
          isLoading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : promos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucune promotion. Créez-en une pour offrir des remises.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {promos.map((p) => (
                <div key={p.id} className={cn("rounded-2xl border p-4 transition-shadow hover:shadow-elegant", p.is_active ? "border-primary/40 bg-card" : "border-border bg-card opacity-70")}>
                  <div className="flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent/40 to-accent/10 text-accent-foreground">
                      {p.kind === "percent" ? <Percent className="h-5 w-5" /> : p.kind === "bogo" ? <Gift className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", p.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{p.is_active ? "Active" : "Inactive"}</span>
                      {canManage && (
                        <>
                          <button onClick={() => setEdit(p)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setDel(p)} className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 font-display text-lg font-bold">{p.name}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Valeur</div>
                      <div className="tabular font-bold text-primary">
                        {p.kind === "percent" ? `-${p.value}%` : p.kind === "fixed" ? formatXOF(Number(p.value)) : `${p.value + 1} pour ${p.value}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Type</div>
                      <div className="font-semibold uppercase">{p.kind}</div>
                    </div>
                  </div>
                  {(p.starts_at || p.ends_at) && (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {p.starts_at ? `Du ${new Date(p.starts_at).toLocaleDateString("fr-FR")}` : ""} {p.ends_at ? `au ${new Date(p.ends_at).toLocaleDateString("fr-FR")}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {LOYALTY_TIERS.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground shadow-glow" style={{ backgroundColor: t.color }}>
                  <Trophy className="h-6 w-6" />
                </div>
                <div className="mt-3 font-display text-xl font-bold">{t.name}</div>
                <div className="tabular text-xs text-muted-foreground">À partir de {t.min_points} pts</div>
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">{t.perk}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <PromoDialog initial={edit} onClose={() => setEdit(null)}
            onSave={async (p) => { await upsert.mutateAsync(p); setEdit(null); }} />
        )}
        {del && (
          <ConfirmDialog title={`Supprimer « ${del.name} » ?`} onClose={() => setDel(null)}
            onConfirm={async () => { await remove.mutateAsync(del.id); setDel(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-md" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", w)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function PromoDialog({ initial, onClose, onSave }: { initial: Partial<Promotion>; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Promotion>>(initial);
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{initial.id ? "Modifier promo" : "Nouvelle promotion"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Type</div><select value={form.kind ?? "percent"} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inp}>
            <option value="percent">Pourcentage</option><option value="fixed">Montant fixe</option><option value="bogo">Offert (BOGO)</option>
          </select></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Valeur</div><input type="number" value={form.value ?? 0} onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Début</div><input type="date" value={form.starts_at?.slice(0,10) ?? ""} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} className={inp} /></label>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Fin</div><input type="date" value={form.ends_at?.slice(0,10) ?? ""} onChange={(e) => setForm({ ...form, ends_at: e.target.value || null })} className={inp} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Promotion active</label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
          <button disabled={!form.name} onClick={() => onSave(form)} className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            <Save className="h-4 w-4" /> Enregistrer
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
