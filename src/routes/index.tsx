import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Zap, ArrowRight, ScanBarcode, Warehouse, Users, Building2, Boxes,
  Sparkles, Smartphone, Bot, Check, Star, Clock,
} from "lucide-react";
import { usePlans } from "@/lib/data/adminHooks";
import { formatXOF } from "@/lib/mock/catalog";
import { formatMoney } from "@/lib/data/hooks";
import { PublicHeader } from "@/components/app/PublicHeader";
import { PublicFooter } from "@/components/app/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NovaCaisse — ZegCaisse, la caisse pensée pour l'Afrique de l'Ouest" },
      { name: "description", content: "ZegCaisse : point de vente tactile, stock intelligent, rapports pilotés par IA et Mobile Money natif. La première application de la plateforme ZegOS." },
    ],
  }),
  component: Landing,
});

// Regroupé en 4 piliers (plutôt qu'une grille plate de 9 tuiles) pour
// raconter le produit par bénéfice plutôt que par liste de fonctionnalités.
const PILLARS = [
  {
    icon: ScanBarcode, title: "Vendez, à tout moment",
    desc: "Une caisse tactile pensée pour la réalité du terrain : scanner, Mobile Money, connexion instable.",
    items: ["Caisse tactile ultra-rapide", "Scanner code-barres", "Mobile Money natif (Wave, Orange, MTN, Moov)", "Fonctionne hors ligne"],
  },
  {
    icon: Warehouse, title: "Gérez le stock sans surprise",
    desc: "Chaque mouvement tracé, chaque rupture anticipée — sur une ou plusieurs organisations.",
    items: ["Alertes de rupture automatiques", "Mouvements de stock détaillés", "Fournisseurs & bons de commande", "Multi-organisation"],
  },
  {
    icon: Bot, title: "Pilotez avec l'IA",
    desc: "Nova lit vos données de vente et répond en langage naturel, comme un comptable disponible 24/7.",
    items: ["Assistant Nova IA", "Rapports automatiques par période", "Objectifs de vente suivis", "Notifications en temps réel"],
  },
  {
    icon: Users, title: "Gardez le contrôle",
    desc: "Une équipe, des rôles précis, des charges suivies — la structure d'une vraie entreprise.",
    items: ["Équipe & permissions fines", "Devis convertis en vente", "Fiches clients détaillées", "Dépenses catégorisées"],
  },
];

// Vision plateforme : liste encodée en dur pour l'instant, sera unifiée
// avec le futur catalogue admin (table `apps`, Chantier B) pour ne plus
// dupliquer avec la même liste dans OnboardingFlow.tsx.
const ZEGOS_APPS = [
  { icon: ScanBarcode, name: "ZegCaisse", desc: "Point de vente & gestion commerciale", available: true },
  { icon: Building2, name: "ZegHotel", desc: "Gestion hôtelière & réservations", available: false },
  { icon: Boxes, name: "ZegERP", desc: "Gestion d'entreprise étendue", available: false },
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
  { name: "Yao N.", shop: "Superette Abidjan", quote: "4 organisations synchronisées en temps réel, avec Wave et Orange Money. Rien de comparable sur le marché.", rating: 5 },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <Hero />
      <Pillars />
      <VisionZegOS />
      <Why />
      <AiShowcase />
      <Testimonials />
      <PricingPreview />
      <FinalCta />
      <PublicFooter />
    </div>
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
            <Sparkles className="h-3.5 w-3.5" /> ZegCaisse · Première application ZegOS
          </span>
          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Encaissez en <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">5 secondes</span>. Même hors ligne. Même en Mobile Money.
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            ZegCaisse encaisse, gère le stock et pilote votre activité avec l'IA — opérationnel en quelques minutes, pensé pour les réalités du commerce en Afrique de l'Ouest.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/inscription" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 font-display font-bold text-primary-foreground shadow-elegant">
              Essayer 3 jours gratuits <ArrowRight className="h-4 w-4" />
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

function Pillars() {
  return (
    <section id="produit" className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">ZegCaisse</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Une seule application, quatre chantiers réglés.</h2>
          <p className="mt-3 text-muted-foreground">Pas une liste de fonctionnalités — une manière de gérer un commerce, du comptoir à la comptabilité.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <motion.div key={p.title} whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/25 text-primary">
                <p.icon className="h-6 w-6" />
              </div>
              <div className="mt-4 font-display text-lg font-bold">{p.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{p.desc}</div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {p.items.map((i) => (
                  <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> {i}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VisionZegOS() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">La plateforme ZegOS</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">ZegCaisse est le premier maillon.</h2>
          <p className="mt-3 text-muted-foreground">D'autres métiers rejoindront la même plateforme, sous le même compte — sans jamais avoir à migrer vos données.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {ZEGOS_APPS.map((a) => (
            <div key={a.name} className={`relative rounded-2xl border p-6 ${a.available ? "border-primary/30 bg-card shadow-elegant" : "border-border bg-muted/30 opacity-70"}`}>
              {!a.available && (
                <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> À venir
                </span>
              )}
              <div className={`grid h-12 w-12 place-items-center rounded-xl ${a.available ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                <a.icon className="h-6 w-6" />
              </div>
              <div className="mt-4 font-display text-lg font-bold">{a.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{a.desc}</div>
              {a.available && <span className="mt-3 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Disponible aujourd'hui</span>}
            </div>
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
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Pourquoi ZegCaisse</span>
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
  const { data: plans = [] } = usePlans();

  return (
    <section className="border-t border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Tarifs</span>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Une formule pour chaque commerce.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-6 ${p.is_recommended ? "border-primary bg-card shadow-elegant" : "border-border bg-card"}`}>
              {p.is_recommended && <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">Populaire</span>}
              <div className="font-display text-xl font-bold">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="tabular font-display text-3xl font-black">{formatMoney(p.price_month, p.currency)}</span>
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

