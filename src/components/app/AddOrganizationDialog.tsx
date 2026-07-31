// Formulaire "Ajouter une boutique / un établissement" — partagé entre
// Paramètres ZegCaisse et Paramètres ZegHotel (les deux pages restent
// distinctes, seul ce composant est réutilisé, paramétré par unitLabel
// pour les libellés). Le provisioning (RPC provision_organization, Phase 2
// restructuration compte/établissements) crée toujours cette organisation
// sous le compte existant du propriétaire, jamais un nouveau compte, et
// refuse (erreur affichée ci-dessous) si la limite d'établissements de la
// formule active est atteinte.
import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";

export const COUNTRIES = ["Bénin", "Togo", "Côte d'Ivoire", "Sénégal", "Burkina Faso", "Mali", "Niger", "Guinée", "Cameroun"];
export const CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GHS", "NGN"];

export function AddOrganizationDialog({ unitLabel, onClose, onCreate, pending }: {
  unitLabel: string;
  onClose: () => void; onCreate: (input: { name: string; country: string; currency: string }) => Promise<void>; pending: boolean;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [currency, setCurrency] = useState("XOF");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onCreate({ name: name.trim(), country, currency });
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-display text-lg font-bold">Ajouter {unitLabel === "boutique" ? "une" : "un"} {unitLabel}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom {unitLabel === "boutique" ? "de la boutique" : "de l'établissement"} *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pays</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Devise</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Nouvel{unitLabel === "boutique" ? "le boutique" : " établissement"} rattaché à votre compte existant — jamais un nouveau
            compte séparé. En période d'essai tant qu'aucun abonnement actif n'existe encore pour cette application sur ce compte.
          </p>
          {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-semibold">Annuler</button>
            <button onClick={submit} disabled={!name.trim() || pending}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
