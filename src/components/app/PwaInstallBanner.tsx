import { useEffect, useState } from "react";
import { Download, X, Smartphone, Share2 } from "lucide-react";

// Bannière incitant à installer l'app en PWA.
//
// Avant : gardée derrière un drapeau posé une seule fois à la fin de
// l'inscription ("novacaisse.showPwaBanner") — invisible pour tout
// utilisateur existant, et une fermeture (même la simple croix) la
// masquait définitivement. Devenue plus insistante (retour utilisateur) :
// visible à chaque session tant que l'app n'est pas installée, avec un
// "snooze" temporaire plutôt qu'un masquage permanent sur "Plus tard"/croix,
// et des instructions dédiées sur iOS Safari (pas de beforeinstallprompt
// là-bas, le bouton "Installer" seul n'y menait nulle part).
const FLAG_INSTALLED = "novacaisse.pwaInstalled";
const KEY_SNOOZE_UNTIL = "novacaisse.pwaBannerSnoozeUntil";
const SNOOZE_LATER_MS = 3 * 24 * 60 * 60 * 1000; // "Plus tard" : redemande dans 3 jours
const SNOOZE_CLOSE_MS = 7 * 24 * 60 * 60 * 1000; // croix : redemande dans 7 jours

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as any).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const ios = isIos();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandalone() || window.localStorage.getItem(FLAG_INSTALLED) === "1") {
      setVisible(false);
    } else {
      const snoozeUntil = Number(window.localStorage.getItem(KEY_SNOOZE_UNTIL) ?? 0);
      setVisible(Date.now() > snoozeUntil);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      window.localStorage.setItem(FLAG_INSTALLED, "1");
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function snooze(ms: number) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_SNOOZE_UNTIL, String(Date.now() + ms));
    }
    setVisible(false);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        if (typeof window !== "undefined") window.localStorage.setItem(FLAG_INSTALLED, "1");
        setVisible(false);
        return;
      }
    }
    snooze(SNOOZE_LATER_MS);
  }

  if (!visible) return null;

  const iosNoPrompt = ios && !deferred;

  return (
    <div className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:right-4 md:bottom-4 md:w-96">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-card p-3.5 shadow-elegant">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Installez NovaCaisse sur cet appareil</div>
          {iosNoPrompt ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Appuyez sur <Share2 className="h-3 w-3 shrink-0" /> puis « Sur l'écran d'accueil » — accès instantané, même hors-ligne.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Accès plein écran, plus rapide, même avec une connexion instable.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {!iosNoPrompt && (
              <button
                onClick={install}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" />
                Installer
              </button>
            )}
            <button
              onClick={() => snooze(SNOOZE_LATER_MS)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={() => snooze(SNOOZE_CLOSE_MS)}
          aria-label="Fermer"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
