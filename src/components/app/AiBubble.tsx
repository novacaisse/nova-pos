import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Send, X } from "lucide-react";
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
    <>
      <button
        aria-label="Ouvrir l'assistant Nova"
        onClick={() => setOpen(true)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground shadow">
          IA
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 24 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden border-l border-border bg-card shadow-elegant">
              <header className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-primary-foreground">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="font-display text-base font-bold">Nova · Assistant IA</div>
                  <div className="text-xs opacity-80">Contexte : {pathname}</div>
                </div>
                <button onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-white/15" aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
                <div className="max-w-lg rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
                  Bonjour 👋 {hint}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Ventes du jour", "Top produits", "Rupture stock"].map((s) => (
                    <button
                      key={s}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex items-center gap-2 border-t border-border p-3"
              >
                <input
                  placeholder="Poser une question à Nova…"
                  className="min-w-0 flex-1 rounded-xl bg-muted px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="submit"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"
                  aria-label="Envoyer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
