// Page dédiée aux formules (Phase 4, restructuration compte/établissements)
// — remplace l'onglet "Formules & tarifs" qui vivait dans admin.parametres.tsx
// (Phase 3). L'application (ZegCaisse/ZegHotel) se choisit en changeant
// d'onglet, pas via un <select> sur chaque formule : une formule est créée
// directement avec le bon app_module et ne le change jamais ensuite (moins
// d'erreur de saisie qu'un sélecteur modifiable après coup).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Plus, Trash2, Loader2, Star } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { usePlans, useUpsertPlan, useDeletePlan, getModulesForApp, type Plan } from "@/lib/data/adminHooks";
import { formatXOF } from "@/lib/mock/catalog";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/admin/formules")({
  component: AdminFormules,
});

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "formule";

const APP_TABS: { k: "pos" | "hotel"; label: string }[] = [
  { k: "pos", label: "ZegCaisse" },
  { k: "hotel", label: "ZegHotel" },
];

function AdminFormules() {
  const [appTab, setAppTab] = useState<"pos" | "hotel">("pos");
  const { data: plans = [], isLoading } = usePlans();
  const [creating, setCreating] = useState(false);

  const tabPlans = plans.filter((p) => p.app_module === appTab);
  // Formules créées avant ce chantier (aucune interface pour saisir
  // app_module) — jamais mélangées silencieusement dans un onglet, montrées
  // à part le temps qu'elles soient assignées une fois pour toutes.
  const unassigned = plans.filter((p) => p.app_module == null);

  return (
    <div>
      <PageHeader title="Formules" subtitle="Catalogue des formules, par application"
        actions={
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle formule
          </button>
        }
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {APP_TABS.map((t) => (
            <button key={t.k} onClick={() => { setAppTab(t.k); setCreating(false); }}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                appTab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {creating && <PlanCard plan={null} appModule={appTab} onDoneCreating={() => setCreating(false)} />}
            {tabPlans.length === 0 && !creating && (
              <div className="col-span-full rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                Aucune formule {appTab === "pos" ? "ZegCaisse" : "ZegHotel"} pour l'instant.
              </div>
            )}
            {tabPlans.map((plan) => <PlanCard key={plan.id} plan={plan} appModule={appTab} />)}
          </div>
        )}

        {unassigned.length > 0 && (
          <div className="rounded-2xl border border-dashed border-warning/40 bg-warning/5 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Non assignées à une application (formules créées avant ce chantier)
            </div>
            <div className="space-y-2">
              {unassigned.map((p) => <UnassignedPlanRow key={p.id} plan={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UnassignedPlanRow({ plan }: { plan: Plan }) {
  const upsert = useUpsertPlan();
  const [saving, setSaving] = useState<"pos" | "hotel" | null>(null);

  const assign = async (app_module: "pos" | "hotel") => {
    setSaving(app_module);
    try {
      await upsert.mutateAsync({ id: plan.id, name: plan.name, app_module });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
      <span className="font-semibold">{plan.name}</span>
      <div className="flex gap-2">
        <button onClick={() => assign("pos")} disabled={saving !== null}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
          {saving === "pos" && <Loader2 className="h-3 w-3 animate-spin" />} Assigner à ZegCaisse
        </button>
        <button onClick={() => assign("hotel")} disabled={saving !== null}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
          {saving === "hotel" && <Loader2 className="h-3 w-3 animate-spin" />} Assigner à ZegHotel
        </button>
      </div>
    </div>
  );
}

function PlanCard({ plan, appModule, onDoneCreating }: {
  plan: Plan | null; appModule: "pos" | "hotel"; onDoneCreating?: () => void;
}) {
  const upsert = useUpsertPlan();
  const remove = useDeletePlan();
  const isNew = plan === null;
  const planModules = getModulesForApp(appModule);

  const [name, setName] = useState(plan?.name ?? "");
  const [priceMonth, setPriceMonth] = useState(plan?.price_month ?? 0);
  const [priceYear, setPriceYear] = useState(plan?.price_year ?? 0);
  const [features, setFeatures] = useState<string[]>(plan?.features ?? []);
  const [newFeature, setNewFeature] = useState("");
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [isRecommended, setIsRecommended] = useState(plan?.is_recommended ?? false);
  // Vide = illimité (null en base) — distinct de 0, contrairement à
  // limits.ai_credits ci-dessous qui garde sa convention 0 = illimité.
  const [maxEstablishments, setMaxEstablishments] = useState(
    plan?.max_establishments != null ? String(plan.max_establishments) : "",
  );
  const [maxUsers, setMaxUsers] = useState(plan?.max_users != null ? String(plan.max_users) : "");
  const [aiCredits, setAiCredits] = useState(plan?.limits.ai_credits ?? 0);
  // Un plan sans `modules` défini = tout inclus (rétrocompatible) — l'état
  // local part alors de la liste complète cochée, pour que décocher une
  // case retire bien ce module plutôt que de créer une liste à un élément.
  const allModuleUrls = planModules.map((m) => m.url);
  const [modules, setModules] = useState<string[]>(
    plan?.limits.modules?.length ? plan.limits.modules : allModuleUrls,
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (plan) {
      setName(plan.name); setPriceMonth(plan.price_month); setPriceYear(plan.price_year);
      setFeatures(plan.features); setIsActive(plan.is_active); setIsRecommended(plan.is_recommended);
      setMaxEstablishments(plan.max_establishments != null ? String(plan.max_establishments) : "");
      setMaxUsers(plan.max_users != null ? String(plan.max_users) : "");
      setAiCredits(plan.limits.ai_credits ?? 0);
      setModules(plan.limits.modules?.length ? plan.limits.modules : allModuleUrls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const toggleModule = (url: string) => {
    setModules((ms) => ms.includes(url) ? ms.filter((m) => m !== url) : [...ms, url]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({
        id: isNew ? slugify(name) : plan!.id,
        name, price_month: priceMonth, price_year: priceYear,
        features, is_active: isActive, is_recommended: isRecommended,
        currency: plan?.currency ?? "XOF",
        // Fixé par l'onglet actif à la création, jamais modifiable ensuite
        // (une formule ne change jamais d'application).
        app_module: plan?.app_module ?? appModule,
        max_establishments: maxEstablishments.trim() === "" ? null : Number(maxEstablishments),
        max_users: maxUsers.trim() === "" ? null : Number(maxUsers),
        limits: {
          // Nova IA n'a de sens que côté ZegCaisse aujourd'hui.
          ai_credits: appModule === "pos" ? (aiCredits || undefined) : undefined,
          modules: modules.length === allModuleUrls.length ? undefined : modules,
        },
        sort_order: plan?.sort_order ?? 99,
      });
      if (isNew) onDoneCreating?.();
    } catch (e: any) {
      alert("Erreur enregistrement formule : " + (e?.message ?? "inconnue"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-5", isActive ? "border-border" : "border-border opacity-60")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la formule"
          className="min-w-0 flex-1 border-b border-transparent bg-transparent font-display text-lg font-bold outline-none focus:border-primary" />
        <button onClick={() => setIsRecommended((v) => !v)} title="Marquer comme recommandée"
          className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", isRecommended ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted")}>
          <Star className="h-3.5 w-3.5" fill={isRecommended ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-3">
        <PriceField label="Prix mensuel" value={priceMonth} onChange={setPriceMonth} />
        <PriceField label="Prix annuel" value={priceYear} onChange={setPriceYear} />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fonctionnalités incluses</div>
        <div className="space-y-1.5">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={f} onChange={(e) => setFeatures((fs) => fs.map((x, j) => j === i ? e.target.value : x))}
                className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
              <button onClick={() => setFeatures((fs) => fs.filter((_, j) => j !== i))} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input value={newFeature} onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newFeature.trim()) { setFeatures((fs) => [...fs, newFeature.trim()]); setNewFeature(""); } }}
              placeholder="Ajouter une fonctionnalité…"
              className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
            <button onClick={() => { if (newFeature.trim()) { setFeatures((fs) => [...fs, newFeature.trim()]); setNewFeature(""); } }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Établissements max</span>
          <input type="number" onFocus={selectOnFocus} min={0} value={maxEstablishments}
            onChange={(e) => setMaxEstablishments(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Vide = illimité"
            className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comptes max</span>
          <input type="number" onFocus={selectOnFocus} min={0} value={maxUsers}
            onChange={(e) => setMaxUsers(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Vide = illimité"
            className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        {appModule === "pos" && (
          <label className="col-span-2 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Crédits IA / mois</span>
            <input type="number" onFocus={selectOnFocus} min={0} value={aiCredits} onChange={(e) => setAiCredits(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0 = illimité"
              className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
          </label>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modules inclus</div>
        <div className="grid grid-cols-2 gap-1.5">
          {planModules.map((m) => (
            <label key={m.url} className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1.5 text-xs">
              <input type="checkbox" checked={modules.includes(m.url)}
                onChange={() => toggleModule(m.url)} className="h-3.5 w-3.5 accent-primary" />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-xs">
        <span>Formule active (visible sur /tarifs)</span>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-primary" />
      </label>

      <div className="mt-5 flex gap-2">
        {isNew ? (
          <button onClick={onDoneCreating} className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold">Annuler</button>
        ) : confirmDelete ? (
          <button onClick={() => remove.mutate(plan!.id)} className="flex-1 rounded-xl bg-destructive py-2 text-xs font-bold text-destructive-foreground">Confirmer la suppression</button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
        <button onClick={save} disabled={!name || saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Enregistrer
        </button>
      </div>
    </div>
  );
}

function PriceField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <input type="number" onFocus={selectOnFocus} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="tabular w-full rounded-lg border border-border bg-background px-2.5 py-1.5 pr-12 text-sm font-semibold outline-none focus:border-primary" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">FCFA</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">≈ {formatXOF(value)}</div>
    </label>
  );
}
