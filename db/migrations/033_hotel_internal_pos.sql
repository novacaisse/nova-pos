-- 033_hotel_internal_pos.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- ZegHotel Phase 7 — Point de vente interne (restaurant/bar/room service) :
-- facturer un article directement sur le folio d'un client en séjour,
-- plutôt qu'en caisse séparée. Réutilise le modèle products/categories/
-- stock_levels/stock_movements de ZegCaisse (déjà scopé organization_id,
-- déjà présent mais totalement inutilisé côté ZegHotel jusqu'ici — aucune
-- nouvelle table nécessaire pour le catalogue).
--
-- post_hotel_pos_charge() : products_select/stock_levels_select sont déjà
-- ouverts à tout membre (has_organization_access), mais l'écriture de
-- stock_movements est restreinte à owner/manager/stock (stock_movements_
-- insert_full) ou à cashier pour type in('sale','return')
-- (stock_movements_insert_cashier) — aucun des deux ne couvre front_desk,
-- le rôle qui opère réellement ce POS interne côté hôtel (il n'existe pas
-- de rôle "cashier" assignable dans une organisation ZegHotel). Plutôt que
-- d'élargir stock_movements_insert_full à front_desk (lui donnerait accès
-- à TOUS les types de mouvement, bien au-delà du besoin), cette fonction
-- security definer accorde uniquement la capacité étroite "vendre un
-- produit du catalogue contre une note ouverte" — même logique que
-- add_sale_payment/create_sale (RPC dédiée plutôt qu'élargissement de
-- policy générale). Le garde-fou anti-survente (apply_stock_movement(),
-- migration 026) s'applique normalement, aucune exception.
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
  if not public.has_any_role_in_organization(p_organization_id, array['owner', 'manager', 'front_desk']::public.app_role[]) then
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

revoke all on function public.post_hotel_pos_charge(uuid, uuid, jsonb) from public;
grant execute on function public.post_hotel_pos_charge(uuid, uuid, jsonb) to authenticated;
