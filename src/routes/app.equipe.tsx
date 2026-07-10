import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Shield, UserCog, Activity } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import { TEAM, ACTIVITY, ROLE_LABEL } from "@/lib/mock/team";
import { ROLE_MATRIX, PERM_MODULES, PERM_ACTIONS, type PermAction, type PermModule } from "@/lib/mock/permissions";
import type { Role } from "@/lib/mock/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/equipe")({
  component: EquipePage,
});

function EquipePage() {
  const [tab, setTab] = useState<"members" | "perms" | "activity">("members");
  const [role, setRole] = useState<Role>("vendeur");
  const [matrix, setMatrix] = useState(() => JSON.parse(JSON.stringify(ROLE_MATRIX)) as typeof ROLE_MATRIX);

  const active = TEAM.filter((m) => m.active).length;
  const toggle = (mod: PermModule, act: PermAction) => {
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [mod]: { ...m[role][mod], [act]: !m[role][mod][act] } } }));
  };

  return (
    <div>
      <PageHeader title="Équipe" subtitle="Utilisateurs, rôles et permissions"
        actions={<button className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90"><Plus className="h-4 w-4" /> Ajouter un utilisateur</button>}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Membres actifs" value={String(active)} icon={<UserCog className="h-5 w-5" />} accent="primary" />
          <StatCard label="Rôles" value={String(Object.keys(ROLE_LABEL).length)} icon={<Shield className="h-5 w-5" />} accent="accent" />
          <StatCard label="Événements 7j" value={String(ACTIVITY.length)} icon={<Activity className="h-5 w-5" />} accent="success" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["members", "perms", "activity"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "members" ? "Membres" : t === "perms" ? "Permissions" : "Journal d'activité"}
            </button>
          ))}
        </div>

        {tab === "members" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Membre</th><th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Contact</th><th className="px-4 py-3">Boutiques</th>
                  <th className="px-4 py-3">Dernière connexion</th><th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {TEAM.map((m) => (
                  <tr key={m.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">{m.initials}</div>
                        <div className="font-semibold">{m.full_name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{ROLE_LABEL[m.role]}</span></td>
                    <td className="px-4 py-3 text-xs"><div>{m.email}</div><div className="text-muted-foreground">{m.phone}</div></td>
                    <td className="px-4 py-3 text-xs">{m.shop_ids.length}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(m.last_login).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", m.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                        {m.active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "perms" && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold">Matrice : accès et actions par module</div>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">Cochez les actions autorisées pour ce rôle.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Module</th>
                    {PERM_ACTIONS.map((a) => (
                      <th key={a.key} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERM_MODULES.map((mod) => (
                    <tr key={mod} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{mod}</td>
                      {PERM_ACTIONS.map((a) => {
                        const on = matrix[role][mod][a.key];
                        const disabled = role === "gerant" || role === "super_admin";
                        return (
                          <td key={a.key} className="px-3 py-2 text-center">
                            <button disabled={disabled} onClick={() => toggle(mod, a.key)}
                              className={cn("grid h-7 w-7 place-items-center rounded-md mx-auto text-xs font-bold",
                                on ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
                                disabled && "opacity-70 cursor-not-allowed")}>
                              {on ? "✓" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="rounded-2xl border border-border bg-card p-2">
            {ACTIVITY.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-b border-border/60 p-3 last:border-0">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-xs font-bold">{a.user.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{a.user}</span> <span className="text-muted-foreground">{a.action}</span> <span className="font-medium">{a.target}</span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
