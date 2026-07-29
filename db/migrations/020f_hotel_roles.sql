-- Migration 020f — ZegHotel, étape 1/4 : ajoute les rôles hôteliers à
-- l'enum app_role existant (owner/manager/accountant déjà présents et
-- couvrent Owner/Manager/Comptable ; il manque Réceptionniste et
-- Gouvernante).
--
-- IMPORTANT — à exécuter SEULE, dans sa propre exécution, avant les
-- migrations 020g/020h/020i/020j : Postgres interdit d'utiliser une
-- nouvelle valeur d'enum dans la même transaction que celle qui l'a
-- ajoutée (erreur "unsafe use of new value of enum type"). Si le SQL
-- Editor Supabase exécute tout le collage en une seule transaction
-- implicite, coller ce fichier seul, valider, PUIS coller les suivants.

alter type public.app_role add value if not exists 'front_desk';
alter type public.app_role add value if not exists 'housekeeping';
