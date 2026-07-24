import { Zap } from "lucide-react";
import { useAppSettings } from "@/lib/data/adminHooks";
import { cn } from "@/lib/utils";

// Logo affiché sur les pages publiques/boutique — reflète app_settings.logo_url
// (Bloc 25, mini-CMS Super Admin) une fois défini, quel que soit `brand`.
//
// brand="novacaisse" (défaut) : badge Zap dégradé — utilisé par les pages
// publiques (landing, tarifs, inscription, souscription), volontairement
// inchangées lors du rebranding ZegCaisse (hors périmètre, Chantier 1).
//
// brand="zegcaisse" : le badge Zap est remplacé par le mot "ZegCaisse" en
// toutes lettres (aucun vrai logo n'existe encore, texte simple en
// attendant) — utilisé par l'espace connecté (/app/*, /admin/*) et les
// pages de connexion (/connexion, /admins).
//
// compact=true : variante étroite (sidebar repliée) où le mot complet ne
// tiendrait pas — un monogramme "Z" dans le même badge que l'ancien Zap.
export function BrandLogo({
  className, iconClassName, textClassName, variant = "default", brand = "novacaisse", compact = false,
}: {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  variant?: "default" | "sidebar";
  brand?: "novacaisse" | "zegcaisse";
  compact?: boolean;
}) {
  const { data } = useAppSettings();
  const alt = brand === "zegcaisse" ? "ZegCaisse" : "NovaCaisse";

  if (data?.logo_url) {
    return (
      <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted", className)}>
        <img src={data.logo_url} alt={alt} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (brand === "zegcaisse" && !compact) {
    return <span className={cn("font-display font-bold tracking-tight", textClassName)}>ZegCaisse</span>;
  }

  const badgeGradient = variant === "sidebar" ? "from-sidebar-primary to-primary-glow" : "from-primary to-primary-glow text-primary-foreground";
  const badgeTextColor = variant === "sidebar" && "text-sidebar-primary-foreground";

  return (
    <div className={cn("grid shrink-0 place-items-center rounded-xl bg-gradient-to-br", badgeGradient, className)}>
      {brand === "zegcaisse" ? (
        <span className={cn("font-display font-bold", badgeTextColor, iconClassName)}>Z</span>
      ) : (
        <Zap className={cn(badgeTextColor, iconClassName)} strokeWidth={2.5} />
      )}
    </div>
  );
}
