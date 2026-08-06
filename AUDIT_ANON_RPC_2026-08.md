# Audit sécurité — accès `anon` aux fonctions RPC

Date : 2026-08-06
Portée : schéma `public` du projet Supabase **Novabase** (`iwpxafuoxixjhioyuhdm`), interrogé en direct (pas d'hypothèse sur le code seul).
Statut : **audit seul, aucune modification de grant ni de code appliquée** (hors migration 079, déjà validée et exécutée avant cette mission — voir note en tête de tableau).

## Résumé exécutif

- Le schéma `public` contient **251 fonctions**, mais **188 appartiennent à l'extension `btree_gist`** (index GiST utilisés par les contraintes anti-chevauchement de réservation ZegHotel) — ce ne sont pas des endpoints applicatifs. **63 fonctions sont du code applicatif réel** ; c'est le vrai périmètre de cet audit.
- Sur ces 63 : **61 ont `EXECUTE` accordé à `anon`** (2 corrigées avant cette mission, migration 079/PR #23).
- **Cause racine identifiée et confirmée en base** (`pg_default_acl`) : le projet Supabase a un privilège par défaut `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`, configuré une fois à la création du projet. Chaque migration de ce dépôt applique le pattern `revoke all ... from public; grant execute ... to authenticated;` en pensant exclure `anon` — mais ce pattern ne retire que le privilège hérité du pseudo-rôle `PUBLIC`, jamais le privilège que Supabase accorde **directement et nommément** à `anon`. Résultat : ce pattern n'a **jamais** été efficace pour exclure `anon`, sur aucune fonction du projet, depuis le début — ce n'est pas une régression d'un chantier récent.
- **Conclusion après vérification ligne par ligne des 63 fonctions et de toutes les policies RLS du schéma** : le vrai périmètre à risque est **beaucoup plus restreint** que ne le suggère le nombre brut.
  - **1 fonction à risque réel** : `find_user_id_by_email()` — aucun contrôle interne, appelable par `anon`.
  - **13 fonctions triggers** exposées inutilement en RPC (échouent hors contexte trigger, donc non exploitables en pratique, mais à nettoyer par hygiène) — 2 déjà corrigées avant cette mission.
  - **47 fonctions protégées** par un contrôle interne suffisant (`has_module_permission()`, `is_super_admin()`, vérification explicite `auth.uid()`, ou RLS `TO authenticated` sur les tables sous-jacentes pour les fonctions `SECURITY INVOKER`).
  - **2 fonctions intentionnellement publiques** (réservation ZegResto en ligne), vérifiées correctement scopées.
- **Toutes les policies RLS du schéma sauf deux** (`app_settings`, `plans` — données publiques par nature : config app, tarifs) sont scopées `TO authenticated` explicitement, jamais `TO public`. C'est ce qui protège de facto la quasi-totalité des fonctions `SECURITY INVOKER` malgré le grant `anon` au niveau fonction : RLS refuse la requête avant même que la logique métier ne s'exécute.

## Méthodologie

1. Inventaire direct `pg_proc`/`pg_get_function_identity_arguments`/`has_function_privilege()` pour les grants réels (`anon`, `authenticated`, `service_role`) — pas de confiance dans le code source seul.
2. Filtrage des fonctions appartenant à une extension (`pg_depend`/`pg_extension`) pour isoler le code applicatif.
3. Lecture du corps (`pg_proc.prosrc`) de chaque fonction `SECURITY DEFINER` pour vérifier la présence d'un contrôle d'autorisation réel (pas seulement une recherche de mot-clé — plusieurs fonctions passent par un wrapper comme `is_super_admin()` ou `has_any_role_in_organization()` plutôt que d'appeler `auth.uid()` directement, ce qu'une recherche naïve par mot-clé aurait manqué).
4. Pour les fonctions `SECURITY INVOKER` (RLS non contournée) : vérification de `pg_policies` sur chaque table écrite/lue, confirmant le rôle `TO authenticated`.
5. `pg_default_acl` interrogé pour confirmer la cause racine du grant `anon`.
6. Croisement avec le Security Advisor Supabase (`get_advisors`, type `security`) — voir section dédiée.

## Cause racine — pourquoi `anon` a `EXECUTE` partout

```sql
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl
from pg_default_acl where defaclnamespace = 'public'::regnamespace;
```

```
role: postgres | schema: public | type: functions
acl: {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

Ce privilège par défaut a été posé par `postgres` (configuration plateforme Supabase à la création du projet), pas par une migration de ce dépôt. Il s'applique automatiquement à **toute nouvelle fonction créée dans `public`**, indépendamment de ce que fait la migration qui la crée. Le pattern `revoke all on function ... from public; grant execute on function ... to authenticated;`, utilisé de façon cohérente dans toutes les migrations depuis le début du projet, retire bien l'accès hérité de `PUBLIC` — mais `anon` a son propre privilège direct via ce default ACL, jamais touché par ce `revoke`.

**Implication pour toute correction future** : `revoke ... from public` ne suffit jamais. Il faut systématiquement `revoke execute on function ... from anon;` explicitement (comme fait dans la migration 079 pour les 2 triggers ZegHotel), ou reconfigurer le default ACL lui-même au niveau du projet (`alter default privileges in schema public revoke execute on functions from anon;`, à exécuter une fois — s'appliquerait alors automatiquement à toute fonction future, mais **hors périmètre de cette mission d'audit**, à valider séparément avant application).

## Filet de sécurité réel : RLS scopée `TO authenticated`

```sql
select tablename, policyname, cmd, roles from pg_policies
where schemaname='public' and (roles::text ilike '%public%' or roles::text ilike '%anon%');
```

Résultat — seulement 2 lignes sur l'ensemble du schéma :

| Table | Policy | Commande | Rôles |
|---|---|---|---|
| `app_settings` | `app_settings_select` | SELECT | `anon, authenticated` |
| `plans` | `plans_select_public` | SELECT | `anon, authenticated` |

Ce sont des données publiques par conception (config d'app, grille tarifaire consommée par `/tarifs` et la landing sans session). **Aucune autre table du schéma n'a de policy applicable à `anon`.** Conséquence directe, vérifiée sur `create_sale()` (aucun contrôle interne, appelée en tant qu'`anon`) : la policy `sales_insert` est scopée `TO authenticated` uniquement — `anon` n'a *aucune* policy applicable, donc RLS refuse l'écriture par défaut, avant même que la logique de la fonction ne s'exécute. Ce comportement est vérifié comme systématique (requête ci-dessus, exhaustive sur tout le schéma), pas seulement sur cet exemple.

## Comparaison avec le Security Advisor Supabase

Le Security Advisor (`get_advisors`, type `security`) relevait, avant cette mission (post-migration 079) :
- 53 × `Public Can Execute SECURITY DEFINER Function` (rôle `anon`) + 53 × la même chose pour `authenticated` = 106 WARN.
- 3 × `Function Search Path Mutable` (`create_sale`, `add_sale_payment`, `create_hotel_reservation`).
- 4 × `Security Definer View` (ERROR, pré-existant, vues `erp_v_*` — hors périmètre RPC, déjà documenté dans un audit précédent).
- 1 × `Extension in Public` (`btree_gist` installée dans `public` plutôt que dans un schéma dédié — hygiène, hors périmètre).
- 1 × `Leaked Password Protection Disabled` (réglage Supabase Auth — hors périmètre RPC, à activer séparément si souhaité).
- 3 × `RLS Enabled No Policy` (INFO) sur `default_role_permissions`, `permission_modules`, `super_admins` — **comportement voulu**, pas un bug : ces tables ne sont lisibles qu'au travers de fonctions `security definer` dédiées (`has_module_permission()`, `is_super_admin()`), jamais en accès direct, RLS bloque tout le monde y compris un `authenticated` légitime par conception.

**Écart avec l'audit manuel** : le Security Advisor **ne distingue pas** une fonction `SECURITY DEFINER` protégée par un contrôle interne (`has_module_permission()`, `is_super_admin()`...) d'une fonction sans aucune protection — il alerte uniformément sur les 53. C'est la valeur ajoutée de cet audit manuel : réduire ces 53 alertes identiques à **1 seul cas réellement à risque**, les 52 autres étant couvertes par un contrôle applicatif vérifié fonction par fonction. Le Security Advisor ne signale pas non plus les fonctions `SECURITY INVOKER` (`create_sale`, `add_sale_payment`, `create_hotel_reservation` mis à part pour le search_path) car il ne vérifie pas le scoping RLS des tables qu'elles touchent — c'est un contrôle que seule cette lecture manuelle croisée apporte.

## Tableau complet — 63 fonctions applicatives, trié par risque

Colonnes : `anon` = `EXECUTE` accordé à `anon` (vérifié via `has_function_privilege`) · `search_path` = figé (✅) ou mutable (⚠️, bas risque hors `SECURITY DEFINER`).

| Fonction | Module | Type | `anon` | `search_path` | Contrôle interne | Catégorie |
|---|---|---|:---:|:---:|---|---|
| `find_user_id_by_email()` | Transverse | DEFINER | ✅ | ✅ | Aucun | 🔴 À risque réel |
| `rls_auto_enable()` | Infra Supabase | DEFINER (event trigger) | ✅ | ✅ | N/A — géré par Supabase | 🟡 Trigger exposé (hygiène) |
| `apply_stock_movement()` | Transverse | DEFINER (trigger) | ✅ | ✅ | N/A — jamais appelée hors trigger | 🟡 Trigger exposé (hygiène) |
| `handle_new_user()` | Transverse | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `notify_new_member()` | Transverse | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `notify_stock_level()` | Transverse | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `notify_big_sale()` | ZegCaisse | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `apply_erp_cash_transaction()` | ZegERP | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `apply_erp_stock_movement()` | ZegERP | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `enforce_single_default_erp_warehouse()` | ZegERP | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `hotel_sync_reservation_room_on_insert()` | ZegHotel | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `hotel_sync_reservation_room_on_update()` | ZegHotel | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `notify_hotel_checkout()` | ZegHotel | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `notify_hotel_reservation_created()` | ZegHotel | DEFINER (trigger) | ✅ | ✅ | N/A | 🟡 Trigger exposé (hygiène) |
| `admin_change_organization_plan()` | Admin | DEFINER | ✅ | ✅ | is_super_admin() | 🟢 Protégée (contrôle interne) |
| `admin_extend_trial()` | Admin | DEFINER | ✅ | ✅ | is_super_admin() | 🟢 Protégée (contrôle interne) |
| `admin_get_user_emails()` | Admin | DEFINER | ✅ | ✅ | is_super_admin() (inline dans le WHERE) | 🟢 Protégée (contrôle interne) |
| `admin_set_payment_status()` | Admin | DEFINER | ✅ | ✅ | is_super_admin() | 🟢 Protégée (contrôle interne) |
| `is_super_admin()` | Admin | DEFINER | ✅ | ✅ | auth.uid() + super_admins (table sans policy, accès direct impossible) | 🟢 Protégée (contrôle interne) |
| `current_user_organizations()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() + organization_members | 🟢 Protégée (contrôle interne) |
| `has_any_role_in_organization()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() + organization_members | 🟢 Protégée (contrôle interne) |
| `has_organization_access()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() + organization_members | 🟢 Protégée (contrôle interne) |
| `has_role_in_organization()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() + organization_members | 🟢 Protégée (contrôle interne) |
| `is_account_member()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() + accounts | 🟢 Protégée (contrôle interne) |
| `is_account_owner()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() | 🟢 Protégée (contrôle interne) |
| `is_organization_owner()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() | 🟢 Protégée (contrôle interne) |
| `my_module_permissions()` | Transverse | DEFINER | ✅ | ✅ | has_module_permission (par org demandée) | 🟢 Protégée (contrôle interne) |
| `provision_organization()` | Transverse | DEFINER | ✅ | ✅ | auth.uid() IS NULL -> exception explicite | 🟢 Protégée (contrôle interne) |
| `has_module_permission()` | Transverse (cœur RLS) | DEFINER | ✅ | ✅ | auth.uid() + organization_members (null-safe, vérifié) | 🟢 Protégée (contrôle interne) |
| `add_reservation_payment()` | ZegCaisse | INVOKER | ✅ | ✅ | RLS (reservations/reservation_payments TO authenticated) | 🟢 Protégée (contrôle interne) |
| `add_sale_payment()` | ZegCaisse | INVOKER | ✅ | ⚠️ | RLS (sales/payments TO authenticated) | 🟢 Protégée (contrôle interne) |
| `create_sale()` | ZegCaisse | INVOKER | ✅ | ⚠️ | RLS (sales/sale_items/payments/stock_movements TO authenticated) | 🟢 Protégée (contrôle interne) |
| `complete_erp_bank_reconciliation()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `complete_erp_pos_sale()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_customer_return()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_delivery()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_fund_transfer()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_goods_receipt()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_pos_return()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `confirm_erp_supplier_return()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `erp_purchase_order_lines_for_receiving()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `post_erp_journal_entry()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `receive_erp_stock_transfer()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `send_erp_stock_transfer()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `validate_erp_inventory()` | ZegERP | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `create_hotel_pos_sale()` | ZegHotel | DEFINER | ✅ | ✅ | has_module_permission('hotel_pos_interne','create') | 🟢 Protégée (contrôle interne) |
| `create_hotel_reservation()` | ZegHotel | INVOKER | ✅ | ⚠️ | RLS (hotel_reservations/hotel_reservation_rooms/hotel_folios TO authenticated) | 🟢 Protégée (contrôle interne) |
| `hotel_check_rate_restrictions()` | ZegHotel | INVOKER | ✅ | ✅ | RLS (lecture seule, TO authenticated) | 🟢 Protégée (contrôle interne) |
| `hotel_compute_room_rate()` | ZegHotel | INVOKER | ✅ | ✅ | RLS (lecture seule, TO authenticated) | 🟢 Protégée (contrôle interne) |
| `hotel_guest_contact()` | ZegHotel | DEFINER | ✅ | ✅ | has_any_role_in_organization(owner/manager/front_desk/accountant) | 🟢 Protégée (contrôle interne) |
| `hotel_guest_summary()` | ZegHotel | INVOKER | ✅ | ✅ | RLS (lecture seule, TO authenticated) | 🟢 Protégée (contrôle interne) |
| `post_hotel_pos_charge()` | ZegHotel | DEFINER | ✅ | ✅ | has_module_permission('hotel_pos_interne','create') | 🟢 Protégée (contrôle interne) |
| `add_resto_bill_payment()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `add_resto_order_item()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `apply_resto_bill_loyalty()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `create_resto_bill()` | ZegResto | INVOKER | ✅ | ✅ | RLS (resto_bills TO authenticated) | 🟢 Protégée (contrôle interne) |
| `mark_resto_order_item_statut()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `send_resto_course()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `set_resto_bill_split_items()` | ZegResto | DEFINER | ✅ | ✅ | has_module_permission | 🟢 Protégée (contrôle interne) |
| `resto_public_create_reservation()` | ZegResto | DEFINER | ✅ | ✅ | Volontairement public — scoping par slug + app_module + not suspended | ⚪ Intentionnellement publique |
| `resto_public_organization_info()` | ZegResto | DEFINER | ✅ | ✅ | Volontairement public — expose seulement id/name par slug | ⚪ Intentionnellement publique |
| `hotel_room_clean_on_task_done()` | ZegHotel | DEFINER (trigger) | — | ✅ | N/A | ✅ Déjà corrigée (migration 079) |
| `hotel_room_dirty_on_checkout()` | ZegHotel | DEFINER (trigger) | — | ✅ | N/A | ✅ Déjà corrigée (migration 079) |

## Détail des cas non triviaux

### 🔴 À risque réel — `find_user_id_by_email(_email text)`

```sql
select id from auth.users where lower(email) = lower(_email) limit 1;
```

Aucune vérification de rôle ou de session. Documentée dans `db/AUDIT-SECURITE.md` (section 7, migration 004) comme un compromis **déjà accepté à l'époque**, avec une limite explicitement voulue : *« exécution réservée aux rôles authentifiés (pas `anon`) pour limiter l'exposition »*. C'est précisément cette intention que le comportement par défaut de Supabase a silencieusement défaite : le grant `anon` n'a jamais été retiré explicitement (seul `revoke from public` a été fait), donc `anon` a toujours pu l'appeler depuis la migration 004, sans que personne ne le sache avant la connexion du Security Advisor.

**Impact réel** : énumération d'emails inscrits sur la plateforme (savoir si un email a un compte) + disclosure de l'UUID interne `auth.users.id` correspondant. Pas de fuite d'email en retour (l'appelant connaît déjà l'email qu'il teste), pas d'écriture, pas d'accès aux données métier (l'UUID seul ne débloque rien d'autre — toutes les tables métier restent protégées par leurs propres RLS). Usage prévu : `create-team-member` (Edge Function, invitation d'un membre d'équipe existant par email).

### 🟡 Fonctions trigger exposées en RPC (hygiène, non exploitables)

13 fonctions (dont 2 déjà corrigées en migration 079) lisent `NEW`/`OLD`/`TG_OP`, valides uniquement en contexte trigger — un appel direct via `/rest/v1/rpc/...` échoue avec une erreur Postgres (`record "new" is not assigned yet`). **Non exploitables**, mais restent inutilement exposées comme surface d'API. Recommandation (à valider avant application) : même traitement que la migration 079 — `revoke all on function ... from public, anon, authenticated;` sur chacune. `rls_auto_enable()` est un event trigger géré par la plateforme Supabase elle-même (pas du code de ce dépôt) — à laisser tel quel.

### 🟢 Le cœur du système : `has_module_permission()` vérifié null-safe

Fonction utilisée par la quasi-totalité des policies RLS du projet. Lue en entier :

```sql
select custom_role_id, role into v_custom_role_id, v_legacy_role
from public.organization_members
where organization_id = _org_id and user_id = auth.uid();

if v_legacy_role is null then
  return false; -- pas membre de cette organisation
end if;
```

Pour `anon`, `auth.uid()` retourne `NULL` → la comparaison `user_id = NULL` ne matche jamais aucune ligne → `v_legacy_role` reste `NULL` → la fonction retourne `false`. Comportement null-safe vérifié, pas supposé.

### ⚪ Fonctions intentionnellement publiques — vérifiées saines

`resto_public_create_reservation()` et `resto_public_organization_info()` alimentent le widget de réservation en ligne ZegResto (sans session). Code relu en entier : scoping strict par `slug` + `app_module = 'resto'` + `not suspended`, validations de base présentes (nom requis, date future, couverts > 0), aucune fuite de données au-delà de `id`/`name` de l'organisation. Aucune anomalie trouvée. Remarque hors périmètre sécurité : aucun rate-limiting applicatif sur l'insertion — pas un trou de permission, mais un vecteur de spam possible à surveiller si le formulaire devient une cible.

## Recommandations (non appliquées — en attente de validation)

Par ordre de priorité, aucune de ces actions n'a été effectuée dans cette mission :

1. **`find_user_id_by_email()`** — ajouter `revoke execute ... from anon;` (garde le comportement `authenticated`-only déjà documenté comme intention d'origine). Alternative plus robuste : ajouter un contrôle interne minimal (`if auth.uid() is null then raise exception`) en plus du revoke, en défense en profondeur.
2. **13 fonctions trigger** — même traitement que la migration 079 (`revoke ... from public, anon, authenticated`), par lot.
3. **3 fonctions `search_path` mutable** (`create_sale`, `add_sale_payment`, `create_hotel_reservation`) — ajouter `set search_path = public`, comme déjà fait pour `add_reservation_payment` (migration 079). Risque bas (`SECURITY INVOKER`) mais ce sont les 3 fonctions financières/réservation les plus utilisées de l'app — cohérence avec le reste du code justifie de les aligner.
4. **Root cause, projet entier** — envisager `alter default privileges in schema public revoke execute on functions from anon;` une fois, au niveau du projet, pour que toute future fonction soit `authenticated`-only par défaut sans dépendre de la discipline de chaque migration. Nécessite de vérifier qu'aucune future fonction n'a besoin d'un accès `anon` volontaire (comme les 2 fonctions publiques ZegResto) avant de l'appliquer globalement.
5. Point hors RPC mais remonté par le même audit : activer *Leaked Password Protection* dans Supabase Auth (réglage plateforme, hors SQL).

---

# Partie 2 — Tâche #67 : Isolation ZegCaisse/ZegHotel

## Contexte trouvé

**Aucune issue GitHub #67 n'existe** dans `novacaisse/nova-pos` — vérifié directement (`GET /repos/novacaisse/nova-pos/issues/67` → 404 ; `list_issues` sur le dépôt → 0 issue au total, ouvertes ou fermées). Ce dépôt ne fait pas de suivi via GitHub Issues. `#67` est un identifiant du gestionnaire de tâches interne utilisé au fil des sessions Claude Code sur ce projet, avec pour libellé : *« Partie A — Isolation totale ZegCaisse/ZegHotel (topbar, recherche, notifications, sélecteur) »*, marqué **en cours** depuis plusieurs chantiers sans avoir été explicitement repris ni clos.

Conséquence pratique : je ne peux pas « clôturer l'issue GitHub #67 » au sens littéral — il n'y a rien à fermer côté GitHub. Ce qui suit documente la vérification demandée ; la décision de marquer la tâche interne comme résolue est laissée à validation ci-dessous.

## Vérification 1 — isolation au niveau base de données

```sql
select count(*) from pg_tables where schemaname='public' and tablename like 'hotel_%';
-- 17

select count(*) from pg_tables where schemaname='public'
  and tablename in ('sales','sale_items','payments','products','categories','customers','quotes','quote_items');
-- 8

select table_name from information_schema.views where table_schema = 'public';
-- erp_v_stock_valuation, erp_v_purchase_orders_summary, erp_v_sales_summary, erp_v_cash_position
-- (4 vues, toutes internes à ZegERP — aucune ne croise hotel_* et les tables ZegCaisse)
```

- **17 tables `hotel_*`** distinctes, jamais partagées avec les tables ZegCaisse nues (`sales`, `payments`, `products`...) — confirmé par `db/CLAUDE.md` et vérifié en direct : aucune n'apparaît en dehors du préfixe `hotel_`.
- **Aucune vue** dans le schéma `public` ne croise les deux modules — les 4 vues existantes sont internes à ZegERP.
- **RLS** : chaque table `hotel_*` a ses propres policies scopées `organization_id` via `has_module_permission()`/`has_organization_access()` — le même mécanisme que ZegCaisse, jamais une policy commune aux deux. Un membre ZegCaisse n'a par construction aucune ligne dans `organization_members` pour une organisation `app_module = 'hotel'`, donc `has_module_permission()` retourne `false` pour lui sur toute table `hotel_*`, quelle que soit l'action.

**Verdict base de données : isolation effective, aucune fuite structurelle trouvée.**

## Vérification 2 — isolation au niveau applicatif (le sujet réel du libellé #67)

Le titre de la tâche (« topbar, recherche, notifications, sélecteur ») décrit un souci **UI**, pas une fuite RLS — vérifié dans le code actuel de `src/routes/app.tsx` :

```ts
// Dérivé de organizations.app_module (une organisation = une seule app,
// source de vérité unique), PAS du préfixe d'URL : ce dernier ne matchait
// que /app/hotel|resto/*, jamais les routes partagées (/app/profil,
// /app/notifications, /app/nova, /app/abonnement...) — bug corrigé ici,
// une organisation ZegHotel/ZegResto/ZegERP y voyait le header ZegCaisse
// (recherche produits/ventes, bouton "PDV").
const appModule = currentOrganization?.app_module;
const inHotelContext = appModule === "hotel";
const inRestoContext = appModule === "resto";
const inErpContext = appModule === "erp";
```

- **Recherche globale** (topbar) : branchée par `app_module` (`HotelGlobalSearch` / `RestoGlobalSearch` / masquée pour ZegERP / `GlobalSearch` ZegCaisse en dernier recours) — jamais la recherche ZegCaisse pour une organisation ZegHotel.
- **Sélecteur d'organisation** (`ShopSelector.tsx`) : filtre explicitement `s.app_module === appKey` — ne propose jamais de boutique ZegCaisse dans le sélecteur d'un compte ZegHotel.
- **Notifications** (`useAppNotifications`/`useNotifications`) : lisent la table `notifications`, scopée `organization_id` comme tout le reste — les triggers qui la peuplent (`notify_hotel_checkout`, `notify_big_sale`, etc.) écrivent chacun avec l'`organization_id` de la ligne déclenchante, jamais de fuite cross-app possible par construction.
- Le commentaire ci-dessus, et le commit correspondant (`ed0a266`, présent sur `main`), confirment que ce bug UI précis a été trouvé et corrigé dans le chantier ZegOS v2 (PR #22, item déjà documenté dans le bilan précédent sous « Bug — Header ZegCaisse affiché dans Profil des autres apps »।).

**Verdict applicatif : le sujet décrit par le libellé de la tâche #67 est traité et vérifié corrigé dans le code actuellement en production (`main`, commit `ec5f33a` et suivants).**

## Conclusion Partie 2

Isolation confirmée effective aux deux niveaux (base de données et interface). Aucune GitHub issue à clôturer (aucune n'existe). **Recommandation** : marquer la tâche interne #67 comme terminée, avec ce document comme preuve. Je n'ai pas modifié le tracker de tâches moi-même dans cette mission au-delà de ce qui est explicitement documenté ici — à confirmer avant que je le fasse, conformément à la contrainte « aucune modification » du brief.
