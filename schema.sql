-- ============================================================
--  Transcriptor – Supabase Schema
--  Pega esto en el SQL Editor de tu proyecto Supabase y ejecuta
-- ============================================================

-- Perfiles: saldo + contador gratuito diario
CREATE TABLE IF NOT EXISTS public.profiles (
  id                      UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_cents           INTEGER NOT NULL DEFAULT 0,
  free_used_today         INTEGER NOT NULL DEFAULT 0,
  free_reset_date         DATE    NOT NULL DEFAULT CURRENT_DATE,
  free_adapt_used_today   INTEGER NOT NULL DEFAULT 0,
  free_adapt_reset_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración: añadir columnas a tabla existente
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_adapt_used_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_adapt_reset_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Trigger: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Límite por IP para usuarios anónimos
CREATE TABLE IF NOT EXISTS public.ip_usage (
  ip         TEXT PRIMARY KEY,
  used_today INTEGER  NOT NULL DEFAULT 0,
  reset_date DATE     NOT NULL DEFAULT CURRENT_DATE
);

-- Transcripciones
CREATE TABLE IF NOT EXISTS public.transcriptions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip          TEXT,
  url         TEXT        NOT NULL,
  platform    TEXT        NOT NULL,
  language    TEXT,
  text        TEXT        NOT NULL,
  cost_cents  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v0.14.7: métricas Apify (solo para plans pro/creator/agency)
ALTER TABLE public.transcriptions
  ADD COLUMN IF NOT EXISTS views              BIGINT,
  ADD COLUMN IF NOT EXISTS likes              BIGINT,
  ADD COLUMN IF NOT EXISTS comments           BIGINT,
  ADD COLUMN IF NOT EXISTS shares             BIGINT,
  ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transcriptions_user_published
  ON public.transcriptions(user_id, published_at DESC);

-- Pagos / recargas
CREATE TABLE IF NOT EXISTS public.payments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents          INTEGER NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guiones guardados por el usuario
CREATE TABLE IF NOT EXISTS public.saved_scripts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  style       TEXT,
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v0.14.26: Suggest Ideas Phase 1 — columnas para sugerencias guardadas
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS hook              TEXT,
  ADD COLUMN IF NOT EXISTS style             TEXT,
  ADD COLUMN IF NOT EXISTS inspired_by_id    TEXT,
  ADD COLUMN IF NOT EXISTS inspired_by_type  TEXT,   -- 'reel' | 'transcription'
  ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'manual';
-- source: 'manual' (existentes) | 'suggestion' (creadas desde Sugerir Ideas)

-- v0.14.24: email activation flow (Resend)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lang              TEXT    NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS email_marketing   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT    UNIQUE;

CREATE TABLE IF NOT EXISTS public.email_log (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key   TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'queued',  -- queued | sent | failed | skipped
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  resend_id      TEXT,
  opened_at      TIMESTAMPTZ,
  clicked_at     TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_email_log_pending
  ON public.email_log(status, scheduled_for)
  WHERE status = 'queued';

-- RLS activado (el backend usa service role, así que bypassa)
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_scripts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own scripts" ON public.saved_scripts
  FOR ALL USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- v0.15.0 — Tracked Competitors
-- Aplicado vía supabase/migrations/20260515091500_tracked_competitors.sql
-- (Las RLS policies y el trigger lowercase viven en el archivo de migración.)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.creators_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_username text UNIQUE NOT NULL,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  followers_count_cached integer,
  last_scraped_at timestamptz,
  next_scrape_due_at timestamptz,
  scrape_status text NOT NULL DEFAULT 'pending'
    CHECK (scrape_status IN ('pending','scraping','ok','failed','not_found','private')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_reels_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators_global(id) ON DELETE CASCADE,
  ig_reel_id text NOT NULL,
  caption text,
  views bigint DEFAULT 0,
  likes bigint DEFAULT 0,
  comments bigint DEFAULT 0,
  posted_at timestamptz,
  thumb_url text,
  video_url text,
  video_duration_sec numeric(6,2),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE(creator_id, ig_reel_id)
);

CREATE TABLE IF NOT EXISTS public.user_tracked_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators_global(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  weekly_digest_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_creator_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extra_slots integer NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  stripe_payment_intent_id text,
  consumed boolean NOT NULL DEFAULT false
);
