import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function DialogShell({ children, onClose, maxWidth = "max-w-sm" }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()} className={cn("w-full overflow-hidden rounded-2xl bg-card shadow-elegant", maxWidth)}>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ============ Scanner code-barres (BarcodeDetector natif) ============ */
// Extrait de app.caisse.tsx (POS) pour être réutilisé par ProductForm
// (champ "Code-barres" à la création d'un produit) — scan caméra via l'API
// native BarcodeDetector (Chrome/Edge/Android, couvre l'immense majorité du
// matériel POS/mobile visé ici). Pas de nouvelle dépendance npm : sur un
// navigateur qui ne supporte pas l'API (Safari/iOS notamment), un message
// clair oriente vers la saisie manuelle plutôt que de planter silencieusement.
export function BarcodeScannerDialog({ onClose, onDetect }: { onClose: () => void; onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new (window as any).BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
    });

    const tick = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          stopped = true;
          onDetect(codes[0].rawValue);
          return;
        }
      } catch {
        // Frame pas encore prête ou erreur ponctuelle de décodage — on continue.
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(e?.message ?? "Impossible d'accéder à la caméra.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onDetect]);

  return (
    <DialogShell onClose={onClose} maxWidth="max-w-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-display text-lg font-bold">Scanner un code-barres</div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-5">
        {!supported ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
            Le scan par caméra n'est pas pris en charge par ce navigateur. Utilisez la saisie manuelle à la place.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} muted playsInline className="w-full" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80" />
          </div>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">Visez le code-barres du produit avec la caméra.</p>
      </div>
    </DialogShell>
  );
}
