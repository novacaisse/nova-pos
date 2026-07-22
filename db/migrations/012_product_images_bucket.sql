-- Migration 012 — bucket Storage pour les images produit (Bloc 9).
-- Même schéma que "shop-logos" (migration 003) : bucket public en
-- lecture (les images produit sont affichées en Caisse/Produits, non
-- sensibles), écriture restreinte aux rôles ayant déjà le droit
-- d'écrire sur `products` (owner/manager/stock — cf. products_insert/
-- products_update dans le schéma).
-- Convention de chemin obligatoire côté client : {shop_id}/{product_id}
-- (ex: "3fa2.../8b1c...") — c'est ce préfixe que les policies vérifient.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_select on storage.objects;
create policy product_images_select on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  )
  with check (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_any_role_in_shop(((storage.foldername(name))[1])::uuid, array['owner','manager','stock']::public.app_role[])
  );
