// Footer partagé par les pages publiques — reprend le footer historique
// de la landing, extrait ici pour être réutilisé (Chantier A). Ajoute un
// lien discret vers /admins (fine print, pas un CTA client) : jusqu'ici
// aucune page publique n'y menait, un compte Super Admin devait connaître
// l'URL par cœur.
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/app/BrandLogo";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <BrandLogo className="h-8" />
          <p className="mt-3 max-w-sm text-xs text-muted-foreground">La première application de la plateforme ZegOS — pensée pour les commerçants d'Afrique de l'Ouest. Édité par Digitorizon.</p>
        </div>
        <div>
          <div className="font-display text-sm font-bold">Produit</div>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li><a href="/#produit" className="hover:text-foreground">ZegCaisse</a></li>
            <li><Link to="/tarifs" className="hover:text-foreground">Tarifs</Link></li>
            <li><Link to="/connexion" className="hover:text-foreground">Connexion</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display text-sm font-bold">Contact</div>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li>contact@novacaisse.bj</li>
            <li>+229 97 00 00 00</li>
            <li>Cotonou, Bénin</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © 2026 ZegOS · Tous droits réservés · <Link to="/admins" className="hover:text-foreground hover:underline">Administration</Link>
      </div>
    </footer>
  );
}
