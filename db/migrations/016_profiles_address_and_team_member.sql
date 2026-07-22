-- Bloc 14 (Équipe) : remplace le flux "la personne crée son propre compte
-- via /rejoindre, puis le owner l'ajoute par email" par une création
-- directe de compte par le owner (Edge Function create-team-member,
-- service role). profiles.address est nécessaire pour la fiche membre
-- complète créée par le owner (nom, téléphone, adresse).
alter table public.profiles add column if not exists address text;

-- create-team-member (service role) doit pouvoir appeler cette fonction
-- pour rattacher un compte existant — jusqu'ici seule la session
-- utilisateur (authenticated) y avait droit.
grant execute on function public.find_user_id_by_email(text) to service_role;
