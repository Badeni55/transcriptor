-- ═══════════════════════════════════════════════════════════════
-- v0.15.5 — creator_reels_global.transcript cacheado + status
-- Para generar guion desde un reel de competidor con material rico:
-- transcripción del audio del reel guardada como cache (varios users
-- pueden guionizar el mismo reel sin re-transcribir). Estados:
-- NULL = nunca intentado, 'transcribing' = en marcha (con
-- transcript_started_at para el stale guard de 15min), 'ok' = listo,
-- 'failed' = falló (un solo reintento permitido en flujo).
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-19.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE creator_reels_global
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_status text
    CHECK (transcript_status IN ('transcribing','ok','failed')),
  ADD COLUMN IF NOT EXISTS transcript_error text,
  ADD COLUMN IF NOT EXISTS transcript_started_at timestamptz;

COMMIT;
