# PRE-DEPLOY — checklist de Reelscript (rama `dev` → `prod`)

> Todo lo manual/migraciones/config que hay que hacer **antes o durante** el deploy.
> Marca `[x]` al completar. Rama de trabajo: `dev`. Deploy = push a `prod`.
> Última actualización: 2026-06-01.

---

## 🔴 Migraciones de BBDD (aplicar a mano en Supabase — NO están aplicadas)

- [ ] **Free lifetime (pricing v0.19):**
  ```sql
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS free_lifetime_uses INTEGER NOT NULL DEFAULT 0;
  ```
  Sin esto, el contador de los 5 «Hazlo mío» de free no persiste (lee 0 → free ilimitado).

- [ ] **Verificar columnas que el código YA usa pero NO están en `schema.sql`** (la DB de prod
  las tiene por fuera; confírmalo antes de un deploy/DB nueva):
  `profiles.plan`, `profiles.monthly_usage`, `profiles.usage_reset_at`,
  `profiles.stripe_subscription_id`, `profiles.avatar_seed`.
  Si faltan en algún entorno:
  ```sql
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS monthly_usage INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS usage_reset_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS avatar_seed TEXT NOT NULL DEFAULT 'default';
  ```
  → **Tarea aparte:** poner `schema.sql` al día con la realidad de prod.

- [ ] **VoiceProfile (moat — perfil de voz por marca):** *(propuesta, sin aplicar)*
  ```sql
  CREATE TABLE IF NOT EXISTS public.voice_profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    brand_id     TEXT NOT NULL DEFAULT '',       -- '' = marca por defecto (NO NULL: rompería el UNIQUE del upsert)
    tone         TEXT,                          -- registro/tono
    phrases      JSONB NOT NULL DEFAULT '[]',   -- frases típicas
    structure    TEXT,                          -- estructura (hook→pasos→CTA…)
    avg_duration INTEGER,                        -- duración media (segundos)
    avoid        TEXT,                          -- qué evita
    confidence   INTEGER NOT NULL DEFAULT 0,    -- 0-100 = "voz al N%"
    source_count INTEGER NOT NULL DEFAULT 0,    -- nº reels propios que lo alimentan
    raw          JSONB,                         -- perfil completo del LLM (extensible)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, brand_id)
  );
  ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "own voice" ON public.voice_profiles FOR ALL USING (auth.uid() = user_id);
  ```

- [ ] **Publication (loop de medición):** *(OPCIONAL v2 — sin aplicar)*
  > v1 ya cierra el loop **reusando `scripts.views_count/likes/comments/saves`** (un guión lleva
  > las métricas del reel publicado en que se convirtió). Esta tabla solo hace falta para reels
  > **orgánicos** (publicados sin partir de un guión). Si la aplicas, ajusta `script_id` al tipo de `scripts.id`.
  ```sql
  CREATE TABLE IF NOT EXISTS public.publications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    brand_id      TEXT,
    ig_media_id   TEXT,                         -- id del reel en IG
    ig_permalink  TEXT,
    caption       TEXT,
    posted_at     TIMESTAMPTZ,
    views         BIGINT, likes BIGINT, comments BIGINT, shares BIGINT,
    duration_sec  INTEGER,
    script_id     TEXT,                         -- ⚠ ajustar el tipo al de scripts.id (¿UUID?) + FK
    match_method  TEXT,                         -- 'text' | 'date' | 'manual'
    match_score   REAL,
    vs_median     REAL,                         -- × sobre la mediana de la cuenta (explosión)
    metrics_updated_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, ig_media_id)
  );
  ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "own pubs" ON public.publications FOR ALL USING (auth.uid() = user_id);
  ```
  *Antes de aplicar: confirmar el tipo de `scripts.id` para la FK `script_id`.*

---

## 🟠 Stripe (crear precios + cablear webhook)

- [ ] Crear en Stripe los **precios** (multi-divisa EUR/USD dentro de cada price):
  - Creador: **€29/mes** · **€276/año**
  - Agencia: **€129/mes** · **€1290/año**
  - Add-ons (recurrentes): marca **€35/mes** · asiento **€19/mes**
  - Topups (one-time): **100cr/€19** · **300cr/€49** · **1000cr/€139**
- [ ] Pegar los price IDs en las env vars (ver `.env.example`):
  `STRIPE_PRICE_CREATOR_MONTH/YEAR`, `STRIPE_PRICE_AGENCY_MONTH/YEAR`,
  `STRIPE_PRICE_ADDON_BRAND`, `STRIPE_PRICE_ADDON_SEAT`,
  `STRIPE_TOPUP_PRICE_100/300/1000`.
- [ ] Webhook en Stripe → endpoint **`/stripe-webhook`**; eventos:
  `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.
  Set `STRIPE_WEBHOOK_SECRET`.
- [ ] Probar en **Stripe test mode** un checkout de cada plan + una renovación (`invoice.paid`)
  y confirmar que el plan + créditos se asignan.

---

## 🟡 Configuración / entorno

- [ ] **`DEMO_MODE` DESACTIVADO en producción** (sin la var, o `=0`). En demo se bypassa el
  login y la isla Radar toma toda la pantalla — NUNCA en prod.
- [ ] Env vars requeridas presentes: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FLASK_SECRET_KEY`.
- [ ] **Redis arriba** (`REDIS_URL`): el rate-limit y los locks de crédito anti-doble-gasto
  (v0.19) son compartidos vía Redis. Si Redis cae, degradan a memoria por-worker (la fuga
  multi-worker vuelve) — **verificar Redis sano antes de empujar tráfico de pago.**
- [ ] **Verificación multi-worker real** (en tu entorno, no en sandbox): 2+ gunicorn workers,
  2 requests de gasto concurrentes del mismo usuario → solo se cobra 1. Y usuario con
  `plan` de pago seteado pero **sin** `stripe_subscription_id` (ni en allowlist) → features de
  pago **bloqueadas**.

---

## 🟢 Código / decisiones de producto pendientes

- [ ] **Commit del WIP en `dev`** (rediseño Signal + pricing + radar-loop) y merge `dev → prod`.
- [ ] **Takeover Signal en producción:** hoy la isla Radar solo ocupa toda la pantalla en
  DEMO. Decidir si prod usa la experiencia Signal a pantalla completa o el rail/command bar
  conviven con el chrome viejo (riesgo de chrome anidado). (`PRODUCTO.md` §8)
- [ ] **Gating por plan real**: el front ya lee `profiles.plan` vía `/auth/me`; el toggle
  Creador/Agencia es solo demo. Confirmar que prod no muestra el toggle.
- [ ] (Polish) Pill de créditos del radar para **free** → mostrar `free_lifetime_left`
  ("5 «Hazlo mío» restantes") en vez de los topups (0).

---

## ✅ Verificación post-deploy

- [ ] `curl -I https://reelscript.net/es/` → **200**.
- [ ] Login real + un «Hazlo mío» de free (debe parar al 6º con el muro de planes).
- [ ] Un checkout real (test) → plan + créditos aplicados.
