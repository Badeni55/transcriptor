# Para Bernat — handoff tras los sprints de David
**Fecha:** 2026-06-09 · **Repo:** `DavidBecama/transcriptor` · **En producción:** v0.21.6 (`reelscript.net`)
**Ramas alineadas:** `prod` = `bernat` = `feature/isla-v2` = v0.21.6 (`2f520c6`). Sin deriva.
**Marco UX de referencia (estándar):** tus apuntes **IDI** — aplicado en todo lo de abajo (Nielsen, Gestalt, atención, memoria, accesibilidad).

> Docs relacionados en la carpeta: `REVISION-rama-bernat.md` (revisión inicial + bugs), `PLAN-v2.0-isla.md` (plan de la isla), `BACKLOG-v2.md`, `ROADMAP-cierre.md`. Este doc los resume y dice qué queda.

---

## 1. Qué se ha hecho y desplegado (v0.20.0 → v0.21.6)

**Economía (v0.20.0–v0.20.1)**
- Planes y créditos nuevos: **Creator 200 cr/mes · Agency 800 cr/mes · Free 12 cr de bienvenida · Marca extra €14,99/+150 cr**. Explosión **gated a planes de pago**. `cost_cents`=18.
- Stripe: prices nuevos creados, `price_id` en la tabla `plans`/`topups`. Precios viejos pendientes de archivar.
- **Hotfix clave:** el límite real de créditos lo da el dict `PLANS` hardcodeado en `app.py` (no la tabla DB) → se sincronizó a 200/800. **Deuda:** que `credits_available` lea de `load_plans_config()` (DB) para una sola fuente de verdad.

**Bugs reales cazados y arreglados**
- `/metrics/summary` 500 (`brand=default` no es UUID → Postgres). 
- Hooks salían como **JSON crudo** (`_parse_ai_json` exigía `body`; ahora `_extract_hook`).
- Contador de créditos no se mostraba a cuentas free con saldo (gateado por `plan==="free"`).
- Consulta a `scripts.hook` inexistente (400) + guard `NoneType` en `develop_idea`.
- Columna `transcriptions.author_username` añadida (para "añadir competidor").

**Rendimiento de generación**
- Los batch (5 guiones, explosión) hacían N llamadas al LLM **en serie** → se colgaba. Ahora **en paralelo** (`gevent` + `monkey.patch_all()` línea 1 + `Pool(8)`). El cuello real era el **modelo**: `gemini-2.5-pro` se colgaba; cambiado a **`gemini-2.5-flash`** en el `.env` del servidor.

**La isla = la app entera (v0.21.x) — adiós doble dashboard**
- **Takeover** activado siempre (`rs-takeover`). Rail final: **Radar · Guiones · Métricas · Cerebro · Analizar · Configuración** (+ captura de ideas global).
- **Analizar** (antes Transcribir) y **Configuración** reusan las vistas legacy reparentadas en `#rsLegacy`.
- **Menú de cuenta** en el rail (avatar abajo) con logout — arregló cerrar sesión bajo takeover.
- **Leak de slugs** cerrado: `/profile/<x>` ya no cuela vistas viejas; la isla enruta por URL.
- **Ideas:** captura global (bombilla → modal): **"Guardar idea" gratis** + "Desarrollar ahora" (5 cr). Fábrica en **Guiones** con dos estados: **Sin desarrollar** / **Desarrolladas**. Ideas asociadas a **marca/cliente** (selector en agency, auto en creator).
- **Asistentes** integrados en **Cerebro** (lista inline + CRUD).
- **Competidores:** chip de autor + **"+ Seguir"** y **borrar/dejar de seguir** (con confirmación).
- Guiones **desplegables** (acordeón), **modal de planes** rediseñado.

**Despliegue:** Release a mano en GitHub (dispara `deploy.yml` → checkout del tag en VPS). Verificar siempre que el VPS quede en el commit nuevo.

---

## 2. Lo que te toca a ti, Bernat

### 2.1 LANDING nueva (el bloque grande)
La landing actual está desfasada y los **vídeos son de hace ~2 meses** (la primera versión). Rehacerla.
- **Mantener las waves** (el elemento visual de olas del hero) — David quiere conservarlas como seña de identidad.
- **Vídeos nuevos** actualizados al producto actual (la isla, no el transcriptor viejo).
- Reflejar el posicionamiento actual: "OS de contenido" / Radar + Ideas + Guiones + Cerebro, no "transcriptor de reels".
- Pricing al día: Creator 200 cr/€29 · Agency 800 cr/€129 · add-ons €14,99.
- **IDI en la landing:** una sola acción primaria por sección (CTA claro), jerarquía visual (Gestalt), copy escaneable (memoria), accesibilidad (contraste, no solo color).

### 2.2 Pulido / deuda (menores)
- **Créditos desde DB:** `credits_available` que lea de `load_plans_config()` en vez del `PLANS` hardcodeado (una sola fuente).
- Barra **"gratis/día"** del front aún sale para logueados (ya no aplica con la economía nueva) → quitar.
- **"Últimas transcripciones"** en el dashboard → "Últimos análisis" (coherencia de naming con Analizar).
- **Archivar** los precios viejos en Stripe (los nuevos ya están en uso).
- Add-on **marca extra**: cablear los **+150 cr/marca** (hoy solo precio, hay un TODO en código).
- Asistentes: si quieres, fundirlos del todo en Cerebro (hoy reusan el panel legacy).

### 2.3 Decisión de comportamiento (confirmar)
- Para Agency, `/profile/radar` y `/profile/overview` ahora abren **Radar (dashboard)**, no el Portfolio macro (el Portfolio queda a un clic en el rail). Si prefieres que esos slugs abran Portfolio, dilo.

---

## 3. Cómo trabajar sin pisarnos
- Todo está en `feature/isla-v2` → `prod` (merge `--no-ff` + tag + Release a mano).
- Si tocas la isla (`radar-loop.js`, `index.html`, CSS), avisa para no colisionar.
- Tras cada cambio en la isla: `node --check static/js/radar-loop.js` + `scripts/verify-island.mjs` (30/30) + `py_compile app.py` si tocas backend. Respeta `isDemo()` y la lógica de créditos.
