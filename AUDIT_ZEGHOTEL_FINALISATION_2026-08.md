# Audit ZegHotel — État actuel, écarts, plan de finalisation

**Date** : 2026-08-06
**Portée** : ZegHotel uniquement (le module le plus avancé après ZegCaisse — 29 correctifs livrés début août, PR #22/#23 mergées).
**Méthode** : exploration et vérification uniquement — **aucune modification de code, migration ou config appliquée dans cette mission**. Chaque affirmation ci-dessous est vérifiée soit dans le code (`src/`, `db/migrations/`, `supabase/functions/`), soit en base réelle via Supabase MCP (`pg_policies`, `pg_proc`/`proacl`, `information_schema`, comptages de lignes), soit côté GitHub (historique de commits).
**Ton** : ce rapport nomme explicitement ce qui est fragile, y compris quand ça contredit le narratif "29 correctifs livrés" du rapport précédent. L'objectif est la vraie photo avant de vendre ce module, pas une liste de fonctionnalités cochées.

---

## Résumé exécutif

ZegHotel est **fonctionnellement complet sur son cœur de métier** (réservations nuitée + horaire, check-in/out, folio, housekeeping automatisé, tarification, rapports) et le socle sécurité (RLS, rôles personnalisés, RPC) est solide et vérifié à jour. Mais l'exploration de cette mission a trouvé **4 problèmes concrets, reproductibles, jamais documentés jusqu'ici** qui touchent directement l'usage autonome par un hôtelier :

1. Le piège `check_in = check_out` (réservations horaires) que le chantier précédent a corrigé à 4 endroits **n'est pas corrigé à un 5e endroit** : le compteur d'occupation du tableau de bord ZegHotel — un client horaire actuellement en séjour n'est pas compté dans les chambres occupées.
2. Aucune protection ne bloque la réservation ou le check-in d'une chambre marquée **"Hors service"** — le champ existe, les triggers le respectent en ménage, mais l'écran de création de réservation ne le filtre jamais.
3. Le module a un type `HotelPaymentKind` qui prévoit le remboursement (`"refund"`) et l'affichage le gère (`printHotelInvoice`, `folioBalance`), mais **aucune UI ne permet de le déclencher** — un acompte encaissé avant une annulation reste comptabilisé comme un paiement, sans mécanisme pour l'inverser.
4. L'onboarding ZegHotel ne crée que l'identité de l'établissement (nom, ville, logo) — **zéro chambre, zéro type de chambre**. Un hôtelier qui termine l'inscription atterrit sur un tableau de bord à 0/0 chambres sans aucun guide pour la suite.

Le point rassurant : l'audit RPC de la mission précédente (migrations 079-081, PR #25) tient bien en production — vérifié à nouveau ici indépendamment, tous les triggers hôtel sont correctement verrouillés (`anon`/`authenticated`/`public` tous `false`). Le cycle housekeeping automatique (migration 078) fonctionne réellement de bout en bout sans intervention manuelle, vérifié dans les deux sens via les triggers en base. Les données réelles restent très faibles en volume (5 réservations, 14 chambres, 2 comptes corporate...) — ce qui explique en partie pourquoi ces 4 problèmes n'ont jamais été remontés : ils n'ont probablement jamais été déclenchés en usage réel.

---

## 1. Inventaire fonctionnel réel

| Brique | Statut | Détail |
|---|---|---|
| Réservations — planning/horaire | **Complet** | Grille planning (14 jours), création avec détection de chevauchement (nuitée + horaire), contrainte d'exclusion PostgreSQL en dernier rempart (`hotel_resv_rooms_excl`/`_hourly_excl`, vérifiées en base). Message d'erreur clair sur conflit concurrent (code `23P01`). |
| Check-in / check-out | **Complet, avec 1 point fragile** | Cycle correct (voir §2a). Le point fragile est le compteur d'occupation du dashboard (§2d, §3). |
| Folio & facture SYSCOHADA | **Complet, avec 1 lacune** | Facture PDF au gabarit A4 SYSCOHADA correcte, proforma avant check-in cohérente avec le folio posté (pas de double comptage, vérifié dans `printHotelInvoice`). Lacune : pas de chemin UI pour un remboursement (§3). |
| Housekeeping automatisé | **Complet, vérifié en base** | Cycle DB-trigger intégral (migration 078) : check-out → chambre `dirty` + tâche `turnover` créée ; tâche `done` → chambre `clean`. `out_of_service` jamais écrasé (vérifié dans le corps des deux fonctions). Le bouton "Regénérer" côté frontend n'est qu'un filet de sécurité, pas le mécanisme principal. |
| POS interne | **Complet** | Deux modes ("sur la note" et "paiement immédiat"), isolé de `sales` (ZegCaisse) via `hotel_pos_sales`. `create_hotel_pos_sale`/`post_hotel_pos_charge` : `SECURITY DEFINER`, contrôle interne via `has_module_permission()` vérifié en base (anon/authenticated exécutent la fonction mais celle-ci s'auto-protège). |
| Comptes entreprise | **Complet** | Facturation différée opérationnelle (`closeFolio({ billToCorporate: true })`), condition correcte (compte rattaché + solde positif). |
| Tarification | **Complet** | Formules tarifaires, tarifs saisonniers, restrictions de vente (min_stay/stop_sell/closed_to_arrival) — appliquées côté serveur (`hotel_check_rate_restrictions()`) et gérables en Paramètres depuis le dernier chantier. |
| Rapports | **Complet** | Occupation/ADR/RevPAR/revenu, tendances période précédente, répartition par type de chambre/canal/mode de paiement, extras, annulations/no-show, export PDF. |

**RLS** : les 17 tables `hotel_*` ont toutes RLS activée (1 à 4 policies chacune, vérifié via `pg_tables`/`pg_policies`). Les rôles personnalisés (`default_role_permissions`, module_key `hotel_*`) sont cohérents avec la matrice attendue : `housekeeping` n'a que `hotel_housekeeping`+`hotel_maintenance`, `front_desk` a un accès large réception mais pas `hotel_rapports.manage` ni `hotel_canaux`, `accountant` est view-only sur les modules financiers (`hotel_folios`, `hotel_payments`, `hotel_rapports`). Un seul résidu inoffensif : `hotel_canaux` reste présent dans `default_role_permissions` bien que l'écran ait été retiré (tâche #175) — décision documentée à l'époque ("retrait application seulement, pas de migration destructrice"), cohérent, pas un bug.

---

## 2. Parcours de bout en bout tracés dans le code

### a) Réservation → check-in → séjour → check-out → facture

Tracé ligne par ligne dans `src/routes/app.hotel.reservations.tsx` + `src/lib/data/hotelHooks.ts` :

1. `CreateReservationModal.submit()` → `useCreateHotelReservation()` → RPC `create_hotel_reservation` (tarif calculé serveur si non saisi manuellement, migrations 027/028).
2. **Nuitée** : `useCheckInReservation()` poste la charge `room` (+ taxe de séjour si activée) dans `hotel_folio_charges` **au check-in**. **Horaire** : aucune charge n'est postée au check-in (durée non connue à l'avance) — elle est calculée et postée **au check-out** à partir du temps réellement écoulé (`actual_check_in_at` → maintenant, arrondi à l'heure supérieure).
3. `useCheckOutReservation()` marque les chambres `dirty` (déclenche aussi le trigger DB §2c en parallèle — double écriture inoffensive, la chambre repasse au même statut par les deux chemins).
4. `printHotelInvoice()` additionne les charges postées ; si aucune charge `room` n'existe encore (réservation pas check-in), elle retombe sur un total proforma calculé depuis `hotel_reservation_rooms.rate_amount` — jamais les deux à la fois (vérifié : `hasPostedRoomCharge` exclut l'un ou l'autre).
5. `useCloseFolio()` clôture, avec l'option facturation entreprise différée.

**Ce parcours fonctionne correctement pour les deux modes de facturation (nuitée et horaire).**

**Lacune trouvée (non documentée avant cet audit)** : l'annulation (`useCancelReservation`) ne touche que `hotel_reservations.status` — jamais le folio. Si un acompte a déjà été encaissé via `useAddFolioPayment()` (possible dès que le folio est `open`, donc même en statut `pending`/`confirmed`, avant tout check-in), et que la réservation est ensuite annulée, le folio garde ce paiement enregistré sans aucune charge en face : le solde devient négatif (créditeur) sans mécanisme pour matérialiser un remboursement physique. Le type `HotelPaymentKind` prévoit `"refund"` (utilisé correctement dans les calculs de solde, `folioBalance()`/`printHotelInvoice()`), mais **`ReservationDrawer` ne propose que `method` (cash/mobile money/carte/virement) dans son formulaire d'encaissement — jamais de sélecteur `kind`, donc `"refund"` n'est atteignable par aucun bouton de l'interface.**

### b) Paiement Mobile Money via MoneyFusion

**Constat central, à corriger dans le narratif du chantier précédent** : MoneyFusion **n'est intégré nulle part dans les parcours de paiement client de ZegHotel**. Vérifié par recherche exhaustive (`grep -r "MoneyFusion\|moneyfusion" src/`) : les seules occurrences touchent l'abonnement SaaS ZegOS (`create-subscription-payment`, `souscription.*`, `admin.abonnements.tsx`) — jamais le folio d'un client hôtelier.

Dans `ReservationDrawer`, "Mobile Money" est une simple **étiquette de méthode** dans `useAddFolioPayment()` (`hotel_payments.method`), au même titre que "Espèces" ou "Carte" — un encaissement manuel déclaré par la réception, sans appel réseau, sans webhook, sans vérification d'aucune sorte. Il n'y a **aucune passerelle de paiement en ligne pour les clients de l'hôtel** dans ce module.

Ce que la mission précédente avait identifié (le toggle JWT de `moneyfusion-webhook`) concerne exclusivement la **facturation de l'abonnement SaaS** (le hôtelier qui paie ZegOS), pas ses propres clients. Sur ce point précis : vérifié via `list_edge_functions`, `moneyfusion-webhook` a bien `verify_jwt: false` en production, cohérent avec `supabase/config.toml` — **le toggle Dashboard est correctement positionné, ce point est résolu**, indépendamment du fait qu'il ne concerne pas les paiements clients ZegHotel.

**Implication produit** : si l'argument commercial de vente de ZegHotel inclut "encaissement Mobile Money", il faut être précis — c'est un enregistrement manuel de méthode de paiement, pas un encaissement en ligne réel (pas de débit du téléphone du client, pas de confirmation automatique). Pour un hôtelier qui s'attend à un vrai bouton "Facturer via Mobile Money" au sens agrégateur de paiement, ce n'est pas ce qui existe aujourd'hui.

### c) Cycle housekeeping automatique

Confirmé fonctionnel de bout en bout **sans intervention manuelle**, vérifié directement en base (migration 078, `db/migrations/078_hotel_room_status_automation.sql`, triggers actifs vérifiés via `information_schema.triggers`) :

- `trg_hotel_room_dirty_on_checkout` (AFTER UPDATE sur `hotel_reservations`) : dès que `status` passe à `checked_out`, chaque chambre de la réservation passe `dirty` **et** une tâche `hotel_housekeeping_tasks(kind='turnover')` est créée immédiatement (garde-fou anti-doublon : `where not exists` sur une tâche non terminée déjà présente ce jour).
- `trg_hotel_room_clean_on_task_done` (AFTER UPDATE sur `hotel_housekeeping_tasks`) : dès qu'une tâche `cleaning`/`turnover` passe `done`, la chambre repasse `clean`.
- `out_of_service` n'est jamais écrasé par ces deux triggers (`where housekeeping_status <> 'out_of_service'` dans les deux fonctions).
- Frontend : `useHotelHousekeepingTasks()` re-interroge toutes les 60s (`refetchInterval: 60_000`), la page joue un son à l'arrivée d'une nouvelle tâche (comparaison d'ID sets). Le bouton "Regénérer (filet de sécurité)" reste utile seulement pour une chambre marquée sale par un autre biais (note manuelle) sans passage par un check-out suivi.

**Ce cycle est réellement automatique et fiable — c'est le point le plus solide du module.**

### d) Le piège `check_in = check_out` (réservations horaires) — vérifié PARTOUT, pas juste "corrigé"

Le chantier précédent a corrigé ce piège à 4 endroits (vérifié, tous encore corrects dans le code actuel) :
- `useHotelReservations()` — filtre de requête (`.or("check_out.gt.X,check_in.gte.X")`).
- Grille planning (`RoomRow`/`bookingsByRoom`, `app.hotel.reservations.tsx`) — `end = isHourly ? addDays(check_in, 1) : check_out`.
- Détection de chevauchement à la création (`CreateReservationModal.bookedRoomIds`) — `rrEnd = check_out > check_in ? check_out : addDays(check_in, 1)`.
- `nightsInRange()` (rapports) — `effectiveCheckOut` avec le même repli.
- Contrainte SQL elle-même (`hotel_resv_rooms_excl`, `daterange(check_in, GREATEST(check_out, check_in + 1))`) — vérifiée en base, c'est la source du pattern repris partout côté application.

**5e endroit trouvé dans cette mission, non corrigé** : le compteur d'occupation du tableau de bord ZegHotel (`useHotelDashboard`/équivalent, `src/lib/data/hotelHooks.ts:1295-1296`) :

```ts
supabase.from("hotel_reservations").select("id", { count: "exact", head: true })
  .eq("organization_id", organizationId!)
  .eq("status", "checked_in").lte("check_in", today).gt("check_out", today),
```

Pour une réservation horaire en cours (`check_in = check_out = today`, `status = 'checked_in'`), `gt("check_out", today)` est **faux** (`check_out` égale `today`, pas strictement supérieur) — cette réservation n'est **jamais comptée** dans `occupied`, donc jamais dans le taux d'occupation affiché sur le tableau de bord. C'est exactement le même piège que celui documenté dans CLAUDE.md, à un endroit que le chantier précédent n'a pas touché. Impact concret : un hôtel qui vend des passages horaires (fréquent dans certains segments) verra son taux d'occupation dashboard sous-évalué tant qu'un client horaire est en séjour.

*(Note : la requête `departures` juste au-dessus, `.eq("check_out", today)`, n'a pas ce problème — l'égalité stricte fonctionne correctement pour une sortie horaire du jour même.)*

---

## 3. Écarts vs une V1 vendable

Ce que cet audit a trouvé qui empêcherait un hôtelier d'utiliser ZegHotel de façon autonome, sans support constant :

- **Compteur d'occupation dashboard** (§2d) — sous-évalue l'occupation en présence de réservations horaires actives. Simple à corriger, mais actif en production tel quel aujourd'hui.
- **Chambre "Hors service" non protégée à la réservation** — `CreateReservationModal` ne filtre les chambres disponibles que par chevauchement de dates (`bookedRoomIds`), jamais par `housekeeping_status`. Rien n'empêche la réception de sélectionner et facturer une chambre marquée `out_of_service` (ex. en travaux). Aucun garde-fou ni côté UI ni côté RPC `create_hotel_reservation` (vérifié : la fonction ne lit pas `housekeeping_status`). C'est exactement le type d'edge case "chambre en double statut" que la mission demandait de vérifier — non géré aujourd'hui.
- **Pas de remboursement UI pour une annulation avec acompte versé** (§2a) — le type `HotelPaymentKind.refund` existe et est correctement pris en compte dans les calculs de solde, mais rien dans l'interface ne permet de le déclencher. Un hôtelier qui annule une réservation avec acompte déjà encaissé n'a aucun outil pour matérialiser le remboursement dans ZegHotel — il devra le gérer hors système.
- **Onboarding incomplet** — `HotelSetupForm` (`src/components/app/OnboardingFlow.tsx:212-318`) ne crée que l'identité de l'établissement (nom, ville, téléphone, logo). Zéro type de chambre, zéro chambre, zéro formule tarifaire. Un hôtelier termine son inscription sur un dashboard "0/0 chambres" et doit deviner qu'il faut aller dans "Chambres" pour créer un type puis des chambres avant de pouvoir prendre sa première réservation — aucun guide, aucun wizard, aucun rappel contextuel.
- **Messages d'erreur génériques** — le pattern dominant dans les gestionnaires d'erreur (`ReservationDrawer.run()`, `CreateReservationModal.submit()`) est `e?.message ?? "Erreur inconnue"`. Les erreurs applicatives connues sont bien traduites (ex. le `23P01` de chevauchement de réservation), mais une coupure réseau ou une erreur Supabase générique remonterait le message brut du client JS (souvent en anglais, type "Failed to fetch"), pas un message français explicite de type "connexion perdue". Le principe du projet ("pas de mode hors-ligne, erreur explicite plutôt qu'échec silencieux") est respecté au sens où rien n'échoue silencieusement — mais la qualité du message dépend du hasard de ce que renvoie le SDK, pas d'une gestion dédiée de la panne réseau.
- **Volumétrie réelle très faible** — 5 réservations, 6 lignes de réservation, 14 chambres, 5 types de chambre, 4 clients, 5 folios, 3 paiements, 2 comptes corporate, **0 ligne** dans `hotel_maintenance_tickets`/`hotel_rate_plans`/`hotel_rate_restrictions`/`hotel_seasonal_rates`. Ce module n'a quasiment pas été utilisé en conditions réelles — les 4 lacunes ci-dessus n'ont probablement jamais été rencontrées par un utilisateur, ce qui explique qu'elles n'aient jamais remonté. Ça ne les rend pas moins réelles pour un premier client payant.

---

## 4. Dette technique et sécurité spécifique à ZegHotel

**RLS / policies** : 10 des 78 "Multiple Permissive Policies" du rapport de sécurité global (2026-08) concernent des tables `hotel_*` — un doublon `X_select` (FOR SELECT) + `X_write` (FOR ALL) qui s'appliquent tous les deux à `authenticated` sur les actions SELECT (Postgres les combine en OR, donc c'est un coût de performance, pas une faille — les deux policies accordent un accès équivalent). Tables concernées : `hotel_corporate_accounts`, `hotel_folio_charges`, `hotel_folios`, `hotel_guests`, `hotel_rate_plans`, `hotel_rate_restrictions`, `hotel_reservation_rooms`, `hotel_room_types`, `hotel_seasonal_rates`, `hotel_settings`.

**Fonctions `SECURITY DEFINER` spécifiques à ZegHotel** — recontrôlées indépendamment dans cette mission (requête directe sur `pg_proc`/`has_function_privilege`, pas une relecture de l'audit précédent) :
- `create_hotel_pos_sale`, `hotel_guest_contact`, `post_hotel_pos_charge` : `SECURITY DEFINER`, `search_path=public`, exécutables par `anon`/`authenticated` au niveau grant — mais toutes s'auto-protègent en interne via `has_module_permission()`/`has_any_role_in_organization()`. Contrôles internes jugés suffisants (cohérent avec le pattern du reste du projet).
- `create_hotel_reservation` : `SECURITY INVOKER`, `search_path` **non figé** (chaîne vide) — hygiène uniquement (pas de `SET search_path`), pas exploitable puisque la RLS de l'appelant s'applique quand même (invoker), mais à corriger par cohérence avec le reste du schéma (toutes les autres fonctions récentes fixent `search_path=public`).
- `hotel_check_rate_restrictions`, `hotel_compute_room_rate`, `hotel_guest_summary` : invoker, lecture seule, `search_path` correct, RLS-protégées.
- Les 12 fonctions trigger hôtel touchées par les migrations 080/081 (`hotel_sync_reservation_room_on_insert/update`, `hotel_room_dirty_on_checkout`, `hotel_room_clean_on_task_done`, `notify_hotel_checkout`, `notify_hotel_reservation_created`) : **revérifiées indépendamment dans cette mission**, `anon_exec`/`authenticated_exec` tous `false` — la correction tient en production.

**Cohérence rôles/permissions** : `default_role_permissions` pour les modules `hotel_*` a été comparée ligne par ligne à `has_any_role_in_organization()`/`has_module_permission()` — cohérente, aucune incohérence trouvée (détail §1).

---

## 5. Recommandations priorisées

### Bloquant avant lancement commercial

| # | Item | Effort | Nature |
|---|---|---|---|
| 1 | Compteur d'occupation dashboard ne compte pas les horaires en cours (`hotelHooks.ts:1295-1296`) | **S** | Fix simple — même pattern `greatest`/`addDays` déjà appliqué 4x ailleurs dans le même fichier |
| 2 | Aucun garde-fou "chambre hors service" à la création de réservation / check-in | **S/M** | Fix simple côté UI (filtrer `bookedRoomIds` par `housekeeping_status`) ; envisager aussi un garde-fou côté RPC `create_hotel_reservation` pour fermer le contournement API directe |
| 3 | Onboarding ne crée aucune chambre/type de chambre | **M** | Touche le flux d'onboarding (`OnboardingFlow.tsx`) — décision produit à valider avant tout prompt de build : wizard guidé post-inscription, ou données de démo pré-remplies désactivables ? |
| 4 | Pas de chemin UI pour rembourser un acompte sur annulation | **S/M** | Le type `refund` existe déjà côté données/calculs — ajouter un sélecteur `kind` ou un bouton dédié dans `ReservationDrawer` |

### Important mais contournable temporairement (V1.1)

- Messages d'erreur réseau non francisés/génériques (`e?.message ?? "Erreur inconnue"`) — nécessiterait une couche de traduction d'erreurs centralisée, pas spécifique à ZegHotel.
- MoneyFusion non intégré aux paiements clients ZegHotel (Mobile Money = étiquette manuelle uniquement) — si le positionnement commercial promet un encaissement en ligne réel, c'est un chantier d'intégration à part entière (**L**, architectural — passerelle de paiement réelle côté guest, à valider avant tout prompt de build).
- 10 "Multiple Permissive Policies" sur tables `hotel_*` — nettoyage de performance, aucun impact sécurité, à traiter avec le reste des 78 du rapport global.

### Amélioration confort (backlog)

- `create_hotel_reservation` : fixer `search_path=public` par cohérence (hygiène, aucun impact fonctionnel).
- `useUpdateHousekeepingTaskStatus()` écrit `housekeeping_status='clean'` côté frontend alors que le trigger DB le fait déjà — écriture redondante inoffensive, simplifiable.
- Résidu `hotel_canaux` dans `default_role_permissions` après le retrait de l'écran Canaux (documenté, sans risque) — nettoyable en passant sur une future migration hôtel.

---

*Rapport produit par exploration de code (`src/`, `db/`, `supabase/functions/`) et vérification en base réelle (Supabase MCP, projet `iwpxafuoxixjhioyuhdm`) et sur l'historique GitHub. Aucune modification appliquée.*
