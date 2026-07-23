import { useEffect } from "react";
import { useAppSettings } from "@/lib/data/adminHooks";

// Applique app_settings.favicon_url (Bloc 25, mini-CMS Super Admin) au
// <link rel="icon"> posé statiquement par __root.tsx, une fois chargé.
// Mise à jour côté client uniquement (pas de loader SSR ici) : le favicon
// par défaut (/favicon.ico) s'affiche donc toujours au tout premier rendu,
// puis bascule sur le favicon personnalisé dès que la requête aboutit —
// compromis délibéré pour éviter de brancher app_settings dans le chargement
// SSR de la racine, plus risqué à modifier sans pouvoir tester en conditions
// réelles ici.
export function DynamicFavicon() {
  const { data } = useAppSettings();

  useEffect(() => {
    if (!data?.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = data.favicon_url;
  }, [data?.favicon_url]);

  return null;
}
