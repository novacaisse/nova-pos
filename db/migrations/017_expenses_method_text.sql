-- Bloc 16 (bug #3) : expenses.method était typé sur l'enum public.payment_method
-- ('cash'/'mobile_money'/'card'/'credit'/'mixed'), pensé pour les ventes —
-- mais le formulaire Dépenses envoie des libellés français en clair
-- ("Espèces", "Mobile Money", "Carte", "Virement", "Chèque"), dont deux
-- n'existent même pas dans l'enum. Résultat : tout enregistrement échouait
-- avec "invalid input value for enum payment_method". Les dépenses n'ont
-- pas à partager cet enum avec les ventes (des moyens de paiement
-- différents, un domaine différent) — converti en texte libre.
alter table public.expenses alter column method type text using method::text;
