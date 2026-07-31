-- 024_atomic_sale_payment.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Corrige une perte de mise à jour concurrente trouvée en auditant les
-- ventes à crédit : useAddSalePayment (src/lib/data/hooks.ts) calculait
-- `paid`/`change_due` côté client à partir d'un objet `sale` déjà en
-- mémoire (paid = sale.paid + amount), puis écrasait la ligne avec cette
-- valeur. Deux paiements complémentaires ajoutés à quelques instants
-- d'écart sur la même vente à crédit (deux appareils, ou caissier et
-- comptable qui règlent la même vente en parallèle) lisent tous les deux
-- le même `sale.paid` obsolète : les deux lignes `payments` sont bien
-- insérées (le journal est correct), mais le second `update` écrase l'effet
-- du premier sur `sales.paid`/`change_due` — la vente reste affichée comme
-- partiellement payée alors qu'elle est en réalité soldée.
--
-- add_sale_payment() déplace le calcul dans une seule instruction SQL
-- atomique (`set paid = paid + p_amount`), évaluée sous le verrou de ligne
-- de l'UPDATE — Postgres sérialise alors correctement les deux paiements
-- concurrents au lieu de laisser le second écraser le premier. Function
-- security invoker (pas definer) : les policies RLS existantes sur
-- sales/payments s'appliquent normalement avec la session de l'appelant,
-- exactement comme le faisaient les deux écritures client qu'elle remplace
-- — aucun changement de droits, uniquement d'atomicité.

create or replace function public.add_sale_payment(p_sale_id uuid, p_amount numeric, p_method public.payment_method)
returns public.sales
language plpgsql as $$
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
