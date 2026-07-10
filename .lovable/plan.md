
Vu l'ampleur (12 chantiers, ~25 fichiers touchés/créés), je propose de découper en **4 sous-blocs** livrés successivement pour que tu puisses valider au fur et à mesure, comme sur les blocs précédents. Sinon je fais tout d'un coup mais un ajustement coûtera cher.

## Sous-bloc A — Layout & navigation (fondations)
Impacte tout le reste, donc à faire en premier.
- **Header `app.tsx`** : retirer entrées Profil/Abonnement/Notifications de la sidebar. Menu utilisateur déroulant en haut à droite (Modifier profil, Mot de passe, Gérer abonnement, Déconnexion). Icône cloche à gauche avec badge non-lues + panneau notifications Digitorizon (nouveau mock `lib/mock/notifications.ts` séparé des alertes stock).
- **AppSidebar** : "Tableau de bord" en premier, retrait Profil/Abonnement/Notifications, fermeture auto au clic (mobile), bouton close mobile.
- **Bottom nav mobile** : nouveau `BottomNav.tsx` (5 items : Tableau de bord, Caisse, Produits, Ventes, Plus) affiché < md, sidebar cachée sur mobile.
- **Bannière PWA** : composant `PwaInstallBanner.tsx` affiché après inscription (flag localStorage), pas de vrai service worker (manifest-only).

## Sous-bloc B — Module Caisse enrichi
- Bouton **Plein écran** (masque sidebar + header via state layout partagé, ou route dédiée `/app/caisse` en mode fullscreen togglable).
- **Tickets en attente** : liste + reprise, state local + panneau latéral.
- **Ajouter client** fonctionnel : dialog recherche + création rapide (nom + téléphone).
- **Remises** : par ligne dans le panier + remise globale (déjà présente).
- **Paiement** : radio Total / Avance / Acompte (montant partiel → solde dû), écran reçu imprimable (dialog `print()`), reste 3 modes existants.

## Sous-bloc C — Modules métier
- **Ventes** : actions Modifier / Supprimer / Ajuster produits (dialogs).
- **Produits** : dialogs Ajouter/Modifier/Supprimer complets, gestion catégories personnalisées CRUD.
- **Stock** : ajustements manuels, seuils par produit éditables, historique détaillé enrichi.
- **Rapports** : périodes Aujourd'hui/Hier/Mois dernier/Année dernière + 5 types (ventes, produits, fournisseurs, meilleurs clients, meilleurs produits), boutons Export PDF/Excel (mock téléchargement d'un fichier généré côté client).
- **Dépenses** : catégories prédéfinies + CRUD custom.
- **Équipe** : matrice de permissions détaillée (module × actions voir/modifier/supprimer).
- **Paramètres** : upload logo (base64 → localStorage), champs boutique enrichis (adresse, RCCM, réseaux sociaux), éditeur ticket (toggles logo/adresse/message/etc + preview live).
- **Nouveau module Devis** : `/app/devis` + `lib/mock/quotes.ts`, création (comme vente), conversion → facture 1 clic.

## Sous-bloc D — Inscription & essai gratuit
- **Inscription** : 1 seul formulaire (logo, boutique, tél, adresse, gérant) → redirection `/app` (pas de paiement).
- **Essai 3 jours** : flag `trial_started_at` en localStorage, garde de route dans `app.tsx` qui redirige vers `/souscription` si expiré + bandeau "Essai : X jours restants".
- **Bannière PWA** après inscription (déclenchée ici).

## Détails techniques

**Nouveaux fichiers** :
- `src/lib/mock/notifications.ts`, `src/lib/mock/quotes.ts`, `src/lib/mock/expenses.ts` (si absent), `src/lib/mock/permissions.ts`
- `src/components/app/UserMenu.tsx`, `src/components/app/NotificationsBell.tsx`, `src/components/app/BottomNav.tsx`, `src/components/app/PwaInstallBanner.tsx`, `src/components/app/TrialBanner.tsx`
- `src/components/pos/HoldTicketsPanel.tsx`, `src/components/pos/CustomerPickerDialog.tsx`, `src/components/pos/ReceiptDialog.tsx`
- `src/routes/app.devis.tsx`
- `public/manifest.webmanifest`

**Modifiés** :
- `src/routes/app.tsx`, `src/components/app/AppSidebar.tsx`, `src/routes/app.caisse.tsx`, `src/routes/app.ventes.tsx`, `src/routes/app.produits.tsx`, `src/routes/app.stock.tsx`, `src/routes/app.rapports.tsx`, `src/routes/app.depenses.tsx`, `src/routes/app.equipe.tsx`, `src/routes/app.parametres.tsx`, `src/routes/inscription.tsx`, `src/routes/__root.tsx` (link manifest)

**Contraintes respectées** : mocks Supabase-ready, tokens de couleur existants, shadcn + Framer Motion, aucun backend touché.

Confirme-moi si je pars sur ce découpage (A → B → C → D avec pause validation entre chaque) ou si tu préfères tout d'un coup.
