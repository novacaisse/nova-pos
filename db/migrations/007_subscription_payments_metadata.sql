-- =====================================================================
-- NovaCaisse — Migration 007 : metadata sur subscription_payments
-- À exécuter manuellement dans le SQL Editor de votre projet Supabase
-- externe, APRÈS relecture. Idempotent (safe à ré-exécuter).
--
-- Contexte : la documentation MoneyFusion fournie ne confirme pas que
-- personal_Info est bien renvoyé tel quel dans les événements webhook. Pour
-- ne pas dépendre de ce comportement non vérifié, l'Edge Function
-- create-subscription-payment stocke elle-même {plan_id, period} ici au
-- moment de la création du paiement ; le webhook les relit depuis notre
-- propre base plutôt que depuis le corps du webhook. Sert aussi à stocker
-- le détail de l'opérateur ("moyen" — Orange Money/MTN MoMo/...) renvoyé
-- par MoneyFusion, que l'enum payment_method ne capture pas finement.
-- =====================================================================

alter table public.subscription_payments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- =============== FIN ===============
