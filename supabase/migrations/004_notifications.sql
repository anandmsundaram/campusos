-- ============================================================
-- Notifications table for in-app notification system
-- ============================================================

create table public.notifications (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  type                text        not null check (type in (
                                    'offer_received', 'offer_accepted', 'offer_rejected',
                                    'new_message', 'task_completed'
                                  )),
  message             text        not null,
  read                boolean     not null default false,
  related_request_id  uuid        references public.requests(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index notifications_user_id_idx     on public.notifications(user_id);
create index notifications_unread_idx      on public.notifications(user_id, read) where (read = false);
create index notifications_created_at_idx  on public.notifications(created_at desc);

alter table public.notifications enable row level security;

-- Users can only view their own notifications
create policy "notifications: user can view own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

-- Any authenticated user can create notifications for other users
-- (needed so clients can notify each other without server-side triggers)
create policy "notifications: any auth user can create"
  on public.notifications for insert
  to authenticated
  with check (true);

-- Users can mark their own notifications as read
create policy "notifications: user can update own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime delivery
alter publication supabase_realtime add table public.notifications;
