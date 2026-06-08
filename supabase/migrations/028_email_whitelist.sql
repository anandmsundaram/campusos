-- Migration 028: email whitelist for non-.edu signup access
-- Apply in Supabase SQL Editor.
--
-- Replaces the hardcoded EDU_BYPASSES set in the signup page.
-- Non-.edu users can register only if their email is in this table.

create table if not exists public.email_whitelist (
  email      text primary key,
  reason     text,
  added_at   timestamptz default now() not null
);

-- Seed founders, admins, and approved beta testers
insert into public.email_whitelist (email, reason) values
  ('anandmsundaram@gmail.com',  'founder'),
  ('campusosapp@gmail.com',     'admin'),
  ('valsgum@gmail.com',         'founder'),
  ('anand.slate@gmail.com',     'founder'),
  ('lakshmi175@gmail.com',      'beta_tester'),
  ('campusvoice@gmail.com',     'beta_tester'),
  ('sanjanaanandtx@gmail.com',  'beta_tester')
on conflict (email) do nothing;

-- RLS: table is not broadly readable — access only via the function below
alter table public.email_whitelist enable row level security;

-- Only service_role (admin) can read/write directly
create policy "service_role full access"
  on public.email_whitelist
  for all
  to service_role
  using (true)
  with check (true);

-- Anon/authenticated users check via the security-definer function, not direct select
-- (prevents listing all whitelisted emails)

-- Function that the signup page calls — returns true if email is whitelisted
create or replace function public.is_email_whitelisted(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.email_whitelist where email = lower(trim(p_email))
  );
$$;

grant execute on function public.is_email_whitelisted(text) to anon, authenticated;
