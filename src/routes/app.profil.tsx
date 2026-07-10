import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { User, Lock, Palette, Save, Sun, Moon, Monitor } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { CURRENT_USER } from "@/lib/mock/session";
import { ROLE_LABEL } from "@/lib/mock/team";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/profil")({
  component: ProfilPage,
});

function ProfilPage() {
  const [tab, setTab] = useState<"info" | "password" | "prefs">("info");
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("auto");

  return (
    <div>
      <PageHeader title="Mon profil" subtitle="Informations personnelles et préférences" />

      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-2xl font-bold text-primary-foreground shadow-glow">
              {CURRENT_USER.avatar_initials}
            </div>
            <div className="mt-3 font-display text-lg font-bold">{CURRENT_USER.full_name}</div>
            <div className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {ROLE_LABEL[CURRENT_USER.role]}
            </div>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nom complet" defaultValue={CURRENT_USER.full_name} />
                  <Field label="Rôle" defaultValue={ROLE_LABEL[CURRENT_USER.role]} disabled />
                  <Field label="Email" defaultValue="aicha@novacaisse.bj" type="email" />
                  <Field label="Téléphone" defaultValue="+229 97 00 11 22" />
                </div>
                <button className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
              </div>
            )}

            {tab === "password" && (
              <div className="max-w-md space-y-4">
                <h2 className="font-display text-lg font-bold">Changer de mot de passe</h2>
                <Field label="Mot de passe actuel" type="password" />
                <Field label="Nouveau mot de passe" type="password" />
                <Field label="Confirmer le nouveau mot de passe" type="password" />
                <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <Lock className="h-4 w-4" /> Mettre à jour
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
                    ] as const).map((t) => (
                      <button key={t.k} onClick={() => setTheme(t.k)}
                        className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors",
                          theme === t.k ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                        <t.icon className="h-6 w-6" />
                        <span className="text-sm font-semibold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Langue</div>
                  <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option>Français</option>
                    <option>English</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60" />
    </label>
  );
}
