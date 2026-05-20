-- Track per-passenger ride completion confirmation for metrics.
-- confirmed_completion = passenger explicitly clicked "Mark complete"
-- confirmed_at = when they did it (null = auto-completed or not yet confirmed)
ALTER TABLE public.request_offers
  ADD COLUMN confirmed_completion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN confirmed_at TIMESTAMPTZ;
