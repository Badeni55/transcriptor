-- ═══════════════════════════════════════════════════════════════
-- v0.15.3.a — creator_reels_global.thumb_b64
-- Las URLs de thumbnail de Instagram (thumb_url) expiran y bloquean
-- hotlinking desde dominios externos. Replicamos el patrón de
-- transcriptions.thumbnail_b64 / ig_videos.thumbnail_b64: descargar
-- el thumb en el worker y guardar como JPEG base64 reescalado a 320×400.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-16.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE creator_reels_global
  ADD COLUMN IF NOT EXISTS thumb_b64 text;

COMMIT;
