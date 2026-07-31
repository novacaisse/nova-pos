-- ============================================================
-- Migration 034 — ZegHotel Phase 8 : canaux de distribution (scope réduit)
-- Présentée pour relecture — NE PAS exécuter automatiquement.
-- ============================================================
-- Décision produit confirmée avec Emmanuel : pas de vraie intégration API
-- (Booking.com, Expedia, etc.) dans cette phase — uniquement une gestion
-- manuelle par canal : nom, notes, tarif spécifique optionnel saisi à la
-- main. hotel_channels existe déjà depuis 020g ("structure seule, hors
-- scope V1") ; on ajoute juste les deux colonnes manquantes pour cet usage
-- manuel, sans toucher aux réservations (aucun channel_id ajouté — un vrai
-- rattachement réservation ↔ canal attendra l'intégration réelle).

alter table public.hotel_channels
  add column if not exists notes text,
  add column if not exists manual_rate numeric(14,2);

comment on column public.hotel_channels.manual_rate is
  'Tarif spécifique au canal, saisi manuellement (aucune synchronisation automatique).';
