-- Timestamp helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- references (uploaded images)
CREATE TABLE public.references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('good','bad','best')),
  commentary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own references" ON public.references FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own references" ON public.references FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own references" ON public.references FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own references" ON public.references FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_references_updated_at BEFORE UPDATE ON public.references
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_references_user ON public.references(user_id);

-- taste_profiles (the synthesized profile, one per user)
CREATE TABLE public.taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  values TEXT[] NOT NULL DEFAULT '{}',
  avoid TEXT[] NOT NULL DEFAULT '{}',
  interview_transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.taste_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own taste profile" ON public.taste_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own taste profile" ON public.taste_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own taste profile" ON public.taste_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own taste profile" ON public.taste_profiles FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_taste_profiles_updated_at BEFORE UPDATE ON public.taste_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- generations
CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief TEXT NOT NULL,
  reference_ids UUID[] NOT NULL DEFAULT '{}',
  output_format TEXT NOT NULL,
  result TEXT NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own generations" ON public.generations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own generations" ON public.generations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own generations" ON public.generations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_generations_user ON public.generations(user_id);

-- references storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('references', 'references', false);

CREATE POLICY "Users read own reference files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'references' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own reference files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'references' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own reference files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'references' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own reference files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'references' AND auth.uid()::text = (storage.foldername(name))[1]);