// Paramètres ZegERP (Frontend Phase 10 — module Administration, migration
// 060) : dépôt par défaut, préfixes de numérotation facture/devis, mois de
// début d'exercice fiscal. Écriture réservée owner/manager côté RLS ;
// accountant a un accès lecture seule (numérotation + clôture fiscale).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, AlertCircle, CheckCircle2, Settings } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { useErpSettings, useUpdateErpSettings } from "@/lib/data/erpSettingsHooks";
import { useErpWarehouses } from "@/lib/data/erpHooks";

export const Route = createFileRoute("/app/erp/parametres")({
  component: ErpParametresPage,
});

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function ErpParametresPage() {
  const { data: myRole } = useMyRole();
  const canWrite = myRole === "owner" || myRole === "manager";
  const { data: settings, isLoading } = useErpSettings();
  const { data: warehouses = [] } = useErpWarehouses();
  const update = useUpdateErpSettings();

  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("FAC-");
  const [quotePrefix, setQuotePrefix] = useState("DEV-");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDefaultWarehouseId(settings.default_warehouse_id ?? "");
    setInvoicePrefix(settings.invoice_prefix);
    setQuotePrefix(settings.quote_prefix);
    setFiscalYearStartMonth(settings.fiscal_year_start_month);
  }, [settings]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        default_warehouse_id: defaultWarehouseId || null,
        invoice_prefix: invoicePrefix.trim() || "FAC-",
        quote_prefix: quotePrefix.trim() || "DEV-",
        fiscal_year_start_month: fiscalYearStartMonth,
      });
      setSaved(true);
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer les réglages."); }
  };

  return (
    <div>
      <PageHeader title="Paramètres ZegERP" subtitle="Dépôt par défaut, numérotation et exercice fiscal" />
      <div className="p-5 sm:p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-5">
          {isLoading ? (
            <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Settings className="h-4 w-4 text-primary" /> Réglages généraux
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dépôt par défaut</span>
                <select value={defaultWarehouseId} onChange={(e) => setDefaultWarehouseId(e.target.value)} disabled={!canWrite}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60">
                  <option value="">— Aucun —</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">Pré-sélectionné dans les écrans POS et réceptions.</p>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Préfixe facture</span>
                  <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} disabled={!canWrite}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Préfixe devis</span>
                  <input value={quotePrefix} onChange={(e) => setQuotePrefix(e.target.value)} disabled={!canWrite}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Début d'exercice fiscal</span>
                <select value={fiscalYearStartMonth} onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))} disabled={!canWrite}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">Référence pour la génération des périodes comptables.</p>
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}
              {saved && !error && (
                <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-xs text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /><span>Réglages enregistrés.</span>
                </div>
              )}

              {canWrite ? (
                <button onClick={save} disabled={update.isPending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                  {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">Lecture seule — seuls le propriétaire et les gestionnaires peuvent modifier ces réglages.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
