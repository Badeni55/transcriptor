-- ═══════════════════════════════════════════════════════════════
-- v0.15.4 — ideas.inspired_by_username
-- Snapshot denormalizado del username del competidor que inspiró la
-- idea. Conservamos la referencia textual aunque el user elimine el
-- creator de su lista de tracked (user_tracked_creators).
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-17.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS inspired_by_username text;

COMMIT;
