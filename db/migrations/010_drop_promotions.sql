-- Migration 010 — suppression complète du module Promotions.
-- Irréversible : supprime la table (et toutes ses lignes), ses policies et
-- son index. Aucune autre table ne référence promotions par une FK (seule
-- promotions.product_id référence products, dans l'autre sens), donc rien
-- d'autre n'est impacté.

drop policy if exists promotions_select on public.promotions;
drop policy if exists promotions_write on public.promotions;
drop policy if exists promotions_update on public.promotions;
drop policy if exists promotions_delete on public.promotions;

drop table if exists public.promotions;
