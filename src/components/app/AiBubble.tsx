import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Nova est désormais une vraie page dédiée (/app/nova, Bloc 20) plutôt
// qu'un panneau glissant par-dessus l'écran courant — ce bouton n'ouvre
// plus rien lui-même, il y navigue simplement.
export function AiBubble() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const active = pathname === "/app/nova";

  return (
    <Link
      to="/app/nova"
      aria-label="Ouvrir l'assistant Nova"
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-xl border hover:bg-muted",
        active ? "border-primary bg-primary/10" : "border-border bg-card text-foreground",
      )}
    >
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground shadow">
        IA
      </span>
    </Link>
  );
}
