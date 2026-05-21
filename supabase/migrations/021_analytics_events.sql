-- analytics_events: lightweight behavioural event log for CampusOS beta.
-- Privacy-preserving: no chat content, no payment details, no PII beyond user_id.
-- user_id is NULL for anonymous events (landing page views, pre-auth funnel).

create table if not exists public.analytics_events (
  id          uuid        primary key default gen_random_uuid(),
  event       text        not null,
  user_id     uuid        references auth.users(id) on delete set null,
  session_id  text,
  properties  jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_event_idx      on public.analytics_events (event);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_user_id_idx    on public.analytics_events (user_id) where user_id is not null;

alter table public.analytics_events enable row level security;

-- Authenticated users may only insert their own events
create policy "analytics_insert_own" on public.analytics_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Anonymous users may insert events where user_id is null (pre-auth funnel)
create policy "analytics_insert_anon" on public.analytics_events
  for insert to anon
  with check (user_id is null);

-- Admin read — checked via JWT email claim
create policy "analytics_select_admin" on public.analytics_events
  for select to authenticated
  using (
    auth.jwt() ->> 'email' in (
      'anandmsundaram@gmail.com',
      'campusosapp@gmail.com',
      'valsgum@gmail.com'
    )
  );
