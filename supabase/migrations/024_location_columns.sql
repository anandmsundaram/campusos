-- Phase A: structured location resolution columns for rides
-- pickup_location and dropoff_location store ResolvedLocation JSON objects

alter table public.requests
  add column if not exists pickup_location  jsonb,
  add column if not exists dropoff_location jsonb;

create index if not exists requests_pickup_location_gin
  on public.requests using gin(pickup_location);

create index if not exists requests_dropoff_location_gin
  on public.requests using gin(dropoff_location);
