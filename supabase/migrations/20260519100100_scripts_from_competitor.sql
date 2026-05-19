-- ═══════════════════════════════════════════════════════════════
-- v0.15.5 — scripts.from_competitor_reel_id + from_competitor_username
-- Trazabilidad de guiones generados desde reels de competidores.
-- Denormalizado: sobrevive al borrado del tracking en
-- user_tracked_creators o al archivado del reel.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-19.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS from_competitor_reel_id text,
  ADD COLUMN IF NOT EXISTS from_competitor_username text;

COMMIT;
