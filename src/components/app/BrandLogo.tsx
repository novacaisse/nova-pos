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
// variant="sidebar" ne force plus la variante sombre depuis le correctif
// LOT E (audit ZegOS Phase 1) : la sidebar (--sidebar) suit désormais le
// thème global comme le reste de l'app, elle n'est plus foncée en
// permanence — le logo doit donc suivre le thème réel (isDark), au même
// titre que partout ailleurs. Le paramètre reste accepté (compat des
// appels existants) mais n'a plus d'effet différenciateur.
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

  const src = compact ? "/icon.png" : isDark ? "/logo-dark.png" : "/logo-light.png";
  return <img src={src} alt="ZegOS" className={cn("object-contain", className)} />;
}
