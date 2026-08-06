-- Migration 074 — Réservations ZegCaisse : paiements échelonnés.
-- reservations.deposit était jusqu'ici un unique versement figé à la
-- création, jamais mis à jour ensuite — le client ne pouvait pas régler son
-- solde en plusieurs fois. reservation_payments journalise chaque
-- versement (comme `payments` pour les ventes) ; add_reservation_payment()
-- l'incrémente atomiquement, même schéma que add_sale_payment() (migration
-- 024) : verrou de ligne sous l'UPDATE, une seule instruction SQL.
-- Présentée pour relecture — NE PAS exécuter automatiquement.

create table if not exists public.reservation_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_reservation_payments_reservation on public.reservation_payments(reservation_id);
alter table public.reservation_payments enable row level security;

-- Même niveau que reservations_update ('manage') : régler un solde
-- échelonné est une modification de la réservation, pas sa création
-- initiale (déjà ouverte à cashier via reservations_insert/'create').
create policy reservation_payments_select on public.reservation_payments for select to authenticated
  using (public.has_module_permission(organization_id, 'reservations', 'view'));
create policy reservation_payments_insert on public.reservation_payments for insert to authenticated
  with check (public.has_module_permission(organization_id, 'reservations', 'manage'));

create or replace function public.add_reservation_payment(p_reservation_id uuid, p_amount numeric, p_method public.payment_method)
returns public.reservations
language plpgsql as $$
declare
  v_organization_id uuid;
  v_reservation public.reservations;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  select organization_id into v_organization_id from public.reservations where id = p_reservation_id;
  if v_organization_id is null then
    raise exception 'Réservation introuvable.';
  end if;

  insert into public.reservation_payments (organization_id, reservation_id, amount, method, created_by)
  values (v_organization_id, p_reservation_id, p_amount, p_method, auth.uid());

  update public.reservations
  set deposit = deposit + p_amount,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

revoke all on function public.add_reservation_payment(uuid, numeric, public.payment_method) from public;
grant execute on function public.add_reservation_payment(uuid, numeric, public.payment_method) to authenticated;
