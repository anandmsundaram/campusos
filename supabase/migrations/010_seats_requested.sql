ALTER TABLE public.request_offers
  ADD COLUMN IF NOT EXISTS seats_requested integer NOT NULL DEFAULT 1 CHECK (seats_requested >= 1);
