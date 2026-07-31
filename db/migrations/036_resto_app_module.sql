-- Migration 036 — ZegResto, étape 2/7 : ajoute 'resto' comme 3e valeur
-- possible d'app_module, aux trois endroits où ('pos','hotel') est encore
-- codé en dur en check constraint (organizations, account_subscriptions,
-- plans — cf. 021_accounts_restructure.sql). Exécuter après 035 (rôles),
-- peut être combinée à celles d'après sans contrainte d'isolation
-- particulière (contrairement à 035, ceci n'ajoute pas de valeur d'enum).

alter table public.organizations drop constraint if exists organizations_app_module_check;
alter table public.organizations add constraint organizations_app_module_check
  check (app_module in ('pos', 'hotel', 'resto'));

alter table public.account_subscriptions drop constraint if exists account_subscriptions_app_module_check;
alter table public.account_subscriptions add constraint account_subscriptions_app_module_check
  check (app_module in ('pos', 'hotel', 'resto'));

alter table public.plans drop constraint if exists plans_app_module_check;
alter table public.plans add constraint plans_app_module_check
  check (app_module is null or app_module in ('pos', 'hotel', 'resto'));
