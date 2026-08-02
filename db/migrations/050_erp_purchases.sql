-- Migration 050 — ZegERP, module 2/10 : Achats & Fournisseurs. Présentée
-- pour relecture — NE PAS exécuter automatiquement. À exécuter après 049
-- (rôle buyer + types de mouvement purchase_receipt/supplier_return).
--
-- Séparation des rôles (ARCHITECTURE_ERP.md, "Rôles ZegERP — validés") :
-- `buyer` porte tout le volet commercial/papier (fournisseurs, demandes,
-- commandes, factures, retours) ; `stock` (déjà existant, réutilisé) porte
-- exclusivement la réception physique (erp_goods_receipts) — cloisonnement
-- volontaire, pas un oubli : un acheteur ne réceptionne pas, un magasinier
-- ne négocie pas de commande.
--
-- Masquage de colonne (CLAUDE.md, priorité sécurité #1) : erp_purchase_
-- order_lines porte unit_cost (donnée sensible). Le rôle `stock` n'a pas
-- accès à cette table via policy SELECT directe (il n'a pas à voir les
-- coûts d'achat) mais doit pouvoir consulter quantités commandées/reçues
-- pour réceptionner : erp_purchase_order_lines_for_receiving() ci-dessous
-- est la fonction security definer étroite qui ne retourne que les
-- colonnes sûres, sur le modèle de hotel_guest_contact().

-- =============== erp_suppliers ===============
create table if not exists public.erp_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_suppliers_org on public.erp_suppliers(organization_id);
alter table public.erp_suppliers enable row level security;

create policy erp_suppliers_select on public.erp_suppliers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','stock']::public.app_role[]));
create policy erp_suppliers_write on public.erp_suppliers for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));

-- =============== erp_purchase_requests + erp_purchase_request_lines
-- (demande interne, avant commande — étape optionnelle : une commande peut
-- aussi être créée directement sans demande préalable, request_id restant
-- alors null côté erp_purchase_orders) ===============
create table if not exists public.erp_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_erp_purchase_requests_org on public.erp_purchase_requests(organization_id);
alter table public.erp_purchase_requests enable row level security;

create policy erp_purchase_requests_select on public.erp_purchase_requests for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','stock']::public.app_role[]));
create policy erp_purchase_requests_insert on public.erp_purchase_requests for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[]));
-- Édition libre tant que 'draft' (y compris la transition vers 'submitted').
create policy erp_purchase_requests_update_draft on public.erp_purchase_requests for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[]))
  with check (status in ('draft', 'submitted') and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[]));
-- Revue (approve/reject) réservée à owner/manager — l'auteur de la demande
-- (même s'il a le rôle buyer/stock) ne s'auto-approuve pas.
create policy erp_purchase_requests_review on public.erp_purchase_requests for update to authenticated
  using (status = 'submitted' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (status in ('approved', 'rejected') and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
create policy erp_purchase_requests_delete on public.erp_purchase_requests for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[]));

create table if not exists public.erp_purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.erp_purchase_requests(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  notes text
);
create index if not exists idx_erp_purchase_request_lines_org on public.erp_purchase_request_lines(organization_id);
create index if not exists idx_erp_purchase_request_lines_request on public.erp_purchase_request_lines(request_id);
alter table public.erp_purchase_request_lines enable row level security;

create policy erp_purchase_request_lines_select on public.erp_purchase_request_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','stock']::public.app_role[]));
create policy erp_purchase_request_lines_write on public.erp_purchase_request_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[])
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer','stock']::public.app_role[])
    and exists (select 1 from public.erp_purchase_requests r where r.id = request_id and r.status = 'draft')
  );

-- =============== erp_purchase_orders + erp_purchase_order_lines ===============
create table if not exists public.erp_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  request_id uuid references public.erp_purchase_requests(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_received', 'received', 'cancelled')),
  expected_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_purchase_orders_org on public.erp_purchase_orders(organization_id);
create index if not exists idx_erp_purchase_orders_supplier on public.erp_purchase_orders(supplier_id);
alter table public.erp_purchase_orders enable row level security;

-- Pas de coût au niveau de l'en-tête (uniquement au niveau des lignes) :
-- select ouvert à `stock` ici, il doit savoir quelles commandes réceptionner.
create policy erp_purchase_orders_select on public.erp_purchase_orders for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer','stock']::public.app_role[]));
create policy erp_purchase_orders_insert on public.erp_purchase_orders for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));
-- Édition libre tant que 'draft' (y compris confirmation, càd envoi au fournisseur).
create policy erp_purchase_orders_update_draft on public.erp_purchase_orders for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]))
  with check (status in ('draft', 'confirmed') and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));
-- Annulation possible tant que la réception n'est pas terminée. Les
-- transitions vers 'partially_received'/'received' ne passent JAMAIS par
-- cette policy : uniquement par confirm_erp_goods_receipt() plus bas.
create policy erp_purchase_orders_cancel on public.erp_purchase_orders for update to authenticated
  using (status in ('confirmed', 'partially_received') and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]))
  with check (status = 'cancelled' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));
create policy erp_purchase_orders_delete on public.erp_purchase_orders for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));

create table if not exists public.erp_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0,
  -- Jamais modifiée directement (aucune policy update ne s'applique une
  -- fois la commande hors 'draft') : incrémentée exclusivement par
  -- confirm_erp_goods_receipt() (security definer, plus bas), qui bypasse
  -- la RLS comme apply_erp_stock_movement() et les RPC de la migration 048.
  received_quantity numeric(14,3) not null default 0,
  check (received_quantity >= 0 and received_quantity <= quantity)
);
create index if not exists idx_erp_purchase_order_lines_org on public.erp_purchase_order_lines(organization_id);
create index if not exists idx_erp_purchase_order_lines_order on public.erp_purchase_order_lines(purchase_order_id);
alter table public.erp_purchase_order_lines enable row level security;

-- `stock` volontairement absent de cette policy : unit_cost est une donnée
-- sensible (voir en-tête de fichier) — accès restreint au rôle qui négocie
-- les achats et à ceux qui supervisent/comptabilisent, pas à qui réceptionne.
create policy erp_purchase_order_lines_select on public.erp_purchase_order_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]));
create policy erp_purchase_order_lines_write on public.erp_purchase_order_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[])
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[])
    and exists (select 1 from public.erp_purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

-- Fonction de masquage de colonne pour `stock` (et toute autre personne
-- autorisée) : renvoie uniquement produit/quantité commandée/quantité déjà
-- reçue pour les lignes d'une commande, jamais unit_cost. C'est la seule
-- voie par laquelle `stock` peut consulter les lignes d'une commande.
create or replace function public.erp_purchase_order_lines_for_receiving(
  p_organization_id uuid,
  p_purchase_order_id uuid
) returns table (id uuid, product_id uuid, quantity numeric, received_quantity numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','accountant','buyer','stock']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  return query
    select l.id, l.product_id, l.quantity, l.received_quantity
    from public.erp_purchase_order_lines l
    join public.erp_purchase_orders o on o.id = l.purchase_order_id
    where l.purchase_order_id = p_purchase_order_id and o.organization_id = p_organization_id;
end;
$$;
revoke all on function public.erp_purchase_order_lines_for_receiving(uuid, uuid) from public;
grant execute on function public.erp_purchase_order_lines_for_receiving(uuid, uuid) to authenticated;

-- =============== erp_goods_receipts + erp_goods_receipt_lines (réception
-- physique — rôle `stock`, jamais `buyer` directement, voir en-tête) ===============
create table if not exists public.erp_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_goods_receipts_org on public.erp_goods_receipts(organization_id);
create index if not exists idx_erp_goods_receipts_order on public.erp_goods_receipts(purchase_order_id);
alter table public.erp_goods_receipts enable row level security;

create policy erp_goods_receipts_select on public.erp_goods_receipts for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_goods_receipts_insert on public.erp_goods_receipts for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
-- Comme les transferts (migration 048) : la confirmation (qui crée les
-- mouvements de stock) passe exclusivement par confirm_erp_goods_receipt(),
-- jamais par une écriture directe de `status`.
create policy erp_goods_receipts_update on public.erp_goods_receipts for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
create policy erp_goods_receipts_delete on public.erp_goods_receipts for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

create table if not exists public.erp_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id uuid not null references public.erp_goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references public.erp_purchase_order_lines(id) on delete restrict,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_goods_receipt_lines_org on public.erp_goods_receipt_lines(organization_id);
create index if not exists idx_erp_goods_receipt_lines_receipt on public.erp_goods_receipt_lines(receipt_id);
alter table public.erp_goods_receipt_lines enable row level security;

create policy erp_goods_receipt_lines_select on public.erp_goods_receipt_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_goods_receipt_lines_write on public.erp_goods_receipt_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_goods_receipts r where r.id = receipt_id and r.status = 'draft')
  );

-- apply_erp_stock_movement() (définie migration 048) mise à jour ici :
-- signature identique (trigger, sans argument) — CREATE OR REPLACE sûr,
-- pas de DROP requis (voir CLAUDE.md, piège CREATE OR REPLACE FUNCTION).
-- Ajoute 'purchase_receipt' (entrée, comme 'in') et 'supplier_return'
-- (sortie, comme 'out' — avec la même garde anti-survente).
create or replace function public.apply_erp_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'transfer_in' then new.quantity
    when 'purchase_receipt' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'transfer_out' then -new.quantity
    when 'supplier_return' then -new.quantity
    else 0
  end;

  insert into public.erp_stock_levels (organization_id, product_id, warehouse_id, quantity)
  values (new.organization_id, new.product_id, new.warehouse_id, delta)
  on conflict (organization_id, product_id, warehouse_id)
  do update set quantity = public.erp_stock_levels.quantity + delta, updated_at = now()
  returning quantity into v_new_qty;

  if new.type in ('out', 'transfer_out', 'supplier_return') and v_new_qty < 0 then
    raise exception 'Stock insuffisant pour ce produit dans ce dépôt (quantité disponible dépassée).';
  end if;

  return new;
end;
$$;

-- confirm_erp_goods_receipt() : pour chaque ligne, crée un mouvement
-- 'purchase_receipt' (coût repris de la ligne de commande, jamais saisi
-- par `stock` — cohérent avec le masquage de colonne ci-dessus), incrémente
-- received_quantity sur la ligne de commande correspondante (bloque le
-- sur-réceptionnement), recalcule le statut de la commande
-- (confirmed/partially_received/received selon les lignes), puis passe la
-- réception "confirmed". Réception partielle supportée nativement (une
-- même commande peut avoir plusieurs erp_goods_receipts).
create or replace function public.confirm_erp_goods_receipt(
  p_organization_id uuid,
  p_receipt_id uuid
) returns public.erp_goods_receipts
language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.erp_goods_receipts;
  v_line record;
  v_po_line public.erp_purchase_order_lines;
  v_new_received numeric(14,3);
  v_total_lines integer;
  v_fully_received_lines integer;
  v_any_received_lines integer;
  v_po_status text;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','stock']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_receipt from public.erp_goods_receipts
    where id = p_receipt_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if v_receipt.status <> 'draft' then raise exception 'Cette réception a déjà été confirmée.'; end if;

  if not exists (select 1 from public.erp_goods_receipt_lines where receipt_id = p_receipt_id) then
    raise exception 'Aucune ligne à réceptionner pour cette réception.';
  end if;

  for v_line in select * from public.erp_goods_receipt_lines where receipt_id = p_receipt_id loop
    select * into v_po_line from public.erp_purchase_order_lines where id = v_line.purchase_order_line_id for update;

    v_new_received := v_po_line.received_quantity + v_line.quantity;
    if v_new_received > v_po_line.quantity then
      raise exception 'Quantité reçue dépasse la quantité commandée pour ce produit.';
    end if;

    update public.erp_purchase_order_lines set received_quantity = v_new_received where id = v_po_line.id;

    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_receipt.warehouse_id, 'purchase_receipt', v_line.quantity, v_po_line.unit_cost, v_receipt.reference, auth.uid());
  end loop;

  select count(*), count(*) filter (where received_quantity >= quantity), count(*) filter (where received_quantity > 0)
    into v_total_lines, v_fully_received_lines, v_any_received_lines
    from public.erp_purchase_order_lines where purchase_order_id = v_receipt.purchase_order_id;

  v_po_status := case
    when v_fully_received_lines = v_total_lines then 'received'
    when v_any_received_lines > 0 then 'partially_received'
    else 'confirmed'
  end;
  update public.erp_purchase_orders set status = v_po_status where id = v_receipt.purchase_order_id;

  update public.erp_goods_receipts set status = 'confirmed', confirmed_at = now()
    where id = p_receipt_id returning * into v_receipt;

  return v_receipt;
end;
$$;
revoke all on function public.confirm_erp_goods_receipt(uuid, uuid) from public;
grant execute on function public.confirm_erp_goods_receipt(uuid, uuid) to authenticated;

-- =============== erp_supplier_invoices (rapprochement facture fournisseur
-- — pas de mouvement de stock associé, aucune RPC nécessaire) ===============
create table if not exists public.erp_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  purchase_order_id uuid references public.erp_purchase_orders(id) on delete set null,
  reference text,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'disputed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_supplier_invoices_org on public.erp_supplier_invoices(organization_id);
create index if not exists idx_erp_supplier_invoices_supplier on public.erp_supplier_invoices(supplier_id);
alter table public.erp_supplier_invoices enable row level security;

create policy erp_supplier_invoices_select on public.erp_supplier_invoices for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]));
-- `accountant` inclus en écriture (pas seulement lecture) : le suivi du
-- statut de paiement (unpaid/partially_paid/paid/disputed) relève de son
-- périmètre financier, cohérent avec ARCHITECTURE_ERP.md ("accountant =
-- lecture large + écriture sur son périmètre financier").
create policy erp_supplier_invoices_write on public.erp_supplier_invoices for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]));

-- =============== erp_supplier_returns + erp_supplier_return_lines (retour
-- marchandise au fournisseur — porté par `buyer` en V1, pas `stock` : choix
-- simplificateur assumé, voir en-tête de fichier ; à revisiter si le besoin
-- d'un geste physique distinct par le magasinier se confirme) ===============
create table if not exists public.erp_supplier_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  purchase_order_id uuid references public.erp_purchase_orders(id) on delete set null,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists idx_erp_supplier_returns_org on public.erp_supplier_returns(organization_id);
alter table public.erp_supplier_returns enable row level security;

create policy erp_supplier_returns_select on public.erp_supplier_returns for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]));
create policy erp_supplier_returns_insert on public.erp_supplier_returns for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));
-- Comme les réceptions : la confirmation passe exclusivement par
-- confirm_erp_supplier_return(), jamais une écriture directe de `status`.
create policy erp_supplier_returns_update on public.erp_supplier_returns for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));
create policy erp_supplier_returns_delete on public.erp_supplier_returns for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[]));

create table if not exists public.erp_supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.erp_supplier_returns(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2)
);
create index if not exists idx_erp_supplier_return_lines_org on public.erp_supplier_return_lines(organization_id);
create index if not exists idx_erp_supplier_return_lines_return on public.erp_supplier_return_lines(return_id);
alter table public.erp_supplier_return_lines enable row level security;

create policy erp_supplier_return_lines_select on public.erp_supplier_return_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','buyer']::public.app_role[]));
create policy erp_supplier_return_lines_write on public.erp_supplier_return_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[])
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','buyer']::public.app_role[])
    and exists (select 1 from public.erp_supplier_returns r where r.id = return_id and r.status = 'draft')
  );

-- confirm_erp_supplier_return() : crée un mouvement 'supplier_return' par
-- ligne (sortie de stock, bloquée par apply_erp_stock_movement() si stock
-- insuffisant) et passe le retour "confirmed".
create or replace function public.confirm_erp_supplier_return(
  p_organization_id uuid,
  p_return_id uuid
) returns public.erp_supplier_returns
language plpgsql security definer set search_path = public as $$
declare
  v_return public.erp_supplier_returns;
  v_line record;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','buyer']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_return from public.erp_supplier_returns
    where id = p_return_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Retour fournisseur introuvable.'; end if;
  if v_return.status <> 'draft' then raise exception 'Ce retour a déjà été confirmé.'; end if;

  if not exists (select 1 from public.erp_supplier_return_lines where return_id = p_return_id) then
    raise exception 'Aucune ligne à retourner pour ce retour fournisseur.';
  end if;

  for v_line in select * from public.erp_supplier_return_lines where return_id = p_return_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, unit_cost, reference, created_by)
    values (p_organization_id, v_line.product_id, v_return.warehouse_id, 'supplier_return', v_line.quantity, v_line.unit_cost, v_return.reference, auth.uid());
  end loop;

  update public.erp_supplier_returns set status = 'confirmed', confirmed_at = now()
    where id = p_return_id returning * into v_return;

  return v_return;
end;
$$;
revoke all on function public.confirm_erp_supplier_return(uuid, uuid) from public;
grant execute on function public.confirm_erp_supplier_return(uuid, uuid) to authenticated;
