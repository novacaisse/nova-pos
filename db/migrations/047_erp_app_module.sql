-- Migration 047 — ZegERP, étape 0/N : enregistre 'erp' comme 4e valeur
-- possible d'app_module. Présentée pour relecture — NE PAS exécuter
-- automatiquement.
--
-- Même mécanique que l'ajout de 'resto' par la migration 036 : trois
-- endroits où ('pos','hotel','resto') est codé en dur en check constraint
-- (organizations, account_subscriptions, plans). Aucun piège ALTER TYPE
-- ici — app_module est un simple `text` avec check constraint, pas un
-- enum Postgres, donc pas de contrainte de transaction séparée.
--
-- provision_organization() n'a besoin d'aucune modification : p_app est un
-- text sans validation inline, donc p_app = 'erp' fonctionnera dès que
-- cette migration est appliquée.
--
-- Aucun rôle ERP-spécifique n'est ajouté ici (voir ARCHITECTURE_ERP.md,
-- section "Rôles ZegERP" — buyer/salesperson/hr_manager en attente de
-- validation avant migration, ajoutés module par module quand chacun
-- démarre réellement, comme 035_resto_roles.sql l'a fait pour server/cook).

alter table public.organizations drop constraint if exists organizations_app_module_check;
alter table public.organizations add constraint organizations_app_module_check
  check (app_module in ('pos', 'hotel', 'resto', 'erp'));

alter table public.account_subscriptions drop constraint if exists account_subscriptions_app_module_check;
alter table public.account_subscriptions add constraint account_subscriptions_app_module_check
  check (app_module in ('pos', 'hotel', 'resto', 'erp'));

alter table public.plans drop constraint if exists plans_app_module_check;
alter table public.plans add constraint plans_app_module_check
  check (app_module is null or app_module in ('pos', 'hotel', 'resto', 'erp'));
