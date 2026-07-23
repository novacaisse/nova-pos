-- Migration 018 — bucket Storage pour la photo de profil (Bloc 23).
-- Même schéma que "shop-logos" (migration 003) et "product-images"
-- (migration 012) : bucket public en lecture (une photo de profil est
-- affichée à toute l'équipe dans Équipe/UserMenu, non sensible),
-- écriture restreinte au propriétaire du profil lui-même.
-- Convention de chemin obligatoire côté client : {user_id}/avatar
-- (ex: "3fa2.../avatar") — c'est ce préfixe que les policies vérifient.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );
