-- Migration 075 — "Téléphone personnel" déplacé de la configuration
-- d'organisation (OnboardingFlow, après connexion) vers la création de
-- compte (inscription.tsx) : handle_new_user() lit désormais aussi
-- raw_user_meta_data->>'phone' (passé par signUp() comme full_name l'est
-- déjà) pour préremplir profiles.phone dès l'inscription, avant même que
-- l'utilisateur choisisse une application ZegOS. CREATE OR REPLACE sûr :
-- signature inchangée (trigger function, aucun paramètre).
-- Présentée pour relecture — NE PAS exécuter automatiquement.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;
