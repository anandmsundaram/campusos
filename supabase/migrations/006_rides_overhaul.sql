-- Add columns to requests
alter table public.requests
  add column if not exists auto_accept   boolean not null default true,
  add column if not exists seats_filled  integer not null default 0,
  add column if not exists ride_started  boolean not null default false;

-- ─── ride_passengers ────────────────────────────────────────────────────────

create table public.ride_passengers (
  id           uuid        primary key default gen_random_uuid(),
  request_id   uuid        not null references public.requests(id) on delete cascade,
  passenger_id uuid        not null references public.profiles(id) on delete cascade,
  status       text        not null default 'pending'
                           check (status in ('pending', 'confirmed', 'cancelled')),
  price_agreed decimal(10,2),
  created_at   timestamptz not null default now(),
  unique (request_id, passenger_id)
);

alter table public.ride_passengers enable row level security;

create policy "ride_passengers: passenger or driver can view"
  on public.ride_passengers for select to authenticated
  using (
    auth.uid() = passenger_id
    or auth.uid() = (select requester_id from public.requests where id = request_id)
  );

create policy "ride_passengers: passenger can insert"
  on public.ride_passengers for insert to authenticated
  with check (auth.uid() = passenger_id);

create policy "ride_passengers: passenger or driver can update"
  on public.ride_passengers for update to authenticated
  using (
    auth.uid() = passenger_id
    or auth.uid() = (select requester_id from public.requests where id = request_id)
  );

alter publication supabase_realtime add table public.ride_passengers;

-- ─── ride_messages ──────────────────────────────────────────────────────────

create table public.ride_messages (
  id         uuid        primary key default gen_random_uuid(),
  request_id uuid        not null references public.requests(id) on delete cascade,
  sender_id  uuid        not null references public.profiles(id) on delete cascade,
  content    text        not null,
  created_at timestamptz not null default now()
);

alter table public.ride_messages enable row level security;

create policy "ride_messages: driver or confirmed passenger can view"
  on public.ride_messages for select to authenticated
  using (
    auth.uid() = (select requester_id from public.requests where id = request_id)
    or auth.uid() in (
      select passenger_id from public.ride_passengers
      where request_id = ride_messages.request_id and status = 'confirmed'
    )
  );

create policy "ride_messages: driver or confirmed passenger can insert"
  on public.ride_messages for insert to authenticated
  with check (
    auth.uid() = (select requester_id from public.requests where id = request_id)
    or auth.uid() in (
      select passenger_id from public.ride_passengers
      where request_id = ride_messages.request_id and status = 'confirmed'
    )
  );

alter publication supabase_realtime add table public.ride_messages;
