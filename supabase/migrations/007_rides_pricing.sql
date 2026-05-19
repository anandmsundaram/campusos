-- Price type for rides
alter table public.requests
  add column if not exists price_type text
    check (price_type in ('fixed', 'split', 'free'));

-- Airport ride flag
alter table public.requests
  add column if not exists is_airport_ride boolean not null default false;

-- Back-fill existing ride rows to split
update public.requests
  set price_type = 'split'
  where category = 'rides' and price_type is null;
