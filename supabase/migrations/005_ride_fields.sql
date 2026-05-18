alter table public.requests add column if not exists origin_city text;
alter table public.requests add column if not exists destination_city text;
alter table public.requests add column if not exists is_driver boolean;
alter table public.requests add column if not exists available_seats integer;
alter table public.requests add column if not exists is_round_trip boolean not null default false;
alter table public.requests add column if not exists return_date timestamptz;
alter table public.requests add column if not exists flexible_time boolean not null default false;
