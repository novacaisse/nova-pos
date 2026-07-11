import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Truck, Phone, Mail, FileText, PackageCheck, Edit3, Trash2, X, Save } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useSuppliers, useUpsertSupplier, useDeleteSupplier, formatXOF, type Supplier } from "@/lib/data/hooks";
import { PURCHASE_ORDERS, type PurchaseOrder } from "@/lib/mock/suppliers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/fournisseurs")({
  component: FournisseursPage,
});

const STATUS_COLOR: Record<PurchaseOrder["status"], string> = {
  brouillon: "bg-muted text-muted-foreground",
  envoyée: "bg-primary/15 text-primary",
  reçue: "bg-success/15 text-success",
  partielle: "bg-warning/20 text-warning-foreground",
  annulée: "bg-destructive/15 text-destructive",
};

function FournisseursPage() {
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  const [del, setDel] = useState<Supplier | null>(null);
  const { data: suppliers = [], isLoading } = useSuppliers();
  const upsert = useUpsertSupplier();
  const remove = useDeleteSupplier();

  const pending = PURCHASE_ORDERS.filter((p) => p.status === "envoyée" || p.status === "partielle").length;

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        subtitle="Partenaires et bons de commande"
        actions={
          <>
            <button onClick={() => setEdit({ name: "" })} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Nouveau fournisseur</button>
            <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><FileText className="h-4 w-4" /> Bon de commande</button>
          </>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Fournisseurs actifs" value={String(suppliers.length)} icon={<Truck className="h-5 w-5" />} accent="primary" />
          <StatCard label="Commandes en cours (démo)" value={String(pending)} icon={<PackageCheck className="h-5 w-5" />} accent="accent" />
          <StatCard label="À payer (démo)" value={formatXOF(0)} accent="destructive" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["suppliers", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "suppliers" ? "Fournisseurs" : "Bons de commande (démo)"}
            </button>
          ))}
        </div>

        {tab === "suppliers" ? (
          isLoading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : suppliers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <div className="text-sm text-muted-foreground">Aucun fournisseur pour l'instant.</div>
              <button onClick={() => setEdit({ name: "" })} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Ajouter</button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suppliers.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-elegant">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.contact ?? "—"}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEdit(s)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => setDel(s)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    {s.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {s.phone}</div>}
                    {s.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {s.email}</div>}
                    {s.address && <div className="text-muted-foreground">{s.address}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border/60 bg-warning/10 px-4 py-2 text-xs text-warning-foreground">Données de démonstration — les bons de commande ne sont pas encore branchés à Supabase.</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Créé</th>
                  <th className="px-4 py-3">Livraison</th>
                  <th className="px-4 py-3 text-right">Articles</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {PURCHASE_ORDERS.map((o) => (
                  <tr key={o.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{o.ref}</td>
                    <td className="px-4 py-3 font-medium">{o.supplier_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.created_at}</td>
                    <td className="px-4 py-3 text-xs">{o.expected_at}</td>
                    <td className="tabular px-4 py-3 text-right">{o.items_count}</td>
                    <td className="tabular px-4 py-3 text-right font-bold">{formatXOF(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_COLOR[o.status])}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <SupplierDialog
            initial={edit}
            onClose={() => setEdit(null)}
            onSave={async (s) => { await upsert.mutateAsync(s); setEdit(null); }}
          />
        )}
        {del && (
          <ConfirmDialog title={`Supprimer ${del.name} ?`} onClose={() => setDel(null)}
            onConfirm={async () => { await remove.mutateAsync(del.id); setDel(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children, onClose, w = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; w?: string }) {
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

function SupplierDialog({ initial, onClose, onSave }: { initial: Partial<Supplier>; onClose: () => void; onSave: (s: any) => Promise<void> | void }) {
  const [form, setForm] = useState<Partial<Supplier>>(initial);
  const isNew = !initial.id;
  const inp = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">{isNew ? "Nouveau fournisseur" : "Modifier fournisseur"}</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nom *</div><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Contact</div><input value={form.contact ?? ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Téléphone</div><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Email</div><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></label>
        <label><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Adresse</div><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} /></label>
        <label className="sm:col-span-2"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex gap-2 pt-1 sm:col-span-2">
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
