-- Migration 020a — ZegOS Chantier 2, étape 1/4 : shops → organizations.
--
-- Uniquement des ALTER TABLE ... RENAME TO / RENAME COLUMN ... — Postgres
-- résout ses dépendances par OID, pas par nom : les policies RLS, les
-- contraintes de clé étrangère et les index continuent de fonctionner à
-- l'identique après ce script, sans qu'on les touche. Cette étape ne
-- modifie AUCUNE donnée, AUCUNE ligne, AUCUNE fonction, AUCUNE policy —
-- uniquement des renommages de schéma. Les fonctions dont le corps
-- référence encore shop_id/shops en interne (elles continueront de
-- fonctionner tant qu'elles ne sont pas exécutées à nouveau, mais leur
-- texte est désormais désynchronisé du schéma réel) seront corrigées à
-- l'étape suivante (020b) — ne pas s'inquiéter si une requête directe sur
-- une fonction avant 020b échoue, c'est attendu et transitoire.
--
-- Réversible en cas de souci : ré-exécuter ce script avec les noms
-- inversés (organizations → shops, etc.) annule intégralement l'effet.

-- =============== 1. Tables ===============
alter table public.shops rename to organizations;
alter table public.shop_members rename to organization_members;
alter table public.shop_settings rename to organization_settings;

-- =============== 2. Colonne shop_id → organization_id ===============
alter table public.organization_members  rename column shop_id to organization_id;
alter table public.categories            rename column shop_id to organization_id;
alter table public.products              rename column shop_id to organization_id;
alter table public.suppliers             rename column shop_id to organization_id;
alter table public.purchase_orders       rename column shop_id to organization_id;
alter table public.purchase_order_items  rename column shop_id to organization_id;
alter table public.customers             rename column shop_id to organization_id;
alter table public.stock_levels          rename column shop_id to organization_id;
alter table public.stock_movements       rename column shop_id to organization_id;
alter table public.sales                 rename column shop_id to organization_id;
alter table public.sale_items            rename column shop_id to organization_id;
alter table public.payments              rename column shop_id to organization_id;
alter table public.quotes                rename column shop_id to organization_id;
alter table public.quote_items           rename column shop_id to organization_id;
alter table public.expenses              rename column shop_id to organization_id;
alter table public.notifications         rename column shop_id to organization_id;
alter table public.subscriptions         rename column shop_id to organization_id;
alter table public.subscription_payments rename column shop_id to organization_id;
alter table public.organization_settings rename column shop_id to organization_id;
alter table public.admin_impersonations  rename column shop_id to organization_id;
alter table public.support_tickets       rename column shop_id to organization_id;
