-- Migration 094 — Fixe search_path sur les 3 fonctions SECURITY INVOKER
-- signalées "Function Search Path Mutable" par le Security Advisor Supabase
-- et par AUDIT_ANON_RPC_2026-08.md (action #2) : create_sale(),
-- add_sale_payment(), create_hotel_reservation().
--
-- Risque bas (SECURITY INVOKER, pas DEFINER — ces fonctions s'exécutent
-- avec les droits de l'appelant, RLS non contournée) mais ce sont les 3
-- fonctions financières/réservation les plus utilisées de l'app :
-- cohérence avec le reste du code (add_reservation_payment, migration 079,
-- et toutes les fonctions DEFINER du projet) justifie de les aligner —
-- sans `search_path` figé, un rôle malveillant capable de créer un objet
-- (fonction, opérateur) dans un schéma placé plus tôt que `public` dans le
-- search_path de la session pourrait le faire résoudre à la place de
-- l'objet `public` attendu.
--
-- Signatures identiques dans les 3 cas — CREATE OR REPLACE suffit, pas de
-- DROP FUNCTION nécessaire. Corps inchangé, seul `set search_path = public`
-- est ajouté à la clause `language plpgsql`.
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

-- ============ add_sale_payment ============
create or replace function public.add_sale_payment(p_sale_id uuid, p_amount numeric, p_method public.payment_method)
returns public.sales
language plpgsql set search_path = public as $$
declare
  v_organization_id uuid;
  v_sale public.sales;
begin
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif.';
  end if;

  select organization_id into v_organization_id from public.sales where id = p_sale_id;
  if v_organization_id is null then
    raise exception 'Vente introuvable.';
  end if;

  insert into public.payments (organization_id, sale_id, method, amount)
  values (v_organization_id, p_sale_id, case when p_method = 'mixed' then 'cash' else p_method end, p_amount);

  update public.sales
  set paid = paid + p_amount,
      change_due = greatest(0, (paid + p_amount) - total)
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.add_sale_payment(uuid, numeric, public.payment_method) from public;
grant execute on function public.add_sale_payment(uuid, numeric, public.payment_method) to authenticated;

-- ============ create_sale ============
create or replace function public.create_sale(
  p_organization_id uuid,
  p_reference text,
  p_customer_id uuid,
  p_payment_method public.payment_method,
  p_paid numeric,
  p_items jsonb,
  p_discount numeric default 0,
  p_notes text default null,
  p_status public.sale_status default 'completed'
) returns public.sales
language plpgsql set search_path = public as $$
declare
  v_item jsonb;
  v_item_discount numeric(14,2);
  v_item_total numeric(14,2);
  v_product_id uuid;
  v_subtotal numeric(14,2) := 0;
  v_items_discount numeric(14,2) := 0;
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_change_due numeric(14,2);
  v_sale public.sales;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La vente doit contenir au moins un article.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_items_discount := v_items_discount + coalesce((v_item->>'discount')::numeric, 0);
  end loop;

  v_discount := coalesce(p_discount, 0) + v_items_discount;
  v_total := greatest(0, v_subtotal - v_discount);
  v_change_due := greatest(0, p_paid - v_total);

  insert into public.sales (
    organization_id, reference, customer_id, cashier_id, status,
    subtotal, discount, tax, total, paid, change_due, payment_method, notes
  ) values (
    p_organization_id, p_reference, p_customer_id, auth.uid(), coalesce(p_status, 'completed'),
    v_subtotal, v_discount, 0, v_total, p_paid, v_change_due, p_payment_method, p_notes
  ) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_item_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric - v_item_discount;
    v_product_id := nullif(v_item->>'product_id', '')::uuid;

    insert into public.sale_items (
      organization_id, sale_id, product_id, name, quantity, unit_price, discount, tax_rate, total
    ) values (
      p_organization_id, v_sale.id, v_product_id, v_item->>'name',
      (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
      v_item_discount, coalesce((v_item->>'tax_rate')::numeric, 0), v_item_total
    );

    if v_product_id is not null then
      insert into public.stock_movements (organization_id, product_id, type, quantity, reason, reference, created_by)
      values (p_organization_id, v_product_id, 'sale', (v_item->>'quantity')::numeric,
        'Vente ' || p_reference, p_reference, auth.uid());
    end if;
  end loop;

  if p_paid > 0 then
    insert into public.payments (organization_id, sale_id, method, amount)
    values (p_organization_id, v_sale.id, case when p_payment_method = 'mixed' then 'cash' else p_payment_method end, p_paid);
  end if;

  return v_sale;
end;
$$;

revoke all on function public.create_sale(uuid, text, uuid, public.payment_method, numeric, jsonb, numeric, text, public.sale_status) from public;
grant execute on function public.create_sale(uuid, text, uuid, public.payment_method, numeric, jsonb, numeric, text, public.sale_status) to authenticated;

-- ============ create_hotel_reservation ============
create or replace function public.create_hotel_reservation(
  p_organization_id uuid,
  p_guest_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms jsonb,
  p_rate_plan_id uuid default null,
  p_corporate_account_id uuid default null,
  p_channel text default 'direct',
  p_adults integer default 1,
  p_children integer default 0,
  p_notes text default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null
) returns public.hotel_reservations
language plpgsql set search_path = public as $$
declare
  v_reservation public.hotel_reservations;
  v_room jsonb;
  v_room_id uuid;
  v_room_type_id uuid;
  v_rate numeric(14,2);
  v_billing_unit text := 'night';
  v_hourly_rate numeric(14,2);
  v_room_hourly_rate numeric(14,2);
  v_billed_hours numeric;
begin
  if p_rooms is null or jsonb_array_length(p_rooms) = 0 then
    raise exception 'Sélectionnez au moins une chambre.';
  end if;

  if p_rate_plan_id is not null then
    select billing_unit, hourly_rate into v_billing_unit, v_hourly_rate
    from public.hotel_rate_plans where id = p_rate_plan_id;
    v_billing_unit := coalesce(v_billing_unit, 'night');
  end if;

  if p_check_in_at is not null and p_check_out_at is not null then
    v_billing_unit := 'hour';
  end if;

  if v_billing_unit = 'hour' and (p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at) then
    raise exception 'Une réservation horaire nécessite une heure d''arrivée et de départ prévues valides.';
  end if;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms
    where id = v_room_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Chambre introuvable.';
    end if;
    perform public.hotel_check_rate_restrictions(p_organization_id, v_room_type_id, p_check_in, p_check_out);
  end loop;

  insert into public.hotel_reservations (
    organization_id, guest_id, corporate_account_id, check_in, check_out,
    rate_plan_id, channel, adults, children, notes, created_by,
    billing_unit, check_in_at, check_out_at
  ) values (
    p_organization_id, p_guest_id, p_corporate_account_id, p_check_in,
    case when v_billing_unit = 'hour' then p_check_in else p_check_out end,
    p_rate_plan_id, coalesce(p_channel, 'direct'), coalesce(p_adults, 1), coalesce(p_children, 0), p_notes, auth.uid(),
    v_billing_unit, p_check_in_at, p_check_out_at
  ) returning * into v_reservation;

  for v_room in select * from jsonb_array_elements(p_rooms) loop
    v_room_id := (v_room->>'room_id')::uuid;
    select room_type_id into v_room_type_id from public.hotel_rooms where id = v_room_id;

    v_room_hourly_rate := null;
    if v_billing_unit = 'hour' then
      v_room_hourly_rate := v_hourly_rate;
      if v_room_hourly_rate is null then
        select hourly_rate into v_room_hourly_rate from public.hotel_room_types where id = v_room_type_id;
      end if;
    end if;

    if (v_room ? 'rate_amount') and (v_room->>'rate_amount') is not null then
      v_rate := (v_room->>'rate_amount')::numeric;
    elsif v_billing_unit = 'hour' then
      v_billed_hours := greatest(1, ceil(extract(epoch from (p_check_out_at - p_check_in_at)) / 3600.0));
      v_rate := round(v_billed_hours * coalesce(v_room_hourly_rate, 0), 2);
    else
      v_rate := public.hotel_compute_room_rate(v_room_type_id, p_check_in, p_check_out, p_rate_plan_id);
    end if;

    insert into public.hotel_reservation_rooms (organization_id, reservation_id, room_id, rate_amount, hourly_rate)
    values (p_organization_id, v_reservation.id, v_room_id, v_rate, v_room_hourly_rate);
  end loop;

  insert into public.hotel_folios (organization_id, reservation_id) values (p_organization_id, v_reservation.id);

  return v_reservation;
end;
$$;

revoke all on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) from public;
grant execute on function public.create_hotel_reservation(uuid, uuid, date, date, jsonb, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz) to authenticated;
