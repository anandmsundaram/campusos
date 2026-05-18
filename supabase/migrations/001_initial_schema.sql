-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- ENUM TYPES
-- ============================================================

create type request_category    as enum ('rides', 'moving', 'peer_help', 'errands', 'borrow');
create type request_urgency     as enum ('low', 'medium', 'high');
create type request_status      as enum ('open', 'matched', 'completed', 'cancelled');
create type offer_status        as enum ('pending', 'accepted', 'rejected');
create type verification_status as enum ('pending', 'verified', 'rejected');


-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  name                text,
  university          text,
  major               text,
  year                text,
  rating              decimal(3, 2) not null default 5.0 check (rating >= 0 and rating <= 5),
  completed_tasks     int           not null default 0   check (completed_tasks >= 0),
  verification_status verification_status not null default 'pending',
  avatar_url          text,
  created_at          timestamptz   not null default now()
);

create table public.requests (
  id           uuid              primary key default gen_random_uuid(),
  requester_id uuid              not null references public.profiles(id) on delete cascade,
  category     request_category  not null,
  title        text              not null,
  description  text,
  location     text,
  budget       decimal(10, 2)    check (budget >= 0),
  urgency      request_urgency   not null default 'medium',
  status       request_status    not null default 'open',
  scheduled_time timestamptz,
  created_at   timestamptz       not null default now()
);

create table public.request_offers (
  id         uuid         primary key default gen_random_uuid(),
  request_id uuid         not null references public.requests(id) on delete cascade,
  helper_id  uuid         not null references public.profiles(id) on delete cascade,
  message    text,
  status     offer_status not null default 'pending',
  created_at timestamptz  not null default now(),
  -- one offer per helper per request
  unique (request_id, helper_id)
);

create table public.messages (
  id          uuid        primary key default gen_random_uuid(),
  sender_id   uuid        not null references public.profiles(id) on delete cascade,
  receiver_id uuid        not null references public.profiles(id) on delete cascade,
  request_id  uuid        references public.requests(id) on delete set null,
  content     text        not null,
  created_at  timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table public.reviews (
  id               uuid        primary key default gen_random_uuid(),
  reviewer_id      uuid        not null references public.profiles(id) on delete cascade,
  reviewed_user_id uuid        not null references public.profiles(id) on delete cascade,
  request_id       uuid        not null references public.requests(id) on delete cascade,
  rating           int         not null check (rating >= 1 and rating <= 5),
  review_text      text,
  created_at       timestamptz not null default now(),
  -- one review per reviewer per request
  unique (reviewer_id, request_id),
  check (reviewer_id <> reviewed_user_id)
);


-- ============================================================
-- INDEXES
-- ============================================================

create index requests_requester_id_idx   on public.requests(requester_id);
create index requests_status_idx         on public.requests(status);
create index requests_category_idx       on public.requests(category);
create index requests_created_at_idx     on public.requests(created_at desc);

create index offers_request_id_idx       on public.request_offers(request_id);
create index offers_helper_id_idx        on public.request_offers(helper_id);

create index messages_sender_id_idx      on public.messages(sender_id);
create index messages_receiver_id_idx    on public.messages(receiver_id);
create index messages_request_id_idx     on public.messages(request_id);
create index messages_created_at_idx     on public.messages(created_at desc);

create index reviews_reviewed_user_id_idx on public.reviews(reviewed_user_id);
create index reviews_reviewer_id_idx      on public.reviews(reviewer_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.requests       enable row level security;
alter table public.request_offers enable row level security;
alter table public.messages       enable row level security;
alter table public.reviews        enable row level security;

-- ----------------------------------------------------------
-- profiles
-- All authenticated users can read any profile (needed to
-- display helper info, ratings, etc.).  Only the owner can
-- write. INSERT is handled exclusively by the trigger below.
-- ----------------------------------------------------------

create policy "profiles: anyone authenticated can view"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: owner can update"
  on public.profiles for update
  to authenticated
  using      (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------------------------------
-- requests
-- All authenticated users can browse requests.
-- Only the requester can modify or delete their own request.
-- ----------------------------------------------------------

create policy "requests: anyone authenticated can view"
  on public.requests for select
  to authenticated
  using (true);

create policy "requests: requester can insert"
  on public.requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "requests: requester can update"
  on public.requests for update
  to authenticated
  using      (auth.uid() = requester_id)
  with check (auth.uid() = requester_id);

create policy "requests: requester can delete"
  on public.requests for delete
  to authenticated
  using (auth.uid() = requester_id);

-- ----------------------------------------------------------
-- request_offers
-- Visible only to the helper who made the offer, and to the
-- requester of the linked request.
-- Helpers can create offers (not on their own requests).
-- Either party can update (helper withdraws; requester accepts/rejects).
-- ----------------------------------------------------------

create policy "offers: helper and requester can view"
  on public.request_offers for select
  to authenticated
  using (
    auth.uid() = helper_id
    or auth.uid() = (
      select requester_id from public.requests where id = request_id
    )
  );

create policy "offers: helpers can create (not on own requests)"
  on public.request_offers for insert
  to authenticated
  with check (
    auth.uid() = helper_id
    and auth.uid() <> (
      select requester_id from public.requests where id = request_id
    )
  );

create policy "offers: helper or requester can update"
  on public.request_offers for update
  to authenticated
  using (
    auth.uid() = helper_id
    or auth.uid() = (
      select requester_id from public.requests where id = request_id
    )
  )
  with check (
    auth.uid() = helper_id
    or auth.uid() = (
      select requester_id from public.requests where id = request_id
    )
  );

-- ----------------------------------------------------------
-- messages
-- Only the sender and receiver can see a message.
-- Only the sender can write.
-- ----------------------------------------------------------

create policy "messages: sender and receiver can view"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "messages: sender can insert"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- ----------------------------------------------------------
-- reviews
-- All authenticated users can read reviews (public reputation).
-- Only the reviewer can create; no edits or deletes.
-- ----------------------------------------------------------

create policy "reviews: anyone authenticated can view"
  on public.reviews for select
  to authenticated
  using (true);

create policy "reviews: reviewer can insert"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = reviewer_id);


-- ============================================================
-- TRIGGER: auto-create profile on auth.users insert
-- ============================================================

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  -- pin search_path so the function can't be hijacked via a
  -- malicious schema placed earlier in the search path
  set search_path = ''
as $$
begin
  insert into public.profiles (id, name, university, major, year)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'major',
    new.raw_user_meta_data ->> 'year'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
