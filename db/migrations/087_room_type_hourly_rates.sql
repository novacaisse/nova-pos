-- 087_room_type_hourly_rates.sql
-- Présentée pour relecture — NE PAS exécuter automatiquement (aucun script
-- CI/déploiement ne doit lancer ce fichier) : à coller manuellement dans
-- Supabase SQL Editor, comme les migrations précédentes.
--
-- Mission "mise à jour ZegHotel" (item 3, dernier tiret) : "lors de
-- l'enregistrement de type de chambre ajouter la possibilité d'ajouter les
-- tarifs par nuitée, heure, heure personnalisée etc... et aussi ajouter les
-- équipements que contient ce type de chambre".
--
-- Équipements : hotel_room_types.amenities (jsonb) existe déjà depuis la
-- création de la table mais n'était exposé nulle part côté frontend
-- (RoomTypeModal, app.hotel.rooms.tsx) — corrigé sans migration, juste un
-- champ UI de plus sur une colonne déjà là.
--
-- Tarifs seulement : nuitée = base_price (déjà là). hourly_rate et
-- custom_hourly_rates sont des tarifs DE RÉFÉRENCE saisis ici, pas (encore)
-- branchés sur hotel_compute_room_rate() (migration 027) : le calcul
-- automatique au moment de la réservation continue de lire
-- hotel_rate_plans.hourly_rate (formule tarifaire org-wide), comportement
-- inchangé et volontairement non retouché ici — la précédence saisonnier >
-- formule tarifaire a été confirmée avec Emmanuel (027) et ne doit pas être
-- réinterprétée sans confirmation explicite. À signaler avant tout
-- branchement automatique.
alter table public.hotel_room_types
  add column if not exists hourly_rate numeric(14,2),
  -- Tarifs horaires personnalisés (ex: [{"label":"2h","hours":2,"price":5000}]) —
  -- jsonb plutôt qu'une table dédiée : volume faible par type de chambre,
  -- pas de besoin de requêter individuellement ces lignes.
  add column if not exists custom_hourly_rates jsonb not null default '[]'::jsonb;
