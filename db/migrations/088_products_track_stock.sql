-- 088_products_track_stock.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Mission "mise à jour ZegHotel" (item 6, premier tiret) : "possibilité
-- d'enregistrer produit avec stock et produit sans stock comme repas, plat,
-- café etc." — products est une table partagée avec ZegCaisse (pas de
-- colonne app_module, cf. CLAUDE.md), donc ce booléen profite aux deux apps
-- via le même ProductForm (src/components/app/ProductForm.tsx).
--
-- Défaut à true : aucun produit existant ne change de comportement tant que
-- le staff ne décoche pas explicitement le suivi de stock sur un article.
alter table public.products
  add column if not exists track_stock boolean not null default true;

-- create_hotel_pos_sale (migration 077, schema.sql) : ne pose plus de
-- mouvement de stock pour un article track_stock=false — un plat/café
-- vendu au POS ZegHotel ne doit pas accumuler de mouvements "sale" fictifs
-- sur un stock qui n'existe pas. Portée volontairement limitée à cette RPC
-- (ZegHotel) : create_sale (ZegCaisse, migration 026) n'est pas retouché
-- ici — changement de portée plus large sur une RPC atomique déjà en
-- production, hors périmètre de cette mission sans confirmation explicite.
-- Signature identique à la version existante (schema.sql) : CREATE OR
-- REPLACE remplace en toute sécurité.
create or replace function public.create_hotel_pos_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_payment_method public.payment_method,
  p_paid numeric
) returns public.hotel_pos_sales
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_reference text;
  v_sale public.hotel_pos_sales;
  v_track_stock boolean;
begin
  if not public.has_module_permission(p_organization_id, 'hotel_pos_interne', 'create') then
    raise exception 'Accès refusé.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Aucun article à vendre.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;
  v_total := greatest(0, v_subtotal - coalesce(p_discount, 0));

  v_reference := 'HP-' || to_char(now(), 'YYMMDD') || '-' || substr(md5(random()::text), 1, 4);

  insert into public.hotel_pos_sales (organization_id, reference, items, subtotal, discount, total, payment_method, paid, created_by)
  values (p_organization_id, v_reference, p_items, v_subtotal, coalesce(p_discount, 0), v_total, p_payment_method, coalesce(p_paid, v_total), auth.uid())
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_product_id is not null then
      select track_stock into v_track_stock from public.products where id = v_product_id;
      if coalesce(v_track_stock, true) then
        insert into public.stock_movements (organization_id, product_id, type, quantity, reason, reference, created_by)
        values (p_organization_id, v_product_id, 'sale', v_quantity, 'POS ZegHotel', v_reference, auth.uid());
      end if;
    end if;
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.create_hotel_pos_sale(uuid, jsonb, numeric, public.payment_method, numeric) from public;
grant execute on function public.create_hotel_pos_sale(uuid, jsonb, numeric, public.payment_method, numeric) to authenticated;
