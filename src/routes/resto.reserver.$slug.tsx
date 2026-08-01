// Formulaire public de réservation ZegResto (Phase 3) — EXCEPTION DE SCOPE
// validée : seule page publique (hors /app et /admin) de ce chantier, pas
// étendue à ZegCaisse/ZegHotel. Page volontairement autonome — pas de
// PublicHeader/PublicFooter (marketing ZegCaisse, hors sujet ici) : juste
// le nom du restaurant (résolu via son slug, resto_public_organization_info)
// et le formulaire. Écrit via resto_public_create_reservation() — RPC
// security definer, seule porte d'écriture anonyme de tout ZegResto,
// jamais un accès direct à la table (voir migration 039).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, CheckCircle2, AlertCircle, UtensilsCrossed, Users, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/app/BrandLogo";

export const Route = createFileRoute("/resto/reserver/$slug")({
  head: () => ({ meta: [{ title: "Réserver une table" }] }),
  component: ReserverPage,
});

type OrgInfo = { id: string; name: string };

function ReserverPage() {
  const { slug } = Route.useParams();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("resto_public_organization_info", { p_slug: slug });
      if (cancelled) return;
      if (error || !data || data.length === 0) { setNotFound(true); setLoading(false); return; }
      setOrg(data[0] as OrgInfo);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/60 px-5 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <BrandLogo className="h-7" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-10">
        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : notFound ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-60" />
            <div className="font-semibold">Restaurant introuvable</div>
            <p className="mt-1 text-sm text-muted-foreground">Vérifiez le lien de réservation fourni par l'établissement.</p>
          </div>
        ) : sent ? (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-success" />
            <div className="font-display text-lg font-bold">Demande envoyée</div>
            <p className="mt-2 text-sm text-muted-foreground">
              {org?.name} vous contactera pour confirmer votre réservation.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><UtensilsCrossed className="h-6 w-6" /></div>
              <div>
                <div className="font-display text-xl font-bold">{org?.name}</div>
                <div className="text-sm text-muted-foreground">Demande de réservation</div>
              </div>
            </div>
            <ReservationForm organizationName={org?.name ?? ""} slug={slug} onSent={() => setSent(true)} />
          </>
        )}
      </main>
    </div>
  );
}

function ReservationForm({ slug, onSent }: { organizationName: string; slug: string; onSent: () => void }) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [couverts, setCouverts] = useState(2);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const valid = nom.trim() && date && heure && couverts > 0;

  const submit = async () => {
    if (!valid || sending) return;
    setError(null);
    setSending(true);
    try {
      const dateHeure = new Date(`${date}T${heure}:00`);
      if (Number.isNaN(dateHeure.getTime()) || dateHeure.getTime() <= Date.now()) {
        setError("Choisissez une date et une heure dans le futur.");
        return;
      }
      const { error: rpcError } = await supabase.rpc("resto_public_create_reservation", {
        p_slug: slug, p_nom_client: nom.trim(), p_telephone_client: telephone.trim() || null,
        p_date_heure: dateHeure.toISOString(), p_nombre_couverts: couverts, p_notes: notes.trim() || null,
      });
      if (rpcError) throw rpcError;
      onSent();
    } catch (e: any) {
      setError(e?.message ?? "Une erreur est survenue. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const inp = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-elegant">
      <label>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><User className="h-3.5 w-3.5" /> Nom *</div>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" className={inp} />
      </label>
      <label>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><Phone className="h-3.5 w-3.5" /> Téléphone</div>
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+229 …" className={inp} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Date *</div>
          <input type="date" min={todayIso} value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
        </label>
        <label>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Heure *</div>
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={inp} />
        </label>
      </div>
      <label>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground"><Users className="h-3.5 w-3.5" /> Nombre de couverts *</div>
        <input type="number" min={1} value={couverts} onChange={(e) => setCouverts(Number(e.target.value))} className={inp} />
      </label>
      <label>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Message (optionnel)</div>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, occasion spéciale…" className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary" />
      </label>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}

      <button onClick={submit} disabled={!valid || sending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-elegant disabled:cursor-not-allowed disabled:opacity-40">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Demander une réservation
      </button>
      <p className="text-center text-[11px] text-muted-foreground">Votre demande sera confirmée directement par l'établissement.</p>
    </div>
  );
}
