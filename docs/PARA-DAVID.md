# Para David — revisión de la reconstrucción (rama `bernat`)

> **Fecha:** 2026-06-03 · **Rama:** `bernat` (≈18 commits sobre `prod`) · **Repo:** `DavidBecama/transcriptor`
> **Qué es esto:** Bernat trabajó esta sesión en reconstruir/terminar el producto. Este doc te explica **todo lo hecho, lo pendiente, cómo revisarlo y los riesgos**, para que valides antes de cualquier merge/deploy. **Nada está desplegado.**

---

## 0. Resumen ejecutivo
Reescritura del producto sobre la base existente, en `bernat`:
- **Rebrand** de la landing al brand "Signal" (oscuro/azul, narrativa "OS de contenido"; isotipo naranja conservado).
- **Panel `/admin`** nuevo, **DB-driven**: gestionar planes/precios/topups/usuarios/ajustes desde el front (sin tocar env vars).
- **Isla "Signal"** (`radar-loop.js`) **cableada al backend**: el loop (idea → guiones → hooks → robar reel → guardar → grabar → explosión) ahora **persiste de verdad y cobra créditos server-side**. Antes era estado local (demo-grade).
- **Cazados y arreglados varios bugs reales de producción** (no se veían en demo), incluido uno que dejaba a las **23 cuentas Agency** sin Portfolio/multi-marca.
- **Migraciones aplicadas a la Supabase de prod** (ver §2 — esto te afecta directamente).

> ⚠️ **Caveat honesto:** los flujos **autenticados** (login real, CRUD con sesión, cobro real) **no se pudieron probar end-to-end** en esta sesión (sin sesión de usuario real). Verificado: arranque sin errores, todas las rutas 200, render de landing/isla, sintaxis/parse de todo. **Lo autenticado y la lógica de cobro nueva necesitan tu revisión.**

---

## 1. Qué se construyó (por área)

### 1.1 Landing — rebrand "Signal"
`templates/index.html` (bloque `{% if not workspace %}`): paleta naranja `#f97316` → azul `#4f7cff` + oscuro premium; copy ES/EN reposicionado al loop; pricing v0.19; SEO `<head>` reescrito. Se desactivó un **tour legacy del transcriptor** (inglés) que se colaba sobre la landing.

### 1.2 Panel `/admin` — DB-driven
- Ruta `/admin` sirve `index.html` (workspace) + overlay `#adminPage` (piel Signal). Gate: `@admin_required` (`ADMIN_EMAILS` **o** `profiles.is_admin`).
- Endpoints `@admin_required`: `GET/POST /admin/api/plans`, `/admin/api/topups`, `GET /admin/api/users` + `POST /admin/api/users/<id>` (plan/credits_delta/is_admin), `GET/POST /admin/api/settings`. Reusa `/admin/metrics`.
- **Config de planes/precios/topups movida a DB** (tablas `plans`/`topups`/`app_settings`) con **fallback** a `PLANS`/env/`COST_CENTS` si la tabla falta o falla → el path de billing no se rompe. `/auth/me` ahora expone `is_admin`.

### 1.3 Isla "Signal" cableada al backend (lo más importante de revisar)
La isla generaba/guardaba en **estado local**. Ahora, en prod (`!isDemo()`), llama al backend. **Endpoints nuevos creados** (en `app.py`, todos `@require_auth`, cobro server-side con `acquire_credit_lock`/refund, voz inyectada vía `voice_prompt_block`):
| Endpoint nuevo | Para | Coste | Reusa |
|---|---|---|---|
| `POST /ideas/generate-batch` | 5 ideas IA | 1 cr | `develop_idea()` |
| `POST /ideas/<id>/scripts/generate-batch` | idea→5 guiones | 5 cr | `adapt_with_ai()`+voz |
| `POST /scripts/<id>/hooks/generate-batch` | 5 hooks | 1 cr | `_HOOK_REGEN_PROMPT` |
| `POST /reels/steal-batch` | "llena mi semana" (5 reels) | 5 cr | generate-script |
| `POST /ideas/explosion` | 5×5×5 | 30 cr | combina los anteriores |
- También: `GET /api/brands` (faltaba — devolvía 404; ahora deriva marcas de `projects`), persistencia de idea (`POST /ideas`), guardar guion (`POST /scripts`), estado (`PATCH /scripts/<id> {recording_status}`), robar reel (`/api/competitors/reels/<id>/generate-script`, maneja sync/async-202/409), refinar voz (`POST /api/voice/refine`), invitar a Equipo (`/agency/invite`).
- **Créditos:** el front ya **no descuenta en local en prod**; refleja el saldo del servidor (sin doble-cobro; el `flashSpark` es solo cosmético). **Revisar:** el helper `_charge_units_locked` (factoriza el patrón anti-doble-gasto; corta con 429 en contención same-user).
- **Demo intacto:** todas las acciones conservan su rama `isDemo()` con banco/estado local.

### 1.4 Loop "el despertar" (commits previos consolidados)
Métricas (fix de ruta `/metrics/summary` que daba 404 en prod), `next_series_suggestion` en Radar + email diario, vincular-reel real (`/metrics/analyze-one`), conectar Instagram **por username vía Apify** (sin OAuth Meta), refinar voz, banco de hooks (`scripts.alt_hooks`).

---

## 2. ⚠️ Migraciones YA aplicadas a la Supabase de PROD  *(esto te afecta)*
Aplicadas vía MCP al proyecto **`reelscript` (`kchhyvaypkhebjkqxhsr`)** — es la **misma DB que usa la v0.16 viva**. Son **aditivas** y la v0.16 las ignora (no rompen nada en producción actual):
- `profiles.free_lifetime_uses INTEGER DEFAULT 0`
- `profiles.is_admin BOOLEAN DEFAULT false` — **`bernatcasanas@gmail.com` marcado `is_admin=true`**
- tabla `voice_profiles` (+ RLS `own voice`)
- tablas `plans` / `topups` / `app_settings` (RLS on, sin policy = solo `service_role`; seed v0.19 con `stripe_price_*` NULL para rellenar desde el panel)
- `scripts.alt_hooks JSONB DEFAULT '[]'`

`schema.sql` se sincronizó con la realidad de prod (snapshot 2026-06-03). Los archivos de migración están en `supabase/migrations/2026060*_*.sql`. Advisors de seguridad: sin WARN nuevos (los `rls_enabled_no_policy` de las tablas nuevas son intencionales, mismo patrón service-role que `profiles`/`payments`).

---

## 3. Bugs de producción cazados y arreglados (clase "funciona en demo, roto en prod")
La isla se desarrolló contra un shim de demo; en prod varias cosas fallaban en silencio:
- **Gating de plan:** `/auth/me` devuelve `plan="agency"` (inglés) pero la isla comparaba con `"agencia"` (español) → `isAgency()` era `false` para las **23 cuentas Agency** → sin Portfolio/Equipo/multi-marca. Normalizado.
- **`/api/brands` no existía** (404) → Agency sin marcas. Creado.
- **`/metrics/summary` sin `connected`** → ocultaba la tarjeta "Conecta Instagram" al revés. Añadido (real, de `ig_profiles`).
- Métricas no filtraban por marca (front manda `?brand`, back leía `project_id`) → alias.
- `stolen_today`, `igConnected` blindado, init `S.team`, tour legacy desactivado, `raw_text` de ideas generadas guardaba un dict (arreglado).

---

## 4. Pendiente / a decidir
- **Decisión de producto — Takeover Signal en prod:** hoy la isla solo ocupa pantalla completa en DEMO (`radar-loop.js:1424`, gate `isDemo()`); en prod manda el **workspace legacy**. La isla ya está cableada, así que flipar = quitar ese gate (1 línea). **Recomendado: validar logueado antes de flipar.**
- **Validación autenticada** (no la pude hacer yo): loop completo, panel `/admin` con datos, Agency multi-marca, free wall, cobro de créditos real.
- **Multiplicadores sin cablear** (siguen local-only; necesitan endpoints nuevos, no se hicieron a ciegas): conveyor `chain` **carrusel/X/serie** (LinkedIn sí mapea a `/transform`), `addReelManual` (no hay endpoint "añadir reel por URL"). Roles por miembro de Equipo (`team-edit`) = "más adelante" per PRODUCTO.md (el invitar sí está).
- **Stripe:** los precios se gestionan desde el panel (no env). Falta crear los Products/Prices y pegar los `price_...` en `/admin`. No bloquea el resto. (Bernat + tú lo validáis.)
- **Deploy** (en pausa, decisión de Bernat).
- Menores: `/auth/me` no devuelve `streak`; tabla `publications` (loop v2 orgánicos) sin aplicar (opcional).

---

## 5. Cómo desplegar (corrección importante del proceso)
El `deploy.yml` real **NO** se dispara por push a `prod`. Se dispara al **publicar un GitHub Release** → hace `git checkout <tag>` en el VPS (por eso el server queda en *detached HEAD*, es normal). Para desplegar: merge `bernat`→`prod` + **publicar un Release con tag nuevo**, y mirar **GitHub → Actions** (no el servidor). *(El CLAUDE.md del repo decía "push a prod"; estaba desactualizado, ya corregido en `PRE-DEPLOY.md`.)*

---

## 6. Cómo revisar (sugerencia)
1. **Diff completo:** `git diff prod...bernat` (o el PR de esta rama). ~18 commits, mensajes descriptivos por feature/fix.
2. **Local:** `docker compose up` → `:5555`. Para ver la isla Signal: `DEMO_MODE=1` (arranca sin claves, bypassa login, takeover full-screen). Para la landing real: sin `DEMO_MODE` (necesita `SUPABASE_URL`/`SERVICE_KEY`).
3. **Foco de revisión técnica recomendado:**
   - `app.py`: los 5 endpoints batch nuevos + `_charge_units_locked` (lógica de cobro/refund/lock) + `/api/brands` + `metrics_summary` (`connected`).
   - `static/js/radar-loop.js`: ramas `!isDemo()` (persistencia/generación, reflejo de créditos sin doble-cobro), normalización de plan.
   - `templates/index.html`: panel `#adminPage` + `/admin/api/*`, rebrand de la landing.
   - `supabase/migrations/`: lo aplicado a prod.
4. **Docs:** `HANDOFF-bernat.md` (lista de acción de Bernat), `PRE-DEPLOY.md` (checklist), `PRODUCTO.md` / `docs/MISION-vision-producto.md` (visión).

---

## 7. Riesgos a tener presentes
- Flujos autenticados + cobro real **no probados end-to-end** por Claude → revisar la lógica de créditos de los endpoints nuevos.
- La isla en prod depende de la decisión de **takeover**; sin flipar, prod sigue con el workspace legacy (que ya persiste) + el rebrand + el panel + los fixes.
- DB de prod compartida: las migraciones ya están aplicadas (aditivas), pero cualquier rollback de código conviene que **no** asuma que esas columnas/tablas no existen.
