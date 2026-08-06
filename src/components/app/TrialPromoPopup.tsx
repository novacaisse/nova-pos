// Popup promo essai gratuit (toutes apps) — pousse la conversion rapide
// pendant les 3 jours d'essai avec la réduction de 5000 F (appliquée
// réellement côté serveur, voir create-subscription-payment) : affiché au
// premier atterrissage de chaque session (dès la fin de l'installation,
// et à chaque connexion suivante), pas à chaque navigation — sinon la
// popup deviendrait vite un obstacle plutôt qu'une incitation. Distinct de
// TrialExpiredPopup (TrialExpiredBlock.tsx), qui ne se déclenche qu'une
// fois l'essai terminé.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const POPUP_KEY = "zegos.trial_promo_popup_shown";
const TRIAL_DISCOUNT = 5000;

// "Séquence de relance" — le ton monte à mesure que la fenêtre d'essai se
// referme, plutôt qu'un seul message statique répété à l'identique.
function relanceCopy(daysLeft: number): { title: string; body: string; urgent: boolean } {
  if (daysLeft <= 0) {
    return {
      title: "Dernier jour d'essai !",
      body: `C'est votre dernière chance : souscrivez aujourd'hui et gardez vos ${TRIAL_DISCOUNT.toLocaleString("fr-FR")} F de réduction — elle disparaît avec la fin de l'essai.`,
      urgent: true,
    };
  }
  if (daysLeft === 1) {
    return {
      title: "Plus qu'un jour pour économiser",
      body: `Votre réduction de ${TRIAL_DISCOUNT.toLocaleString("fr-FR")} F expire demain avec votre essai gratuit. Souscrivez maintenant pour ne pas la perdre.`,
      urgent: true,
    };
  }
  return {
    title: "Bienvenue sur zegOS 👋",
    body: `Abonnez-vous pendant votre essai gratuit et obtenez ${TRIAL_DISCOUNT.toLocaleString("fr-FR")} F de réduction, appliquée automatiquement au paiement — une offre valable uniquement pendant ces 3 jours.`,
    urgent: false,
  };
}

export function TrialPromoPopup({ organizationId, daysLeft }: { organizationId: string | undefined; daysLeft: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const key = `${POPUP_KEY}:${organizationId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setOpen(true);
  }, [organizationId]);

  const copy = relanceCopy(daysLeft);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm text-center sm:text-left">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {copy.urgent ? <Clock className="h-5 w-5 text-destructive" /> : <Sparkles className="h-5 w-5 text-primary" />}
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link
            to="/souscription"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Souscrire et économiser {TRIAL_DISCOUNT.toLocaleString("fr-FR")} F
          </Link>
          <button onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Plus tard
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
