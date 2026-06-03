# HANDOFF — Reelscript (rama `bernat`) · qué tienes que hacer tú

> **Fecha:** 2026-06-03 · **Rama:** `bernat` (NADA desplegado a prod) · **Autor:** sesión Claude
> **Para qué sirve:** este doc es tu lista de acción. Todo lo que se podía construir/arreglar sin tu login y sin decisiones de negocio está hecho y commiteado. Aquí queda lo que depende de ti.

---

## TL;DR

- Esta sesión reconstruyó el producto en `bernat`: **rebrand de la landing** (Signal, oscuro+azul), **panel admin DB-driven**, **loop cerrado** (métricas/cerebro/voz/hooks/IG), **Equipo (invitar)**, y se cazaron **bugs reales de prod** (gating de plan de tus 23 cuentas Agency, `/api/brands` ausente, etc.).
- **Migraciones YA aplicadas** a tu Supabase de prod (es compartida; la v0.16 viva las ignora, son aditivas). Tú eres **admin**.
- **Nada está desplegado.** El código vive en `bernat`.
- Quedan **4 cosas tuyas** (§1) + **1 proyecto de ingeniería** (§2, cablear la isla) que necesita tu login para testear.

---

## 1. LO QUE TIENES QUE HACER TÚ

### A. 💳 Stripe — crear precios y pegarlos en el panel  *(bloqueante para cobrar)*
Los precios YA no van por variables de entorno: se gestionan desde el **panel admin** (`/admin` → Planes/Topups, tablas `plans`/`topups`).
1. En Stripe (modo live) crea los **Products/Prices** (multi-divisa EUR/USD dentro de cada price) y copia los `price_...`:
   | Plan | Mensual | Anual |
   |---|---|---|
   | Creador | €29 | €276 (= €23/mes) |
   | Agencia | €129 | €1290 (= €107,50/mes) |
   | Topup 100 cr | €19 (one-time) | — |
   | Topup 300 cr | €49 (one-time) | — |
   | Topup 1000 cr | €139 (one-time) | — |
2. Tras desplegar (§C), entra a `https://reelscript.net/admin` → **Planes** y **Topups** → pega los `price_...` → Guardar. (También puedo meterlos yo por MCP si me los pasas.)
3. **Webhook:** ya tienes `STRIPE_WEBHOOK_SECRET` en prod (endpoint `/stripe-webhook`, eventos `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`). Si reutilizas ese webhook, no toques nada. Si creas uno nuevo, hay que actualizar la var en el VPS con `docker compose down && up -d` (un restart no basta).

### B. 🤔 Decisión: ¿el "Signal" (la isla) pasa a ser la experiencia de prod?
**Hoy la isla solo toma la pantalla en DEMO** (`radar-loop.js:1424`, gateado a `isDemo()`). En **producción real corre el workspace LEGACY** (las pestañas viejas de `index.html`), que **sí persiste** ideas/guiones contra el backend.
- La isla Signal (rebrand, loop, dashboard "el despertar") es el **producto nuevo**, pero hoy es **demo-grade**: sus acciones de crear/generar/guardar son **estado local, no llaman al backend** (ver §2).
- **Tu decisión:** ¿quieres que Signal sea la prod (flip del takeover) o conviven? Si dices que sí, hay que ejecutar el proyecto de §2 antes de flipar. El flip en sí es quitar el gate `isDemo()` de la línea 1424 — trivial — pero **no lo hagas hasta cablear §2**, o la isla en prod no guardará nada.

### C. 🚀 Deploy  *(cuando lo decidas — hoy en pausa)*
**OJO — corrección importante:** el deploy **NO** se dispara por push a `prod`. El `deploy.yml` real se dispara al **publicar un GitHub Release** (hace `git checkout <tag>` en el VPS; el detached HEAD del server es normal/esperado).
1. Merge `bernat` → `prod`.
2. **Publica un GitHub Release con un tag nuevo** ← esto dispara el deploy.
3. Mira el progreso en **GitHub → pestaña Actions** (NO en el servidor).
4. Verifica: `curl -I https://reelscript.net/es/` → 200.
> Es un salto grande (prod está en v0.16.x; `bernat` es la reconstrucción completa). Considera desplegar fuera de horario punta.

### D. ✅ Validación con login real  *(tu review — yo no tengo sesión)*
Con tu cuenta admin, valida en prod (tras desplegar) o en local con creds reales:
- [ ] **Panel `/admin`**: abre el overlay, edita un plan/topup, busca un usuario, cambia plan/créditos, toggle admin.
- [ ] **Agency multi-marca** (tus 23 cuentas): que Portfolio liste marcas y se pueda entrar a cada una. *(El bug que lo rompía —`agency` vs `agencia` y `/api/brands` ausente— ya está arreglado.)*
- [ ] **Free wall**: un «Hazlo mío» de free debe parar al 6º.
- [ ] **Checkout** de prueba (test mode) de cada plan tras pegar los precios.

---

## 2. PROYECTO PENDIENTE — cablear la isla "Signal" al backend
**Por qué no lo hice yo:** la isla se desarrolló contra el shim de demo; sus acciones de crear/generar/persistir son **estado local**. Cablearlas necesita **tu login para testear el flujo autenticado** (no puedo) y decisiones de producto. No lo medio-cableo a ciegas. Aquí queda el alcance exacto:

| Acción en la isla (`radar-loop.js`) | Hoy (demo) | Debe (prod) → endpoint backend (ya existe) |
|---|---|---|
| `seedIdea`/`addSeedIdea` (apuntar idea) | local `S.ideas` | `POST /ideas {raw_text}` |
| `gen5ideas` (5 ideas IA) | banco fijo `BANK_IDEAS` | endpoint IA de ideas (confirmar/crear) |
| `gen5scripts` (idea→5 guiones) | beats genéricos locales | endpoint de generación (confirmar/crear) |
| `gen5hooks` | banco fijo `BANK_HOOKS` | endpoint de hooks IA |
| robar reel → guion ("Hazlo mío") | local | flujo adapt-con-voz (`/transform` + voz) |
| `saveScript` | local `S.guiones` | `POST /scripts` |
| `gui-toggle-rec`/`gui-discard`/`recorded` | `g.status` local | `PATCH /scripts/<id> {recording_status}` |
| Créditos | descuento local (`spend`) | verdad del servidor (el backend ya descuenta en sus endpoints) |

**Notas:** `/ideas`, `/scripts`, `PATCH /scripts/<id>` y `/transform` ya existen y el **workspace legacy los usa correctamente** → es la referencia para cablear con las shapes correctas. Patrón: rama prod (`!isDemo()`) que llama al backend; demo intacto. Requiere testear logueado.

---

## 3. LO YA HECHO Y ARREGLADO ESTA SESIÓN (13 commits en `bernat`)

**Construido:** rebrand landing (Signal) · panel `/admin` DB-driven (planes/precios/topups/usuarios/ajustes/métricas) · loop B0–B8 (fix métricas, next_series en Radar+email, vincular-reel real, conectar IG por username, refinar voz, banco de hooks) · Equipo invitar · tour nuevo en español (gateado a workspace).

**Migraciones aplicadas a prod (Supabase, vía MCP):** `profiles.free_lifetime_uses`, tabla `voice_profiles`, tablas `plans`/`topups`/`app_settings`, `profiles.is_admin`, `scripts.alt_hooks`. **Tú = admin.** Advisors de seguridad sin WARN nuevos.

**Bugs de prod cazados y arreglados** (clase "funciona en demo, roto en prod"):
- **Gating de plan**: `/auth/me` da `agency` (inglés) pero la isla comparaba con `agencia` (español) → tus **23 cuentas Agency** perdían Portfolio/Equipo/multi-marca. Normalizado.
- **`/api/brands` no existía** (404) → Agency sin marcas. Creado.
- **`/metrics/summary` sin `connected`** → ocultaba "Conecta Instagram" al revés. Añadido (real, de `ig_profiles`).
- **Métricas no filtraban por marca** (front manda `?brand`, back leía `project_id`) → alias.
- `stolen_today`, `igConnected` blindado, `S.team` init, tour legacy en inglés desactivado, pill free.

**Verificado:** la app arranca (129 rutas, sin errores de runtime), todas las rutas dan 200, la landing rebrandeada y la isla renderizan, el tour ES funciona. *(Lo NO verificable sin tu login: CRUD autenticado real — §1.D.)*

---

## 4. DIFERIDO / MENORES (no bloquean)
- **Roles/marcas por miembro de Equipo** (`team-edit`): "más adelante" en PRODUCTO.md (decisión de producto abierta). El **invitar** sí está cableado.
- `/auth/me` no devuelve `streak` (la isla lo espera; muestra 0/undefined) — menor.
- Hooks en **modo demo** no persisten visualmente (cosmético, demo-only; en prod con backend sí).
- Checkout en **demo** navega a una URL Stripe falsa (cosmético demo).
- `publications` (tabla loop v2 para reels orgánicos): sin aplicar, opcional (el loop v1 reusa `scripts.*`).

---

## 5. Atajo mínimo para lanzar
**A** (Stripe) → **§2** (cablear isla, si quieres Signal en prod) → **B** (decidir takeover) → **C** (deploy) → pegar precios en `/admin` → **D** (validar). Si NO flipas el takeover todavía: puedes desplegar igual y prod sigue con el workspace legacy + las correcciones + el panel admin + el rebrand de la landing.
