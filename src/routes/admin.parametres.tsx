import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Save, FileText, Package } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PLANS } from "@/lib/mock/subscription";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/parametres")({
  component: AdminParametres,
});

function AdminParametres() {
  const [tab, setTab] = useState<"plans" | "landing">("plans");

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Configuration globale de la plateforme" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {([
            { k: "plans" as const, label: "Formules & tarifs", icon: Package },
            { k: "landing" as const, label: "Contenu landing", icon: FileText },
          ]).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "plans" && (
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <input defaultValue={plan.name} className="font-display text-lg font-bold bg-transparent outline-none border-b border-transparent focus:border-primary" />
                  {plan.recommended && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Populaire</span>}
                </div>
                <div className="space-y-3">
                  <PriceField label="Prix mensuel" defaultValue={plan.price_month} />
                  <PriceField label="Prix annuel (-20%)" defaultValue={Math.round(plan.price_month * 12 * 0.8)} />
                  <PriceField label="Prix Lifetime" defaultValue={plan.price_month * 24} />
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fonctionnalités incluses</div>
                  <div className="space-y-1.5">
                    {plan.features.map((f, i) => (
                      <input key={i} defaultValue={f} className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
                    ))}
                  </div>
                </div>
                <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground hover:opacity-90">
                  <Save className="h-3.5 w-3.5" /> Enregistrer
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "landing" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4">
              <div className="font-display text-lg font-bold">Contenu de la landing</div>
              <div className="text-xs text-muted-foreground">Textes clés visibles sur la page d'accueil publique.</div>
            </div>
            <div className="grid gap-4">
              <TextField label="Titre principal (Hero)" defaultValue="La caisse moderne pour vos boutiques." />
              <TextField label="Sous-titre" defaultValue="Point de vente tactile, stock intelligent, rapports IA et paiement mobile money — tout dans une seule application, pensée pour les commerçants d'Afrique de l'Ouest." multiline />
              <TextField label="CTA principal" defaultValue="Essayer 14 jours gratuits" />
              <TextField label="Titre section IA" defaultValue="Posez une question. Obtenez la réponse." />
              <TextField label="Titre tarifs" defaultValue="Une formule pour chaque commerce." />
              <TextField label="Email de contact" defaultValue="contact@novacaisse.bj" />
            </div>
            <button className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              <Save className="h-4 w-4" /> Publier les modifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceField({ label, defaultValue }: { label: string; defaultValue: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <input type="number" defaultValue={defaultValue}
          className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 pr-12 text-sm font-semibold outline-none focus:border-primary" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">FCFA</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">≈ {formatXOF(defaultValue)}</div>
    </label>
  );
}

function TextField({ label, defaultValue, multiline }: { label: string; defaultValue: string; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {multiline
        ? <textarea rows={3} defaultValue={defaultValue} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        : <input defaultValue={defaultValue} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      }
    </label>
  );
}
