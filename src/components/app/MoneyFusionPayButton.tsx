// Bouton de paiement Mobile Money réel (mission "Onboarding + MoneyFusion
// + permissions", Partie 2) — remplace l'étiquette manuelle "Mobile Money"
// par un vrai lien MoneyFusion généré côté serveur (create-module-payment),
// réutilisé identique dans les 4 modules (ZegCaisse/ZegHotel/ZegResto/ZegERP).
// Le montant n'est jamais envoyé par ce composant sauf pour un acompte
// ZegHotel (kind="deposit") — dans tous les autres cas le serveur le
// recalcule depuis l'enregistrement cible, ce bouton ne fait que
// déclencher la demande.
import { useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { useCreateModulePayment, type ModulePaymentInput } from "@/lib/data/paymentHooks";
import { selectOnFocus } from "@/lib/utils";

export function MoneyFusionPayButton({
  organizationId, appModule, targetId, kind, amount, defaultPhone, defaultName, label, className,
}: {
  organizationId: string;
  appModule: ModulePaymentInput["app_module"];
  targetId: string;
  kind?: ModulePaymentInput["kind"];
  amount?: number;
  defaultPhone?: string;
  defaultName?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateModulePayment();

  const inp = "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className={className ?? "flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"}>
        <Smartphone className="h-3.5 w-3.5" /> {label ?? "Payer via Mobile Money"}
      </button>
    );
  }

  const submit = async () => {
    setError(null);
    try {
      if (kind === "deposit" && (!amount || amount <= 0)) throw new Error("Montant d'acompte invalide.");
      const data = await create.mutateAsync({
        organization_id: organizationId, app_module: appModule, target_id: targetId,
        phone: phone.trim(), full_name: name.trim(), kind, amount,
      });
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Smartphone className="h-3.5 w-3.5" /> Lien de paiement Mobile Money</div>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} onFocus={selectOnFocus} placeholder="Téléphone du client" className={inp} />
      <input value={name} onChange={(e) => setName(e.target.value)} onFocus={selectOnFocus} placeholder="Nom du client" className={inp} />
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">{error}</div>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="h-8 flex-1 rounded-lg border border-border bg-card text-[11px] font-semibold">Annuler</button>
        <button onClick={submit} disabled={!phone.trim() || !name.trim() || create.isPending}
          className="flex h-8 flex-[2] items-center justify-center gap-1.5 rounded-lg bg-primary text-[11px] font-bold text-primary-foreground disabled:opacity-40">
          {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Générer le lien
        </button>
      </div>
    </div>
  );
}
