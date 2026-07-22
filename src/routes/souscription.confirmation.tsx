import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Zap, Loader2, CircleCheck, XCircle, Check } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSubscriptionPayment } from "@/lib/data/hooks";

type ConfirmationSearch = { payment_id?: string };

export const Route = createFileRoute("/souscription/confirmation")({
  head: () => ({ meta: [{ title: "Confirmation de paiement — NovaCaisse" }] }),
  validateSearch: (search: Record<string, unknown>): ConfirmationSearch => ({
    payment_id: typeof search.payment_id === "string" ? search.payment_id : undefined,
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { payment_id } = Route.useSearch();
  const { data: payment, isLoading, isError } = useSubscriptionPayment(payment_id ?? null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/connexion" });
  }, [authLoading, user, navigate]);

  let content: ReactNode;

  if (!payment_id) {
    content = (
      <>
        <XCircle className="mx-auto h-14 w-14 text-destructive" />
        <h2 className="mt-5 font-display text-xl font-bold">Référence de paiement manquante</h2>
        <p className="mt-2 text-sm text-muted-foreground">Le lien de confirmation semble incomplet.</p>
        <Link to="/souscription" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Retour à la souscription
        </Link>
      </>
    );
  } else if (authLoading || isLoading) {
    content = (
      <>
        <Loader2 className="mx-auto h-14 w-14 animate-spin text-primary" />
        <h2 className="mt-5 font-display text-xl font-bold">Vérification en cours…</h2>
      </>
    );
  } else if (isError || !payment) {
    content = (
      <>
        <XCircle className="mx-auto h-14 w-14 text-destructive" />
        <h2 className="mt-5 font-display text-xl font-bold">Paiement introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">Nous n'avons pas retrouvé cette transaction sur votre compte.</p>
        <Link to="/souscription" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Retour à la souscription
        </Link>
      </>
    );
  } else if (payment.status === "paid") {
    content = (
      <>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success">
          <CircleCheck className="h-12 w-12" />
        </motion.div>
        <h2 className="mt-5 font-display text-2xl font-black">Paiement confirmé !</h2>
        <p className="mt-2 text-sm text-muted-foreground">Votre abonnement est actif. Merci pour votre confiance.</p>
        <Link to="/app" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-5 text-sm font-bold text-primary-foreground shadow-elegant">
          <Check className="h-4 w-4" /> Accéder à mon espace
        </Link>
      </>
    );
  } else if (payment.status === "failed") {
    content = (
      <>
        <XCircle className="mx-auto h-14 w-14 text-destructive" />
        <h2 className="mt-5 font-display text-xl font-bold">Paiement échoué</h2>
        <p className="mt-2 text-sm text-muted-foreground">La transaction n'a pas abouti. Vous pouvez réessayer.</p>
        <Link to="/souscription" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Réessayer
        </Link>
      </>
    );
  } else {
    content = (
      <>
        <Loader2 className="mx-auto h-14 w-14 animate-spin text-primary" />
        <h2 className="mt-5 font-display text-xl font-bold">En attente de confirmation…</h2>
        <p className="mt-2 text-sm text-muted-foreground">Validez la transaction sur votre téléphone si ce n'est pas déjà fait. Cette page se met à jour automatiquement.</p>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center px-5 py-8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold">NovaCaisse</span>
        </Link>

        <div className="mt-8 w-full flex-1 rounded-3xl border border-border bg-card p-10 text-center shadow-elegant">
          {content}
        </div>
      </div>
    </div>
  );
}
