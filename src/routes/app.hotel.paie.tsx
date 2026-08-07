// Module Paie ZegHotel (mission "Round 2 ZegHotel", Phase D — scope
// confirmé : version simple, salaire de base par membre + génération de
// bulletin mensuel, PAS de gestion fiscale/cotisations détaillée type
// ZegERP RH, migration 057).
//
// Deux volets : salaires de base (hotel_payroll_profiles, une ligne par
// membre) et bulletins mensuels (hotel_payslips, migration 091) — le
// salaire est figé au moment de la génération d'un bulletin, jamais
// recalculé rétroactivement si le profil change ensuite (même logique que
// hotel_treasury_reconciliations.system_total, migration 090).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Wallet, Printer, Check, Loader2, Trash2, Sparkles } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useFormatMoney, useMyRole, useShopMembers, useShopSettings } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import { renderA4Document, openPrintWindow } from "@/lib/printDoc";
import {
  useHotelPayrollProfiles, useUpsertHotelPayrollProfile,
  useHotelPayslips, useGenerateHotelPayslips, useUpdateHotelPayslip, useDeleteHotelPayslip,
  type HotelPayslip,
} from "@/lib/data/hotelHooks";
import { cn, selectOnFocus } from "@/lib/utils";

export const Route = createFileRoute("/app/hotel/paie")({
  component: HotelPaiePage,
});

const MONTH_LABEL = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function printPayslip(
  memberName: string, month: number, year: number, slip: { base_salary: number; adjustment: number; adjustment_note: string | null; net_total: number },
  org: { name: string; logo_url: string | null } | null,
  settings: { data: { address?: string; phone?: string; ifu?: string } } | null | undefined,
  formatMoney: (n: number) => string,
) {
  const bodyHtml = `
    <div class="doc-parties">
      <div class="block"><h2>Employé</h2><div class="name">${memberName}</div></div>
      <div class="block" style="text-align:right"><h2>Période</h2><div class="name">${MONTH_LABEL[month - 1]} ${year}</div></div>
    </div>
    <div class="doc-totals">
      <div class="row"><span>Salaire de base</span><span>${formatMoney(slip.base_salary)}</span></div>
      ${slip.adjustment !== 0 ? `<div class="row"><span>${slip.adjustment_note || (slip.adjustment > 0 ? "Prime" : "Retenue")}</span><span>${slip.adjustment > 0 ? "+" : ""}${formatMoney(slip.adjustment)}</span></div>` : ""}
      <div class="row total"><span>Net à payer</span><span>${formatMoney(slip.net_total)}</span></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#666">Bulletin simplifié — hors cotisations sociales et retenues fiscales détaillées.</p>`;
  const html = renderA4Document({
    docTitle: "Bulletin de paie",
    docNumber: `${year}-${String(month).padStart(2, "0")}`,
    docDate: new Date().toLocaleDateString("fr-FR"),
    shop: { shopName: org?.name ?? "Organisation", logoUrl: org?.logo_url, address: settings?.data.address, phone: settings?.data.phone, ifu: settings?.data.ifu },
    bodyHtml,
    footerHtml: "Bulletin généré par ZegHotel.",
  });
  openPrintWindow(html, { width: 900, height: 700 });
}

function HotelPaiePage() {
  const formatMoney = useFormatMoney();
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager";
  const { currentOrganization } = useOrganization();
  const { data: settings } = useShopSettings();
  const { data: members = [] } = useShopMembers();
  const { data: profiles = [] } = useHotelPayrollProfiles();
  const upsertProfile = useUpsertHotelPayrollProfile();

  const today = new Date();
  const [periodMonth, setPeriodMonth] = useState(today.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(today.getFullYear());
  const { data: payslips = [], isLoading: loadingSlips } = useHotelPayslips(periodMonth, periodYear);
  const generate = useGenerateHotelPayslips();
  const updateSlip = useUpdateHotelPayslip();
  const removeSlip = useDeleteHotelPayslip();

  const profileByUser = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const slipByUser = useMemo(() => new Map(payslips.map((s) => [s.user_id, s])), [payslips]);
  const memberName = (userId: string) => members.find((m) => m.user_id === userId)?.profile?.full_name ?? "Membre";

  const totalPayrollMonth = payslips.reduce((s, p) => s + p.net_total, 0);
  const paidCount = payslips.filter((p) => p.status === "paid").length;

  const [salaryDraft, setSalaryDraft] = useState<Record<string, number>>({});

  const saveSalary = async (userId: string) => {
    const value = salaryDraft[userId];
    if (value === undefined) return;
    await upsertProfile.mutateAsync({ user_id: userId, base_salary: value });
    setSalaryDraft((prev) => { const next = { ...prev }; delete next[userId]; return next; });
  };

  const generateAll = async () => {
    const withSalary = profiles.filter((p) => p.base_salary > 0);
    await generate.mutateAsync({ periodMonth, periodYear, profiles: withSalary });
  };

  return (
    <div>
      <PageHeader title="Paie" subtitle="Salaires de base et bulletins mensuels — version simplifiée" />
      <div className="space-y-5 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Membres avec salaire" value={String(profiles.filter((p) => p.base_salary > 0).length)} icon={<Users className="h-5 w-5" />} accent="primary" />
          <StatCard label={`Masse salariale — ${MONTH_LABEL[periodMonth - 1]} ${periodYear}`} value={formatMoney(totalPayrollMonth)} icon={<Wallet className="h-5 w-5" />} accent="accent" />
          <StatCard label="Bulletins payés" value={`${paidCount} / ${payslips.length}`} icon={<Check className="h-5 w-5" />} accent="success" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 text-sm font-semibold">Salaires de base</div>
          <div className="space-y-1">
            {members.map((m) => {
              const profile = profileByUser.get(m.user_id);
              const value = salaryDraft[m.user_id] ?? profile?.base_salary ?? 0;
              return (
                <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.profile?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{m.role}</div>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <input type="number" onFocus={selectOnFocus} value={value}
                        onChange={(e) => setSalaryDraft((prev) => ({ ...prev, [m.user_id]: Number(e.target.value) }))}
                        onBlur={() => saveSalary(m.user_id)}
                        className="tabular h-9 w-32 rounded-lg border border-border bg-background px-2 text-right text-sm" />
                    </div>
                  ) : (
                    <span className="tabular font-semibold">{formatMoney(profile?.base_salary ?? 0)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Bulletins de paie</div>
            <div className="flex items-center gap-2">
              <select value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                {MONTH_LABEL.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
              </select>
              <input type="number" onFocus={selectOnFocus} value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}
                className="tabular h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm" />
              {canManage && (
                <button onClick={generateAll} disabled={generate.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
                  {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Générer les manquants
                </button>
              )}
            </div>
          </div>

          {loadingSlips ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : payslips.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aucun bulletin pour cette période. {canManage && "Cliquez sur \"Générer les manquants\" pour créer les bulletins des membres avec un salaire renseigné."}
            </div>
          ) : (
            <div className="space-y-1">
              {payslips.map((slip) => (
                <PayslipRow key={slip.id} slip={slip} memberName={memberName(slip.user_id)} canManage={canManage}
                  onUpdate={(patch) => updateSlip.mutate({ id: slip.id, ...patch })}
                  onDelete={() => removeSlip.mutate(slip.id)}
                  onPrint={() => printPayslip(memberName(slip.user_id), periodMonth, periodYear, slip,
                    currentOrganization ? { name: currentOrganization.name, logo_url: currentOrganization.logo_url ?? null } : null, settings, formatMoney)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PayslipRow({ slip, memberName, canManage, onUpdate, onDelete, onPrint }: {
  slip: HotelPayslip; memberName: string; canManage: boolean;
  onUpdate: (patch: Partial<HotelPayslip>) => void; onDelete: () => void; onPrint: () => void;
}) {
  const formatMoney = useFormatMoney();
  const [adjustment, setAdjustment] = useState(slip.adjustment);
  const editable = canManage && slip.status === "draft";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{memberName}</div>
        <div className="text-xs text-muted-foreground">Base {formatMoney(slip.base_salary)}</div>
      </div>
      {editable ? (
        <input type="number" onFocus={selectOnFocus} value={adjustment}
          onChange={(e) => setAdjustment(Number(e.target.value))}
          onBlur={() => { if (adjustment !== slip.adjustment) onUpdate({ adjustment }); }}
          placeholder="Ajustement" className="tabular h-8 w-28 rounded-lg border border-border bg-background px-2 text-right text-xs" />
      ) : (
        slip.adjustment !== 0 && <span className={cn("tabular text-xs", slip.adjustment > 0 ? "text-success" : "text-destructive")}>{slip.adjustment > 0 ? "+" : ""}{formatMoney(slip.adjustment)}</span>
      )}
      <span className="tabular w-28 shrink-0 text-right font-bold">{formatMoney(slip.net_total)}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
        slip.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground")}>
        {slip.status === "paid" ? "Payé" : "Brouillon"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={onPrint} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted" title="Imprimer"><Printer className="h-4 w-4" /></button>
        {canManage && slip.status === "draft" && (
          <button onClick={() => onUpdate({ status: "paid" })} className="grid h-8 w-8 place-items-center rounded-lg text-success hover:bg-success/10" title="Marquer payé"><Check className="h-4 w-4" /></button>
        )}
        {canManage && (
          <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}
