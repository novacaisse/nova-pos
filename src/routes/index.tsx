import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Zap, ArrowRight, ScanBarcode, Warehouse, BarChart3, Users, Store, Tag,
  Sparkles, Truck, Wallet, Bell, Smartphone, Bot, Check, Star, Menu,
} from "lucide-react";
import { PLANS } from "@/lib/mock/subscription";
import { formatXOF } from "@/lib/mock/catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NovaCaisse — Logiciel de caisse pour commerçants d'Afrique de l'Ouest" },
      { name: "description", content: "Point de vente tactile, gestion de stock, rapports IA, mobile money. Pensé pour les commerçants du Bénin, du Togo, du Burkina et au-delà." },
    ],
  }),
  component: Landing,
});

const MODULES = [
  { icon: ScanBarcode, name: "Point de vente", desc: "Caisse tactile ultra-rapide avec scanner et paiement mobile money." },
  { icon: Warehouse, name: "Stock intelligent", desc: "Alertes de rupture, mouvements, inventaire multi-boutique." },
  { icon: BarChart3, name: "Rapports IA", desc: "Tableaux de bord et insights automatiques par période." },
  { icon: Store, name: "Multi-boutique", desc: "Gérez toutes vos boutiques depuis une seule interface." },
  { icon: Tag, name: "Promotions & fidélité", desc: "Remises, offres BOGO et programme client par paliers." },
  { icon: Users, name: "Équipe & rôles", desc: "Permissions fines par utilisateur et journal d'activité." },
  { icon: Truck, name: "Fournisseurs", desc: "Bons de commande, réceptions, historique d'achats." },
  { icon: Wallet, name: "Dépenses", desc: "Suivi des charges par catégorie avec justificatifs." },
  { icon: Bot, name: "Assistant Nova IA", desc: "Posez vos questions, obtenez des réponses métier instantanées." },
  { icon: Bell, name: "Notifications temps réel", desc: "Alertes stock, paiements et objectifs de vente." },
];

const WHY = [
  { icon: Zap, title: "Rapide", desc: "Encaissement en moins de 5 secondes, même hors ligne." },
  { icon: Bot, title: "IA intégrée", desc: "Nova répond à vos questions business en langage naturel." },
  { icon: Smartphone, title: "Mobile Money", desc: "Orange, MTN, Moov, Wave — tous les opérateurs de la sous-région." },
  { icon: Sparkles, title: "Pensé pour l'Afrique", desc: "Devise FCFA, tactile tablette, faible bande passante." },
];

const TESTIMONIALS = [
  { name: "Aïcha K.", shop: "Boutique Cotonou Centre", quote: "Depuis NovaCaisse, je ferme ma caisse en 2 minutes le soir. L'IA me dit même quoi recommander.", rating: 5 },
  { name: "Kwame A.", shop: "Marché Dantokpa", quote: "Simple, rapide, et mes vendeurs n'ont eu besoin d'aucune formation. Le stock est enfin fiable.", rating: 5 },
  { name: "Yao N.", shop: "Superette Abidjan", quote: "4 boutiques synchronisées en temps réel, avec Wave et Orange Money. Rien de comparable sur le marché.", rating: 5 },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <Modules />
      <Why />
      <AiShowcase />
      <Testimonials />
      <PricingPreview />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">NovaCaisse</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="#modules" className="hover:text-foreground">Fonctionnalités</a>
          <Link to="/tarifs" className="hover:text-foreground">Tarifs</Link>
          <Link to="/connexion" className="hover:text-foreground">Connexion</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/inscription" className="hidden h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90 sm:inline-flex">
            Essayer gratuitement <ArrowRight className="h-4 w-4" />
          </Link>
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-border text-foreground md:hidden" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
      <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-2 lg:py-28">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Nouveau · Assistant IA Nova
          </span>
          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            La caisse <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">moderne</span> pour vos boutiques.
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            Point de vente tactile, stock intelligent, rapports IA et paiement mobile money — tout dans une seule application, pensée pour les commerçants d'Afrique de l'Ouest.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/inscription" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 font-display font-bold text-primary-foreground shadow-elegant">
              Essayer 14 jours gratuits <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/app/caisse" className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 font-semibold hover:bg-muted">
              Voir la démo
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" /> Sans carte bancaire</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" /> Mobile Money</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" /> Hors ligne</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="relative">
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-4 shadow-elegant">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary"><ScanBarcode className="h-4 w-4" /></div>
                <div className="font-display text-sm font-bold">Ticket #2481</div>
              </div>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Payé</span>
            </div>
            <div className="space-y-2 py-3 text-sm">
              {[
                { e: "🍚", n: "Riz parfumé 5kg", q: 2, p: 9000 },
                { e: "🥤", n: "Coca 33cl", q: 6, p: 3000 },
                { e: "🧴", n: "Huile 1L", q: 1, p: 2200 },
              ].map((r) => (
                <div key={r.n} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.e}</span>
                    <span className="font-medium">{r.n}</span>
                    <span className="text-xs text-muted-foreground">×{r.q}</span>
                  </div>
                  <span className="tabular font-semibold">{formatXOF(r.p)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Sous-total</span><span className="tabular">14 200 F</span>
              </div>
              <div className="mt-1 flex items-center justify-between font-display text-lg font-bold">
                <span>Total</span><span className="tabular text-primary">14 200 F</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-primary/10 py-2 text-center font-semibold text-primary">Espèces</div>
              <div className="rounded-lg bg-muted py-2 text-center font-semibold">Momo</div>
              <div className="rounded-lg bg-muted py-2 text-center font-semibold">Carte</div>
            </div>
          </div>
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} className="absolute -right-4 top-10 hidden rounded-2xl border border-border bg-card p-3 shadow-elegant sm:block">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-success/15 text-success"><Check className="h-4 w-4" /></div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Nouvelle vente</div>
                <div className="tabular text-sm font-bold">+14 200 F</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Modules() {
  return (
    <section id="modules" className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Fonctionnalités</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Tout ce qu'il vous faut, dans une seule app.</h2>
          <p className="mt-3 text-muted-foreground">13 modules intégrés, conçus pour couvrir chaque geste de votre commerce, du comptoir à la comptabilité.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {MODULES.map((m) => (
            <motion.div key={m.name} whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/25 text-primary">
                <m.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-display text-base font-bold">{m.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Pourquoi NovaCaisse</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Fait pour les commerçants d'ici.</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((w) => (
            <div key={w.title} className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
                <w.icon className="h-6 w-6" />
              </div>
              <div className="mt-4 font-display text-lg font-bold">{w.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{w.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AiShowcase() {
  return (
    <section className="border-y border-border bg-gradient-to-br from-primary/5 via-background to-accent/10 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Bot className="h-3.5 w-3.5" /> Assistant Nova IA
          </span>
          <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl">Posez une question. Obtenez la réponse.</h2>
          <p className="mt-4 text-muted-foreground">Nova comprend vos données de vente, stock et clients. Demandez-lui ce que vous voulez, comme à un comptable.</p>
          <ul className="mt-6 space-y-2 text-sm">
            {["Quels sont mes 5 produits les plus vendus ce mois ?", "Combien j'ai gagné cette semaine ?", "Quels produits sont en rupture ?"].map((q) => (
              <li key={q} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {q}</li>
            ))}
          </ul>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-3xl border border-border bg-card p-5 shadow-elegant">
          <div className="flex items-start justify-end">
            <div className="max-w-xs rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
              Combien j'ai gagné aujourd'hui ?
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"><Bot className="h-4 w-4" /></div>
            <div className="max-w-sm rounded-2xl rounded-tl-sm border border-border bg-muted px-4 py-3 text-sm">
              Aujourd'hui vous avez encaissé <span className="tabular font-bold text-primary">324 500 F</span> sur <span className="font-bold">47 tickets</span>. C'est +18% vs hier. Top produit : <span className="font-semibold">Riz parfumé 5kg</span> (12 ventes).
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Ils utilisent NovaCaisse</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Des commerçants qui ferment leur caisse sereins.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex gap-0.5 text-primary">
                {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
              </div>
              <p className="mt-3 text-sm">"{t.quote}"</p>
              <div className="mt-4 border-t border-border/60 pt-3">
                <div className="font-display text-sm font-bold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.shop}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingPreview() {
  return (
    <section className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Tarifs</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Une formule pour chaque commerce.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-6 ${p.recommended ? "border-primary bg-card shadow-elegant" : "border-border bg-card"}`}>
              {p.recommended && <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Populaire</span>}
              <div className="font-display text-xl font-bold">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="tabular font-display text-3xl font-black">{formatXOF(p.price_month)}</span>
                <span className="text-xs text-muted-foreground">/ mois</span>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {p.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" /> {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/tarifs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Voir toutes les formules et détails <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-5">
        <div className="rounded-3xl bg-gradient-to-br from-primary via-primary to-primary-glow p-10 text-center text-primary-foreground shadow-elegant">
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">Prêt à moderniser votre caisse ?</h2>
          <p className="mt-3 text-primary-foreground/85">Créez votre compte en 2 minutes. Sans engagement, sans carte bancaire.</p>
          <Link to="/inscription" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-background px-6 font-display font-bold text-primary hover:bg-background/90">
            Commencer maintenant <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"><Zap className="h-4 w-4" strokeWidth={2.5} /></div>
            <span className="font-display text-lg font-bold">NovaCaisse</span>
          </div>
          <p className="mt-3 max-w-sm text-xs text-muted-foreground">La caisse moderne pour les commerçants d'Afrique de l'Ouest. Édité par Digitorizon.</p>
        </div>
        <div>
          <div className="font-display text-sm font-bold">Produit</div>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li><a href="#modules" className="hover:text-foreground">Fonctionnalités</a></li>
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
        © 2026 NovaCaisse · Tous droits réservés
      </div>
    </footer>
  );
}
