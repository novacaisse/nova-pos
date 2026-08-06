-- Migration 082 — Onboarding ZegHotel obligatoire (Mission "Onboarding +
-- MoneyFusion + permissions", Partie 1).
--
-- HotelSetupForm (OnboardingFlow.tsx) ne créait jusqu'ici que l'identité de
-- l'établissement (nom/ville/téléphone/logo) — zéro chambre, zéro type de
-- chambre. Un hôtelier terminait son inscription sur un tableau de bord
-- "0/0 chambres" sans aucun guide pour la suite (constat de
-- AUDIT_ZEGHOTEL_FINALISATION_2026-08.md, §3). Cette colonne porte le
-- verrou frontend : /app/hotel/* reste bloqué sur un wizard (app.hotel.tsx)
-- tant qu'aucune chambre n'a été créée.
--
-- organizations plutôt que hotel_settings : hotel_settings n'a pas de ligne
-- garantie à la création d'une organisation (upsert-au-premier-enregistrement,
-- comme organization_settings côté ZegCaisse) — organizations, elle, existe
-- toujours dès provision_organization(). Colonne sans effet pour les autres
-- app_module (pos/resto/erp), jamais lue en dehors des routes /app/hotel.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

alter table public.organizations
  add column if not exists hotel_onboarding_completed boolean not null default false;

-- Backfill : toute organisation hôtel qui a déjà au moins une chambre a
-- forcément déjà été configurée avant ce chantier — jamais bloquée
-- rétroactivement par le nouveau wizard.
update public.organizations o
set hotel_onboarding_completed = true
where o.app_module = 'hotel'
  and exists (select 1 from public.hotel_rooms hr where hr.organization_id = o.id);
