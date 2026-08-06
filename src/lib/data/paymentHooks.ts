// Hooks partagés pour les paiements clients réels MoneyFusion (mission
// "Onboarding + MoneyFusion + permissions", Partie 2) — un seul point
// d'entrée générique (Edge Function create-module-payment) pour les 4
// modules ZegOS, au lieu d'une intégration dupliquée par module.
import { useMutation, useQuery } from "@tanstack/react-query";
import { invokeFn } from "@/lib/data/invokeFn";
import { supabase } from "@/integrations/supabase/client";

export type ModulePaymentInput = {
  organization_id: string;
  app_module: "pos" | "hotel" | "resto" | "erp";
  target_id: string;
  phone: string;
  full_name: string;
  // ZegHotel uniquement : 'deposit' (acompte, amount requis, plafonné
  // serveur) ou 'payment' (solde exact au check-out, amount ignoré).
  kind?: "deposit" | "payment";
  amount?: number;
};

export function useCreateModulePayment() {
  return useMutation({
    mutationFn: (input: ModulePaymentInput) =>
      invokeFn<{ url: string; payment_request_id: string }>("create-module-payment", input),
  });
}

export type PaymentRequestStatus = "pending" | "paid" | "failed";
export function usePaymentRequestStatus(paymentRequestId: string | null) {
  return useQuery({
    queryKey: ["payment_request", paymentRequestId],
    enabled: !!paymentRequestId,
    // Le statut change côté serveur (webhook), jamais côté client — court
    // polling pendant que l'utilisateur est revenu sur l'app après le
    // paiement MoneyFusion, même esprit que la page /souscription/confirmation.
    refetchInterval: 4000,
    queryFn: async (): Promise<PaymentRequestStatus | null> => {
      const { data, error } = await supabase.from("payment_requests")
        .select("status").eq("id", paymentRequestId!).maybeSingle();
      if (error) throw error;
      return (data?.status as PaymentRequestStatus | undefined) ?? null;
    },
  });
}
