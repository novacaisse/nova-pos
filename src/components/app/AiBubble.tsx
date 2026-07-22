import { useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Ouvrir l'assistant Nova"
          className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground shadow">
            IA
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(92vw,360px)] overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-primary-foreground">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold">Nova · Assistant IA</div>
            <div className="text-[11px] opacity-80">Contexte : {pathname}</div>
          </div>
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
      </PopoverContent>
    </Popover>
  );
}
