import { useAppSettings } from "@/lib/data/adminHooks";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Logo réel de la plateforme ZegOS (fourni par l'utilisateur — plus aucun
// texte stylé ni icône générique de secours). Deux variantes thème
// (logo-light.png / logo-dark.png, wordmark complet) + une variante icône
// seule (icon.png, carré, déjà un badge autonome) pour les espaces
// restreints (sidebar repliée). app_settings.logo_url (Bloc 25, upload
// Super Admin) reste prioritaire si défini, quel que soit le thème.
//
// variant="sidebar" force la variante sombre : le fond de la sidebar
// (--sidebar) reste toujours sombre, y compris en thème clair — le
// logo doit donc toujours y être la version pensée pour fond sombre,
// indépendamment du thème global de la page.
export function BrandLogo({
  className, compact = false, variant = "auto",
}: {
  className?: string;
  compact?: boolean;
  variant?: "auto" | "sidebar";
}) {
  const { data } = useAppSettings();
  const { isDark } = useTheme();

  if (data?.logo_url) {
    return <img src={data.logo_url} alt="ZegOS" className={cn("object-contain", className)} />;
  }

  const useDarkVariant = variant === "sidebar" || isDark;
  const src = compact ? "/icon.png" : useDarkVariant ? "/logo-dark.png" : "/logo-light.png";
  return <img src={src} alt="ZegOS" className={cn("object-contain", className)} />;
}
