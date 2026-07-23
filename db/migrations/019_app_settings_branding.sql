-- Migration 019 — branding global de la plateforme (Bloc 25).
-- Table singleton (une seule ligne, id fixé à `true`) pour le logo et le
-- favicon affichés sur les pages publiques/boutique (landing, tarifs,
-- connexion, inscription, souscription, sidebar boutique) — distinct de
-- shops.logo_url qui reste le logo propre à chaque boutique.
-- Lecture publique (nécessaire pour un visiteur anonyme sur la landing),
-- écriture réservée aux super-admins (même fonction is_super_admin() que
-- le reste de l'espace /admin).

create table if not exists public.app_settings (
  id boolean primary key default true,
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to anon, authenticated
  using (true);

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Bucket Storage pour les fichiers de branding (public en lecture,
-- écriture réservée aux super-admins). Convention de chemin : "logo" et
-- "favicon" (pas de préfixe utilisateur/boutique, un seul jeu de fichiers
-- pour toute la plateforme).
insert into storage.buckets (id, name, public)
values ('app-branding', 'app-branding', true)
on conflict (id) do nothing;

drop policy if exists app_branding_select on storage.objects;
create policy app_branding_select on storage.objects for select
  using (bucket_id = 'app-branding');

drop policy if exists app_branding_insert on storage.objects;
create policy app_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-branding' and public.is_super_admin());

drop policy if exists app_branding_update on storage.objects;
create policy app_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'app-branding' and public.is_super_admin())
  with check (bucket_id = 'app-branding' and public.is_super_admin());

drop policy if exists app_branding_delete on storage.objects;
create policy app_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-branding' and public.is_super_admin());
