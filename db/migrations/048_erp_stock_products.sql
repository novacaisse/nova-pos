-- Migration 048 — ZegERP, module 1/10 : Stock / Produits (fondation — tout
-- le reste de ZegERP dépend de ces tables). Présentée pour relecture — NE
-- PAS exécuter automatiquement. À exécuter après 047 (app_module).
--
-- Convention de nommage : colonnes en anglais (name/status/quantity/type...),
-- comme ZegCaisse (products/stock_movements) et ZegHotel (hotel_rooms/
-- hotel_reservations) — ZegResto (colonnes françaises) est l'exception dans
-- ce dépôt, pas la référence à suivre. Choix explicite pour rester cohérent
-- avec la majorité des modules existants.
--
-- Isolation totale : aucune de ces tables ne référence products/categories/
-- stock_levels/stock_movements (ZegCaisse) — catalogue et stock 100%
-- propres à ZegERP, comme documenté dans ARCHITECTURE_ERP.md.
--
-- Rôles utilisés ici : owner/manager (partagés, tous droits), accountant
-- (partagé, lecture), stock (partagé avec ZegCaisse par nom — même
-- sémantique "responsable stock/entrepôt", aucune portée cross-module vu
-- que la RLS reste scopée par organization_id). Aucun rôle ERP-spécifique
-- n'est nécessaire pour ce module.

-- =============== erp_product_categories ===============
create table if not exists public.erp_product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.erp_product_categories(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_product_categories_org on public.erp_product_categories(organization_id);
alter table public.erp_product_categories enable row level security;

create policy erp_product_categories_select on public.erp_product_categories for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_product_categories_write on public.erp_product_categories for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

-- =============== erp_brands ===============
create table if not exists public.erp_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_brands_org on public.erp_brands(organization_id);
alter table public.erp_brands enable row level security;

create policy erp_brands_select on public.erp_brands for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_brands_write on public.erp_brands for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

-- =============== erp_units (unités de mesure, propres à chaque organisation
-- — pas de table de référence globale, chaque PME a son propre vocabulaire) ===============
create table if not exists public.erp_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists idx_erp_units_org on public.erp_units(organization_id);
alter table public.erp_units enable row level security;

create policy erp_units_select on public.erp_units for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_units_write on public.erp_units for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

-- =============== erp_warehouses (multi-dépôts natif — à la différence de
-- ZegCaisse qui n'a qu'un niveau de stock par organisation) ===============
create table if not exists public.erp_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  address text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_warehouses_org on public.erp_warehouses(organization_id);
alter table public.erp_warehouses enable row level security;

create policy erp_warehouses_select on public.erp_warehouses for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_warehouses_write on public.erp_warehouses for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

-- Un seul dépôt par défaut par organisation : plutôt qu'un index unique
-- partiel (qui ferait échouer l'écriture avec une erreur de contrainte peu
-- explicite côté UI), ce trigger désactive automatiquement l'ancien défaut
-- quand un nouveau est défini — invariant garanti sans logique frontend
-- dédiée.
create or replace function public.enforce_single_default_erp_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_default then
    update public.erp_warehouses set is_default = false
      where organization_id = new.organization_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_erp_warehouses_single_default on public.erp_warehouses;
create trigger trg_erp_warehouses_single_default
  before insert or update of is_default on public.erp_warehouses
  for each row when (new.is_default)
  execute function public.enforce_single_default_erp_warehouse();

-- =============== erp_products ===============
create table if not exists public.erp_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.erp_product_categories(id) on delete set null,
  brand_id uuid references public.erp_brands(id) on delete set null,
  unit_id uuid references public.erp_units(id) on delete set null,
  sku text, barcode text, name text not null, description text,
  price numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index if not exists idx_erp_products_org on public.erp_products(organization_id);
create index if not exists idx_erp_products_barcode on public.erp_products(organization_id, barcode);
alter table public.erp_products enable row level security;

create policy erp_products_select on public.erp_products for select to authenticated
  using (public.has_organization_access(organization_id));
create policy erp_products_write on public.erp_products for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));

-- =============== erp_stock_levels (niveau PAR dépôt, contrairement à
-- stock_levels ZegCaisse qui n'a pas de notion de dépôt) — jamais d'écriture
-- directe, maintenue exclusivement par apply_erp_stock_movement() plus bas ===============
create table if not exists public.erp_stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete cascade,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id, warehouse_id)
);
create index if not exists idx_erp_stock_levels_org on public.erp_stock_levels(organization_id);
create index if not exists idx_erp_stock_levels_product on public.erp_stock_levels(product_id);
alter table public.erp_stock_levels enable row level security;

create policy erp_stock_levels_select on public.erp_stock_levels for select to authenticated
  using (public.has_organization_access(organization_id));
-- Pas de policy insert/update/delete : lignes gérées exclusivement par le
-- trigger apply_erp_stock_movement() (security definer, plus bas).

-- =============== erp_stock_transfers + erp_stock_transfer_lines (créées
-- avant erp_stock_movements, qui les référence pour traçabilité) ===============
create table if not exists public.erp_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  from_warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  to_warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'in_transit', 'received')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  check (from_warehouse_id <> to_warehouse_id)
);
create index if not exists idx_erp_stock_transfers_org on public.erp_stock_transfers(organization_id);
alter table public.erp_stock_transfers enable row level security;

create policy erp_stock_transfers_select on public.erp_stock_transfers for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_stock_transfers_insert on public.erp_stock_transfers for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
-- UPDATE direct limité aux transferts encore "draft" (édition libre avant
-- envoi) — les transitions de statut (envoi/réception) passent exclusivement
-- par les RPC security definer plus bas, jamais par une écriture directe de
-- `status`, pour garantir que chaque transition crée bien ses mouvements de
-- stock correspondants.
create policy erp_stock_transfers_update on public.erp_stock_transfers for update to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
create policy erp_stock_transfers_delete on public.erp_stock_transfers for delete to authenticated
  using (status = 'draft' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.erp_stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null references public.erp_stock_transfers(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);
create index if not exists idx_erp_stock_transfer_lines_org on public.erp_stock_transfer_lines(organization_id);
create index if not exists idx_erp_stock_transfer_lines_transfer on public.erp_stock_transfer_lines(transfer_id);
alter table public.erp_stock_transfer_lines enable row level security;

create policy erp_stock_transfer_lines_select on public.erp_stock_transfer_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
-- Écriture des lignes limitée aux transferts encore "draft" (même raison
-- que erp_stock_transfers_update ci-dessus).
create policy erp_stock_transfer_lines_write on public.erp_stock_transfer_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_stock_transfers t where t.id = transfer_id and t.status = 'draft')
  );

-- =============== erp_inventories + erp_inventory_lines (inventaire
-- physique par dépôt — créées avant erp_stock_movements pour la même
-- raison de traçabilité) ===============
create table if not exists public.erp_inventories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  status text not null default 'in_progress' check (status in ('in_progress', 'validated')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);
create index if not exists idx_erp_inventories_org on public.erp_inventories(organization_id);
alter table public.erp_inventories enable row level security;

create policy erp_inventories_select on public.erp_inventories for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_inventories_insert on public.erp_inventories for insert to authenticated
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
-- Même principe que les transferts : la validation (qui crée les mouvements
-- d'ajustement) passe exclusivement par validate_erp_inventory(), jamais
-- par une écriture directe de `status`.
create policy erp_inventories_update on public.erp_inventories for update to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]))
  with check (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[]));
create policy erp_inventories_delete on public.erp_inventories for delete to authenticated
  using (status = 'in_progress' and public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));

create table if not exists public.erp_inventory_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_id uuid not null references public.erp_inventories(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  -- Snapshot du stock théorique au moment de l'ajout de la ligne (pas
  -- recalculé dynamiquement) : si des mouvements de stock ont lieu pendant
  -- le comptage, l'écart calculé à la validation peut diverger de la
  -- réalité du moment — limite assumée en V1, un inventaire se fait
  -- normalement hors activité.
  theoretical_quantity numeric(14,3) not null default 0,
  counted_quantity numeric(14,3),
  created_at timestamptz not null default now(),
  unique (inventory_id, product_id)
);
create index if not exists idx_erp_inventory_lines_org on public.erp_inventory_lines(organization_id);
create index if not exists idx_erp_inventory_lines_inventory on public.erp_inventory_lines(inventory_id);
alter table public.erp_inventory_lines enable row level security;

create policy erp_inventory_lines_select on public.erp_inventory_lines for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
create policy erp_inventory_lines_write on public.erp_inventory_lines for all to authenticated
  using (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  )
  with check (
    public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
    and exists (select 1 from public.erp_inventories i where i.id = inventory_id and i.status = 'in_progress')
  );

-- =============== erp_stock_movements (ledger immuable) ===============
do $$ begin
  create type public.erp_stock_movement_type as enum ('in', 'out', 'adjustment', 'transfer_out', 'transfer_in');
exception when duplicate_object then null;
end $$;

create table if not exists public.erp_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.erp_products(id) on delete restrict,
  warehouse_id uuid not null references public.erp_warehouses(id) on delete restrict,
  type public.erp_stock_movement_type not null,
  -- Comme stock_movements (ZegCaisse) : quantity porte le signe pour
  -- 'adjustment' (correction positive ou négative) ; toujours positif pour
  -- in/out/transfer_out/transfer_in, dont le sens est déterminé par `type`
  -- (voir apply_erp_stock_movement()).
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2),
  reason text,
  reference text,
  -- Traçabilité : renseigné uniquement pour les mouvements générés par
  -- send_erp_stock_transfer()/receive_erp_stock_transfer() ou
  -- validate_erp_inventory() — jamais les deux à la fois.
  transfer_id uuid references public.erp_stock_transfers(id) on delete set null,
  inventory_id uuid references public.erp_inventories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_erp_stock_movements_org on public.erp_stock_movements(organization_id);
create index if not exists idx_erp_stock_movements_product on public.erp_stock_movements(product_id, warehouse_id);
create index if not exists idx_erp_stock_movements_transfer on public.erp_stock_movements(transfer_id);
create index if not exists idx_erp_stock_movements_inventory on public.erp_stock_movements(inventory_id);
alter table public.erp_stock_movements enable row level security;

create policy erp_stock_movements_select on public.erp_stock_movements for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant','stock']::public.app_role[]));
-- 'transfer_out'/'transfer_in' exclus de l'insert direct : uniquement créés
-- par send_erp_stock_transfer()/receive_erp_stock_transfer() (security
-- definer, plus bas), pour garantir qu'ils vont toujours par paire liée à
-- un erp_stock_transfer_lines réel. Ledger immuable : aucune policy
-- update/delete.
create policy erp_stock_movements_insert on public.erp_stock_movements for insert to authenticated
  with check (
    type in ('in', 'out', 'adjustment')
    and public.has_any_role_in_organization(organization_id, array['owner','manager','stock']::public.app_role[])
  );

-- Maintient erp_stock_levels à jour à chaque mouvement (même pattern que
-- apply_stock_movement() côté ZegCaisse) — security definer car
-- erp_stock_levels n'a aucune policy d'écriture directe.
create or replace function public.apply_erp_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  delta numeric(14,3);
  v_new_qty numeric(14,3);
begin
  delta := case new.type
    when 'in' then new.quantity
    when 'transfer_in' then new.quantity
    when 'adjustment' then new.quantity
    when 'out' then -new.quantity
    when 'transfer_out' then -new.quantity
    else 0
  end;

  insert into public.erp_stock_levels (organization_id, product_id, warehouse_id, quantity)
  values (new.organization_id, new.product_id, new.warehouse_id, delta)
  on conflict (organization_id, product_id, warehouse_id)
  do update set quantity = public.erp_stock_levels.quantity + delta, updated_at = now()
  returning quantity into v_new_qty;

  if new.type in ('out', 'transfer_out') and v_new_qty < 0 then
    raise exception 'Stock insuffisant pour ce produit dans ce dépôt (quantité disponible dépassée).';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_erp_stock_movements_apply on public.erp_stock_movements;
create trigger trg_erp_stock_movements_apply
  after insert on public.erp_stock_movements
  for each row execute function public.apply_erp_stock_movement();

-- =============== RPC : transferts inter-dépôts ===============
-- send_erp_stock_transfer() : crée les mouvements 'transfer_out' (décrémente
-- le dépôt source, bloqué par le trigger si stock insuffisant) et passe le
-- transfert "in_transit". Verrouille la ligne (for update) pour éviter un
-- double envoi concurrent.
create or replace function public.send_erp_stock_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_stock_transfers;
  v_line record;
  v_line_count integer;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','stock']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_stock_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'draft' then raise exception 'Ce transfert a déjà été envoyé.'; end if;

  select count(*) into v_line_count from public.erp_stock_transfer_lines where transfer_id = p_transfer_id;
  if v_line_count = 0 then raise exception 'Aucune ligne à envoyer pour ce transfert.'; end if;

  for v_line in select * from public.erp_stock_transfer_lines where transfer_id = p_transfer_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reference, transfer_id, created_by)
    values (p_organization_id, v_line.product_id, v_transfer.from_warehouse_id, 'transfer_out', v_line.quantity, v_transfer.reference, p_transfer_id, auth.uid());
  end loop;

  update public.erp_stock_transfers set status = 'in_transit', sent_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;
revoke all on function public.send_erp_stock_transfer(uuid, uuid) from public;
grant execute on function public.send_erp_stock_transfer(uuid, uuid) to authenticated;

-- receive_erp_stock_transfer() : crée les mouvements 'transfer_in'
-- (incrémente le dépôt destination) et passe le transfert "received".
-- Réception intégrale uniquement en V1 (pas de réception partielle —
-- non demandé, ajout possible plus tard sans casser ce qui existe).
create or replace function public.receive_erp_stock_transfer(
  p_organization_id uuid,
  p_transfer_id uuid
) returns public.erp_stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_transfer public.erp_stock_transfers;
  v_line record;
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','stock']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_transfer from public.erp_stock_transfers
    where id = p_transfer_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'Ce transfert n''est pas en transit.'; end if;

  for v_line in select * from public.erp_stock_transfer_lines where transfer_id = p_transfer_id loop
    insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reference, transfer_id, created_by)
    values (p_organization_id, v_line.product_id, v_transfer.to_warehouse_id, 'transfer_in', v_line.quantity, v_transfer.reference, p_transfer_id, auth.uid());
  end loop;

  update public.erp_stock_transfers set status = 'received', received_at = now()
    where id = p_transfer_id returning * into v_transfer;

  return v_transfer;
end;
$$;
revoke all on function public.receive_erp_stock_transfer(uuid, uuid) from public;
grant execute on function public.receive_erp_stock_transfer(uuid, uuid) to authenticated;

-- =============== RPC : validation d'inventaire ===============
-- validate_erp_inventory() : pour chaque ligne comptée (counted_quantity
-- renseignée), crée un mouvement 'adjustment' si l'écart est non nul
-- (quantity = écart, signé — voir apply_erp_stock_movement()), puis passe
-- l'inventaire "validated". Les lignes non comptées sont ignorées (pas
-- d'ajustement forcé à zéro).
create or replace function public.validate_erp_inventory(
  p_organization_id uuid,
  p_inventory_id uuid
) returns public.erp_inventories
language plpgsql security definer set search_path = public as $$
declare
  v_inventory public.erp_inventories;
  v_line record;
  v_gap numeric(14,3);
begin
  if not public.has_any_role_in_organization(p_organization_id, array['owner','manager','stock']::public.app_role[]) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_inventory from public.erp_inventories
    where id = p_inventory_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Inventaire introuvable.'; end if;
  if v_inventory.status <> 'in_progress' then raise exception 'Cet inventaire a déjà été validé.'; end if;

  for v_line in
    select * from public.erp_inventory_lines
    where inventory_id = p_inventory_id and counted_quantity is not null
  loop
    v_gap := v_line.counted_quantity - v_line.theoretical_quantity;
    if v_gap <> 0 then
      insert into public.erp_stock_movements (organization_id, product_id, warehouse_id, type, quantity, reason, inventory_id, created_by)
      values (p_organization_id, v_line.product_id, v_inventory.warehouse_id, 'adjustment', v_gap, 'Régularisation inventaire', p_inventory_id, auth.uid());
    end if;
  end loop;

  update public.erp_inventories set status = 'validated', validated_at = now()
    where id = p_inventory_id returning * into v_inventory;

  return v_inventory;
end;
$$;
revoke all on function public.validate_erp_inventory(uuid, uuid) from public;
grant execute on function public.validate_erp_inventory(uuid, uuid) to authenticated;
