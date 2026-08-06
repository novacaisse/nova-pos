-- Migration 078 — Statut chambre automatique + génération automatique des
-- tâches de ménage (jusqu'ici : housekeeping_status et hotel_housekeeping_tasks
-- ne bougeaient jamais tout seuls, une gouvernante/réception devait cliquer
-- "Générer les tâches du jour" ET marquer chaque chambre "propre" à la
-- main). Deux triggers ferment la boucle :
-- 1. Check-out (hotel_reservations.status -> 'checked_out') : les chambres
--    de la réservation passent "dirty" ET une tâche 'turnover' est créée
--    tout de suite (même logique anti-doublon que useGenerateHousekeepingTasks,
--    reprise ici) — la gouvernante n'a plus besoin d'attendre un clic.
-- 2. Tâche marquée 'done' (kind cleaning/turnover) : la chambre repasse
--    "clean" automatiquement.
-- 'out_of_service' n'est jamais écrasé par ces triggers (une chambre en
-- maintenance ne redevient pas "sale" ou "propre" toute seule).
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create or replace function public.hotel_room_dirty_on_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_room record;
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    for v_room in
      select room_id from public.hotel_reservation_rooms where reservation_id = new.id
    loop
      update public.hotel_rooms
      set housekeeping_status = 'dirty'
      where id = v_room.room_id and housekeeping_status <> 'out_of_service';

      insert into public.hotel_housekeeping_tasks (organization_id, room_id, task_date, kind)
      select new.organization_id, v_room.room_id, current_date, 'turnover'
      where not exists (
        select 1 from public.hotel_housekeeping_tasks
        where room_id = v_room.room_id and task_date = current_date and status <> 'done'
      );
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_hotel_room_dirty_on_checkout on public.hotel_reservations;
create trigger trg_hotel_room_dirty_on_checkout
  after update on public.hotel_reservations
  for each row execute function public.hotel_room_dirty_on_checkout();

create or replace function public.hotel_room_clean_on_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.kind in ('cleaning', 'turnover') then
    update public.hotel_rooms
    set housekeeping_status = 'clean'
    where id = new.room_id and housekeeping_status <> 'out_of_service';
  end if;
  return new;
end $$;

drop trigger if exists trg_hotel_room_clean_on_task_done on public.hotel_housekeeping_tasks;
create trigger trg_hotel_room_clean_on_task_done
  after update on public.hotel_housekeeping_tasks
  for each row execute function public.hotel_room_clean_on_task_done();
