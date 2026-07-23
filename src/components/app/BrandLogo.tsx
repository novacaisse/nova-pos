import { Zap } from "lucide-react";
import { useAppSettings } from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

// Logo affiché sur les pages publiques/boutique (landing, tarifs, connexion,
// inscription, souscription, sidebar boutique) — reflète app_settings.logo_url
// (Bloc 25, mini-CMS Super Admin) une fois défini, sinon retombe sur le badge
// Zap dégradé utilisé partout jusqu'ici (comportement par défaut inchangé).
export function BrandLogo({
  className, iconClassName, variant = "default",
}: {
  className?: string;
  iconClassName?: string;
  variant?: "default" | "sidebar";
}) {
  const { data } = useAppSettings();

  if (data?.logo_url) {
    return (
      <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted", className)}>
        <img src={data.logo_url} alt="NovaCaisse" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={cn(
      "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br",
      variant === "sidebar" ? "from-sidebar-primary to-primary-glow" : "from-primary to-primary-glow text-primary-foreground",
      className,
    )}>
      <Zap className={cn(variant === "sidebar" && "text-sidebar-primary-foreground", iconClassName)} strokeWidth={2.5} />
    </div>
  );
}
