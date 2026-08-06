-- Migration 073 — Paramètres ZegCaisse : bascule "vente en rupture de
-- stock" (organization_settings.data.allow_oversell, boolean, défaut
-- false — comportement actuel inchangé tant que la boutique n'a jamais
-- touché ce réglage). apply_stock_movement() (migration 026) bloquait tout
-- mouvement 'sale' qui ferait passer le stock sous zéro, sans exception :
-- quand la bascule est activée, une vente peut désormais faire passer le
-- stock en négatif ("-X" jusqu'à réapprovisionnement/ajustement) — 'out' et
-- 'transfer' restent gardés dans tous les cas (mouvements internes, pas des
-- ventes clients, jamais concernés par ce réglage).
-- Présentée pour relecture — NE PAS exécuter automatiquement.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
  v_allow_oversell boolean;
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
    if new.type = 'sale' then
      select coalesce((data->>'allow_oversell')::boolean, false) into v_allow_oversell
      from public.organization_settings where organization_id = new.organization_id;
    else
      v_allow_oversell := false;
    end if;
    if not v_allow_oversell then
      raise exception 'Stock insuffisant pour ce produit (quantité disponible dépassée).';
    end if;
  end if;

  return new;
end $$;
