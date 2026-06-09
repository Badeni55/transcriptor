# HANDOFF — Reelscript (rama `bernat`) · qué tienes que hacer tú

> **Fecha:** 2026-06-03 · **Rama:** `bernat` (NADA desplegado a prod) · **Autor:** sesión Claude
> Todo lo construible/arreglable de forma autónoma está hecho y commiteado. Aquí queda lo que depende de ti (tu login, tus decisiones). **Stripe NO es bloqueante** — va al final (§4), sin prisa.

---

## TL;DR
- Reconstruido en `bernat`: **rebrand landing** (Signal) · **panel admin** DB-driven · **loop cerrado** · **isla Signal CABLEADA al backend** (ideas/guiones/hooks/robar/explosión/estado **persisten de verdad en prod**, ya no es demo-grade) · bugs prod reales cazados (gating de tus **23 cuentas Agency**, `/api/brands`, etc.).
- **Migraciones YA en tu Supabase de prod** (compartida; aditivas; la v0.16 viva las ignora). Tú eres **admin**.
- **Nada desplegado.** ~17 commits en `bernat`.
- **Lo que te toca:** validar con tu login (§1) → decidir el takeover (§2) → desplegar (§3). Stripe cuando quieras (§4).

---

## 1. ✅ VALIDAR CON TU LOGIN  *(yo no tengo sesión real → es tu review)*
La isla ya persiste en prod, pero el flujo autenticado solo lo puedes probar tú (logueado). Valida en local (con creds reales) o tras desplegar:
- [ ] **Loop completo (isla Signal):** apuntar idea → generar 5 guiones → 5 hooks → robar reel ("Hazlo mío") → guardar → marcar grabado. Todo debe **persistir tras recargar** y **descontar créditos del servidor** (sin doble-cobro).
- [ ] **Explosión creativa** (5×5×5 = 30 créditos): que genere el árbol idea→guiones→hooks y persista.
- [ ] **Panel `/admin`:** abrir overlay, editar plan/topup, buscar usuario, cambiar plan/créditos, toggle admin.
- [ ] **Agency multi-marca** (tus 23 cuentas): Portfolio lista marcas, se entra a cada una. *(El bug que lo rompía ya está arreglado.)*
- [ ] **Free wall:** un «Hazlo mío» free para al 6º.

---

## 2. 🤔 DECISIÓN: ¿el "Signal" (la isla) pasa a ser la experiencia de prod?
- **Hoy** la isla solo toma la pantalla completa en DEMO (`radar-loop.js:1424`, gateado a `isDemo()`); en prod manda el **workspace legacy**.
- **Ya NO es demo-grade:** sus acciones core están cableadas al backend (§1). El flip es **quitar el gate `isDemo()` de la línea 1424** (1 línea).
- **Recomendación:** primero valida (§1) logueado; si todo va, flipa el takeover y Signal es tu prod. *(Lo dejo sin flipar — es tu decisión y conviene validar antes.)*

---

## 3. 🚀 DESPLEGAR  *(cuando decidas)*
**OJO — corrección:** el deploy **NO** se dispara por push a `prod`. El `deploy.yml` real se dispara al **publicar un GitHub Release** (`git checkout <tag>` en el VPS; el detached HEAD del server es normal).
1. Merge `bernat` → `prod`.
2. **Publica un GitHub Release con tag nuevo** ← dispara el deploy.
3. Progreso en **GitHub → Actions** (NO en el servidor). Verifica `curl -I https://reelscript.net/es/` → 200.
> Salto grande (prod en v0.16.x → reconstrucción). Considera horario valle. El rebrand + panel admin + fixes van a prod aunque NO flipes el takeover.

---

## 4. 💳 Stripe — cuando te venga bien (NO bloquea nada)
Los precios se gestionan desde el **panel `/admin`** (tablas `plans`/`topups`), no por env vars. Cuando quieras cobrar: crea los Products/Prices en Stripe (Creador €29/€276, Agencia €129/€1290, topups €19/€49/€139), y pega los `price_...` en `/admin` → Planes/Topups (o me los pasas y los meto por MCP). Webhook ya existe. *(Lo validas con tu socio, como dijiste.)*

---

## 5. ⏳ Cola "luego" — multiplicadores de la isla que faltan por cablear  *(necesitan backend nuevo + tu testeo; no los hice a ciegas)*
| Acción isla | Estado | Para cablear |
|---|---|---|
| Conveyor `chain`: **LinkedIn** | local | mapea a `/transform` style=linkedin (ya existe) |
| Conveyor `chain`: **carrusel / X / serie-de-3** | local | NO hay style en `/transform` → endpoints nuevos (como los batch que ya creé) |
| `addReelManual` (pegar reel competidor por URL) | local | no hay endpoint "añadir reel por URL" (el tracking es por username) → backend/decisión |
| Roles/marcas por miembro de **Equipo** (`team-edit`) | stub | "más adelante" en PRODUCTO.md (decisión). El **invitar** sí está cableado |

Otros menores: `/auth/me` no devuelve `streak` (muestra 0); hooks en **demo** no persisten visual (prod sí); checkout en **demo** navega a URL Stripe falsa (cosmético demo); tabla `publications` (loop v2 orgánicos) sin aplicar (opcional).

---

## 6. Lo ya hecho y arreglado esta sesión (~17 commits en `bernat`)
**Construido:** rebrand landing (Signal) · panel `/admin` DB-driven (planes/precios/topups/usuarios/ajustes/métricas) · loop B0–B8 (métricas, next_series en Radar+email, vincular-reel, conectar IG por username, refinar voz, banco de hooks) · Equipo invitar · tour nuevo ES · **isla cableada al backend** (5 endpoints batch nuevos: `/ideas/generate-batch`, `/ideas/<id>/scripts/generate-batch`, `/scripts/<id>/hooks/generate-batch`, `/reels/steal-batch`, `/ideas/explosion` — reusan `develop_idea`/`adapt_with_ai`+voz con cobro server-side anti-doble-gasto).

**Migraciones aplicadas a prod (Supabase, vía MCP):** `free_lifetime_uses`, `voice_profiles`, `plans`/`topups`/`app_settings`, `profiles.is_admin`, `scripts.alt_hooks`. **Tú = admin.** Advisors sin WARN nuevos.

**Bugs prod cazados (clase "funciona en demo, roto en prod"):** gating de plan (`agency`→`agencia`, tus 23 cuentas) · `/api/brands` ausente · `connected` en métricas · métricas por marca (`?brand`) · `stolen_today` · `igConnected` blindado · tour legacy en inglés desactivado · `raw_text` de ideas generadas guardaba un dict (arreglado) · lock anti-doble-gasto con 429 en contención.

**Verificado:** arranca sin errores de runtime, rutas 200, landing+isla renderizan, tour ES funciona. *(NO verificable sin tu login: el CRUD autenticado real — §1.)*

---

## 7. Atajo mínimo
**§1** (validar logueado) → **§2** (decidir takeover) → **§3** (deploy). Stripe (§4) y la cola (§5) cuando quieras. Si NO flipas el takeover: despliegas igual y prod sigue con el workspace legacy + el rebrand + el panel admin + todos los fixes.
