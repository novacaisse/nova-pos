-- Migration 046 — ZegResto V2, étape 8 : réglages complémentaires
-- (Ticket & Caisse, Sons & Notifications). Présentée pour relecture — NE
-- PAS exécuter automatiquement. À exécuter après 045 (fidélité).
--
-- Additif sur resto_settings (créée migration 044) — ne touche à aucune
-- colonne existante :
--   - cash_float_default / cash_float_required : fond de caisse ZegResto.
--     Vérification faite (cf. CLAUDE.md/ARCHITECTURE.md, aucune fonction-
--     nalité de suivi de session de caisse — ouverture/fermeture, écarts —
--     n'existe nulle part dans ZegOS aujourd'hui, ZegCaisse compris) :
--     scope volontairement réduit à un réglage de configuration (montant
--     par défaut + bascule "ouverture obligatoire"), PAS une fonctionnalité
--     de suivi de session complète avec journal d'écarts — non demandée
--     explicitement comme un livrable séparé de ce chantier.
--   - reservation_sound_enabled : alerte sonore à l'arrivée d'une nouvelle
--     réservation en ligne (staff), réutilise le même choix de son/volume
--     que le KDS (kds_sound_choice/kds_sound_volume, migration 044) — une
--     seule palette sonore pour tout ZegResto plutôt que dupliquer
--     choix+volume par type d'alerte, non demandé avec cette granularité.
--
-- Le reste de "Ticket & Caisse" (en-tête/pied de page/mentions légales du
-- reçu imprimé) réutilise organization_settings (receipt_header,
-- receipt_footer, receipt_logo_url, data.ticket) — déjà présent et déjà
-- alimenté par OrgIdentityTab pour l'adresse/téléphone/IFU, table partagée
-- par toutes les applications ZegOS, aucune nouvelle colonne nécessaire.

alter table public.resto_settings add column if not exists cash_float_default numeric(14,2) not null default 0 check (cash_float_default >= 0);
alter table public.resto_settings add column if not exists cash_float_required boolean not null default false;
alter table public.resto_settings add column if not exists reservation_sound_enabled boolean not null default true;
