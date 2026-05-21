-- User-submitted reports for trust/safety moderation.
-- Admins review via the admin dashboard; no automated action.

create table if not exists public.reports (
  id           uuid        primary key default gen_random_uuid(),
  reporter_id  uuid        references auth.users(id) on delete set null,
  target_type  text        not null check (target_type in ('request', 'offer', 'user', 'message_thread')),
  target_id    text        not null,
  reason       text        not null check (reason in (
                 'inappropriate_content', 'harassment', 'scam_fraud',
                 'safety_concern', 'spam', 'other'
               )),
  details      text,
  status       text        not null default 'pending'
                 check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at   timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_status_idx     on public.reports (status) where status = 'pending';

alter table public.reports enable row level security;

-- Authenticated users can file reports
create policy "reports_insert_authenticated" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- Admins can read all reports
create policy "reports_select_admin" on public.reports
  for select to authenticated
  using (
    auth.jwt() ->> 'email' in (
      'anandmsundaram@gmail.com',
      'campusosapp@gmail.com',
      'valsgum@gmail.com'
    )
  );

-- Admins can update report status
create policy "reports_update_admin" on public.reports
  for update to authenticated
  using (
    auth.jwt() ->> 'email' in (
      'anandmsundaram@gmail.com',
      'campusosapp@gmail.com',
      'valsgum@gmail.com'
    )
  );
