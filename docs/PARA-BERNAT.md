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

### 2.0 BRANDING / COPY (el norte de todo el contenido y la landing)
El mensaje central de ReelScript, y lo que debe respirar TODO el copy (landing, modales, vacíos, onboarding):

> **"Copia lo que ya funciona."**

La promesa: **sabemos lo que es viral, sabemos lo que funciona en tu nicho → te decimos qué grabar.** No es "genera contenido con IA" genérico; es "esto es lo que ya está explotando en tu nicho, hazlo tuyo". El branding gira en torno a eso: certeza basada en lo que ya triunfa, no en adivinar.
- Aplícalo en los CTAs, los hooks de la landing, los empty states ("aún no hay señales… aquí verás lo que explota en tu nicho"), y el tono general.
- IDI: una promesa clara y repetida (memoria/consistencia); copy escaneable; el valor visible en 3 segundos.

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

### 2.3 Visión: interoperabilidad / agentes (apuesta futura, no urgente)
Norte: que ReelScript sea **lo más interoperable posible, sin barreras de entrada**.
- **`llms.txt`** (HECHO, pendiente de servir en `/llms.txt`): describe el producto para agentes/LLMs. Hay que añadir una ruta Flask que lo sirva en `reelscript.net/llms.txt`.
- **API pública + MCP (futuro):** exponer el núcleo (generar ideas/guiones/hooks, analizar reel, señales del Radar) como API autenticada con API keys, cobrada **contra el mismo sistema de créditos**. Encima, un **MCP server** para que agentes (Claude, plugins) la usen. Decisión de negocio antes de construir: ¿pricing por uso separado de la suscripción? Validar demanda con un MVP mínimo (una API + un MCP en el registro) antes de escalar a 10 integraciones. **No es para ahora** — bloque estratégico tras cerrar lo actual.

### 2.4 Decisión de comportamiento (confirmar)
- Para Agency, `/profile/radar` y `/profile/overview` ahora abren **Radar (dashboard)**, no el Portfolio macro (el Portfolio queda a un clic en el rail). Si prefieres que esos slugs abran Portfolio, dilo.

---

## 3. Cómo trabajar sin pisarnos
- Todo está en `feature/isla-v2` → `prod` (merge `--no-ff` + tag + Release a mano).
- Si tocas la isla (`radar-loop.js`, `index.html`, CSS), avisa para no colisionar.
- Tras cada cambio en la isla: `node --check static/js/radar-loop.js` + `scripts/verify-island.mjs` (30/30) + `py_compile app.py` si tocas backend. Respeta `isDemo()` y la lógica de créditos.
