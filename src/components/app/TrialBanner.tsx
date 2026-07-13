import { Link } from "@tanstack/react-router";
import { Clock, Sparkles } from "lucide-react";
import { getTrialInfo } from "@/lib/trial";
import { useShop } from "@/lib/auth/ShopProvider";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const { currentShop } = useShop();
  const info = getTrialInfo(currentShop);

  if (!info.onTrial || info.expired) return null;

  const urgent = info.daysLeft <= 1;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-xs sm:text-sm",
        urgent
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-primary",
      )}
    >
      {urgent ? <Clock className="h-4 w-4 shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Essai gratuit :</span>{" "}
        {info.daysLeft === 0
          ? "dernier jour"
          : `${info.daysLeft} jour${info.daysLeft > 1 ? "s" : ""} restant${info.daysLeft > 1 ? "s" : ""}`}
        .
      </div>
      <Link
        to="/souscription"
        className="rounded-lg bg-current/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider hover:underline"
      >
        Souscrire
      </Link>
    </div>
  );
}
