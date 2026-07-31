-- 021_accounts_restructure.sql
-- Phase 1 de "PROMPT COMBINÉ — Isolation ZegCaisse/ZegHotel + Restructuration
-- compte/établissements". Présentée pour relecture — NE PAS exécuter
-- automatiquement (aucun script CI/déploiement ne doit lancer ce fichier).
-- Sa seule présence dans le repo n'a aucun effet tant qu'il n'est pas
-- collé et lancé manuellement dans Supabase SQL Editor.
--
-- Objectif : passer d'un modèle "1 organisation = 1 abonnement, plusieurs
-- apps possibles sur la même organisation" à :
--   accounts (1 par propriétaire)
--    └─ account_subscriptions (1 par app_module actif : 'pos' | 'hotel')
--    └─ organizations (= établissements, chacun une seule app_module)
--         └─ organization_members (many-to-many, inchangé)
--
-- Cette migration est strictement additive et rejouable (idempotente) :
-- elle peut être relancée sans dupliquer de données si une exécution
-- précédente a été interrompue. Elle ne modifie ni ne supprime aucune
-- donnée existante (organizations.plan/trial_ends_at, subscriptions,
-- organizations.active_apps restent en place et pilotent toujours le
-- frontend actuel — rien ne change côté application avant la Phase 2).
--
-- Ordre d'exécution recommandé : lancer ce fichier en une fois (il est
-- découpé en sections séquentielles ci-dessous). La section 5 (backfill)
-- affiche des NOTICE pour toute situation ambiguë trouvée dans les
-- données réelles (conflits de statut/plan entre organisations d'un même
-- propriétaire, organisations encore multi-app) — à lire dans l'onglet
-- "Messages" du SQL Editor après exécution, avant de considérer le
-- résultat comme définitif.

begin;

-- =============== 1. TABLE accounts ===============
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id)
);
create index if not exists idx_accounts_owner on public.accounts(owner_id);

-- =============== 2. TABLE account_subscriptions ===============
create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_module text not null check (app_module in ('pos', 'hotel')),
  -- Pas de FK vers plans(id) : comme subscriptions.plan existant, cette
  -- colonne vaut aussi 'trial' pendant la période d'essai, une valeur qui
  -- n'existe pas comme ligne dans plans (seules les formules payantes
  -- starter/pro/business y sont définies).
  plan_id text not null,
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, app_module)
);
create index if not exists idx_account_subs_account on public.account_subscriptions(account_id);

-- =============== 3. organizations.account_id + app_module ===============
-- Nullable pour l'instant : rendu obligatoire à la fin de la section 5,
-- une fois le backfill vérifié réussi pour 100% des lignes.
alter table public.organizations add column if not exists account_id uuid references public.accounts(id);
alter table public.organizations add column if not exists app_module text;
do $$ begin
  alter table public.organizations add constraint organizations_app_module_check check (app_module in ('pos', 'hotel'));
exception when duplicate_object then null;
end $$;
create index if not exists idx_organizations_account on public.organizations(account_id);

-- =============== 4. plans.app_module / max_establishments / max_users ===============
-- Nullable = illimité (cohérent avec plans.limits.organizations/users qui
-- utilisent déjà "∞" côté mini-CMS actuel). Aucune valeur n'est insérée ici
-- pour les plans existants : les formules par application seront saisies
-- manuellement via l'admin en Phase 3 (pas de palier codé en dur).
alter table public.plans add column if not exists app_module text;
do $$ begin
  alter table public.plans add constraint plans_app_module_check check (app_module is null or app_module in ('pos', 'hotel'));
exception when duplicate_object then null;
end $$;
alter table public.plans add column if not exists max_establishments integer;
alter table public.plans add column if not exists max_users integer;

-- =============== 5. BACKFILL ===============
-- 5a. app_module par organisation, dérivé de active_apps existant.
--     Règle validée : active_apps contient 'hotel' -> 'hotel', sinon 'pos'.
update public.organizations
set app_module = case when active_apps ? 'hotel' then 'hotel' else 'pos' end
where app_module is null;

-- 5b. Diagnostic (NOTICE uniquement, ne bloque rien) : organisations dont
--     active_apps contenait encore les deux apps au moment du backfill —
--     leur app_module a été forcé à 'hotel' par la règle ci-dessus, ce qui
--     peut ne pas correspondre à l'usage réel si elles étaient surtout
--     utilisées côté ZegCaisse. À vérifier manuellement si la liste
--     n'est pas vide.
do $$
declare
  v_org record;
  v_count integer := 0;
begin
  for v_org in
    select id, name, owner_id, active_apps from public.organizations
    where active_apps ? 'hotel' and active_apps ? 'pos'
  loop
    v_count := v_count + 1;
    raise notice 'Organisation multi-app détectée (app_module forcé à hotel) : % (id=%, owner_id=%, active_apps=%)',
      v_org.name, v_org.id, v_org.owner_id, v_org.active_apps;
  end loop;
  if v_count = 0 then
    raise notice 'Aucune organisation multi-app (pos+hotel simultané) trouvée.';
  else
    raise notice '% organisation(s) multi-app trouvée(s), voir détail ci-dessus.', v_count;
  end if;
end $$;

-- 5c. Un compte par propriétaire distinct (organizations.owner_id).
--     Nom par défaut = nom de la plus ancienne organisation de ce
--     propriétaire ; modifiable plus tard, aucune UI de rename n'existe
--     encore pour "accounts" (hors scope de cette migration).
insert into public.accounts (owner_id, name)
select distinct on (o.owner_id) o.owner_id, o.name
from public.organizations o
where o.owner_id not in (select owner_id from public.accounts)
order by o.owner_id, o.created_at asc;

-- 5d. Diagnostic : propriétaires dont organizations.owner_id diverge de
--     organization_members (role='owner') — signale une incohérence de
--     données antérieure à cette migration plutôt que de la trancher ici.
do $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select o.id as organization_id, o.name, o.owner_id as organizations_owner_id, m.user_id as member_owner_id
    from public.organizations o
    left join public.organization_members m
      on m.organization_id = o.id and m.role = 'owner' and m.user_id = o.owner_id
    where m.user_id is null
  loop
    v_count := v_count + 1;
    raise notice 'Incohérence owner : organisation % (id=%) — organizations.owner_id=% sans ligne organization_members role=owner correspondante.',
      v_row.name, v_row.organization_id, v_row.organizations_owner_id;
  end loop;
  if v_count = 0 then
    raise notice 'Aucune incohérence owner_id vs organization_members trouvée.';
  else
    raise notice '% incohérence(s) owner_id vs organization_members trouvée(s), voir détail ci-dessus — le regroupement par compte a tout de même été fait sur organizations.owner_id (source de vérité existante).', v_count;
  end if;
end $$;

-- 5e. Rattache chaque organisation au compte de son propriétaire.
update public.organizations o
set account_id = a.id
from public.accounts a
where a.owner_id = o.owner_id and o.account_id is null;

-- 5f. account_subscriptions : une ligne par (compte, app_module), dérivée
--     de la subscription la plus favorable parmi les organisations du
--     groupe pour cette app_module. "Plus favorable" = statut le plus
--     avantageux (active > trialing > past_due > canceled > expired),
--     puis à égalité la current_period_end/trial_ends_at la plus
--     éloignée dans le temps. Cette règle est appliquée automatiquement ;
--     les cas où plusieurs organisations d'un même compte disposaient (sur
--     leur subscription la plus récente chacune) de statuts différents
--     sont listés en NOTICE ci-dessous pour vérification plutôt que
--     d'être tranchés silencieusement.
do $$
declare
  v_group record;
  v_conflict_count integer := 0;
begin
  for v_group in
    select account_id, app_module, count(distinct status) as distinct_statuses, count(*) as org_count
    from (
      select o.account_id, o.app_module, s.status
      from public.organizations o
      join lateral (
        select * from public.subscriptions sub
        where sub.organization_id = o.id
        order by sub.created_at desc
        limit 1
      ) s on true
      where o.account_id is not null
    ) latest
    group by account_id, app_module
    having count(*) > 1 and count(distinct status) > 1
  loop
    v_conflict_count := v_conflict_count + 1;
    raise notice 'Conflit de statut d''abonnement : compte % / app % — % organisations concernées, % statuts distincts trouvés parmi leurs abonnements les plus récents. Résolu automatiquement par la règle "plus favorable", à vérifier manuellement.',
      v_group.account_id, v_group.app_module, v_group.org_count, v_group.distinct_statuses;
  end loop;
  if v_conflict_count = 0 then
    raise notice 'Aucun conflit de statut d''abonnement entre organisations d''un même compte.';
  end if;
end $$;

with ranked as (
  select
    o.account_id,
    o.app_module,
    s.plan,
    s.status,
    s.trial_ends_at,
    s.current_period_end,
    row_number() over (
      partition by o.account_id, o.app_module
      order by
        case s.status
          when 'active' then 1
          when 'trialing' then 2
          when 'past_due' then 3
          when 'canceled' then 4
          when 'expired' then 5
          else 6
        end,
        coalesce(s.current_period_end, s.trial_ends_at) desc nulls last,
        s.created_at desc
    ) as rnk
  from public.organizations o
  join lateral (
    select * from public.subscriptions sub
    where sub.organization_id = o.id
    order by sub.created_at desc
    limit 1
  ) s on true
  where o.account_id is not null
),
best as (
  select account_id, app_module, plan, status, trial_ends_at, current_period_end
  from ranked where rnk = 1
)
insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at, current_period_end)
select b.account_id, b.app_module, b.plan, b.status, b.trial_ends_at, b.current_period_end
from best b
on conflict (account_id, app_module) do nothing;

-- 5g. Comptes/app_module sans aucune ligne "subscriptions" existante
--     (organisation créée mais jamais passée par /souscription) : ligne
--     account_subscriptions par défaut en essai, dérivée de
--     organizations.plan/trial_ends_at (mêmes valeurs que le trial par
--     défaut à la création d'une organisation).
insert into public.account_subscriptions (account_id, app_module, plan_id, status, trial_ends_at)
select distinct on (o.account_id, o.app_module)
  o.account_id, o.app_module, o.plan, 'trialing'::public.subscription_status, o.trial_ends_at
from public.organizations o
where o.account_id is not null
  and not exists (
    select 1 from public.account_subscriptions acs
    where acs.account_id = o.account_id and acs.app_module = o.app_module
  )
order by o.account_id, o.app_module, o.created_at asc
on conflict (account_id, app_module) do nothing;

-- =============== 6. Contraintes NOT NULL (après vérification du backfill) ===============
-- Ne durcit account_id/app_module que si 100% des lignes sont renseignées
-- — sinon laisse nullable et prévient par NOTICE (ne fait jamais échouer
-- toute la transaction pour ça : le backfill reste utile même incomplet,
-- à corriger manuellement avant de relancer cette section si besoin).
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing from public.organizations where account_id is null or app_module is null;
  if v_missing = 0 then
    alter table public.organizations alter column account_id set not null;
    alter table public.organizations alter column app_module set not null;
    raise notice 'organizations.account_id et app_module passés NOT NULL (backfill complet).';
  else
    raise notice '% organisation(s) sans account_id/app_module après backfill — colonnes laissées nullable, à corriger avant de durcir la contrainte manuellement.', v_missing;
  end if;
end $$;

-- =============== 7. Fonctions security definer ===============
create or replace function public.is_account_owner(_account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.accounts where id = _account_id and owner_id = auth.uid());
$$;

-- Lecture par tous les membres d'au moins une organisation du compte —
-- cohérent avec le principe déjà appliqué dans useReadOnlyMode (statut
-- d'abonnement visible par tous, écriture réservée au propriétaire).
create or replace function public.is_account_member(_account_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_account_owner(_account_id) or exists (
    select 1 from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where o.account_id = _account_id and m.user_id = auth.uid()
  );
$$;

-- =============== 8. RLS ===============
alter table public.accounts enable row level security;
alter table public.account_subscriptions enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_account_member(id));
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts for delete to authenticated
  using (owner_id = auth.uid());
-- Super Admin : lecture cross-comptes (même principe que shops_select_admin).
drop policy if exists accounts_select_admin on public.accounts;
create policy accounts_select_admin on public.accounts for select to authenticated
  using (public.is_super_admin());

drop policy if exists account_subscriptions_select on public.account_subscriptions;
create policy account_subscriptions_select on public.account_subscriptions for select to authenticated
  using (public.is_account_member(account_id));
drop policy if exists account_subscriptions_insert on public.account_subscriptions;
create policy account_subscriptions_insert on public.account_subscriptions for insert to authenticated
  with check (public.is_account_owner(account_id));
drop policy if exists account_subscriptions_update on public.account_subscriptions;
create policy account_subscriptions_update on public.account_subscriptions for update to authenticated
  using (public.is_account_owner(account_id)) with check (public.is_account_owner(account_id));
drop policy if exists account_subscriptions_delete on public.account_subscriptions;
create policy account_subscriptions_delete on public.account_subscriptions for delete to authenticated
  using (public.is_account_owner(account_id));
-- Super Admin : lecture cross-comptes (Abonnements/Facturation, Phase 3).
drop policy if exists account_subscriptions_select_admin on public.account_subscriptions;
create policy account_subscriptions_select_admin on public.account_subscriptions for select to authenticated
  using (public.is_super_admin());

commit;
