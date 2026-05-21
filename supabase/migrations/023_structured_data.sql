-- Category-specific structured field storage for non-ride request categories.
-- Moving: helpers_needed, access_type, has_heavy_items, etc.
-- Peer help: subject, is_virtual
-- Errands: errand_type, reimbursement_type
-- Borrow: item, borrow_duration
-- Rides: has_luggage
--
-- Using JSONB (not separate columns) keeps the schema stable as categories evolve.
-- The GIN index supports future @> / jsonb_path_exists filtering and matching queries.

alter table public.requests
  add column if not exists structured_data jsonb;

create index if not exists requests_structured_data_gin
  on public.requests using gin(structured_data);
