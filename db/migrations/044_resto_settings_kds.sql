-- Migration 044 — ZegResto V2, étape 4 : réglages KDS configurables
-- (resto_settings). Présentée pour relecture — NE PAS exécuter
-- automatiquement. À exécuter après 043 (courses cuisine).
--
-- Nouvelle table resto_settings (une ligne par organisation, créée à la
-- volée par le premier upsert depuis /app/resto/parametres — même pattern
-- que hotel_settings, pas de ligne par défaut via provision_organization()).
-- Ne porte pour l'instant QUE les réglages du KDS (chantier 3 du prompt
-- V2) : intervalle d'auto-refresh (filet de sécurité si le canal Supabase
-- Realtime décroche, et mode affichage "mains libres" sans interaction),
-- seuil d'urgence (minutes écoulées avant qu'un ticket bascule en alerte
-- visuelle), et le son de nouveau ticket (activé/choix/volume). D'autres
-- réglages (Ticket & Caisse, fidélité, son des réservations — chantiers 4
-- et 8 du prompt V2) viendront s'ajouter par ALTER TABLE ADD COLUMN dans
-- une migration ultérieure, sans toucher à ce qui existe déjà ici.
--
-- Aucune valeur métier n'est codée en dur côté frontend : les colonnes
-- ci-dessous portent des valeurs par défaut raisonnables, mais restent
-- entièrement modifiables depuis les Paramètres.

create table if not exists public.resto_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  kds_auto_refresh_seconds integer not null default 15 check (kds_auto_refresh_seconds in (10, 15, 30)),
  kds_urgency_minutes integer not null default 10 check (kds_urgency_minutes > 0),
  kds_sound_enabled boolean not null default true,
  kds_sound_choice text not null default 'chime' check (kds_sound_choice in ('chime', 'bell', 'soft')),
  kds_sound_volume numeric(3,2) not null default 0.6 check (kds_sound_volume >= 0 and kds_sound_volume <= 1),
  updated_at timestamptz not null default now()
);
alter table public.resto_settings enable row level security;

-- Lecture étendue (cook a besoin de connaître l'intervalle de refresh, le
-- seuil d'urgence et le son configuré pour son propre écran KDS) ; écriture
-- strictement owner/manager (page Paramètres), même pattern que
-- hotel_settings.
drop policy if exists resto_settings_select on public.resto_settings;
create policy resto_settings_select on public.resto_settings for select to authenticated
  using (public.has_organization_access(organization_id));
drop policy if exists resto_settings_write on public.resto_settings;
create policy resto_settings_write on public.resto_settings for all to authenticated
  using (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]))
  with check (public.has_any_role_in_organization(organization_id, array['owner','manager']::public.app_role[]));
