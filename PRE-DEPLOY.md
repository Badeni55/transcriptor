# PRE-DEPLOY — checklist de Reelscript (rama `bernat`)

> Todo lo manual/migraciones/config que hay que hacer **antes o durante** el deploy.
> Marca `[x]` al completar. Rama de trabajo: `bernat`.
> ⚠ **Deploy NO se dispara por push a `prod`.** Se dispara al **publicar un GitHub Release**
> (ver `deploy.yml`): el VPS hace `git checkout <tag>` → **detached HEAD es normal y esperado** aquí.
> Última actualización: **2026-06-03**.

---

## ⭐ Estado a 2026-06-03 (rama `bernat`)

> Sesión de construcción cerrada en rama `bernat`. **Sin deploy** (en pausa). Resumen de en qué punto está todo.

**✅ Construido y verificado en código:**
- **Migraciones BBDD aplicadas a prod** (vía Supabase MCP): `profiles.free_lifetime_uses`, tabla `voice_profiles`,
  nuevas tablas `plans` / `topups` / `app_settings`, `profiles.is_admin`, `scripts.alt_hooks`.
  **`bernatcasanas@gmail.com` = admin** (`is_admin = true`).
- **Pricing v0.19** + **gating real por plan** (`profiles.plan` vía `/auth/me`, no toggle demo).
- **Pill de créditos del radar para free** → muestra `free_lifetime_left` ("N «Hazlo mío» restantes").
- **Topups multi-monto** (100 / 300 / 1000 créditos).
- **Hooks agrupados** (back + front): `alt_hooks` en `scripts`, endpoints de hooks, UI de variantes en la card.
- **Loop cerrado**: métricas ↔ cerebro ↔ voz (VoiceProfile real) ↔ `next_series_suggestion`.
- **Panel admin** (`/admin`, `/admin/api/*`) gobierna **precios y planes** (tablas `plans` / `topups` / `app_settings` DB-driven, con fallback). **Los precios YA NO van por env vars de Stripe.**

**🟠 Pendiente (lo hará Bernat / fuera de esta sesión):**
- **Stripe**: crear los **precios** en Stripe (test + live) y **pegar los price IDs en el panel admin** (`/admin` → Planes / Topups). El webhook existente sigue cableado.
- **Deploy**: en pausa. Cuando toque, se dispara **publicando un GitHub Release** (no push a `prod`).

---

## 🟢 Migraciones de BBDD (APLICADAS a prod vía Supabase MCP — 2026-06-03)

> Todas las migraciones de esta sesión están **aplicadas a la DB de prod** vía MCP. Quedan marcadas `[x]`.
> Pendiente menor (no bloquea): poner `schema.sql` al día con la realidad de prod.

- [x] **Free lifetime (pricing v0.19):** *(aplicada)*
  ```sql
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS free_lifetime_uses INTEGER NOT NULL DEFAULT 0;
  ```
  Sin esto, el contador de los 5 «Hazlo mío» de free no persiste (lee 0 → free ilimitado).

- [x] **Tablas/columnas del pricing DB-driven (panel admin):** *(aplicadas)*
  - `plans`, `topups`, `app_settings` (tablas DB-driven con fallback en código).
  - `profiles.is_admin BOOLEAN NOT NULL DEFAULT false` → `bernatcasanas@gmail.com = true`.
  - `scripts.alt_hooks JSONB NOT NULL DEFAULT '[]'::jsonb` (hooks agrupados).
  > Los **precios de planes/topups ya NO viven en env vars de Stripe**: se editan en `/admin` (Planes / Topups)
  > y se persisten en estas tablas.

- [x] **Verificar columnas que el código YA usa pero NO están en `schema.sql`** (la DB de prod
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

- [x] **VoiceProfile (moat — perfil de voz por marca):** *(aplicada a prod)*
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

## 🟠 Stripe — CAMBIO DE MODELO: precios gestionados desde el panel admin

> ⚠ **Los precios YA NO van por env vars.** Se gestionan **DB-driven desde el panel admin** (`/admin` → Planes / Topups,
> tablas `plans` / `topups` con fallback en código). Las env vars `STRIPE_PRICE_*` quedan **obsoletas** para esto.
> **El webhook existente sigue cableado** y no cambia.
>
> **Único pendiente (lo hará Bernat):** crear los precios en Stripe y **pegar los price IDs en el panel**.

- [ ] **(Bernat)** Crear en Stripe los **precios** (multi-divisa EUR/USD dentro de cada price). Valores de referencia:
  - Creador: **€29/mes** · **€276/año**
  - Agencia: **€129/mes** · **€1290/año**
  - Add-ons (recurrentes): marca **€35/mes** · asiento **€19/mes**
  - Topups (one-time): **100cr/€19** · **300cr/€49** · **1000cr/€139**
  > Los importes finales se editan en el panel; estos son los de partida.
- [ ] **(Bernat)** Pegar los **price IDs en el panel admin** (`/admin` → Planes / Topups), **no** en env vars.
  *(Histórico — las env vars `STRIPE_PRICE_CREATOR_MONTH/YEAR`, `STRIPE_PRICE_AGENCY_MONTH/YEAR`,
  `STRIPE_PRICE_ADDON_BRAND/SEAT`, `STRIPE_TOPUP_PRICE_100/300/1000` quedan obsoletas para este flujo.)*
- [x] Webhook en Stripe → endpoint **`/stripe-webhook`**; eventos:
  `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.
  Set `STRIPE_WEBHOOK_SECRET`. *(El webhook existente se mantiene — sin cambios en este flujo.)*
- [ ] Probar en **Stripe test mode** un checkout de cada plan + una renovación (`invoice.paid`)
  y confirmar que el plan + créditos se asignan (una vez los price IDs estén pegados en el panel).

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

## 🟢 Código / decisiones de producto

- [x] **Pricing v0.19** implementado (gating real, pill free, topups multi-monto, hooks agrupados, loop cerrado). *Construido en rama `bernat`.*
- [ ] **Deploy:** en pausa. Cuando toque, se dispara **publicando un GitHub Release** (no por push a `prod`); el VPS hace `git checkout <tag>` (detached HEAD normal).
- [ ] **Takeover Signal en producción:** hoy la isla Radar solo ocupa toda la pantalla en
  DEMO. Decidir si prod usa la experiencia Signal a pantalla completa o el rail/command bar
  conviven con el chrome viejo (riesgo de chrome anidado). (`PRODUCTO.md` §8)
- [x] **Gating por plan real**: el front lee `profiles.plan` vía `/auth/me`; el toggle
  Creador/Agencia era solo demo. Gating real implementado (prod no muestra el toggle).
- [x] (Polish) Pill de créditos del radar para **free** → muestra `free_lifetime_left`
  ("N «Hazlo mío» restantes") en vez de los topups (0).

---

## 🧩 Pendiente — front & features (para una tanda "luego")

- [x] **Hooks agrupados en el guion** *(implementado en rama `bernat`, back + front):*
  - Migración aplicada: `scripts.alt_hooks JSONB NOT NULL DEFAULT '[]'::jsonb` (+ pendiente declarar `scripts` en `schema.sql`, hoy solo está `saved_scripts` legacy).
  - Backend: `POST /scripts/<id>/hooks` (añadir, dedupe), `DELETE /scripts/<id>/hooks` (quitar por índice), `POST /scripts/<id>/hooks/use` (swap activo↔variante, sin perder nada). Hook-guardado-suelto redirigido → `alt_hooks` del padre.
  - Frontend: desplegable "N hooks alternativos" + "Usar"/quitar en `scr-card` (`#profPanelScripts`), replicando `guiCardHTML`/`gui-use-hook`/`gui-del-hook` de `radar-loop.js`.
- [x] **Loop cerrado (`next_series_suggestion`)** ("lo que grabaste sobre X petó → el siguiente en tu voz"): métricas engancha el loop server-side al refrescar IG; VoiceProfile real + cerebro alimentan la sugerencia. *(Pendiente menor: superficie en email — el Radar ya lo muestra.)*
- [ ] **Captura de voz también en el primer-run del Radar** (hoy solo en Cerebro).
- [ ] **Retención real (Instagram Insights / OAuth)**: la vista "Rendimiento del guion"
  muestra hoy una curva de **muestra**. La retención / avg watch time / reach reales solo
  vienen de la **Graph API de Instagram (Insights)** con la cuenta business/creator conectada
  por **OAuth de Meta** (no scraping). Integración aparte; el scraper actual solo da views/likes/comentarios.
- [ ] **Persistir el vínculo manual guion↔reel** (`scripts.reel_url`) + las métricas de
  publicación en `scripts.views_count/...` (ya existe la columna) cuando se monte en prod.
- [ ] **Takeover Signal en producción** (la isla solo ocupa pantalla completa en demo) — decidir integración rail/command bar vs chrome viejo.

## ✅ Verificación post-deploy

- [ ] `curl -I https://reelscript.net/es/` → **200**.
- [ ] Login real + un «Hazlo mío» de free (debe parar al 6º con el muro de planes).
- [ ] Un checkout real (test) → plan + créditos aplicados.
