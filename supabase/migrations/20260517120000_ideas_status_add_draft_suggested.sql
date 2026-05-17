-- ═══════════════════════════════════════════════════════════════
-- v0.15.4.b — ampliar ideas_status_check con 'draft_suggested'
-- El CHECK constraint original restringía status a {draft, developed,
-- scripted}. El INSERT del endpoint generate-idea (v0.15.4) usa
-- status='draft_suggested' → violaba el constraint → 500 al guardar.
--
-- Lección: la verificación de status en v0.15.4 consultó valores
-- existentes (SELECT DISTINCT status) pero no pg_constraint. El CHECK
-- no es visible vía SELECT DISTINCT. A partir de ahora, validar
-- constraints siempre que se introduzca un nuevo enum-like value.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-17.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.ideas
  DROP CONSTRAINT IF EXISTS ideas_status_check;

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY['draft','developed','scripted','draft_suggested']::text[]));

COMMIT;
