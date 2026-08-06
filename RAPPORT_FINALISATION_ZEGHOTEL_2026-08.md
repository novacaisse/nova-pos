# Rapport de finalisation — Onboarding + MoneyFusion + Permissions

**Date** : 2026-08-06
**Mission** : "Onboarding ZegHotel + MoneyFusion réel (4 apps) + Refonte permissions (rôles → matrice CRUD)"
**Méthode** : chaque partie exécutée directement (migrations appliquées via Supabase MCP, vérifiées en base réelle, puis PR ouverte et mergée) — jamais de push direct sur `main`.

| Partie | PR | Statut |
|---|---|---|
| 1 — Onboarding ZegHotel obligatoire | [#27](https://github.com/novacaisse/nova-pos/pull/27) | Mergée |
| 2 — MoneyFusion réel sur les 4 modules | [#28](https://github.com/novacaisse/nova-pos/pull/28) | Mergée |
| 3 — Remboursement d'acompte (manuel) | [#29](https://github.com/novacaisse/nova-pos/pull/29) | Mergée |
| 4 — Refonte permissions (matrice CRUD) | *(cette PR)* | En relecture |

---

## Partie 1 — Onboarding ZegHotel obligatoire

**Constat de départ** (`AUDIT_ZEGHOTEL_FINALISATION_2026-08.md` §3) : `HotelSetupForm` ne créait que l'identité de l'établissement — un hôtelier terminait son inscription sur un dashboard à 0/0 chambres, sans guide.

**Migration 082** : `organizations.hotel_onboarding_completed boolean default false`, backfillée à `true` pour les organisations hôtel déjà équipées de chambres (2 organisations réelles, vérifiées individuellement) — jamais rebloquées rétroactivement.

**Frontend** : `app.hotel.tsx` remplace tout `/app/hotel/*` (dashboard inclus, jamais juste grisé) par `HotelOnboardingGate` tant que le flag est `false`. Le wizard (owner/manager uniquement, cohérent avec `default_role_permissions`) crée au moins un type de chambre et une chambre avant de débloquer ; les autres rôles voient un écran "configuration en attente".

**Vérifications** : migration appliquée et backfill revérifié par requête directe ; policies RLS `hotel_room_types`/`hotel_rooms` revérifiées cohérentes avec le contrôle de rôle du wizard ; `tsc` propre.

---

## Partie 2 — MoneyFusion réel sur les 4 modules

**Constat de départ** (`AUDIT_ZEGHOTEL_FINALISATION_2026-08.md` §2b) : "Mobile Money" n'était qu'une étiquette de méthode de paiement enregistrée manuellement dans chaque module, sans passerelle réelle.

**Référence technique réutilisée** : `create-subscription-payment` + `moneyfusion-webhook` (paiement d'abonnement SaaS, déjà validé) — même proxy MoneyFusion à IP fixe, même principe de vérification serveur (jamais le statut annoncé dans le corps de la requête webhook).

**Migration 083** : table `payment_requests` (organisation, module, table cible, `target_id`, montant, `provider_ref` — le token MoneyFusion, clé de réconciliation unique). Écriture réservée au `service_role` — le montant n'est **jamais** celui envoyé par le client, toujours recalculé côté serveur depuis l'état réel de la cible :

| Module | Cible | Calcul du montant |
|---|---|---|
| ZegCaisse | `sales` | `total - paid` |
| ZegHotel | `hotel_folios` | solde réel (charges − paiements, avec repli proforma avant check-in) ; acompte plafonné au solde |
| ZegResto | `resto_bills` | `total - loyalty_discount - déjà payé` |
| ZegERP | `erp_pos_sales` (draft) | somme des lignes, même formule que `complete_erp_pos_sale()` |

**Fonctions scindées** (nécessaire, pas cosmétique) : `add_resto_bill_payment()` et `complete_erp_pos_sale()` vérifient l'accès en interne via `has_module_permission()`, qui lit `auth.uid()` — `NULL` sous un appel `service_role` sans session utilisateur. Chacune est scindée en une fonction interne (`apply_*`, logique métier inchangée, réservée `service_role`) et le wrapper authentifié d'origine (inchangé). `add_sale_payment()` et l'insertion `hotel_payments` n'ont pas ce problème (pas de contrôle interne, RLS bypassée par `service_role` comme pour `subscription_payments`).

**Edge Functions** : `create-module-payment` (nouvelle, `verify_jwt=true`) — autorisation via `has_module_permission()` au niveau exact déjà utilisé par l'écriture manuelle équivalente de chaque module. `moneyfusion-webhook` (étendu, `verify_jwt=false` inchangé) — dispatche désormais `payment_requests` en plus de `subscription_payments`.

**Idempotence** : `UPDATE ... WHERE status='pending'` juste avant le dispatch métier — un callback dupliqué obtient 0 ligne affectée. **Vérifié en base** par simulation d'un double appel sur une ligne réelle (créée puis nettoyée) : 1er `UPDATE` → ligne affectée, 2e `UPDATE` identique → 0 ligne.

**Vérifications supplémentaires** : grants des nouvelles fonctions `apply_*` confirmés `service_role`-only (`anon`/`authenticated` = `false`) ; `apply_resto_bill_payment`/`apply_complete_erp_pos_sale` exécutées en direct via `service_role` sur des lignes réelles (note déjà payée, vente déjà annulée) — plus de blocage "Accès refusé.", les garde-fous métier d'origine se déclenchent correctement.

**Simplification assumée** : `return_url` redirige vers le tableau de bord de l'app sans page de confirmation dédiée par module — la réconciliation réelle se fait côté serveur (webhook), indépendamment du retour navigateur.

---

## Partie 3 — Remboursement d'acompte (manuel)

**Constat** : `hotel_payments.kind` prévoit déjà `"refund"` (`folioBalance()`/`printHotelInvoice()` le gèrent correctement dans les calculs de solde), mais aucun bouton de l'interface ne permettait de le déclencher.

**Implémentation** : panneau "Rembourser un acompte" dans `ReservationDrawer` (montant, méthode, motif/référence libre) — aucun appel MoneyFusion, simple insertion `hotel_payments(kind='refund')`, le solde du folio le reflète immédiatement. Aucune migration nécessaire (le type et le calcul existaient déjà). Affichage du détail folio corrigé au passage : un remboursement s'affichait comme un encaissement normal (vert, `-montant`) — maintenant distingué (rouge, `+montant`, avec la référence saisie).

**Vérification "ailleurs"** (demandée par la mission) :
- **ZegCaisse** : remboursement déjà géré via `sales.status = 'refunded'/'partially_refunded'` — mécanisme différent, pas un trou.
- **ZegERP** : remboursement déjà géré via le module `erp_pos_returns` — mécanisme différent, pas un trou.
- **ZegResto** : `resto_bill_payments.statut` a une valeur `'annulee'`, mais **aucune RPC/UI ne la déclenche** — un trou réel équivalent, mais laissé **hors périmètre** de cette Partie (l'audit citait explicitement l'acompte ZegHotel) plutôt que traité sans mandat explicite. À trancher séparément si souhaité.

---

## Partie 4 — Refonte permissions (matrice CRUD)

### Ce qui existait déjà (delta réel, pas une réécriture ex-nihilo)

Avant cette mission, `has_module_permission(org, module, level)` était déjà la fonction unique appelée par **287 des ~330 policies RLS** du projet (vérifié : `select count(*) from pg_policies where qual/with_check like '%has_module_permission%'`), issue du chantier "rôles personnalisés" précédent (tâches #144-149). Le vrai delta demandé par cette mission est : (1) remplacer la **source de données** de cette fonction (rôles nommés indirects → matrice directe par membre), (2) passer de 3 niveaux (view/create/manage) à 4 verbes CRUD indépendants, (3) réduire les derniers appels à `has_any_role_in_organization()` (43 sites restants), (4) UI à cases à cocher réservée au propriétaire.

### Décision structurante : compatibilité de signature

`has_module_permission(_org_id, _module_key, _level)` **garde exactement sa signature et son vocabulaire existant** (`'view'`/`'create'`/`'manage'`). Les 287 policies qui l'appellent déjà n'ont **aucun texte à changer** et héritent automatiquement de la nouvelle matrice. `'manage'` reste un alias de `(can_update ET can_delete)` pour ces call sites non encore migrés au vocabulaire fin ; `'read'`/`'update'`/`'delete'` sont les verbes de premier rang pour tout code écrit à partir de maintenant (déjà utilisés par les policies `payment_requests`, migration 083).

**Alternative rejetée** : réécrire le texte des ~287 policies une par une pour forcer `'read'`/`'update'`/`'delete'` partout — risque de rupture RLS massif sur une base réelle pour un gain nul (le comportement observable est strictement identique via l'alias `'manage'`).

### Migration 084

- **`organization_module_permissions`** : `organization_id`, `user_id`, `module_key`, `can_create`, `can_read`, `can_update`, `can_delete` — matrice directe, remplace `organization_roles`/`organization_role_permissions`. Le **propriétaire n'a jamais de ligne** ici : `has_module_permission()` court-circuite `role='owner'` avant toute lecture de la table (accès total structurel, élimine le risque qu'un propriétaire se retire lui-même l'accès).
- RLS : lecture = soi-même ou propriétaire de l'organisation ; **écriture réservée au propriétaire uniquement** (jamais manager, contrairement au reste du projet) — mandat explicite de la mission.
- **Backfill** : chaque membre non-owner reçoit une ligne par module dérivée de son rôle personnalisé s'il en a un (0 compte réel n'en a actuellement), sinon de son rôle hérité (`default_role_permissions`) — reproduit exactement l'accès effectif d'avant la bascule.
- **`organization_roles`/`organization_role_permissions`/`default_role_permissions` ne sont PAS supprimées** (risque de perte irréversible sur une base réelle sans marge de retour arrière) — elles deviennent orphelines dès que `has_module_permission()` ne les lit plus. Nettoyage définitif (`DROP`) laissé à une migration de suivi séparée, après une période d'observation.
- **15 policies SELECT ZegResto** converties de `has_any_role_in_organization(liste de rôles)` vers `has_module_permission(module, 'view')` — comportement identique vérifié (les modules ciblés — `resto_commandes`/`resto_cuisine`/`resto_menu`/`resto_salle` — sont déjà `open_view=true`).

### Exceptions explicitement NON converties (à trancher par Anselme)

43 sites `has_any_role_in_organization()` au total ; 15 convertis ci-dessus, **28 laissés intacts** :

- **DELETE/INSERT verrouillés en dur owner/manager** (`hotel_rooms`, `hotel_reservations`, `hotel_housekeeping_tasks`, `hotel_maintenance_tickets`, `resto_orders`, `resto_bills`, `resto_order_items`, `resto_kitchen_tickets`, `resto_order_courses`, `resto_tables`, `resto_reservations`, `erp_accounting_periods`, `erp_bank_reconciliations`, `erp_fund_transfers`, `erp_inventories`, `erp_stock_transfers`, `erp_purchase_requests_review`, `erp_sales_pipeline_stages`) — les rendre délégables via la matrice serait un **changement de posture de sécurité** (actuellement "jamais délégable", documenté comme choix produit délibéré dans les commits Phase D : *"toutes les suppressions plus strictes que leur update correspondant... restent owner/manager, jamais délégables"*), pas une simple bascule technique. **Choix par défaut : ne rien changer** (le plus sûr) — je n'ai pas pris la décision de les rendre délégables sans mandat explicite.
- **`organizations` (`shops_update`)** et les **policies Storage** (`product-images`/`resto-menu-photos`/`shop-logos`) : structurelles/transverses, pas scopées à un seul module métier — laissées sur le contrôle de rôle existant.

### Frontend

- `TeamPage.tsx` : l'onglet "Rôles personnalisés" (création/édition de rôles nommés) est remplacé par un onglet "Permissions" — liste des membres délégables, bouton "Permissions" par membre (owner uniquement) ouvrant une grille CRUD (Voir/Créer/Modifier/Supprimer) par module, sauvegardée directement en base.
- Nav (`my_module_permissions()` RPC, déjà utilisée par `AppSidebar`/`BottomNav`) : **inchangée dans son usage** — elle continue de lire `can_view`, désormais rebasé sur la matrice. Un membre sans `can_read` sur un module reste absent de la navigation, comme avant.
- Hooks obsolètes supprimés du code applicatif : `useOrganizationRoles`, `useOrganizationRolePermissions`, `useUpsertOrganizationRole`, `useDeleteOrganizationRole`, `useUpsertRolePermissions`, `useUpdateMemberCustomRole` — vérifié aucun autre appelant dans `src/`.
- Création/invitation de membres (`create-team-member`) : déjà owner-only (vérifié serveur, `membership.role !== 'owner'` rejeté) — aucun changement nécessaire, conforme au mandat "le propriétaire est seul habilité à créer/inviter".

### Vérification obligatoire avant merge — résultats (Supabase MCP, base réelle, projet `iwpxafuoxixjhioyuhdm`)

**Grants/policies avant/après** : requête `pg_proc`/`has_function_privilege` sur les nouvelles fonctions `apply_resto_bill_payment`/`apply_complete_erp_pos_sale` (Partie 2) confirmée `service_role`-only ; `organization_module_permissions` confirmée RLS activée avec exactement 2 policies (`select`, `all`) ; comparaison directe du backfill contre `default_role_permissions` pour un membre réel (`cashier`, 11 modules) : les 4 modules ayant une ligne `default_role_permissions` (`clients`/`devis`/`reservations`/`ventes`) montrent une correspondance exacte `can_read=old_view`, `can_create=old_create`, `can_update=can_delete=old_manage` ; les 7 autres modules (sans ligne `default_role_permissions`) backfillés à `false` partout, comportement identique à l'ancien `coalesce(...,false)`.

**Trois utilisateurs de test réels, vérifiés en requête directe** (simulation JWT via `set local request.jwt.claims`, jamais via l'application) :

| Palier | Utilisateur / module | Résultat |
|---|---|---|
| **Aucun accès** | `cashier` réel / module `fournisseurs` (pas de ligne matrice, pas `open_view`) | `has_module_permission(...,'read') = false` ; `INSERT` sur `suppliers` → **rejeté** (`new row violates row-level security policy`) ; ligne insérée par `service_role` invisible en `SELECT` pour ce membre (0 résultat malgré une ligne réelle) |
| **Lecture seule** | `cashier` réel / module `stock` (`open_view=true`, aucune ligne matrice) | `read=true`, `create=false`, `update=false` |
| **Accès complet** | `owner` réel / module `fournisseurs` | `INSERT` sur `suppliers` → **accepté immédiatement** (court-circuit structurel) |

**Verrouillage RPC** (demandé explicitement) : `add_sale_payment()` appelée par le `cashier` de test sur une vente `completed` qui n'est pas la sienne (hors du carve-out "brouillon propre") → l'`UPDATE` interne est bloqué par RLS (`sales_update` requiert `'manage'`, absent) ; la fonction retourne une ligne entièrement `NULL` (comportement de `RETURNING INTO` sur 0 ligne affectée, pas une exception) et **le solde réel n'a pas bougé** (vérifié : `paid` inchangé après l'appel). Confirme que l'appel direct d'une RPC n'ouvre aucun contournement de la matrice.

Toutes les données de test ont été créées et vérifiées à l'intérieur de transactions **jamais commitées** (aucun `COMMIT` explicite) — confirmé après coup par requête : zéro résidu dans la base réelle.

### Résumé honnête

Ce qui est **réellement neuf et vérifié** : la matrice CRUD par membre, son UI, son backfill sans perte, et le fait que les 287 policies existantes en héritent automatiquement. Ce qui **reste identique à avant** (par choix assumé, documenté ci-dessus, pas par oubli) : les 28 verrous owner/manager côté DELETE/INSERT les plus sensibles, la gestion de `organizations`/Storage, et les tables de l'ancien système (non supprimées, orphelines). Si l'intention était de rendre **tout** délégable sans exception, ce travail reste à faire consciemment, module par module, avec le même niveau de test que ci-dessus.
