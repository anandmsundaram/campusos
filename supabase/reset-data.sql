-- ─────────────────────────────────────────────────────────────────────────────
-- CampusOS · Reset to clean state
-- Deletes all transactional data; keeps auth.users and public.profiles intact.
-- Run in Supabase → SQL Editor whenever you need a fresh start.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.request_offers;
DELETE FROM public.ride_passengers;
DELETE FROM public.notifications;
DELETE FROM public.messages;
DELETE FROM public.requests;
DELETE FROM public.password_history;
