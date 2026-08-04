-- Migration 067 — Rôles personnalisés, Phase D-1 (ZegHotel) : bascule des
-- policies RLS hotel_* vers has_module_permission(), même principe que la
-- migration 064 pour ZegCaisse — chaque carve-out métier existant est
-- préservé verbatim (voir commentaire au-dessus de chaque bloc). Présentée
-- pour relecture — NE PAS exécuter automatiquement. À exécuter après 066.
--
-- Règle générale observée dans TOUTES les tables hotel_* qui ont une
-- policy _delete séparée (hotel_rooms, hotel_reservations,
-- hotel_housekeeping_tasks, hotel_maintenance_tickets) : la suppression
-- est strictement owner/manager, y compris pour des rôles qui ont le
-- droit de modifier (update) la même table (front_desk/housekeeping selon
-- les cas). Plutôt que de forcer cette nuance dans le modèle 3-niveaux
-- (qui combine update+delete dans 'manage'), ces 4 policies delete restent
-- codées en dur owner/manager — comme organization_members, une règle
-- métier qui ne doit jamais pouvoir être déléguée à un rôle personnalisé.
-- Les tables qui utilisaient une policy unique "for all" (donc SANS cette
-- distinction dans l'original) passent, elles, entièrement par
-- has_module_permission(...,'manage').

-- =============== hotel_room_types / hotel_rooms (module 'hotel_rooms') ===============
drop policy if exists hotel_room_types_write on public.hotel_room_types;
create policy hotel_room_types_write on public.hotel_room_types for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_rooms', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'manage'));

drop policy if exists hotel_rooms_insert on public.hotel_rooms;
create policy hotel_rooms_insert on public.hotel_rooms for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'create'));
-- Carve-out préservé : housekeeping peut changer le statut d'une chambre
-- (clean/dirty/inspected/out_of_service) même sans permission 'manage' sur
-- le module (commentaire d'origine : accès à toute la ligne par
-- simplicité RLS, l'UI ne lui expose que le changement de statut).
drop policy if exists hotel_rooms_update on public.hotel_rooms;
create policy hotel_rooms_update on public.hotel_rooms for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_rooms', 'manage') or public.has_role_in_organization(organization_id, 'housekeeping'))
  with check (public.has_module_permission(organization_id, 'hotel_rooms', 'manage') or public.has_role_in_organization(organization_id, 'housekeeping'));
drop policy if exists hotel_rooms_delete on public.hotel_rooms;
create policy hotel_rooms_delete on public.hotel_rooms for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== hotel_rate_plans / hotel_seasonal_rates / hotel_rate_restrictions / hotel_settings (module 'hotel_parametres') ===============
drop policy if exists hotel_rate_plans_write on public.hotel_rate_plans;
create policy hotel_rate_plans_write on public.hotel_rate_plans for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));
drop policy if exists hotel_seasonal_rates_write on public.hotel_seasonal_rates;
create policy hotel_seasonal_rates_write on public.hotel_seasonal_rates for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));
drop policy if exists hotel_rate_restrictions_write on public.hotel_rate_restrictions;
create policy hotel_rate_restrictions_write on public.hotel_rate_restrictions for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));
drop policy if exists hotel_settings_write on public.hotel_settings;
create policy hotel_settings_write on public.hotel_settings for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_parametres', 'manage'));

-- =============== hotel_corporate_accounts (module 'hotel_corporate') ===============
drop policy if exists hotel_corporate_select on public.hotel_corporate_accounts;
create policy hotel_corporate_select on public.hotel_corporate_accounts for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_corporate', 'view'));
drop policy if exists hotel_corporate_write on public.hotel_corporate_accounts;
create policy hotel_corporate_write on public.hotel_corporate_accounts for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_corporate', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_corporate', 'manage'));

-- =============== hotel_channels (module 'hotel_canaux') ===============
-- Policy d'origine unique (using = with check, owner/manager pour tout,
-- y compris la lecture) — reproduit fidèlement avec un seul niveau
-- 'manage' plutôt que de distinguer view/manage comme ailleurs.
drop policy if exists hotel_channels_all on public.hotel_channels;
create policy hotel_channels_all on public.hotel_channels for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_canaux', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_canaux', 'manage'));

-- =============== hotel_guests (module 'hotel_clients') ===============
-- hotel_guest_contact() (masquage de colonnes pour accountant) n'est pas
-- touchée par cette migration — carve-out indépendant de la RLS de table.
drop policy if exists hotel_guests_select on public.hotel_guests;
create policy hotel_guests_select on public.hotel_guests for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_clients', 'view'));
drop policy if exists hotel_guests_write on public.hotel_guests;
create policy hotel_guests_write on public.hotel_guests for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_clients', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_clients', 'manage'));

-- =============== hotel_reservations / hotel_reservation_rooms (module 'hotel_reservations') ===============
drop policy if exists hotel_reservations_select on public.hotel_reservations;
create policy hotel_reservations_select on public.hotel_reservations for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'view'));
drop policy if exists hotel_reservations_insert on public.hotel_reservations;
create policy hotel_reservations_insert on public.hotel_reservations for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'create'));
drop policy if exists hotel_reservations_update on public.hotel_reservations;
create policy hotel_reservations_update on public.hotel_reservations for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'));
-- Carve-out préservé : suppression définitive (hors annulation) reste
-- owner/manager, jamais délégable — conserve l'historique par défaut.
drop policy if exists hotel_reservations_delete on public.hotel_reservations;
create policy hotel_reservations_delete on public.hotel_reservations for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

drop policy if exists hotel_resv_rooms_select on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_select on public.hotel_reservation_rooms for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'view'));
drop policy if exists hotel_resv_rooms_write on public.hotel_reservation_rooms;
create policy hotel_resv_rooms_write on public.hotel_reservation_rooms for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_reservations', 'manage'));

-- =============== hotel_folios / hotel_folio_charges (module 'hotel_folios') ===============
drop policy if exists hotel_folios_select on public.hotel_folios;
create policy hotel_folios_select on public.hotel_folios for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'view'));
drop policy if exists hotel_folios_write on public.hotel_folios;
create policy hotel_folios_write on public.hotel_folios for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_folios', 'manage'));

drop policy if exists hotel_folio_charges_select on public.hotel_folio_charges;
create policy hotel_folio_charges_select on public.hotel_folio_charges for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'view'));
drop policy if exists hotel_folio_charges_write on public.hotel_folio_charges;
create policy hotel_folio_charges_write on public.hotel_folio_charges for all to authenticated
  using (public.has_module_permission(organization_id, 'hotel_folios', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_folios', 'manage'));

-- post_hotel_pos_charge() : autorisation réelle branchée sur le module
-- 'hotel_pos_interne' plutôt qu'une liste de rôles en dur — la seule
-- fonction hôtel qui accordait un accès métier via un check de rôle
-- explicite (pas une policy RLS classique), donc à migrer ici aussi pour
-- respecter l'exigence "permission réellement appliquée" sur ce module.
create or replace function public.post_hotel_pos_charge(
  p_organization_id uuid,
  p_folio_id uuid,
  p_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_folio public.hotel_folios;
begin
  if not public.has_module_permission(p_organization_id, 'hotel_pos_interne', 'create') then
    raise exception 'Accès refusé.';
  end if;

  select * into v_folio from public.hotel_folios where id = p_folio_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Note introuvable.';
  end if;
  if v_folio.status <> 'open' then
    raise exception 'Impossible d''ajouter une charge à une note clôturée.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Aucun article à facturer.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantité invalide.';
    end if;

    insert into public.hotel_folio_charges (organization_id, folio_id, kind, description, amount, quantity)
    values (p_organization_id, p_folio_id, 'extra', v_item->>'name', (v_item->>'unit_price')::numeric, round(v_quantity)::int);

    if v_product_id is not null then
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, created_by)
      values (p_organization_id, v_product_id, 'sale', v_quantity, 'POS interne ZegHotel', auth.uid());
    end if;
  end loop;
end;
$$;

-- =============== hotel_payments (module 'hotel_payments') ===============
drop policy if exists hotel_payments_select on public.hotel_payments;
create policy hotel_payments_select on public.hotel_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'view'));
drop policy if exists hotel_payments_insert on public.hotel_payments;
create policy hotel_payments_insert on public.hotel_payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_payments', 'create'));
drop policy if exists hotel_payments_update on public.hotel_payments;
create policy hotel_payments_update on public.hotel_payments for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_payments', 'manage'));
drop policy if exists hotel_payments_delete on public.hotel_payments;
create policy hotel_payments_delete on public.hotel_payments for delete to authenticated
  using (public.has_module_permission(organization_id, 'hotel_payments', 'manage'));

-- =============== hotel_housekeeping_tasks (module 'hotel_housekeeping') ===============
drop policy if exists hotel_housekeeping_select on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_select on public.hotel_housekeeping_tasks for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_housekeeping', 'view'));
drop policy if exists hotel_housekeeping_insert on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_insert on public.hotel_housekeeping_tasks for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_housekeeping', 'create'));
drop policy if exists hotel_housekeeping_update on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_update on public.hotel_housekeeping_tasks for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_housekeeping', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_housekeeping', 'manage'));
-- Carve-out préservé : suppression d'une tâche reste owner/manager, même
-- pour front_desk/housekeeping qui peuvent la créer/modifier.
drop policy if exists hotel_housekeeping_delete on public.hotel_housekeeping_tasks;
create policy hotel_housekeeping_delete on public.hotel_housekeeping_tasks for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

-- =============== hotel_maintenance_tickets (module 'hotel_maintenance') ===============
drop policy if exists hotel_maintenance_select on public.hotel_maintenance_tickets;
create policy hotel_maintenance_select on public.hotel_maintenance_tickets for select to authenticated
  using (public.has_module_permission(organization_id, 'hotel_maintenance', 'view'));
drop policy if exists hotel_maintenance_insert on public.hotel_maintenance_tickets;
create policy hotel_maintenance_insert on public.hotel_maintenance_tickets for insert to authenticated
  with check (public.has_module_permission(organization_id, 'hotel_maintenance', 'create'));
drop policy if exists hotel_maintenance_update on public.hotel_maintenance_tickets;
create policy hotel_maintenance_update on public.hotel_maintenance_tickets for update to authenticated
  using (public.has_module_permission(organization_id, 'hotel_maintenance', 'manage'))
  with check (public.has_module_permission(organization_id, 'hotel_maintenance', 'manage'));
-- Carve-out préservé : suppression d'un ticket reste owner/manager, même
-- pour housekeeping qui peut le créer/modifier.
drop policy if exists hotel_maintenance_delete on public.hotel_maintenance_tickets;
create policy hotel_maintenance_delete on public.hotel_maintenance_tickets for delete to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
