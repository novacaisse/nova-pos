import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Shield, UserCog, X, Trash2, Loader2, Save } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useShopMembers, useCreateTeamMember, useUpdateMemberRole, useRemoveMember, useMyRole,
  useShopSettings, useUpdateShopSettings, useTeamPermissions, DEFAULT_TEAM_PERMISSIONS,
  type ShopMember, type TeamPermissions,
} from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { PERMISSIONS_MATRIX } from "@/lib/permissionsMatrix";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/equipe")({
  component: EquipePage,
});

const ALL_ROLES: AppRole[] = ["owner", "manager", "cashier", "stock", "accountant"];

function initials(name: string | null | undefined) {
  const src = (name?.trim() || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function EquipePage() {
  const [tab, setTab] = useState<"members" | "perms">("members");
  const { user } = useAuth();
  const { data: myRole } = useMyRole();
  const { data: members = [], isLoading } = useShopMembers();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [inviting, setInviting] = useState(false);

  const isOwner = myRole === "owner";
  const roleCounts = new Set(members.map((m) => m.role)).size;

  return (
    <div>
      <PageHeader title="Équipe" subtitle="Utilisateurs, rôles et permissions"
        actions={isOwner && (
          <button onClick={() => setInviting(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
            <Plus className="h-4 w-4" /> Ajouter un membre
          </button>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Membres" value={String(members.length)} icon={<UserCog className="h-5 w-5" />} accent="primary" />
          <StatCard label="Rôles distincts" value={String(roleCounts)} icon={<Shield className="h-5 w-5" />} accent="accent" />
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["members", "perms"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "members" ? "Membres" : "Permissions"}
            </button>
          ))}
        </div>

        {tab === "members" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Membre</th><th className="px-4 py-3">Rôle</th>
                    <th className="px-4 py-3">Téléphone</th><th className="px-4 py-3">Membre depuis</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <MemberRow key={m.id} member={m} isOwner={isOwner} isSelf={m.user_id === user?.id}
                      onRoleChange={(role) => updateRole.mutate({ memberId: m.id, role })}
                      onRemove={() => {
                        if (confirm("Retirer ce membre de l'équipe ? Son accès à la boutique sera coupé immédiatement.")) {
                          removeMember.mutate(m.id);
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "perms" && (
          <div className="space-y-4">
            <TogglesPanel isOwner={isOwner} />

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 text-sm font-semibold">
              Matrice de permissions réelle (fixée par les règles de sécurité de la base — non modifiable ici)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Donnée</th>
                    {ALL_ROLES.map((r) => (
                      <th key={r} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">{ROLE_LABEL[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS_MATRIX.map((row) => (
                    <tr key={row.table} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      {ALL_ROLES.map((r) => (
                        <td key={r} className="px-3 py-2 text-center font-mono text-xs">{row.cells[r]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              S = lecture, I = création, U = modification, D = suppression. « — » = aucun accès.
            </p>
          </div>
          </div>
        )}
      </div>

      {inviting && <CreateMemberModal onClose={() => setInviting(false)} />}
    </div>
  );
}

const TOGGLES: { key: keyof TeamPermissions; label: string; hint: string }[] = [
  { key: "cashier_can_discount", label: "Remise à la caisse", hint: "Autorise le rôle Caissier à appliquer une remise sur une vente." },
  { key: "cashier_view_cost_margin", label: "Prix d'achat et marge", hint: "Affiche le prix d'achat et la marge au rôle Caissier dans le catalogue Produits." },
  { key: "cashier_sees_only_own_sales", label: "Historique des ventes limité", hint: "Un Caissier ne voit dans Ventes que ses propres tickets, pas ceux de toute l'équipe." },
];

function TogglesPanel({ isOwner }: { isOwner: boolean }) {
  const { data: settings } = useShopSettings();
  const current = useTeamPermissions();
  const updateSettings = useUpdateShopSettings();
  const [local, setLocal] = useState<TeamPermissions>(current);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(current); }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaved(false);
    await updateSettings.mutateAsync({ data: { ...(settings?.data ?? {}), permissions: local } });
    setSaved(true);
  };

  const dirty = TOGGLES.some((t) => local[t.key] !== current[t.key]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 text-sm font-semibold">Bascules pour le rôle Caissier</div>
      <p className="mb-4 text-xs text-muted-foreground">
        Réglages ciblés en plus du système de rôle — pas une nouvelle grille de permissions complète.
        Les valeurs par défaut préservent le comportement actuel.
      </p>
      <div className="space-y-2">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3 text-sm">
            <div>
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.hint}</div>
            </div>
            <input type="checkbox" checked={local[t.key]} disabled={!isOwner}
              onChange={(e) => setLocal((l) => ({ ...l, [t.key]: e.target.checked }))}
              className="h-5 w-5 shrink-0 accent-primary" />
          </label>
        ))}
      </div>
      {isOwner && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={!dirty || updateSettings.isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </button>
          {saved && !dirty && <span className="text-xs text-success">Enregistré.</span>}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, isOwner, isSelf, onRoleChange, onRemove }: {
  member: ShopMember; isOwner: boolean; isSelf: boolean;
  onRoleChange: (role: AppRole) => void; onRemove: () => void;
}) {
  const canEdit = isOwner && !isSelf;
  return (
    <tr className="border-t border-border/60 hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs font-bold text-primary-foreground">
            {member.profile?.avatar_url ? (
              <img src={member.profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(member.profile?.full_name)
            )}
          </div>
          <div className="font-semibold">{member.profile?.full_name || "—"}{isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(vous)</span>}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        {canEdit ? (
          <select value={member.role} onChange={(e) => onRoleChange(e.target.value as AppRole)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        ) : (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{ROLE_LABEL[member.role]}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{member.profile?.phone || "—"}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(member.created_at).toLocaleDateString("fr-FR")}</td>
      <td className="px-4 py-3 text-right">
        {isOwner && !isSelf && (
          <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function CreateMemberModal({ onClose }: { onClose: () => void }) {
  const create = useCreateTeamMember();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<AppRole>("cashier");
  const [error, setError] = useState<string | null>(null);

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        full_name: fullName.trim(), email: email.trim(), password: password || undefined,
        phone: phone.trim() || undefined, address: address.trim() || undefined, role,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Ajouter un membre</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <p className="text-xs text-muted-foreground">
            Créez directement le compte de cette personne. Communiquez-lui ensuite l'email et le mot de passe pour
            qu'elle se connecte — si un compte existe déjà avec cet email, il sera simplement rattaché à cette
            boutique (aucun mot de passe requis dans ce cas).
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom complet *</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inp} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe (si nouveau compte)</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Téléphone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rôle</span>
              <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inp}>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adresse</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inp} />
          </label>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!fullName.trim() || !email.trim() || create.isPending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
