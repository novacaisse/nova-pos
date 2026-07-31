-- 026_atomic_create_sale.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Corrige deux problèmes liés, trouvés en auditant useCreateSale
-- (src/lib/data/hooks.ts) :
--
-- 1. apply_stock_movement() n'avait aucune garde contre une quantité
--    résultante négative : une vente pouvait faire passer stock_levels.quantity
--    sous zéro sans le moindre avertissement (survente silencieuse).
--
-- 2. useCreateSale enchaînait 4 écritures client séparées (sales, sale_items,
--    payments, stock_movements) sans transaction : si l'étape stock_movements
--    échouait à mi-parcours du panier (produit oversold), la vente restait
--    déjà créée et payée, avec des mouvements de stock pour certaines lignes
--    du panier mais pas toutes — un état incohérent, pire que l'absence de
--    garde-fou. Ajouter la garde de (1) SANS d'abord régler (2) aurait rendu
--    ce problème pire, pas mieux (c'est pourquoi la Phase 10 avait
--    volontairement laissé ce point de côté).
--
-- create_sale() déplace toute la séquence dans une seule fonction SQL :
-- un appel RPC = une transaction Postgres. Si un produit du panier est en
-- survente, l'exception lève et POSTGRES ANNULE TOUT (sale, sale_items,
-- payments, mouvements de stock déjà insérés pour les lignes précédentes du
-- même panier) — pas de vente fantôme, pas de mouvement de stock orphelin.
-- Security invoker (pas definer), comme add_sale_payment (migration 024) :
-- les policies RLS sales_insert/sale_items_insert/payments_insert/
-- stock_movements_insert_* s'appliquent normalement avec la session de
-- l'appelant, aucun changement de droits.

-- =============== 1. Garde-fou anti-survente ===============
-- Seuls 'sale'/'out'/'transfer' représentent une sortie réelle de stock
-- (marchandise qui quitte le contrôle de la boutique) : bloqués si le
-- niveau résultant serait négatif. 'adjustment' reste volontairement non
-- gardé — c'est une correction manuelle explicite (inventaire physique),
-- pas une opération commerciale, et peut légitimement corriger un compteur
-- déjà faux dans un sens ou l'autre.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'return' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'sale' then -new.quantity
    when 'transfer' then -new.quantity
    else 0
  end;
  insert into public.stock_levels (organization_id, product_id, quantity)
  values (new.organization_id, new.product_id, delta)
  on conflict (organization_id, product_id)
  do update set quantity = public.stock_levels.quantity + delta, updated_at = now()
  returning quantity into v_new_qty;

  if new.type in ('sale', 'out', 'transfer') and v_new_qty < 0 then
    raise exception 'Stock insuffisant pour ce produit (quantité disponible dépassée).';
  end if;

  return new;
end $$;

-- =============== 2. create_sale() — vente atomique ===============
-- p_items : jsonb array de {product_id, name, quantity, unit_price,
-- discount?, tax_rate?} — même forme que le tableau construit côté client
-- avant cette migration.
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
language plpgsql as $$
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
