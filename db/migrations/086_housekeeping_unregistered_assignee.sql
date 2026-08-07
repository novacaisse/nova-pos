-- 086_housekeeping_unregistered_assignee.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Mission "mise à jour ZegHotel" (item 4) : "Ajouter la possibilité
-- d'assigner une tâche à un membre enregistré dans le logiciel OU non
-- enregistré." — assigned_to (uuid, references auth.users) ne peut porter
-- que des comptes existants. assigned_to_name est un texte libre, mutuellement
-- exclusif avec assigned_to côté frontend (jamais les deux en même temps) :
-- pas de contrainte SQL pour l'imposer, une tâche assignée à un compte réel
-- ET portant un nom libre resterait cohérente (le nom serait simplement
-- ignoré à l'affichage, cf. hotelHooks.ts memberName()).
alter table public.hotel_housekeeping_tasks
  add column if not exists assigned_to_name text;
