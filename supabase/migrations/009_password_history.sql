-- Track hashed passwords so users cannot reuse their last 5 passwords.
-- We store our own bcrypt hashes (separate from Supabase's internal auth store).

CREATE TABLE public.password_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  password_hash text       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_history_user_id_created_idx
  ON public.password_history (user_id, created_at DESC);

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

-- Users can read and insert their own history; no delete allowed.
CREATE POLICY "password_history: user can read own"
  ON public.password_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "password_history: user can insert own"
  ON public.password_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
