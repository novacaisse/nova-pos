import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store, Coins, Receipt, ArrowLeftRight, Save, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SHOPS } from "@/lib/mock/session";
import { PRODUCTS, formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/parametres")({
  component: ParametresPage,
});

function ParametresPage() {
  const [tab, setTab] = useState<"shop" | "currency" | "taxes" | "transfer">("shop");

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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom" defaultValue={SHOPS[0].name} />
                <Field label="Ville" defaultValue={SHOPS[0].city} />
                <Field label="Téléphone" defaultValue="+229 21 30 40 50" />
                <Field label="Email" defaultValue="contact@novacaisse.bj" />
                <Field label="Adresse" defaultValue="Rue 12.345, Cotonou" className="sm:col-span-2" />
                <Field label="Numéro fiscal (IFU)" defaultValue="3202400123456" />
                <Field label="Devise" defaultValue="FCFA (XOF)" disabled />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Boutiques multiples</div>
                  <button className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3 w-3" /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {SHOPS.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Store className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.city} · Plan {s.plan}</div>
                      </div>
                      <button className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:underline">Modifier</button>
                    </div>
                  ))}
                </div>
              </div>

              <button className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <Save className="h-4 w-4" /> Enregistrer
              </button>
            </div>
          )}

          {tab === "currency" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Devise et affichage</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Devise principale" options={["FCFA (XOF)", "EUR", "USD", "GHS", "NGN"]} />
                <SelectField label="Position du symbole" options={["Après (500 F)", "Avant ($ 500)"]} />
                <SelectField label="Séparateur milliers" options={["Espace (10 000)", "Virgule (10,000)", "Point (10.000)"]} />
                <Field label="Décimales" defaultValue="0" type="number" />
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
                      <th className="px-3 py-2">Nom</th>
                      <th className="px-3 py-2 text-right">Taux</th>
                      <th className="px-3 py-2">Portée</th>
                      <th className="px-3 py-2">Statut</th>
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

          {tab === "transfer" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Transfert de stock entre boutiques</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Depuis" options={SHOPS.map((s) => s.name)} />
                <SelectField label="Vers" options={SHOPS.map((s) => s.name)} />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produits à transférer</div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {PRODUCTS.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-base">{p.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">Stock actuel : {p.stock} · {formatXOF(p.price)}</div>
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

function Field({ label, className, ...props }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
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
