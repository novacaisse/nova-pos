-- =====================================================================
-- NovaCaisse — Migration 003 : historique de paiements d'abonnement +
-- bucket Storage pour le logo boutique
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Portée :
--   1. Nouvelle table public.subscription_payments (une ligne par paiement
--      d'abonnement), RLS alignée sur subscriptions (owner/manager en
--      écriture, + accountant en lecture).
--   2. Bucket Supabase Storage "shop-logos" (public en lecture) + policies
--      sur storage.objects restreignant l'écriture à owner/manager de la
--      boutique concernée, via le préfixe de chemin {shop_id}/....
-- =====================================================================

-- =============== 1. subscription_payments ===============

do $$ begin
  create type public.subscription_payment_status as enum ('pending','paid','failed','refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'XOF',
  method public.payment_method not null default 'mobile_money',
  status public.subscription_payment_status not null default 'pending',
  provider text default 'moneyfusion',
  provider_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sub_payments_shop on public.subscription_payments(shop_id);
create index if not exists idx_sub_payments_subscription on public.subscription_payments(subscription_id);

grant select, insert, update, delete on public.subscription_payments to authenticated;

alter table public.subscription_payments enable row level security;

drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager','accountant']::public.app_role[]));
drop policy if exists subscription_payments_write on public.subscription_payments;
create policy subscription_payments_write on public.subscription_payments for insert to authenticated
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscription_payments_update on public.subscription_payments;
create policy subscription_payments_update on public.subscription_payments for update to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));
drop policy if exists subscription_payments_delete on public.subscription_payments;
create policy subscription_payments_delete on public.subscription_payments for delete to authenticated
  using (public.has_any_role_in_shop(shop_id, array['owner','manager']::public.app_role[]));

-- =============== 2. Bucket "shop-logos" ===============
-- Convention de chemin obligatoire côté client : {shop_id}/<fichier>
-- (ex: "3fa2.../logo.png") — c'est ce préfixe que les policies vérifient.

insert into storage.buckets (id, name, public)
values ('shop-logos', 'shop-logos', true)
on conflict (id) do nothing;

-- Lecture publique (nécessaire pour l'affichage sur les tickets/reçus,
-- qui peuvent être imprimés/partagés hors session authentifiée). Le flag
-- "public" du bucket sert déjà les fichiers via l'URL publique sans passer
-- par ces policies, mais on les ajoute pour couvrir aussi les appels API
-- authentifiés (list/download via le client Supabase).
drop policy if exists shop_logos_select on storage.objects;
create policy shop_logos_select on storage.objects for select
  using (bucket_id = 'shop-logos');

drop policy if exists shop_logos_insert on storage.objects;
create policy shop_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_update on storage.objects;
create policy shop_logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  )
  with check (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists shop_logos_delete on storage.objects;
create policy shop_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'shop-logos'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );

-- =============== FIN ===============
-- Rappel : subscription_payments a les mêmes grants que le reste (all à
-- service_role via le grant déjà en place sur "all tables in schema
-- public"). Le bucket shop-logos est public en lecture par design (logo de
-- boutique = donnée non sensible), écriture strictement owner/manager de
-- la boutique propriétaire du chemin.
