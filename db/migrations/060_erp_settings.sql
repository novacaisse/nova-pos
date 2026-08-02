-- Migration 060 — ZegERP, module 10/10 : Administration. Présentée pour
-- relecture — NE PAS exécuter automatiquement. À exécuter après 059.
--
-- Aucun rôle nouveau, aucune table de rôles/permissions dédiée —
-- organization_members.role (l'enum app_role partagé) reste la seule
-- source de vérité, exactement comme annoncé dans ARCHITECTURE_ERP.md :
-- "Administration ERP" au sens de ce module correspond à un écran
-- /app/erp/parametres plutôt qu'à un schéma de données propre.
--
-- Seule addition, volontairement minimale et non spéculative : une table
-- erp_settings à une ligne par organisation, portant uniquement des
-- réglages déjà nécessaires aux modules livrés précédemment (pas de champ
-- ajouté "au cas où") :
--   - default_warehouse_id : pré-sélection du dépôt dans les écrans POS
--     ERP (module 4)/réceptions (module 2) — évite de le redemander à
--     chaque écran.
--   - invoice_prefix/quote_prefix : numérotation des factures (module 3)
--     et devis (module 3).
--   - fiscal_year_start_month : référence pour la génération des périodes
--     comptables (module 6).
-- Pas de ligne créée automatiquement à la provision de l'organisation
-- (pas de trigger dédié) — le frontend fait un upsert au premier
-- enregistrement depuis /app/erp/parametres, comme les écrans de
-- paramètres existants (organization_settings) le font déjà.

create table if not exists public.erp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  default_warehouse_id uuid references public.erp_warehouses(id) on delete set null,
  invoice_prefix text not null default 'FAC-',
  quote_prefix text not null default 'DEV-',
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);
create index if not exists idx_erp_settings_org on public.erp_settings(organization_id);
alter table public.erp_settings enable row level security;

-- Lecture élargie (accountant en a besoin pour la numérotation facture/
-- devis et le mois de clôture fiscal) ; écriture réservée owner/manager,
-- même principe que organization_members/shop_settings (gestion
-- d'administration toujours réservée aux deux rôles d'administration).
create policy erp_settings_select on public.erp_settings for select to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager','accountant']::public.app_role[]));
create policy erp_settings_write on public.erp_settings for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
