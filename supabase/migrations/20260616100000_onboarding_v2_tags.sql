-- ════════════════════════════════════════════════════════════════════════════
-- Onboarding v2 — categorización por TAGS (nicho/subnicho) + librería reciclable.
--
-- El foso: cada creador trackeado se etiqueta con el/los subnicho(s) del usuario
-- que lo añade (unión incremental). Un usuario nuevo del subnicho X recibe el
-- radar PRE-LLENO con reels que YA petaron de creadores tageados con X (reusa lo
-- cacheado, scrapea solo lo nuevo). Matching por overlap de `subniches` (GIN),
-- no por nicho amplio: cosmética orgánica ≠ cosmética.
--
-- Idempotente. Aplicar manualmente en Supabase (no se auto-aplica).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Tags en el creador GLOBAL (compartido entre todos los usuarios = la librería).
ALTER TABLE creators_global
  ADD COLUMN IF NOT EXISTS niche        TEXT,
  ADD COLUMN IF NOT EXISTS subniches    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS niche_source TEXT,            -- 'user' | 'llm' | 'seed'
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Matching por overlap de tags: WHERE subniches && ARRAY['copywriting',...]
CREATE INDEX IF NOT EXISTS idx_creators_global_subniches
  ON creators_global USING GIN (subniches);
CREATE INDEX IF NOT EXISTS idx_creators_global_niche
  ON creators_global (niche);

-- 2) Perfil del usuario: su nicho/subnichos/objetivo + flag de onboarding v2.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS niche              TEXT,
  ADD COLUMN IF NOT EXISTS subniches          TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goal               TEXT,    -- grow | sell | educate | entertain
  ADD COLUMN IF NOT EXISTS onboarding_v2_done BOOLEAN NOT NULL DEFAULT false;

-- 3) (Opcional, recomendado para la query de reciclaje) índice por explosión.
--    El feed reciclado ordena por views; ya hay PK en creator_reels_global.
CREATE INDEX IF NOT EXISTS idx_creator_reels_views
  ON creator_reels_global (creator_id, views DESC) WHERE is_archived = false;

-- ── Notas de diseño ─────────────────────────────────────────────────────────
-- · `subniches` vive en creators_global (no en user_tracked_creators) porque el
--   tag es una propiedad GLOBAL del creador (lo comparten todos los usuarios) →
--   eso es lo que permite reciclar entre usuarios del mismo subnicho.
-- · `niche`/`subniches` en profiles es la declaración del usuario (su segmento).
-- · Clasificación automática de creadores existentes (LLM sobre su contenido)
--   queda como job aparte (ver reporte: "qué dejé fuera").
