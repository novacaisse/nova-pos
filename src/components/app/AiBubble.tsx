import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

const CONTEXT_HINTS: Record<string, string> = {
  "/app/caisse": "Je peux suggérer des ventes croisées, résumer le ticket ou proposer une remise.",
  "/app/rapports": "Demande-moi une synthèse hebdo ou le top 5 produits.",
  "/app/stock": "Je peux détecter les ruptures probables cette semaine.",
  "/app/produits": "Génère une description, catégorise ou fixe un prix conseillé.",
};

export function AiBubble() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const hint = CONTEXT_HINTS[pathname] ?? "Je suis Nova, l'assistant IA de votre boutique. Posez-moi n'importe quelle question.";

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="pointer-events-auto w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-elegant"
          >
            <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-primary-foreground">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-semibold">Nova · Assistant IA</div>
                <div className="text-[11px] opacity-80">Contexte : {pathname}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15"
                aria-label="Fermer l'assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-4">
              <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-foreground">
                Bonjour 👋 {hint}
              </div>
              <div className="flex flex-wrap gap-2">
                {["Ventes du jour", "Top produits", "Rupture stock"].map((s) => (
                  <button
                    key={s}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex items-center gap-2 border-t border-border p-2.5"
            >
              <input
                placeholder="Poser une question à Nova…"
                className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"
                aria-label="Envoyer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow"
        aria-label="Ouvrir l'assistant Nova"
      >
        <Sparkles className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shadow">
          IA
        </span>
      </motion.button>
    </div>
  );
}
