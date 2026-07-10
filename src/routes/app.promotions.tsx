import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Tag, Percent, Gift, Trophy, Sparkles } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { PROMOTIONS, LOYALTY_TIERS } from "@/lib/mock/promotions";
import { formatXOF } from "@/lib/mock/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/promotions")({
  component: PromotionsPage,
});

function PromotionsPage() {
  const [tab, setTab] = useState<"promos" | "loyalty">("promos");

  const active = PROMOTIONS.filter((p) => p.active).length;
  const totalUses = PROMOTIONS.reduce((s, p) => s + p.uses, 0);

  return (
    <div>
      <PageHeader
        title="Promotions & Fidélité"
        subtitle="Remises, offres et programme client"
        actions={
          <button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle promotion
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Promotions actives" value={String(active)} icon={<Tag className="h-5 w-5" />} accent="primary" />
          <StatCard label="Utilisations totales" value={String(totalUses)} icon={<Sparkles className="h-5 w-5" />} accent="accent" />
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PROMOTIONS.map((p) => (
              <div key={p.id} className={cn("rounded-2xl border p-4 transition-shadow hover:shadow-elegant", p.active ? "border-primary/40 bg-card" : "border-border bg-card opacity-70")}>
                <div className="flex items-start justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent/40 to-accent/10 text-accent-foreground">
                    {p.kind === "percent" ? <Percent className="h-5 w-5" /> : p.kind === "bogo" ? <Gift className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", p.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-3 font-display text-lg font-bold">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.scope === "categorie" ? `Catégorie · ${p.target}` : p.scope === "produit" ? `Produit · ${p.target}` : "Sur panier"}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Valeur</div>
                    <div className="tabular font-bold text-primary">
                      {p.kind === "percent" ? `-${p.value}%` : p.kind === "fixed" ? formatXOF(p.value) : `${p.value + 1} pour ${p.value}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">Utilisations</div>
                    <div className="tabular font-bold">{p.uses}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">Du {p.starts_at} au {p.ends_at}</div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
