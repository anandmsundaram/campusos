-- Add counter-offer support to request_offers
-- Requester can counter once; helper then accepts or declines.

-- 1. Extend the offer_status enum with 'countered'
ALTER TYPE offer_status ADD VALUE IF NOT EXISTS 'countered';

-- 2. Add requester's counter-offer amount
ALTER TABLE public.request_offers
  ADD COLUMN IF NOT EXISTS requester_counter decimal(10, 2) CHECK (requester_counter >= 0);
