# Instructions pour Claude Code — ZegOS (nova-pos)

Voir **`ARCHITECTURE.md`** pour la documentation complète du socle ZegOS et des trois modules ZegCaisse, ZegHotel, ZegResto : tables, rôles, RLS, routes, décisions produit. **`ARCHITECTURE_ERP.md`** documente ZegERP séparément (module volumineux, 13 sous-modules) — même socle partagé, mêmes conventions. Ce fichier ne duplique aucun des deux — il capture les conventions de travail à suivre dans ce dépôt.

## Règles impératives

- **Aucune migration SQL n'est exécutée automatiquement.** Chaque fichier `db/migrations/0NN_*.sql` est présenté pour relecture (jamais lancé par CI, jamais appliqué par l'agent) — c'est Anselme qui l'exécute manuellement dans le SQL Editor Supabase.
- **RLS obligatoire et strict sur chaque nouvelle table.** C'est la priorité de sécurité #1 du projet. Toujours auditer explicitement une policy générée — dépendances circulaires, sous-selects coûteux, colonnes sensibles non masquables par RLS (voir le pattern `hotel_guest_contact()` : RLS ne masque jamais des colonnes, seulement des lignes — pour restreindre des colonnes, exposer une fonction `security definer` qui ne retourne que les champs sûrs). Le même principe s'applique en écriture : si un rôle ne doit pouvoir modifier que certaines colonnes d'une ligne (ex. `mark_resto_order_item_statut()` pour `cook` — jamais un accès UPDATE direct qui exposerait aussi `prix_unitaire`/`quantite`), passer par une RPC étroite plutôt qu'une policy UPDATE large. Pour une table où l'INSERT doit démarrer sur une valeur figée (ex. `resto_loyalty_accounts.points_balance = 0` à la création), le contraindre directement dans la clause `with check` de la policy insert, pas seulement côté frontend.
- **`db/schema.sql`** est la référence "fresh install" — toujours mis à jour dans le même commit qu'une migration, et reflète l'état **final** du schéma (pas l'historique) : quand une fonction est modifiée par une migration ultérieure (`create or replace function`, même signature), `schema.sql` montre directement sa version finale, avec un commentaire indiquant quelle migration l'a mise à jour.
- **Vérifier `npx tsc --noEmit`** avant chaque commit, diffé contre une baseline connue (erreurs pré-existantes liées à des packages absents dans ce sandbox) — zéro nouvelle erreur tolérée.
- **`src/routeTree.gen.ts`** se régénère via `@tanstack/router-generator` (voir l'historique de session pour le script exact) — jamais édité à la main.
- **Un commit par phase** sur les chantiers multi-phases, poussé au fur et à mesure — pas un unique commit géant en fin de chantier.

## Pièges Postgres récurrents

- `CREATE OR REPLACE FUNCTION` ne remplace en toute sécurité que si la signature (nom + types d'arguments) est identique. Un changement de signature crée un nouvel overload et laisse l'ancien orphelin — utiliser `DROP FUNCTION IF EXISTS <ancienne signature>` avant.
- `ALTER TYPE ... ADD VALUE` sur un enum doit s'exécuter **seule**, dans sa propre transaction, avant toute policy qui référence la nouvelle valeur (erreur "unsafe use of new value of enum type" sinon).
- `daterange(a, b)` est **vide** quand `a = b` — piège classique pour les contraintes anti-chevauchement (`EXCLUDE USING gist`) sur des réservations "même jour" (ex. ZegHotel horaire) : utiliser `greatest(b, a + 1)` pour les contraintes au jour près, une seconde contrainte séparée en `tstzrange` pour la granularité fine.

## Convention de nommage et d'isolation

- Chaque module a ses tables préfixées (`hotel_*`, `resto_*`) pour éviter toute collision avec le schéma ZegCaisse nu (`payments`, `orders`… existent déjà côté ZegCaisse sous d'autres noms).
- ZegCaisse/ZegHotel/ZegResto sont des applications **100% autonomes** dans la navigation — jamais d'écran commun avec des onglets pour plusieurs applications, seulement des composants réutilisés (`TeamPage`, `OrgIdentityTab`, `PeriodSelector`). Le contexte courant se déduit toujours de l'URL (`pathname.startsWith("/app/hotel")`, etc.), jamais d'un état global.
- Certains identifiants contiennent encore littéralement "shop" (`shops_select`, `idx_shop_members_user`…) — c'est **intentionnel**, hérité du renommage NovaCaisse → ZegCaisse par `ALTER ... RENAME` (voir ARCHITECTURE.md, section Historique).
