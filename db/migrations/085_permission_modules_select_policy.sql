-- Migration 085 — Correctif : modal Permissions vide (aucun module affiché).
--
-- Cause racine (confirmée en base réelle, projet iwpxafuoxixjhioyuhdm) :
-- public.permission_modules a la RLS ACTIVÉE (relrowsecurity=true) mais
-- ZÉRO policy — un état qui n'existe dans AUCUN fichier de migration
-- tracké ici (schema.sql/063/066/068/070/084 ne l'activent jamais). RLS a
-- donc été activée hors bande, très probablement via le bouton "Enable
-- RLS" du Security Advisor du dashboard Supabase (qui signale toute table
-- publique sans RLS), sans qu'une policy de lecture compensatoire soit
-- ajoutée dans la foulée. Résultat : RLS activée + 0 policy = deny-all
-- pour authenticated — la table réelle contient pourtant ~50 lignes
-- (vérifié : select count(*) from permission_modules = non-zéro en
-- direct/postgres, mais 0 ligne simulée en role authenticated).
--
-- Pourquoi la navigation (AppSidebar/BottomNav, via my_module_permissions())
-- n'a jamais été affectée : cette RPC est SECURITY DEFINER, exécutée comme
-- son propriétaire (postgres) — la RLS ne s'applique jamais au
-- propriétaire d'une table (relforcerowsecurity=false ici). Seule la
-- requête FRONTEND DIRECTE de ModulePermissionsModal
-- (usePermissionModules -> .from("permission_modules").select("*"),
-- exécutée via PostgREST sous le rôle authenticated réel) est bloquée —
-- d'où un tableau visuellement vide, sans le moindre message d'erreur
-- (le hook ne surface pas `error`, corrigé côté frontend dans ce même
-- correctif).
--
-- permission_modules est un simple catalogue de référence (clé/libellé/
-- app_module/open_view par module) : aucune donnée sensible, aucun
-- scoping par organisation nécessaire — ouvrir la lecture à tout
-- utilisateur authentifié est le comportement correct et voulu (c'est
-- déjà, de facto, ce qui se passait avant l'activation RLS hors bande).
-- Écriture non ouverte : ce catalogue n'est modifié que par migration.
--
-- Balayage effectué sur les autres tables dans le même état (RLS activée,
-- 0 policy) : default_role_permissions (orpheline depuis la migration 084,
-- plus lue par aucun code applicatif — laissée telle quelle, deny-all est
-- sans impact et reste le choix le plus sûr) et super_admins (deny-all est
-- le comportement VOULU pour cette table sensible, jamais interrogée
-- directement par le frontend — laissée telle quelle).
--
-- Présentée pour relecture — NE PAS exécuter automatiquement.

alter table public.permission_modules enable row level security;

create policy permission_modules_select on public.permission_modules for select to authenticated
using (true);
