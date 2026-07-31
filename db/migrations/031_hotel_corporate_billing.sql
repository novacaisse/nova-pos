-- 031_hotel_corporate_billing.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 4 — Module Comptes entreprise & agences (/app/hotel/corporate).
-- Décision produit confirmée avec Emmanuel : "clôture différée simple" —
-- jusqu'ici hotel_reservations.corporate_account_id était purement
-- informatif, useCloseFolio exigeait toujours un solde à zéro même pour un
-- séjour facturé à une entreprise. billed_to_corporate/corporate_paid_at
-- permettent à la réception de clôturer une note avec un solde impayé en
-- la marquant "à facturer à l'entreprise" ; le solde reste calculé comme
-- toujours (charges - paiements, folioBalance() inchangée) jusqu'à ce
-- qu'un règlement (hotel_payments, méthode bank_transfer) soit enregistré
-- au moment où l'entreprise paie — corporate_paid_at n'est qu'un marqueur
-- "en attente / réglé" pour le relevé, pas une nouvelle source de vérité
-- financière.
alter table public.hotel_folios
  add column if not exists billed_to_corporate boolean not null default false,
  add column if not exists corporate_paid_at timestamptz;
