-- Migration 035 — ZegResto, étape 1/7 : ajoute les rôles restaurant à
-- l'enum app_role existant (owner/manager/accountant déjà présents et
-- couvrent Owner/Manager/Comptable ; il manque Serveur et Cuisinier).
--
-- IMPORTANT — à exécuter SEULE, dans sa propre exécution, avant les
-- migrations 036+ : Postgres interdit d'utiliser une nouvelle valeur
-- d'enum dans la même transaction que celle qui l'a ajoutée (erreur
-- "unsafe use of new value of enum type"). Si le SQL Editor Supabase
-- exécute tout le collage en une seule transaction implicite, coller ce
-- fichier seul, valider, PUIS coller les suivants. Même précaution que
-- 020f_hotel_roles.sql pour front_desk/housekeeping.

alter type public.app_role add value if not exists 'server';
alter type public.app_role add value if not exists 'cook';
