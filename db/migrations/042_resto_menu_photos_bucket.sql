-- Migration 042 — ZegResto V2, étape 1 : bucket Storage pour les photos
-- d'articles du menu. Présentée pour relecture — NE PAS exécuter
-- automatiquement.
--
-- Remplace le champ texte resto_menu_items.photo_url (URL externe, V1)
-- par un vrai upload — la colonne elle-même ne change pas de type (déjà
-- `text`), seule la valeur qu'elle contient devient une URL publique du
-- bucket au lieu d'une URL saisie à la main.
--
-- Même pattern que le bucket "product-images" (migration 012) : public en
-- lecture, écriture restreinte aux rôles pouvant déjà écrire sur
-- resto_menu_items (owner/manager). Convention de chemin obligatoire côté
-- client : {organization_id}/{menu_item_id}.

insert into storage.buckets (id, name, public)
values ('resto-menu-photos', 'resto-menu-photos', true)
on conflict (id) do nothing;

drop policy if exists resto_menu_photos_select on storage.objects;
create policy resto_menu_photos_select on storage.objects for select
  using (bucket_id = 'resto-menu-photos');
drop policy if exists resto_menu_photos_insert on storage.objects;
create policy resto_menu_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists resto_menu_photos_update on storage.objects;
create policy resto_menu_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  )
  with check (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
drop policy if exists resto_menu_photos_delete on storage.objects;
create policy resto_menu_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'resto-menu-photos'
    and public.has_any_role_in_organization(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.app_role[])
  );
