-- Bloc 11 (Ventes) : corrige un bug pré-existant du Bloc 8 (tickets en
-- attente persistants). useDeleteHoldTicket() fait un DELETE sur `sales` —
-- or la policy sales_delete n'autorisait que owner/manager. Un cashier
-- (rôle qui utilise la Caisse au quotidien) ne pouvait donc jamais
-- reprendre ni supprimer son propre ticket en attente : l'opération
-- échouait silencieusement côté RLS. Corrigé en autorisant un cashier à
-- supprimer UNIQUEMENT ses propres ventes encore au statut 'draft' — les
-- ventes finalisées restent strictement owner/manager, comme avant.
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (
    public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[])
    or (status = 'draft' and cashier_id = auth.uid() and public.has_role_in_shop(shop_id, 'cashier'))
  );
