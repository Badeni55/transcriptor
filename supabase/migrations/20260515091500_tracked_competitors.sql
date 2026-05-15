-- ═══════════════════════════════════════════════════════════════
-- v0.15.0 — Tracked Competitors feature
-- Tablas: creators_global, creator_reels_global, user_tracked_creators,
--         user_creator_credits
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-15
-- (este archivo es el snapshot exacto para re-aplicación / portabilidad
-- via psql o SQL Editor — incluye BEGIN/COMMIT explícitos).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. creators_global
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creators_global (
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

CREATE INDEX IF NOT EXISTS idx_creators_global_username_lower
  ON creators_global (lower(ig_username));

CREATE INDEX IF NOT EXISTS idx_creators_global_next_scrape
  ON creators_global (next_scrape_due_at)
  WHERE scrape_status NOT IN ('not_found','private');

CREATE OR REPLACE FUNCTION lowercase_ig_username() RETURNS trigger AS $$
BEGIN
  NEW.ig_username := lower(NEW.ig_username);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creators_global_lowercase ON creators_global;
CREATE TRIGGER trg_creators_global_lowercase
  BEFORE INSERT OR UPDATE ON creators_global
  FOR EACH ROW EXECUTE FUNCTION lowercase_ig_username();

-- ──────────────────────────────────────────────────────────────
-- 2. creator_reels_global
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_reels_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators_global(id) ON DELETE CASCADE,
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
  UNIQUE(creator_id, ig_reel_id)
);

CREATE INDEX IF NOT EXISTS idx_reels_creator_posted
  ON creator_reels_global (creator_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_reels_creator_views
  ON creator_reels_global (creator_id, views DESC);

-- ──────────────────────────────────────────────────────────────
-- 3. user_tracked_creators
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tracked_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES creators_global(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  weekly_digest_enabled boolean NOT NULL DEFAULT true
);

-- Partial unique indexes: cubren los dos casos (project_id NULL / NOT NULL).
-- Postgres trata NULLs como distintos en UNIQUE constraints, por eso necesitamos
-- partial indexes para garantizar "un user no puede trackear al mismo creador
-- dos veces" sin proyecto (Pro/Creator) y "no dos veces dentro del mismo proyecto"
-- (Agency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_unique_no_project
  ON user_tracked_creators (user_id, creator_id)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_unique_with_project
  ON user_tracked_creators (user_id, creator_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_user_active
  ON user_tracked_creators (user_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tracked_creator
  ON user_tracked_creators (creator_id)
  WHERE archived_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- 4. user_creator_credits
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_creator_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extra_slots integer NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  stripe_payment_intent_id text,
  consumed boolean NOT NULL DEFAULT false
);

-- Nota: el predicado del índice usa `consumed = false` (IMMUTABLE) en lugar
-- de `expires_at > now()` (now() es STABLE, no permitido en index predicates).
-- Las queries filtran expires_at > now() OR IS NULL en runtime.
CREATE INDEX IF NOT EXISTS idx_credits_user_active
  ON user_creator_credits (user_id, expires_at)
  WHERE consumed = false;

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies (idempotentes con DROP IF EXISTS)
-- ═══════════════════════════════════════════════════════════════

-- creators_global: lectura abierta a autenticados, escritura solo service_role.
ALTER TABLE creators_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creators_global_read ON creators_global;
CREATE POLICY creators_global_read ON creators_global FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS creators_global_write ON creators_global;
CREATE POLICY creators_global_write ON creators_global FOR ALL TO service_role USING (true);

-- creator_reels_global: idem.
ALTER TABLE creator_reels_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reels_read ON creator_reels_global;
CREATE POLICY reels_read ON creator_reels_global FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS reels_write ON creator_reels_global;
CREATE POLICY reels_write ON creator_reels_global FOR ALL TO service_role USING (true);

-- user_tracked_creators: solo el dueño.
ALTER TABLE user_tracked_creators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracked_read ON user_tracked_creators;
CREATE POLICY tracked_read ON user_tracked_creators FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS tracked_write ON user_tracked_creators;
CREATE POLICY tracked_write ON user_tracked_creators FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_creator_credits: lectura solo del dueño, escritura service_role
-- (las compras se procesan vía webhook Stripe → backend con service_role).
ALTER TABLE user_creator_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credits_read ON user_creator_credits;
CREATE POLICY credits_read ON user_creator_credits FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS credits_write ON user_creator_credits;
CREATE POLICY credits_write ON user_creator_credits FOR ALL TO service_role USING (true);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Smoke tests (post-migration)
-- ═══════════════════════════════════════════════════════════════
-- SELECT count(*) FROM creators_global;
-- SELECT count(*) FROM creator_reels_global;
-- SELECT count(*) FROM user_tracked_creators;
-- SELECT count(*) FROM user_creator_credits;
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename IN ('creators_global','creator_reels_global',
--                       'user_tracked_creators','user_creator_credits');
