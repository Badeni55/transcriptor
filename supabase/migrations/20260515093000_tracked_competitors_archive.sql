-- ═══════════════════════════════════════════════════════════════
-- v0.15.2 — Tracked Competitors: retention column
-- Añade is_archived a creator_reels_global para soft-delete de reels
-- viejos (cuando el cron de retention futura lo necesite).
-- Las queries activas filtran is_archived = false vía partial index.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-15.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE creator_reels_global
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reels_active
  ON creator_reels_global (creator_id, posted_at DESC)
  WHERE is_archived = false;

COMMIT;
