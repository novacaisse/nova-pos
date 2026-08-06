// Essai/abonnement expiré (extension de LOT C, useReadOnlyMode) : au-delà
// de la lecture seule déjà en place sur les points d'entrée d'écriture, la
// demande produit va plus loin — les modules métier (hors tableau de bord et
// Abonnement) deviennent inaccessibles tant que l'organisation n'a pas
// souscrit, un popup explique pourquoi au premier atterrissage sur le
// tableau de bord. Le tableau de bord et Abonnement restent toujours
// consultables : c'est depuis là que l'utilisateur souscrit.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const DASHBOARD_ROOTS = ["/app", "/app/hotel", "/app/resto", "/app/erp"];
const ALWAYS_ALLOWED = ["/app/abonnement", "/app/profil", "/app/notifications", "/app/nova"];

export function isAllowedWhenTrialExpired(pathname: string) {
  return DASHBOARD_ROOTS.includes(pathname) || ALWAYS_ALLOWED.some((p) => pathname.startsWith(p));
}

export function TrialExpiredModuleLock() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Module verrouillé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre essai gratuit est terminé. Souscrivez à une formule pour retrouver l'accès à ce module — le tableau
          de bord et la page Abonnement restent disponibles en attendant.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link
            to="/souscription"
            className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Souscrire maintenant
          </Link>
          <Link to="/app/abonnement" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Voir mon abonnement
          </Link>
        </div>
      </div>
    </div>
  );
}

const POPUP_KEY = "zegos.trial_expired_popup_shown";

export function TrialExpiredPopup({ organizationId }: { organizationId: string | undefined }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const key = `${POPUP_KEY}:${organizationId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setOpen(true);
  }, [organizationId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm text-center sm:text-left">
        <DialogHeader>
          <DialogTitle>Essai gratuit terminé</DialogTitle>
          <DialogDescription>
            Les modules de cette organisation sont verrouillés jusqu'à la souscription d'une formule. Le tableau de
            bord et la page Abonnement restent accessibles.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link
            to="/souscription"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Souscrire maintenant
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
