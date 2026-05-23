-- ═══════════════════════════════════════════════════════════════
-- v0.15.8 — script_generation_locks
-- Cierra el 0.1% residual del guard 60s de v0.15.5: dos tasks async del
-- mismo (user, reel) que llegan al INSERT en milisegundos sin verse mutuamente.
-- PK compuesta (user_id, reel_id) garantiza atomicidad — el INSERT del 2º
-- POST falla con conflict, el endpoint devuelve 409 in_progress con el
-- task_id del 1º para que el frontend reuse el polling.
--
-- Mantiene defensa en profundidad:
--   - Guard 60s sobre tabla scripts (v0.15.5): caso "ya generaste hace <60s".
--   - Lock (este, v0.15.8): caso "hay generación en curso del mismo reel".
--
-- Sweeper periódico (tasks.sweep_stale_resources cada 5min) limpia locks
-- huérfanos con started_at > 10min — protege contra worker muerto antes
-- del finally que normalmente libera el lock.
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-23.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.script_generation_locks (
  user_id    uuid NOT NULL,
  reel_id    uuid NOT NULL REFERENCES public.creator_reels_global(id) ON DELETE CASCADE,
  task_id    text,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_sgl_started_at ON public.script_generation_locks(started_at);

ALTER TABLE public.script_generation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY sgl_read  ON public.script_generation_locks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY sgl_write ON public.script_generation_locks
  FOR ALL    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
