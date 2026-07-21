-- =====================================================================
-- NovaCaisse — Migration 006 : support_tickets + support_messages
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Conception minimale :
--   - Un ticket appartient à une boutique (shop_id), créé par n'importe
--     quel membre de cette boutique (peu importe son rôle — un cashier
--     doit pouvoir demander de l'aide).
--   - Les messages forment un fil de discussion append-only (pas
--     d'update/delete — même logique que le ledger stock_movements :
--     un historique de support ne se réécrit pas).
--   - Seul le Super Admin change le statut d'un ticket (open/in_progress/
--     resolved/closed) — les membres de la boutique lisent et répondent,
--     mais ne referment pas eux-mêmes le ticket (évite les allers-retours
--     de statut non coordonnés).
-- =====================================================================

do $$ begin
  create type public.support_ticket_status as enum ('open','in_progress','resolved','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status public.support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_shop on public.support_tickets(shop_id);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_ticket on public.support_messages(ticket_id);

grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- support_tickets : visible par les membres de la boutique concernée ou le
-- Super Admin ; création par tout membre de la boutique ; changement de
-- statut réservé au Super Admin ; suppression réservée au Super Admin
-- (nettoyage/spam).
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (public.has_shop_access(shop_id) or public.is_super_admin());
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (public.has_shop_access(shop_id) and created_by = auth.uid());
drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists support_tickets_delete_admin on public.support_tickets;
create policy support_tickets_delete_admin on public.support_tickets for delete to authenticated
  using (public.is_super_admin());

-- support_messages : même visibilité que le ticket parent ; écriture par
-- les membres de la boutique du ticket ou le Super Admin ; aucune
-- update/delete (fil de discussion immuable).
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (public.has_shop_access(t.shop_id) or public.is_super_admin())
    )
  );
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (public.has_shop_access(t.shop_id) or public.is_super_admin())
    )
  );

-- =============== FIN ===============
