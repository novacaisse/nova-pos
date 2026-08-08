# Cartographie ZegHotel vs référentiel PMS professionnel — Août 2026

Rapport d'exploration seul — **aucune modification de code, de schéma ou de configuration**. Toutes les affirmations ci-dessous sont vérifiées directement dans le code réel (`src/`, `db/migrations/`, `db/schema.sql`, `supabase/functions/`) de ce dépôt, à l'état actuel de la branche `main` (après PR #32). Aucune estimation à l'œil : chaque ligne "Preuve" cite un fichier, une table, une fonction ou une route réels.

**Limite méthodologique à signaler honnêtement** : Supabase MCP était déconnecté au moment de la rédaction et n'a pas pu être reconnecté dans le temps imparti à cette mission. Je n'ai donc **pas pu confirmer par une requête live** que toutes les migrations listées ci-dessous ont effectivement été exécutées en base de production (rappel CLAUDE.md : aucune migration n'est appliquée automatiquement, c'est Anselme qui les exécute manuellement dans le SQL Editor Supabase). Le code et le schéma déclarés dans le dépôt sont donc la source de vérité de ce rapport — pas un état de production confirmé en direct. Deux missions précédentes dans cette même série (Partie 4 permissions, correctifs PR #31/#32) ont déjà vérifié en base réelle une partie significative du socle (matrice de permissions, `hotel_onboarding_completed`, `payment_requests`), ce qui donne une confiance raisonnable que l'essentiel tourne réellement — mais ce n'est pas une garantie module par module. **Recommandation : si une décision d'investissement s'appuie sur ce rapport, faire confirmer en direct (SQL Editor) l'état des tables les plus critiques avant d'arbitrer.**

---

## Doute prioritaire tranché : POS interne lié au folio

**Verdict : construit et fonctionnel, contrairement à l'hypothèse du référentiel de départ.**

Deux mécanismes distincts, tous les deux réels et câblés de bout en bout (route → hook → RPC `security definer` → tables) :

| Mécanisme | Fonction | Table écrite | Frontend |
|---|---|---|---|
| Charge sur note ouverte (client en séjour) | `post_hotel_pos_charge()` (migration 033) | `hotel_folio_charges` + `stock_movements` | `app.hotel.pos-interne.tsx` → `usePostHotelPosCharge()` |
| Vente immédiate payée sur-le-champ (passant) | `create_hotel_pos_sale()` (migration 077) | `hotel_pos_sales` (nouvelle table dédiée, RLS active, 2 policies) + `stock_movements` | même route → `useCreateHotelPosSale()` |

Les deux réutilisent le catalogue `products`/`stock_levels` de ZegCaisse (déjà scopé par organisation) et le garde-fou anti-survente `apply_stock_movement()` (migration 026) — aucune écriture ne contourne le contrôle de stock. Autorisation : `owner/manager/front_desk` uniquement, via `has_module_permission(..., 'hotel_pos_interne', ...)`, pas un accès élargi à `stock_movements` en général.

---

## Module par module

### 1. Tableau de bord
**Statut : construit.**
**Preuve** : `src/routes/app.hotel.index.tsx` (142 lignes) + `useHotelDashboardStats()` (`hotelHooks.ts:1268`). KPIs réels : taux d'occupation, arrivées/départs du jour (liste nominative), nombre de chambres, revenu hébergement/nuits vendues/occupation sur période sélectionnable (`PeriodSelector`, même composant que ZegCaisse). Raccourcis vers Réservations/Chambres/Housekeeping. Écran de blocage propre si aucune chambre configurée (renvoie vers l'onboarding).
**Pertinence UEMOA** : nécessaire — c'est l'écran d'accueil quotidien de la réception.

### 2. Réservations
**Statut : construit, riche.**
**Preuve** : `src/routes/app.hotel.reservations.tsx` (825 lignes) — `RoomRow`/`days`/`bookings` : grille visuelle chambre × jour (timeline), pas une simple liste. `useCreateHotelReservation()`/`useUpdateHotelReservation()`/`useCancelReservation()` (`hotelHooks.ts`). Tarification calculée automatiquement à la création (`hotel_compute_room_rate()`, migration 027 : tarif saisonnier > formule tarifaire en %, override manuel toujours prioritaire) avec garde-fous bloquants (`hotel_check_rate_restrictions()` : séjour minimum, stop-vente, fermé aux arrivées — migration 027). Facturation nuitée **et** horaire (migration 028, double contrainte d'exclusion en base pour empêcher tout chevauchement, voir CLAUDE.md "pièges Postgres"). Acompte + remboursement manuel (Partie 3, `kind: "refund"`).
**Gap identifié** : aucun document de confirmation de réservation (voucher/bon de séjour) généré ou envoyé à la création — seule la facture SYSCOHADA existe, au check-out.
**Pertinence UEMOA** : nécessaire — cœur du produit.

### 3. Chambres
**Statut : construit.**
**Preuve** : `src/routes/app.hotel.rooms.tsx`, tables `hotel_room_types`/`hotel_rooms` (schema.sql). CRUD types de chambres (nom, capacité, prix de base, équipements en texte libre) et chambres individuelles (numéro, étage, type, statut). `useSetRoomHousekeepingStatus()` — statut ménage distinct du statut occupation. Statut chambre automatique (task #171, migration 078 `hotel_room_status_automation.sql`).
**Pertinence UEMOA** : nécessaire.

### 4. Check-in / Check-out
**Statut : partiel — cœur fonctionnel solide, sous-fonctionnalités avancées absentes.**
**Preuve construit** : `useCheckInReservation()`/`useCheckOutReservation()` (`hotelHooks.ts:671-807`). Check-in : bascule statut, pose automatiquement la charge chambre + taxe de séjour (si activée, `hotel_settings.city_tax_enabled`) sur le folio, gère nuitée et horaire (calcul à la durée réelle écoulée pour l'horaire, arrondi à l'heure supérieure). Check-out : bascule statut, marque les chambres "sale" pour le ménage. Capture d'identité manuelle complète en base : `hotel_guests.id_document_type/id_document_number/nationality/date_of_birth/address` (migration 028), avec masquage RLS des colonnes sensibles pour les rôles non autorisés via `hotel_guest_contact()` (accountant voit le nom, jamais le passeport).
**Absent** :
- Scan CNI/passeport par caméra/OCR — capture manuelle uniquement (champs texte).
- Signature électronique — aucune trace dans le code (pas de lib de signature, pas de champ `signature_url`).
- Dépôt de garantie / pré-autorisation carte distincte de l'acompte — seul `depositAmount` existe (un acompte classique appliqué au folio, remboursable manuellement), pas un mécanisme de caution séparée libérée sans facture au départ.
**Pertinence UEMOA** : scan CNI = nécessite un SDK/hardware spécifique et une conformité RGPD/biométrie non triviale — **utile mais différable**. Signature électronique — **utile mais différable** (usage encore faible dans l'hôtellerie indépendante UEMOA). Dépôt de garantie — **utile**, casse fréquente/consommation minibar est un vrai point de friction en gestion indépendante.

### 5. CRM client
**Statut : partiel — fiche et historique construits, fidélité absente.**
**Preuve construit** : `src/routes/app.hotel.clients.tsx` (266 lignes), table `hotel_guests`, `useHotelGuestSummaries()`/`useHotelGuestStays()` (historique de séjours réel, task #174), création rapide de client depuis une réservation (task #170).
**Absent** : aucun programme de fidélité/points pour ZegHotel — recherché explicitement (`hotel.*loyalt`, `hotel.*fidelit`), aucune table ni composant, contrairement à ZegResto qui a `resto_loyalty_accounts` (migration 045). Aucune segmentation clients (VIP, black-list) au-delà du champ libre `notes`.
**Pertinence UEMOA** : historique de séjour = nécessaire. Fidélité formelle (points, paliers) = **utile mais différable** — la clientèle affaires/habituée d'un hôtel indépendant UEMOA se fidélise surtout par la relation directe et les comptes entreprise (déjà couverts, voir module 10), pas par un programme de points formel.

### 6. Housekeeping
**Statut : construit, avec une lacune ciblée.**
**Preuve** : `src/routes/app.hotel.housekeeping.tsx` (90 lignes), `hotel_housekeeping_tasks` (schema.sql). Génération automatique des tâches du jour (`useGenerateHousekeepingTasks`, bouton "filet de sécurité" pour régénérer), 3 types (nettoyage/recouche/inspection), 3 statuts (à faire/en cours/terminé), rafraîchissement auto 1 min + son à l'arrivée d'une nouvelle tâche (task #172).
**Gap identifié** : la colonne `assigned_to` existe dans `hotel_housekeeping_tasks` (référence `auth.users`) mais **n'est jamais lue ni écrite côté frontend** — impossible d'assigner une tâche à une femme de chambre nommément ; toute l'équipe voit et peut prendre toutes les tâches du jour. Colonne DB présente, fonctionnalité UI absente — à ne pas compter comme "fait".
**Pertinence UEMOA** : nécessaire (le module de base) ; l'assignation nominative est **utile mais différable** pour un petit établissement (souvent 1-3 personnes de ménage).

### 7. Maintenance
**Statut : construit.**
**Preuve** : `src/routes/app.hotel.maintenance.tsx` (161 lignes), table `hotel_maintenance_tickets` (migration 030), `useCreateMaintenanceTicket()`/`useUpdateMaintenanceTicket()`. Module détaché de housekeeping (task #83), accessible à tout le personnel pour signaler un incident (pas juste owner/manager).
**Pertinence UEMOA** : nécessaire.

### 8. Facturation
**Statut : construit.**
**Preuve** : `hotel_folios`/`hotel_folio_charges`/`hotel_payments` (schema.sql), `useHotelFolio()`/`useAddFolioCharge()`/`useAddFolioPayment()`/`useCloseFolio()`. Facture PDF réelle au format SYSCOHADA/OHADA (`printHotelInvoice()`, `app.hotel.reservations.tsx:527`, task #53). `useCloseFolio()` recalcule le solde depuis la base et **refuse** de clôturer une note à solde non nul (garde-fou réel, pas juste visuel). Remboursement manuel d'acompte (Partie 3) avec ledger réel (`kind: "refund"`).
**Pertinence UEMOA** : nécessaire.

### 9. Comptabilité (caisse, comptes, rapports)
**Statut : partiel — pas de "caisse" ni de clôture de journée financière au sens PMS classique ; couvert autrement.**
**Preuve** : pas de concept de session de caisse pour ZegHotel (contrairement à ZegCaisse) — les paiements sont enregistrés directement sur `hotel_payments`, réconciliables via `useHotelPaymentsInRange()`/`useHotelFolioExtrasInRange()` (rapports). "Audit de nuit" (`useRunNightAudit()`, `hotelHooks.ts:1321`) — **attention, plus étroit que son nom ne l'indique** : il ne fait qu'une chose, basculer en `no_show` les réservations du jour non arrivées ; ce n'est **pas** une clôture financière quotidienne (pas de snapshot de caisse, pas de rapprochement bancaire). Comptes entreprise avec facturation différée et relevé mensuel (`useHotelCorporateInvoices()`/`useMarkCorporateInvoicePaid()`, `app.hotel.corporate.tsx`, 252 lignes).
**Pertinence UEMOA** : le modèle "sans caisse dédiée, paiements directs au folio" est en réalité **adapté** à un petit hôtel indépendant (pas de shift de caissier à gérer côté hôtel) — construire une vraie clôture de journée financière serait **utile mais différable**, seulement si l'établissement grandit et a besoin d'un contrôle comptable plus formel.

### 10. Tarification avancée
**Statut : construit, très complet.**
**Preuve** : `src/components/app/HotelTarificationTab.tsx` (259 lignes), tables `hotel_rate_plans`/`hotel_seasonal_rates`/`hotel_rate_restrictions`/`hotel_corporate_accounts` (migration 027, 031). Prix de base par type de chambre, grilles saisonnières (dates), plans tarifaires en % (peuvent servir de "promotion" ad hoc — PDJ inclus, non remboursable -10%, etc.), formule horaire dédiée, taxe de séjour + devise secondaire sur facture, comptes entreprise/groupe avec facturation différée, restrictions de vente (stop-vente, séjour minimum, fermé aux arrivées) réellement bloquantes côté serveur (`hotel_check_rate_restrictions()`).
**Nuance** : pas de règle "weekend" au sens jour-de-semaine automatique (à faire à la main via une grille saisonnière à dates précises) ; pas de code promo/coupon saisi par le client — l'ajustement % est un réglage établissement, pas une offre limitée dans le temps avec code.
**Pertinence UEMOA** : nécessaire, déjà un point fort réel du produit.

### 11. Channel Manager (Booking/Expedia/Airbnb/Agoda/Google Hotels)
**Statut : absent — confirmé, pas d'analyse plus poussée (décision déjà prise).**
**Preuve** : `hotel_channels` (créée migration 020g comme "structure seule, hors scope V1", 2 colonnes ajoutées en migration 034 — `notes`/`manual_rate`, saisie manuelle uniquement, aucune synchronisation). La page frontend (`app.hotel.canaux.tsx`) a été supprimée (task #175) — recherche exhaustive `canaux|hotel_channels|Canaux` dans `src/` : **0 résultat**. Table 100% orpheline en base, aucune intégration API n'a jamais existé, même à son maximum.

### 12. Booking Engine (réservation publique en ligne)
**Statut : absent.**
**Preuve** : recherche `hotel_public|public_hotel` dans tout le dépôt : **0 résultat**. Pour comparaison, ZegResto a un équivalent réel (`resto_public_create_reservation()`/`resto_public_organization_info()`, migration 039) — rien de semblable n'a jamais été construit côté ZegHotel.
**Pertinence UEMOA** : nécessaire à terme pour la distribution directe (économiser les commissions OTA), mais un chantier complet en soi (page publique, disponibilité temps réel exposée sans authentification, paiement d'acompte anonyme) — **utile mais différable**, à ne pas sous-estimer en effort.

### 13. Restaurant/POS interne
**Statut : construit — voir "Doute prioritaire tranché" ci-dessus.**
**Pertinence UEMOA** : nécessaire — piscine/bar/restaurant intégré est très courant dans l'hôtellerie UEMOA de milieu de gamme.

### 14. Gestion des stocks
**Statut : partiel — hérité de ZegCaisse, lecture seule côté hôtel.**
**Preuve** : `app.hotel.produits.index.tsx` réutilise `products`/`stock_levels`/`stock_movements` (partagés ZegCaisse). Historique des mouvements affiché par produit (`useProductStockMovements`). Décrémenté automatiquement par les ventes POS interne (module 13).
**Gap identifié** : aucun formulaire de création manuelle de mouvement de stock (entrée/ajustement) côté ZegHotel — recherché `useCreateStockMovement|useAddStockMovement|CreateMovement` dans `app.hotel.produits.index.tsx` : **0 résultat**. ZegCaisse a une page "Stock" dédiée avec ce formulaire (task #143) ; ZegHotel ne l'a pas repris.
**Pertinence UEMOA** : nécessaire dès qu'un hôtel a un minibar/bar/restaurant avec approvisionnement régulier — la lacune (pas d'entrée manuelle de stock) est réelle et gênante en usage quotidien.

### 15. Employés/RH
**Statut : partiel — comptes et rôles réels, planning/présence/sécurité absents.**
**Preuve construit** : `TeamPage.tsx` partagé (Équipe ZegHotel), rôles dédiés `front_desk`/`housekeeping` (`src/lib/roles.ts`, migration 020f), matrice de permissions CRUD par membre (Partie 4, migration 084, vérifiée en base réelle sur cette même app dans PR #31/#32).
**Absent** : aucun planning/shift, aucun pointage de présence (recherché `hotel.*(planning|shift|presence|pointage|schedule)` : 0 résultat), aucune 2FA (le seul composant `InputOTP` du dépôt est un composant UI shadcn générique jamais importé nulle part ailleurs — pas une fonctionnalité 2FA réelle).
**Pertinence UEMOA** : comptes/rôles = nécessaire (fait). Planning/présence = **utile mais différable** pour un petit établissement à effectif réduit et stable. 2FA = **utile mais différable** — un vrai plus sécurité mais pas un frein à l'usage quotidien pour la cible visée.

### 16. Rapports
**Statut : construit, complet.**
**Preuve** : `src/routes/app.hotel.rapports.tsx` (366 lignes). ADR, RevPAR, revenu extras hors chambre, annulations, no-show, pickup à 7/30 jours (réservations déjà au calendrier — **pas** une prévision IA, voir module "Premium" ci-dessous), export PDF (`exportPdf()`, ligne 161), sélecteur de période universel partagé avec le dashboard.
**Pertinence UEMOA** : nécessaire.

### 17. Notifications
**Statut : partiel — rappels internes au personnel uniquement, aucun envoi réel au client.**
**Preuve** : migration 032, table `notifications` (socle partagé) — le fichier lui-même documente explicitement la limite : *"ce qui est livré ici, ce sont des RAPPELS pour le personnel (...), pas un envoi réel de SMS/email au client — une vraie intégration de messagerie sortante (Twilio, SendGrid...) est hors périmètre."* Deux événements par trigger (nouvelle réservation, check-out) + un rappel J-1 calculé côté client. Canal unique : cloche in-app.
**Pertinence UEMOA** : les rappels internes = nécessaires et déjà là. Email/SMS/WhatsApp réel au client = **utile mais différable** (coût récurrent d'un fournisseur SMS/WhatsApp Business en zone UEMOA, ROI à valider avant d'investir) — mais probablement le gap le plus visible pour un hôtelier qui compare à un PMS pro.

### 18. Multi-établissements
**Statut : construit.**
**Preuve** : socle `accounts`/`account_subscriptions` (Phases 1-4, migrations 021-022), `hotelOrgs` filtré par `app_module === "hotel"` dans `app.hotel.parametres.tsx`, liste + ajout d'établissement dans l'onglet "Établissement". Isolation stricte déjà auditée (Partie A de ce même chantier, sélecteur/recherche/notifications adaptés au contexte hôtel).
**Pertinence UEMOA** : nécessaire pour tout groupe de 2+ établissements.

### 19. Paramètres (général, utilisateurs, 2FA, sauvegarde)
**Statut : partiel.**
**Preuve construit** : `app.hotel.parametres.tsx` (132 lignes) — identité établissement (`OrgIdentityTab` partagé), multi-établissements, tarification (renvoi vers module 10), devise principale. Gestion utilisateurs = page Équipe séparée (fait, voir module 15).
**Absent** : 2FA (voir module 15), aucune fonctionnalité de sauvegarde/export de données (`sauvegarde|backup|export.*complet` : 0 résultat dans ce fichier).
**Pertinence UEMOA** : sauvegarde/export — **utile mais différable** pour l'utilisateur final (Supabase gère déjà les sauvegardes infrastructure côté plateforme ; un export self-service est un vrai plus mais pas un manque bloquant).

### 20. API & Intégrations
**Statut : construit pour le paiement, avec un vrai risque de traçabilité à signaler ; absent pour le reste.**
**Preuve construit** : MoneyFusion réel câblé sur ZegHotel — `MoneyFusionPayButton.tsx` dans `app.hotel.reservations.tsx` (solde folio au check-out + acompte réservation), `useCreateModulePayment()` (`src/lib/data/paymentHooks.ts`) invoque l'edge function `create-module-payment`, réconciliation webhook (`moneyfusion-webhook`), table `payment_requests` (migration 083, réf. unique organisation/module/enregistrement, écriture réservée `service_role`, montant toujours recalculé serveur — jamais celui envoyé par le client côté ZegHotel sauf l'acompte, plafonné serveur).
**⚠️ Signalé comme construit mais fragile** : l'edge function `supabase/functions/create-module-payment/` **n'existe nulle part dans ce dépôt git** — vérifié par `git show --name-status` sur le commit de merge de la PR #28 qui l'a introduite : le diff ne contient **aucun fichier** sous `supabase/functions/create-module-payment/`, seulement la migration, `MoneyFusionPayButton.tsx`, `paymentHooks.ts` et les 4 routes clientes. La fonction a donc été déployée directement dans Supabase (via l'outil MCP de déploiement) **sans jamais être committée** — son code source n'est récupérable nulle part dans l'historique git. Elle fonctionne probablement toujours en production (le webhook et les 4 boutons clients qui l'appellent, eux, sont bien dans le dépôt), mais c'est un vrai risque : si le projet Supabase est un jour recréé, ou si quelqu'un veut relire/modifier cette fonction précise, son code est perdu — à récupérer en direct depuis le dashboard Supabase et à committer dans une passe de rattrapage, indépendamment de cette mission.
**Absent** : aucun webhook sortant, aucun connecteur tiers (comptabilité, CRM externe), aucune API publique documentée pour ZegHotel au-delà de MoneyFusion.
**Pertinence UEMOA** : MoneyFusion = nécessaire, déjà fait (avec la réserve ci-dessus). Le reste = non pertinent pour ce marché à ce stade (pas d'écosystème de connecteurs tiers attendu par la cible).

---

## Modules "Premium" — confirmation d'absence uniquement (hors scope, décision déjà prise)

- **Serrures connectées** : recherche `serrure|smart.?lock` dans `src/` — 0 résultat. Absent.
- **Self check-in QR** : recherche `self.?check.?in|qr.*checkin` — 0 résultat. Absent.
- **Application mobile client** : aucune app native/PWA dédiée client trouvée (l'app existante est 100% back-office staff, PWA installable mais pas un portail client). Absent.
- **IA prévision de demande** : recherche `forecast|prediction` — un seul résultat, dans `app.hotel.rapports.tsx`, qui est un **rapport de pickup** (réservations déjà enregistrées sur 7/30 jours), pas un modèle prédictif. Aucune IA de prévision de demande n'existe. Absent, confirmé sans ambiguïté.

---

## Liste priorisée — ce qui manque et serait le plus impactant à construire en premier

Classée par impact perçu pour un hôtelier UEMOA indépendant/petite chaîne, avec un effort estimé (S/M/L). Décision laissée à Anselme — ceci éclaire le choix, ne le remplace pas.

| # | Manque | Effort | Pourquoi ça compte en premier |
|---|---|---|---|
| 1 | **Entrée manuelle de mouvement de stock côté ZegHotel** (module 14) | **S** | Lacune ciblée et peu coûteuse à combler (le modèle de données et le composant existent déjà côté ZegCaisse, il s'agit de le reprendre) — bloque l'usage réel dès qu'un hôtel gère un minibar/bar avec réappro. |
| 2 | **Committer le code de `create-module-payment`** (module 20) | **S** | Pas une nouvelle fonctionnalité — un risque de perte pure et simple d'un code qui tourne déjà en production. Récupération + commit, pas de nouveau développement métier. |
| 3 | **Assignation nominative des tâches de ménage** (`assigned_to`, module 6) | **S** | La colonne existe déjà en base — pur travail frontend (sélecteur + filtre "mes tâches"). Gain de clarté immédiat pour une équipe de 2-3 personnes. |
| 4 | **Document de confirmation de réservation** (voucher/bon de séjour imprimable, module 2/8) | **S/M** | Le moteur de facture PDF SYSCOHADA existe déjà — réutiliser le même pattern pour un document plus simple à la réservation, pas à l'arrivée. Utile pour rassurer le client et pour les dossiers comptes entreprise. |
| 5 | **Dépôt de garantie distinct de l'acompte** (module 4) | **M** | Un vrai point de friction opérationnel courant (casse/consommation minibar) dans l'hôtellerie indépendante — nécessite un nouveau statut de charge folio ("caution retenue/libérée") mais reste dans le modèle de données existant, pas une nouvelle intégration externe. |
| 6 | **Notification client réelle (au minimum WhatsApp)** (module 17) | **M** | C'est le gap le plus visible dans une démo comparative face à un PMS pro, et WhatsApp Business a une forte pénétration en zone UEMOA (plus pertinent qu'email/SMS classique dans ce marché) — mais implique un coût récurrent de fournisseur à valider avant d'investir. |
| 7 | **Booking Engine minimal** (réservation publique + acompte, module 12) | **L** | Fort potentiel de revenu direct (évite les commissions OTA), mais chantier complet : page publique, disponibilité exposée sans authentification, paiement anonyme — comparable en ampleur à ce qui a déjà été fait pour ZegResto (`resto_public_create_reservation`), donc un référentiel de complexité existe déjà en interne pour cadrer l'effort. |
| 8 | **Programme de fidélité simple** (module 5) | **M** | Moins prioritaire que les comptes entreprise (déjà couverts) pour la clientèle UEMOA typique — à réévaluer seulement si la demande client est confirmée. |
| 9 | **Planning/présence du personnel** (module 15) | **M/L** | Utile pour grandir au-delà d'un petit établissement, mais différable tant que l'effectif reste réduit et stable. |

**Volontairement exclu de cette liste** (déjà tranché hors scope par la mission) : Channel Manager, serrures connectées, self check-in, app mobile client, IA de prévision.
