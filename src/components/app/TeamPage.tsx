// Page "Équipe" générique, réutilisée séparément par ZegCaisse
// (/app/equipe) et ZegHotel (/app/hotel/equipe) — chacune avec sa propre
// liste de rôles proposés (roles/defaultRole) : les deux applications
// partagent la même table organization_members (un compte, un rôle) mais
// n'exposent jamais le même écran ni la même liste de rôles à choisir.
import { useEffect, useState } from "react";
import { Plus, Shield, UserCog, X, Trash2, Loader2, Save, ShieldCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/PageHeader";
import {
  useShopMembers, useCreateTeamMember, useUpdateMemberRole, useRemoveMember, useMyRole,
  useShopSettings, useUpdateShopSettings, useTeamPermissions, DEFAULT_TEAM_PERMISSIONS,
  usePermissionModules, useOrganizationModulePermissions, useUpsertModulePermission,
  useSales, useFormatMoney,
  type ShopMember, type TeamPermissions,
} from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAccountMemberLimit } from "@/lib/data/accountHooks";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { PERMISSIONS_MATRIX } from "@/lib/permissionsMatrix";
import { cn } from "@/lib/utils";

function initials(name: string | null | undefined) {
  const src = (name?.trim() || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function TeamPage({ roles, defaultRole, title, subtitle, showPermissionsMatrix, customRolesAppModule }: {
  roles: AppRole[]; defaultRole: AppRole; title: string; subtitle: string; showPermissionsMatrix: boolean;
  // "pos" pour ZegCaisse (seule app branchée pour l'instant — Phase D
  // ajoutera hotel/resto/erp) : fait apparaître l'onglet "Rôles
  // personnalisés" et le sélecteur de rôle personnalisé par membre.
  // Omis = comportement strictement inchangé (ZegHotel aujourd'hui).
  customRolesAppModule?: string;
}) {
  const [tab, setTab] = useState<"members" | "perms" | "roles">("members");
  const { user } = useAuth();
  const { data: myRole } = useMyRole();
  const { data: members = [], isLoading } = useShopMembers();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [inviting, setInviting] = useState(false);
  const [viewingActivity, setViewingActivity] = useState<ShopMember | null>(null);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState<ShopMember | null>(null);

  const isOwner = myRole === "owner";
  const roleCounts = new Set(members.map((m) => m.role)).size;
  const { maxUsers, memberCount, planName } = useAccountMemberLimit();
  const atUserLimit = maxUsers != null && memberCount >= maxUsers;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}
        actions={isOwner && (
          <button onClick={() => setInviting(true)} disabled={atUserLimit}
            title={atUserLimit ? `Limite de ${maxUsers} comptes atteinte pour la formule ${planName}` : undefined}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            <Plus className="h-4 w-4" /> Ajouter un membre
          </button>
        )}
      />

      <div className="space-y-4 p-5 sm:p-8">
        {atUserLimit && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            Limite de {maxUsers} comptes atteinte pour la formule <b>{planName}</b>. Passez à une formule supérieure
            depuis <a href="/app/abonnement" className="underline">Abonnement</a> pour ajouter plus de membres.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Membres" value={maxUsers != null ? `${memberCount} / ${maxUsers}` : String(members.length)} icon={<UserCog className="h-5 w-5" />} accent="primary" />
          <StatCard label="Rôles distincts" value={String(roleCounts)} icon={<Shield className="h-5 w-5" />} accent="accent" />
        </div>

{/* La matrice statique PERMISSIONS_MATRIX (onglet "perms") est spécifique
    ZegCaisse (voir permissionsMatrix.ts) — gardée derrière
    showPermissionsMatrix seul. L'onglet "Permissions" (matrice CRUD par
    membre, migration 084), lui, doit s'afficher dès qu'une app fournit
    customRolesAppModule, même si elle n'a pas (encore) cette matrice
    statique (cas ZegHotel). */}
        {(showPermissionsMatrix || customRolesAppModule) && (
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            {(["members", ...(showPermissionsMatrix ? (["perms"] as const) : []), ...(customRolesAppModule ? (["roles"] as const) : [])] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t === "members" ? "Membres" : t === "perms" ? "Matrice de référence" : "Permissions"}
              </button>
            ))}
          </div>
        )}

        {tab === "members" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Membre</th><th className="px-4 py-3">Rôle de base</th>
                    <th className="px-4 py-3">Téléphone</th><th className="px-4 py-3">Membre depuis</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <MemberRow key={m.id} member={m} isOwner={isOwner} isSelf={m.user_id === user?.id} roles={roles}
                      canEditPermissions={!!customRolesAppModule}
                      onViewActivity={customRolesAppModule === "pos" ? () => setViewingActivity(m) : undefined}
                      onRoleChange={(role) => updateRole.mutate({ memberId: m.id, role })}
                      onEditPermissions={() => setEditingPermissionsFor(m)}
                      onRemove={() => {
                        if (confirm("Retirer ce membre de l'équipe ? Son accès à l'organisation sera coupé immédiatement.")) {
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

        {tab === "roles" && customRolesAppModule && (
          <ModulePermissionsIntro isOwner={isOwner} members={members.filter((m) => m.role !== "owner")}
            onEdit={(m) => setEditingPermissionsFor(m)} />
        )}

        {showPermissionsMatrix && tab === "perms" && (
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
                    {roles.map((r) => (
                      <th key={r} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">{ROLE_LABEL[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS_MATRIX.map((row) => (
                    <tr key={row.table} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      {roles.map((r) => (
                        <td key={r} className="px-3 py-2 text-center font-mono text-xs">{row.cells[r] ?? "—"}</td>
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

      {inviting && <CreateMemberModal onClose={() => setInviting(false)} roles={roles} defaultRole={defaultRole} />}
      {viewingActivity && <MemberActivityDialog member={viewingActivity} onClose={() => setViewingActivity(null)} />}
      {editingPermissionsFor && customRolesAppModule && (
        <ModulePermissionsModal member={editingPermissionsFor} appModule={customRolesAppModule} onClose={() => setEditingPermissionsFor(null)} />
      )}
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

function MemberRow({ member, isOwner, isSelf, roles, canEditPermissions, onViewActivity, onRoleChange, onEditPermissions, onRemove }: {
  member: ShopMember; isOwner: boolean; isSelf: boolean; roles: AppRole[];
  canEditPermissions: boolean;
  onViewActivity?: () => void;
  onRoleChange: (role: AppRole) => void; onEditPermissions: () => void; onRemove: () => void;
}) {
  // Un membre garde un seul rôle (organization_members.role) partagé entre
  // ZegCaisse et ZegHotel — mais chaque page Équipe ne propose que les
  // rôles pertinents pour SON application (voir app.equipe.tsx /
  // app.hotel.equipe.tsx). Si le rôle réel du membre n'est pas dans cette
  // liste (ex. "Caissier" vu depuis Équipe ZegHotel), un <select> contrôlé
  // par `roles` afficherait silencieusement la première option de la liste
  // au lieu de la vraie valeur (bug audité : Mariame affichée "Propriétaire"
  // côté ZegHotel alors que son vrai rôle est "Caissier" côté ZegCaisse —
  // pas une élévation de privilège réelle, un artefact d'affichage). On
  // n'édite donc jamais depuis une page où le rôle actuel n'a pas de sens.
  const roleBelongsHere = roles.includes(member.role);
  const canEdit = isOwner && !isSelf && roleBelongsHere;
  return (
    <tr onClick={onViewActivity} className={cn("border-t border-border/60 hover:bg-muted/40", onViewActivity && "cursor-pointer")}>
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
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <select value={member.role} onChange={(e) => onRoleChange(e.target.value as AppRole)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        ) : (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
            title={!roleBelongsHere ? "Rôle géré depuis l'Équipe de l'autre application" : undefined}>
            {ROLE_LABEL[member.role]}{!roleBelongsHere && isOwner && !isSelf && " (autre app)"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{member.profile?.phone || "—"}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(member.created_at).toLocaleDateString("fr-FR")}</td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {canEditPermissions && isOwner && !isSelf && member.role !== "owner" && (
            <button onClick={onEditPermissions}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
              <ShieldCheck className="h-3.5 w-3.5" /> Permissions
            </button>
          )}
          {isOwner && !isSelf && (
            <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// Activité d'un membre (ZegCaisse uniquement, voir customRolesAppModule ===
// "pos" côté appelant) — dérivée des 200 dernières ventes de l'organisation
// (useSales) filtrées côté client par cashier_id, pas une nouvelle table ni
// un journal d'activité dédié.
function MemberActivityDialog({ member, onClose }: { member: ShopMember; onClose: () => void }) {
  const formatXOF = useFormatMoney();
  const { data: sales = [], isLoading } = useSales(200);
  const mine = sales.filter((s) => s.cashier_id === member.user_id);
  const total = mine.reduce((s, sale) => s + Number(sale.total), 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-display text-lg font-bold">{member.profile?.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]} · membre depuis le {new Date(member.created_at).toLocaleDateString("fr-FR")}</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {member.profile?.phone && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Téléphone</span><span>{member.profile.phone}</span></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ventes récentes</div>
              <div className="mt-1 text-xl font-bold">{mine.length}</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Chiffre d'affaires</div>
              <div className="mt-1 text-xl font-bold">{formatXOF(total)}</div>
            </div>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
            ) : mine.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Aucune vente enregistrée par ce membre sur les 200 dernières ventes de l'organisation.
              </div>
            ) : mine.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs">
                <span className="font-mono">{s.reference}</span>
                <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString("fr-FR")}</span>
                <span className="font-bold">{formatXOF(Number(s.total))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Matrice de permissions par membre (migration 084, mission "Onboarding +
// MoneyFusion + permissions" Partie 4) — remplace les rôles personnalisés
// nommés. Chaque membre non-owner a des droits create/read/update/delete
// indépendants par module, réellement vérifiés en RLS via
// has_module_permission() (jamais un simple masquage côté UI). Édition
// réservée au propriétaire (RLS org_module_perms_write) — cet onglet ne
// fait qu'introduire la liste des membres, l'édition se fait via le
// bouton "Permissions" de chaque ligne (voir tableau Membres).
function ModulePermissionsIntro({ isOwner, members, onEdit }: { isOwner: boolean; members: ShopMember[]; onEdit: (m: ShopMember) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 text-sm font-semibold">Permissions par membre</div>
      <p className="mb-4 text-xs text-muted-foreground">
        Chaque membre (hors propriétaire, toujours accès total) a des droits indépendants par module — voir, créer,
        modifier, supprimer. Ces droits sont appliqués directement par la base de données, pas seulement affichés à
        l'écran. {isOwner ? "Cliquez sur un membre pour les régler." : "Seul le propriétaire peut les modifier."}
      </p>
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucun membre délégable pour l'instant (le propriétaire a toujours accès total).
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <button key={m.id} onClick={() => isOwner && onEdit(m)} disabled={!isOwner}
              className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> {m.profile?.full_name || "—"}
                <span className="text-xs font-normal text-muted-foreground">— {ROLE_LABEL[m.role]}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type CrudLevel = "can_create" | "can_read" | "can_update" | "can_delete";
const CRUD_LABEL: Record<CrudLevel, string> = { can_create: "Créer", can_read: "Voir", can_update: "Modifier", can_delete: "Supprimer" };
const CRUD_ORDER: CrudLevel[] = ["can_read", "can_create", "can_update", "can_delete"];

function ModulePermissionsModal({ member, appModule, onClose }: { member: ShopMember; appModule: string; onClose: () => void }) {
  const { data: modules = [] } = usePermissionModules(appModule);
  const { data: existingRows = [] } = useOrganizationModulePermissions(member.user_id);
  const upsert = useUpsertModulePermission();
  const [grid, setGrid] = useState<Record<string, Record<CrudLevel, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, Record<CrudLevel, boolean>> = {};
    for (const m of modules) {
      const existing = existingRows.find((r) => r.module_key === m.key);
      next[m.key] = {
        can_read: existing?.can_read ?? m.open_view,
        can_create: existing?.can_create ?? false,
        can_update: existing?.can_update ?? false,
        can_delete: existing?.can_delete ?? false,
      };
    }
    setGrid(next);
  }, [modules, existingRows]);

  const toggle = (moduleKey: string, level: CrudLevel, openView: boolean) => {
    if (level === "can_read" && openView) return; // lecture déjà ouverte à tous — pas modifiable
    setGrid((g) => ({ ...g, [moduleKey]: { ...g[moduleKey], [level]: !g[moduleKey]?.[level] } }));
  };

  const save = async () => {
    setError(null); setSaving(true);
    try {
      for (const m of modules) {
        const row = grid[m.key];
        if (!row) continue;
        await upsert.mutateAsync({ user_id: member.user_id, module_key: m.key, ...row });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-display text-lg font-bold">Permissions — {member.profile?.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground">Rôle de base : {ROLE_LABEL[member.role]} (ces droits s'ajoutent, ne le remplacent pas)</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Module</th>
                  {CRUD_ORDER.map((l) => (
                    <th key={l} className="px-3 py-2 text-center">{CRUD_LABEL[l]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.key} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    {CRUD_ORDER.map((l) => {
                      const lockedOpen = l === "can_read" && m.open_view;
                      return (
                        <td key={l} className="px-3 py-2 text-center">
                          <input type="checkbox" checked={grid[m.key]?.[l] ?? false} disabled={lockedOpen}
                            onChange={() => toggle(m.key, l, m.open_view)}
                            title={lockedOpen ? "Lecture déjà ouverte à tous les membres" : undefined}
                            className="h-4 w-4 accent-primary disabled:opacity-50" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={save} disabled={saving}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateMemberModal({ onClose, roles, defaultRole }: { onClose: () => void; roles: AppRole[]; defaultRole: AppRole }) {
  const create = useCreateTeamMember();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<AppRole>(() => (roles.includes(defaultRole) ? defaultRole : roles[0]));
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
            organisation (aucun mot de passe requis dans ce cas).
          </p>
          {/* Le navigateur assimile ce formulaire à une connexion (email + mot de
              passe) et propose sinon d'autofill les identifiants du compte Owner
              connecté — autocomplete="off"/"new-password" + noms de champs non
              standards pour empêcher toute suggestion d'identifiants sauvegardés. */}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom complet *</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inp}
              name="member_full_name" autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp}
              name="member_email_address" autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe (si nouveau compte)</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" className={inp}
              name="member_new_password" autoComplete="new-password" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Téléphone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rôle</span>
              <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inp}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
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
