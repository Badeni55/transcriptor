-- voice_profiles — el moat: perfil de voz por marca (tono, frases, estructura…).
-- Aplicada a prod (proyecto reelscript) 2026-06-03 vía MCP.
-- El backend la lee/escribe con service_role (bypassa RLS); la policy "own voice"
-- protege el acceso vía Data API por si lo usa un usuario autenticado.

CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id     TEXT NOT NULL DEFAULT '',
  tone         TEXT,
  phrases      JSONB NOT NULL DEFAULT '[]',
  structure    TEXT,
  avg_duration INTEGER,
  avoid        TEXT,
  confidence   INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  raw          JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id)
);

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own voice" ON public.voice_profiles;
CREATE POLICY "own voice" ON public.voice_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
