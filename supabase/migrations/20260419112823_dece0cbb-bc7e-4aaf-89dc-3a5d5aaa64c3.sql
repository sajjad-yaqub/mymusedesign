ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS inspirations text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS image_dimensions text,
  ADD COLUMN IF NOT EXISTS rating text,
  ADD COLUMN IF NOT EXISTS saved_to_history boolean NOT NULL DEFAULT false;

-- Allow users to update their own generations (for rating + save-to-history)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generations' AND policyname = 'Users update own generations'
  ) THEN
    CREATE POLICY "Users update own generations"
    ON public.generations
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;