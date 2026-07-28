// Header partagé par les pages publiques (/, /tarifs, /inscription,
// /souscription) — remplace les implémentations divergentes (landing
// avait un bouton menu mobile non câblé ; les autres pages n'avaient
// aucune navigation). Menu mobile via Sheet (slide-in latéral), jusque-là
// présent dans le projet mais jamais utilisé.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu } from "lucide-react";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center">
          <BrandLogo className="h-9" />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="/#produit" className="hover:text-foreground">ZegCaisse</a>
          <Link to="/tarifs" className="hover:text-foreground">Tarifs</Link>
          <Link to="/connexion" className="hover:text-foreground">Connexion</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/inscription" className="hidden h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 sm:inline-flex">
            Essayer gratuitement <ArrowRight className="h-4 w-4" />
          </Link>

          <Sheet open={open} onOpenChange={setOpen}>
            <button
              onClick={() => setOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border text-foreground md:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <SheetContent side="right" className="flex w-4/5 max-w-xs flex-col gap-1 p-0">
              <div className="border-b border-border p-5">
                <BrandLogo className="h-8" />
              </div>
              <nav className="flex flex-col gap-1 p-3">
                <SheetClose asChild>
                  <a href="/#produit" className="rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-muted">ZegCaisse</a>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/tarifs" className="rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-muted">Tarifs</Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/connexion" className="rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-muted">Connexion</Link>
                </SheetClose>
              </nav>
              <div className="mt-auto p-3">
                <SheetClose asChild>
                  <Link to="/inscription" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant">
                    Essayer gratuitement <ArrowRight className="h-4 w-4" />
                  </Link>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
