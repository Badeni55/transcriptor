-- ═══════════════════════════════════════════════════════════════
-- v0.15.4 — ideas.generation_reasoning
-- Columna dedicada para el reasoning que devuelve el LLM al generar
-- una idea desde un reel de competidor. Antes se metía en script_draft
-- (jsonb), pero colisiona con la estructura {intro,desarrollo,cierre}
-- que escribe develop_idea y v0.15.6 (guion-desde-reel) — el reasoning
-- se perdería al desarrollar la idea.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-17.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS generation_reasoning text;

COMMIT;
