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

-- ════════════════════════════════════════════════════════════════════════════
-- 4) RLS — re-aserción idempotente del modelo de seguridad tras añadir columnas.
--    Las columnas nuevas NO crean superficie nueva: RLS es a nivel de FILA, así
--    que heredan la política de su tabla. Aquí re-aseguramos esa política y
--    revocamos cualquier acceso de `anon` (defensa en profundidad).
-- ════════════════════════════════════════════════════════════════════════════

-- profiles: RLS activa SIN policy de cliente = deny-all (solo el backend, con
-- service_role, lee/escribe). Las columnas nuevas (niche/subniches/goal/
-- onboarding_v2_done) quedan, por tanto, inaccesibles para cualquier cliente
-- (ni authenticated ni anon). No añadimos policy → no se exponen.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon;

-- creators_global: LIBRERÍA COMPARTIDA (el foso). Lectura para autenticados
-- (mapping público subnicho→creador), escritura/etiquetado SOLO service_role
-- (el backend; nunca el cliente). Las columnas niche/subniches heredan esto.
ALTER TABLE public.creators_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creators_global_read ON public.creators_global;
CREATE POLICY creators_global_read ON public.creators_global
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS creators_global_write ON public.creators_global;
CREATE POLICY creators_global_write ON public.creators_global
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.creators_global FROM anon;

-- creator_reels_global: idem (reels de la librería: lectura autenticados,
-- escritura service_role). El feed reciclado se sirve desde el backend.
ALTER TABLE public.creator_reels_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reels_read ON public.creator_reels_global;
CREATE POLICY reels_read ON public.creator_reels_global
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS reels_write ON public.creator_reels_global;
CREATE POLICY reels_write ON public.creator_reels_global
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.creator_reels_global FROM anon;

-- user_tracked_creators: el "quién sigue a quién" NO se filtra — owner-only.
-- (Re-aserción defensiva: la librería reciclable expone subnicho→creador→reels,
--  nunca qué usuario concreto sigue a quién.)
ALTER TABLE public.user_tracked_creators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracked_read ON public.user_tracked_creators;
CREATE POLICY tracked_read ON public.user_tracked_creators
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS tracked_write ON public.user_tracked_creators;
CREATE POLICY tracked_write ON public.user_tracked_creators
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.user_tracked_creators FROM anon;

-- ── Notas de diseño ─────────────────────────────────────────────────────────
-- · `subniches` vive en creators_global (no en user_tracked_creators) porque el
--   tag es una propiedad GLOBAL del creador (lo comparten todos los usuarios) →
--   eso es lo que permite reciclar entre usuarios del mismo subnicho.
-- · `niche`/`subniches` en profiles es la declaración del usuario (su segmento).
-- · Clasificación automática de creadores existentes (LLM sobre su contenido)
--   queda como job aparte (ver reporte: "qué dejé fuera").
-- · Idempotente y seguro de re-ejecutar: ADD COLUMN IF NOT EXISTS, CREATE INDEX
--   IF NOT EXISTS, y políticas con DROP POLICY IF EXISTS antes de CREATE.
