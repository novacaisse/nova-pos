-- 030_hotel_maintenance_module.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 3 — Module Maintenance détaché (/app/hotel/maintenance) :
-- hotel_maintenance_tickets existait déjà mais ne vivait que dans l'onglet
-- Housekeeping, accessible en écriture à owner/manager/front_desk/
-- housekeeping seulement. Sorti en route propre, accessible à TOUT le
-- personnel hôtel pour signaler un incident (accountant ajouté ici) — le
-- suivi/la résolution reste réservé à owner/manager/housekeeping
-- (inchangé, cf. commentaire déjà présent sur hotel_maintenance_update).
drop policy if exists hotel_maintenance_select on public.hotel_maintenance_tickets;
create policy hotel_maintenance_select on public.hotel_maintenance_tickets for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping','accountant']::public.app_role[]));
drop policy if exists hotel_maintenance_insert on public.hotel_maintenance_tickets;
create policy hotel_maintenance_insert on public.hotel_maintenance_tickets for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','front_desk','housekeeping','accountant']::public.app_role[]));
