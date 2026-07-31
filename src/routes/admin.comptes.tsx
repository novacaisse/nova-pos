// Écran "Comptes" (Phase 11, admin complet) — jusqu'ici aucun écran admin
// ne montrait accounts/account_subscriptions, pourtant l'unité de
// facturation réelle depuis la Phase 1 : Emmanuel ne pouvait voir "ce
// compte possède N boutiques ZegCaisse + 1 hôtel, avec tel abonnement par
// application" sans accès direct à la base. Lecture seule — les actions
// (changer de formule, suspendre...) restent dans Boutiques, par
// établissement, comme aujourd'hui.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Mail, Phone, Store, BedDouble, UtensilsCrossed } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { useAdminAccounts, type AdminAccount } from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/comptes")({
  component: AdminComptes,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Actif", trialing: "Essai", past_due: "Paiement en retard", canceled: "Résilié", expired: "Expiré",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-success/15 text-success", trialing: "bg-accent/25 text-accent-foreground",
  past_due: "bg-destructive/15 text-destructive", canceled: "bg-muted text-muted-foreground", expired: "bg-muted text-muted-foreground",
};
const APPS = ["pos", "hotel", "resto"] as const;
const APP_LABEL: Record<(typeof APPS)[number], string> = { pos: "ZegCaisse", hotel: "ZegHotel", resto: "ZegResto" };
const APP_UNIT_LABEL: Record<(typeof APPS)[number], string> = { pos: "boutique(s)", hotel: "établissement(s)", resto: "restaurant(s)" };
const APP_ICON: Record<(typeof APPS)[number], typeof Store> = { pos: Store, hotel: BedDouble, resto: UtensilsCrossed };

function AdminComptes() {
  const { data: accounts = [], isLoading } = useAdminAccounts();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(needle)
      || a.owner_profile?.full_name?.toLowerCase().includes(needle)
      || a.owner_email?.toLowerCase().includes(needle));
  }, [accounts, q]);

  const withHotel = accounts.filter((a) => a.subscriptions.some((s) => s.app_module === "hotel")).length;
  const withResto = accounts.filter((a) => a.subscriptions.some((s) => s.app_module === "resto")).length;
  const pastDue = accounts.filter((a) => a.subscriptions.some((s) => s.status === "past_due")).length;

  return (
    <div>
      <PageHeader title="Comptes" subtitle="Unité de facturation réelle : compte → abonnement par application → établissements" />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Comptes" value={String(accounts.length)} icon={<Store className="h-5 w-5" />} accent="primary" />
          <StatCard label="Avec ZegHotel actif" value={String(withHotel)} icon={<BedDouble className="h-5 w-5" />} accent="accent" />
          <StatCard label="Avec ZegResto actif" value={String(withResto)} icon={<UtensilsCrossed className="h-5 w-5" />} accent="accent" />
          <StatCard label="Paiement en retard" value={String(pastDue)} icon={<Mail className="h-5 w-5" />} accent="destructive" />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un compte, un propriétaire, un email…"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucun compte trouvé.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => <AccountCard key={a.id} account={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountCard({ account }: { account: AdminAccount }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-bold">{account.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {account.owner_email ?? "—"}</span>
            {account.owner_profile?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {account.owner_profile.phone}</span>}
          </div>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          {APPS.map((app) => {
            const Icon = APP_ICON[app];
            return account.establishment_counts[app] ? (
              <span key={app} className="flex items-center gap-1 rounded-full border border-border px-2 py-1">
                <Icon className="h-3 w-3" />
                {account.establishment_counts[app]} {APP_UNIT_LABEL[app]}
              </span>
            ) : null;
          })}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {APPS.map((app) => {
          const sub = account.subscriptions.find((s) => s.app_module === app);
          if (!sub && !account.establishment_counts[app]) return null;
          return (
            <div key={app} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">{APP_LABEL[app]}</span>
              {sub ? (
                <span className={cn("rounded-full px-2 py-0.5 font-bold uppercase", STATUS_COLOR[sub.status] ?? "bg-muted text-muted-foreground")}>
                  {sub.plan_id} · {STATUS_LABEL[sub.status] ?? sub.status}
                </span>
              ) : (
                <span className="text-muted-foreground">Aucun abonnement</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
