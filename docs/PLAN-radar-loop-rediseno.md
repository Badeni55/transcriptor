# Plan — Portar el diseño "Radar Loop" a la app (literal)

> **Fecha:** 2026-05-30 · **Rama:** `bernat` · **Fuente del diseño:** `Reelscript.zip` (prototipo React "Loop")
> **Objetivo:** que el Radar de la app sea **literalmente** el diseño del prototipo: feed con momentum/FOMO + "Llena mi semana" + tarjetas de reel → robar → generación (orbe) → reveal del guión → cinta de formatos → teleprompter → batch semana. Dark/light premium.

---

## Estrategia de integración (clave)

El diseño está **100% scopeado bajo `.rs`** y trae **sus propios tokens** (`.rs[data-theme="dark|light"]`). La app **no usa `class="rs"` en ningún sitio** (verificado: 0 colisiones). Por tanto:

> **Lo meto como una isla `.rs` autocontenida dentro del panel Radar (`#ideasPanelCompetitors`).** Copio `ds.css` casi verbatim al `<style>` de la app, y renderizo el markup del diseño (traducido de JSX a JS vanilla) dentro de `<div id="radarRoot" class="rs rs--desktop" data-theme="dark">`. Cero riesgo de chocar con el resto; el restyle global previo (tokens app) sigue intacto para el resto de paneles.

Traducción JSX → vanilla JS: el diseño es React; la app es JS vanilla con template strings (como `renderCompetitorFeed`). Porto los componentes a un módulo `RadarLoop` con su propia máquina de estados (igual que `app.jsx`).

---

## Componentes del diseño a portar (de los .jsx)

- **Shell/feed** (`screens.jsx`): `Spark` (créditos con animación fly), `Momentum` (saludo serif + línea FOMO), `Whale` (hero "Llena mi semana"), `Filters` (🔥 Explotando / Recientes / ★ Favoritos), `ReelCard` (thumb vertical, avatar+handle+when, cap, sum, métricas eye/heart/badge-explode, acciones "✨ Hazlo mío" + estrella fav).
- **Flujo** (`flow.jsx`): `Generating` (orbe cónico + pasos rotando), `ScriptReveal` (hook serif + beats numerados + close + `ConveyorBelt`), `ConveyorBelt` ("¿Y ahora?" — chains: grabar/hooks/carrusel/linkedin/x/serie), `FormatResult` (HooksResult / CarouselResult / LinkedinResult / XResult / SerieResult), `Teleprompter` (overlay negro), `FillWeek` (batch rows wait→run→done).
- **Máquina de estados** (`app.jsx`): view = feed|gen|script|result|prompter|fillweek; COST por acción; steal/chain/recorded/startFillWeek/toggleFav; overlays como sheets full-screen.
- **Iconos** inline (`Ic` en screens.jsx).

---

## Mapeo datos reales → forma del diseño

| Diseño | Endpoint real | Notas |
|---|---|---|
| feed reels | `GET /api/tracked-creators/reels` | map: handle=ig_username, initials=derivar, when=tiempo rel, explosion=explosion_score, views/likes=formateado, dur=video_duration_sec, cap=caption, sum=(2ª línea/None) |
| momentum stats | `GET /api/radar/stats` | competitors, reels_week, exploded_week, stolen_today (añadir al endpoint o usar stolen_total) |
| robar (steal) | `POST /api/competitors/reels/<id>/generate-script` | tras generar, mostrar reveal. Demo: `reel.script` mock. Prod: fetch script generado y parsear a {hook,beats,close} |
| formatos | client-side | hooks/carrusel/linkedin/x/serie = re-layout del guión ya generado (sin LLM nuevo) → funciona demo + prod |
| llena semana | `GET /api/radar/fill-week/candidates` + POST generate ×N | animación batch |

**Demo:** el shim de `fetch` servirá reels con la forma rica (script/hooks/sum/dur), portando el contenido de `data.js`. Así la demo renderiza el diseño **literal**.

---

## Pasos de ejecución (sin parar)

1. **CSS** — pegar `ds.css` (`.rs` tokens + componentes, ~300 líneas; omitir stage/frame del prototipo) en el `<style>` de `index.html`.
2. **Demo data** — enriquecer el shim: `/api/tracked-creators/reels` devuelve reels ricos (port de `data.js`); `/api/radar/stats` con `stolen_today`.
3. **Markup** — sustituir el interior de `#ideasPanelCompetitors` por `<div id="radarRoot" class="rs"></div>`.
4. **Módulo `RadarLoop`** (nuevo `<script>`) — iconos + render (momentum/whale/filters/feed/cards) + overlays (gen/script/belt/formats/teleprompter/fillweek) + máquina de estados + toast + spark.
5. **Wiring** — `loadCompetitors()` monta `RadarLoop`; fetch feed+stats; steal→generate real; formatos client-side; fillweek real.
6. **Responsive** — `rs--desktop`/`rs--mobile` por viewport.
7. **Verificar** en la demo (server local) e iterar hasta que sea pixel-fiel.

---

## Estado

- [x] 1. CSS portado (isla .rs)
- [x] 2. Demo data rica (nicho IA, script+hooks por reel)
- [x] 3. Markup panel (#radarRoot)
- [x] 4. Módulo RadarLoop (vanilla JS, máquina de estados completa)
- [x] 5. Wiring endpoints (loadCompetitors → RadarLoop.mount; me/stats/reels reales)
- [x] 6. Responsive (rs--desktop/rs--mobile por viewport)
- [x] 7. Verificado: JS pasa node --check + harness funcional (monta y renderiza feed sin errores)
