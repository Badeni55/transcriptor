-- ═══════════════════════════════════════════════════════════════
-- v0.15.6 — user_favorite_reels
-- Permite a un user marcar reels de competidores como favoritos para
-- coleccionar/encontrarlos rápido. Hard-delete (sin archived_at): toggle
-- es estado binario, no histórico. UNIQUE(user_id, reel_id) garantiza
-- idempotencia (POST = ON CONFLICT DO NOTHING).
--
-- Patrón replicado de user_tracked_creators (RLS user-scoped, gen_random_uuid).
-- ON DELETE CASCADE en reel_id: si el reel se archiva/borra, el favorito
-- se va con él (consistente).
--
-- Aplicado a Supabase production vía MCP apply_migration el 2026-05-20.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_favorite_reels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  reel_id     uuid NOT NULL REFERENCES public.creator_reels_global(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_favreels_user ON public.user_favorite_reels(user_id);
CREATE INDEX IF NOT EXISTS idx_favreels_reel ON public.user_favorite_reels(reel_id);

ALTER TABLE public.user_favorite_reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY favreels_read  ON public.user_favorite_reels
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY favreels_write ON public.user_favorite_reels
  FOR ALL    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
