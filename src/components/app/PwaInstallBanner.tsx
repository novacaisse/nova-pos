import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

// Bannière incitant à installer l'app en PWA (mobile).
// Affichée si le drapeau localStorage "novacaisse.showPwaBanner" = "1"
// (positionné à la fin de l'inscription) et que l'utilisateur ne l'a pas
// déjà fermée. Aucun service worker n'est enregistré ici — c'est
// uniquement une invitation.

const FLAG_SHOW = "novacaisse.showPwaBanner";
const FLAG_DISMISSED = "novacaisse.pwaBannerDismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const show = window.localStorage.getItem(FLAG_SHOW) === "1";
    const dismissed = window.localStorage.getItem(FLAG_DISMISSED) === "1";
    setVisible(show && !dismissed);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FLAG_DISMISSED, "1");
      window.localStorage.removeItem(FLAG_SHOW);
    }
    setVisible(false);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:right-4 md:bottom-4 md:w-96">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-elegant">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Installer NovaCaisse sur votre téléphone</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ajoutez l'app à votre écran d'accueil pour un accès instantané.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={install}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" />
              Installer
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
