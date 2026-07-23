import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { User, Lock, Palette, Save, Sun, Moon, Monitor, Loader2, Camera } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useProfile, useUpdateProfile, useUploadAvatar, useMyRole } from "@/lib/data/hooks";
import { ROLE_LABEL } from "@/lib/roles";
import { useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/profil")({
  component: ProfilPage,
});

function initials(name: string | null | undefined, email: string | null | undefined) {
  const src = (name?.trim() || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function ProfilPage() {
  const [tab, setTab] = useState<"info" | "password" | "prefs">("info");
  const { user, updateEmail, updatePassword } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const { data: role } = useMyRole();
  const { theme, setTheme } = useTheme();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    if (profile) { setFullName(profile.full_name ?? ""); setPhone(profile.phone ?? ""); }
  }, [profile]);
  useEffect(() => {
    if (user) setEmail(user.email ?? "");
  }, [user]);

  const saveInfo = async () => {
    setInfoMsg(null);
    try {
      await updateProfile.mutateAsync({ full_name: fullName, phone });
      if (email !== user?.email) {
        const { error } = await updateEmail(email);
        if (error) throw new Error(error);
        setInfoMsg("Informations enregistrées. Vérifiez votre boîte mail pour confirmer le nouvel email.");
      } else {
        setInfoMsg("Informations enregistrées.");
      }
    } catch (e: any) {
      setInfoMsg("Erreur : " + (e?.message ?? "inconnue"));
    }
  };

  const pickAvatar = async (file?: File) => {
    if (!file) return;
    setAvatarError(null);
    try {
      await uploadAvatar.mutateAsync(file);
    } catch (e: any) {
      setAvatarError(e?.message ?? "Impossible d'enregistrer la photo.");
    }
  };

  const savePassword = async () => {
    setPwdMsg(null);
    if (newPwd.length < 6) { setPwdMsg("Le nouveau mot de passe doit faire au moins 6 caractères."); return; }
    if (newPwd !== confirmPwd) { setPwdMsg("La confirmation ne correspond pas."); return; }
    setPwdBusy(true);
    try {
      const { error } = await updatePassword(currentPwd, newPwd);
      if (error) throw new Error(error);
      setPwdMsg("Mot de passe mis à jour.");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: any) {
      setPwdMsg("Erreur : " + (e?.message ?? "inconnue"));
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Mon profil" subtitle="Informations personnelles et préférences" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <div className="relative mx-auto h-20 w-20">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-glow text-2xl font-bold text-primary-foreground shadow-glow">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(profile?.full_name, user?.email)
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
                aria-label="Changer la photo de profil"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-60"
              >
                {uploadAvatar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => pickAvatar(e.target.files?.[0])} />
            </div>
            {avatarError && <div className="mt-2 text-xs text-destructive">{avatarError}</div>}
            <div className="mt-3 font-display text-lg font-bold">{profile?.full_name || user?.email}</div>
            {role && (
              <div className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {ROLE_LABEL[role]}
              </div>
            )}
            <div className="mt-4 space-y-1">
              {([
                { k: "info", label: "Informations", icon: User },
                { k: "password", label: "Mot de passe", icon: Lock },
                { k: "prefs", label: "Préférences", icon: Palette },
              ] as const).map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    tab === t.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted")}>
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card p-6">
            {tab === "info" && (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold">Informations personnelles</h2>
                {profileLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Nom complet" value={fullName} onChange={setFullName} />
                      <Field label="Rôle" value={role ? ROLE_LABEL[role] : "—"} disabled />
                      <Field label="Email" type="email" value={email} onChange={setEmail} />
                      <Field label="Téléphone" value={phone} onChange={setPhone} />
                    </div>
                    {infoMsg && <div className="text-xs text-muted-foreground">{infoMsg}</div>}
                    <button onClick={saveInfo} disabled={updateProfile.isPending}
                      className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                      <Save className="h-4 w-4" /> Enregistrer
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === "password" && (
              <div className="max-w-md space-y-4">
                <h2 className="font-display text-lg font-bold">Changer de mot de passe</h2>
                <Field label="Mot de passe actuel" type="password" value={currentPwd} onChange={setCurrentPwd} />
                <Field label="Nouveau mot de passe" type="password" value={newPwd} onChange={setNewPwd} />
                <Field label="Confirmer le nouveau mot de passe" type="password" value={confirmPwd} onChange={setConfirmPwd} />
                {pwdMsg && <div className="text-xs text-muted-foreground">{pwdMsg}</div>}
                <button onClick={savePassword} disabled={pwdBusy || !currentPwd || !newPwd}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {pwdBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Mettre à jour
                </button>
              </div>
            )}

            {tab === "prefs" && (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold">Préférences d'affichage</h2>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thème</div>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { k: "light", label: "Clair", icon: Sun },
                      { k: "dark", label: "Sombre", icon: Moon },
                      { k: "auto", label: "Auto", icon: Monitor },
                    ] as const satisfies { k: ThemePref; label: string; icon: typeof Sun }[]).map((t) => (
                      <button key={t.k} onClick={() => setTheme(t.k)}
                        className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors",
                          theme === t.k ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                        <t.icon className="h-6 w-6" />
                        <span className="text-sm font-semibold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...props }: {
  label: string; value?: string; onChange?: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange?.(e.target.value)} {...props}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
    </label>
  );
}
