alter table public.request_offers
  add column if not exists counter_budget decimal(10, 2) check (counter_budget >= 0);
