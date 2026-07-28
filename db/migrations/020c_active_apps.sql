-- Migration 020c — ZegOS Chantier 2, étape 3/4 : ajoute organizations.active_apps
--
-- Colonne purement informative pour l'instant (aucune logique de
-- restriction ne s'y appuie encore) — prépare le support multi-application
-- par organisation (ex. une organisation avec ZegCaisse ET un futur
-- ZegHotel actifs simultanément sur le même établissement).
--
-- Nommée "active_apps" et non "active_modules" pour éviter toute confusion
-- avec plans.limits.modules (Bloc 27, déjà en prod) : ce dernier désigne un
-- concept totalement différent — les écrans internes de ZegCaisse
-- (Rapports, Nova IA, etc.) inclus ou non par une formule. "active_apps"
-- désigne les produits ZegOS eux-mêmes (ZegCaisse, ZegHotel, ZegERP…).
--
-- `add column ... default` remplit automatiquement les lignes existantes
-- (Postgres 11+, backfill optimisé sans réécriture table par table) — pas
-- besoin d'un UPDATE séparé.

alter table public.organizations
  add column if not exists active_apps jsonb not null default '["pos"]'::jsonb;
