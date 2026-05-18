-- Enable Supabase Realtime for the messages table.
-- Run this in the Supabase SQL editor, OR toggle the table in:
--   Dashboard → Database → Replication → supabase_realtime publication

alter publication supabase_realtime add table public.messages;
