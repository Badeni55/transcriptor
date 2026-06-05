# TODO — Mejoras UX de la isla "Signal" (auditoría IDI)

> **Fecha:** 2026-06-05 · **Para:** Claude Code · **Origen:** evaluación heurística del frontend contra los apuntes de *Interacción y Diseño de Interfaces* (IDI) de Bernat.
> **Repo:** `DavidBecama/transcriptor` · ábrelo en la raíz del repo. Todas las rutas de este documento son **relativas a la raíz del repo**.
> **Objetivo:** llevar la isla nueva `static/js/radar-loop.js` ("Signal") al estándar de usabilidad/accesibilidad que la chrome antigua de `templates/index.html` **ya cumple**, sin romper nada.

---

## Cómo ejecutar esto

1. Ve por prioridad: **P0 → P1 → P2**. Dentro de cada bloque, de arriba a abajo.
2. Cada tarea trae **Archivos**, **Problema (con el principio IDI que lo justifica)**, **Acción** (subtareas con checkbox) y **Aceptación** (criterio verificable). No marques `[x]` la tarea hasta cumplir su Aceptación.
3. Tras cada tarea: `node --check static/js/radar-loop.js` y, si existe, el harness funcional que monta la isla (ver `docs/PLAN-radar-loop-rediseno.md` §7). No avances con el check en rojo.
4. Trabaja una tarea por commit, con mensaje `ux(idi): <Tn> <título>`.

## Reglas duras (no te las saltes)

- **Scope:** cambios confinados a `static/js/radar-loop.js` y, donde se indique, a los tokens compartidos del `<style>` de `templates/index.html` + su espejo `static/design-system.html`. **No toques** la chrome legacy (transcriptor, auth, modales fuera de `.rs`).
- **Demo ↔ prod:** respeta siempre la bifurcación `isDemo()`. Lo que añadas debe funcionar en ambos modos.
- **Billing:** no toques la lógica de créditos server-side ni el doble-cobro (`applyCredits`, `refreshCredits`). Es la fuente de verdad del backend.
- **Estilo:** vanilla JS con template strings, como el resto del archivo. Reusa los primitivos del design system (`.btn`, `.field`, `.card`, `overlayShellHTML`). No metas dependencias.
- **No rediseñes** ni reordenes pantallas más allá de lo que pide cada tarea.

---

## P0 — Las 3 de máximo impacto / mínimo coste

### T1 · Una sola acción primaria por pantalla
- **Prioridad:** P0 · **Severidad:** grave
- **Archivos:** `static/js/radar-loop.js` (`dashboardHTML` ≈L416-456, `whaleHTML` ≈L291, `ideaInputHTML` ≈L286, `voiceOnboardCardHTML` ≈L778, `nextSeriesHTML` ≈L270-279)
- **Problema (IDI):** atención y percepción — "resaltar un elemento lo hace percibir como de mayor interés, *como un título*" y "limitar el número de distracciones". Hoy el Dashboard muestra hasta **5 botones `btn-primary` naranja a la vez** (Hazlo mío, Desarrollar idea, Hazlo/whale, Aprender mi voz, Desarrollar serie). Si todo es título, nada lo es → se diluye el principio I del producto ("una respuesta, no un menú").
- **Acción:**
  - [ ] Dejar **un único `btn-primary` visible** en el Dashboard: el "Hazlo mío" de la Oportunidad #1 (`opportunityHTML`).
  - [ ] Bajar a `btn-secondary` el botón del whale (`whaleHTML`) y el "Desarrollar" del idea-input (`ideaInputHTML`) cuando se renderizan dentro del Dashboard.
  - [ ] Convertir `voiceOnboardCardHTML` en un **banner delgado** (no una card con CTA primario) y colocarlo de forma que **no empuje la Oportunidad #1 por debajo del fold**. Mantener su CTA como `btn-secondary`.
  - [ ] Aplicar el mismo criterio a `nextSeriesHTML` (CTA secundario en el Dashboard; puede seguir primario en el Cerebro, donde es la acción principal).
- **Aceptación:** en el Dashboard, con reels y sin perfil de voz, **el primer y único botón naranja visible sobre el fold es "Hazlo mío"** de la Oportunidad #1. El resto de CTAs son secundarios/ghost.

### T2 · Eliminar los 5 `window.prompt()`
- **Prioridad:** P0 · **Severidad:** grave
- **Archivos:** `static/js/radar-loop.js` (`addReelManual` ≈L1306, `refineVoice` ≈L1344, `igConnectProfile` ≈L1409, handler `gui-link-reel` ≈L1543, `teamInvite` ≈L1444)
- **Problema (IDI):** memoria ("limita la necesidad de memorizar") + satisfacción ("sin incomodidades") + affordance. `window.prompt()` no valida, no da label/helper, rompe la estética premium y obliga a recordar la URL fuera de contexto. Además es **incoherente**: el onboarding de voz usa `<textarea>`, pero refinar voz usa `prompt()`.
- **Acción:**
  - [ ] Crear un helper reutilizable `promptSheet({title, label, placeholder, helper, multiline, validate, onSubmit})` que renderice un overlay con `overlayShellHTML` + primitivos `.field` (label + input/textarea + helper + error).
  - [ ] Migrar los 5 flujos a `promptSheet`. "Refinar voz" debe usar **textarea** (igual que el onboarding) y la misma ruta de backend.
  - [ ] Validación mínima por flujo (URL no vacía / con http; email con `@`; usuario IG sin `@`).
- **Aceptación:** `grep -n "prompt(" static/js/radar-loop.js` no devuelve **ninguna** llamada a `window.prompt`. Cada flujo abre un sheet propio con validación y se ve coherente en demo y prod.

### T3 · Teclado y foco en la isla
- **Prioridad:** P0 · **Severidad:** media (corrige un doble estándar)
- **Archivos:** `static/js/radar-loop.js` (`mount` ≈L1692-1700 — hoy solo engancha `click` + `resize`; `ideaInputHTML` ≈L286; `cmdHTML` searchbox ≈L226)
- **Problema (IDI):** usabilidad ("evitar el mayor número de interrupciones") y Flow ("un sentido de control"). La isla **no escucha teclado**: overlays no cierran con `Esc`, los inputs de idea no envían con `Enter`, y el `⌘K` del command bar es **decorativo** (no hay handler en ningún sitio) → affordance mentirosa. La chrome legacy sí tiene `Esc`/`Enter` por todas partes.
- **Acción:**
  - [ ] Añadir un listener `keydown` global (engancharlo en `mount`, junto al de `click`).
  - [ ] `Escape` cierra el overlay activo (gen/script/result/perf/prompter/fillweek), equivalente a `close-feed`/`back` según el caso.
  - [ ] `Enter` en `#rsIdeaSeed` dispara `seed-go`; en `#rsIdeaSeed2`, `seed-add`. (No interceptar Enter dentro de textareas.)
  - [ ] `⌘K`/`Ctrl+K`: enfocar un buscador **real**, o —si no se va a implementar ahora— **eliminar el `<span>⌘K</span>`** del searchbox para no prometer un atajo inexistente.
- **Aceptación:** `Esc` cierra cualquier overlay; `Enter` envía la idea desde ambos inputs; `⌘K` hace algo visible **o** ya no aparece la pista de atajo.

---

## P1 — Accesibilidad y feedback (siguiente tanda)

### T4 · Toast accesible + errores que no se esfuman
- **Prioridad:** P1 · **Severidad:** media
- **Archivos:** `static/js/radar-loop.js` (`showToast` ≈L985, nodo `rs-toast` en `render` ≈L977)
- **Problema (IDI):** "evita usar **solo una modalidad sensorial**" y "evita pop-ups con texto que desaparecen tras un delay" (apuntes, pág. 7). El toast de la isla es visual, efímero (2,8 s) y **sin `aria-live`** — mientras que el `toastContainer` legacy **sí** lo tiene. Para un error ("Error de red"), es el antipatrón exacto.
- **Acción:**
  - [ ] Añadir `role="status"` + `aria-live="polite"` al nodo `#rsToast`.
  - [ ] Separar `showToast(msg)` (info, auto-oculta 2,8 s) de `showError(msg)` (persistente, con botón de cerrar, `aria-live="assertive"`).
  - [ ] Enrutar los toasts de error de red/fallo (`onboardVoice`, `refineVoice`, `linkReelPublished`, `refreshReels`, `igConnectProfile`) a `showError`.
- **Aceptación:** el toast se anuncia por lector de pantalla; un error de red **permanece** hasta que el usuario lo cierra.

### T5 · Overlays como diálogos accesibles
- **Prioridad:** P1 · **Severidad:** media
- **Archivos:** `static/js/radar-loop.js` (`overlayShellHTML` ≈L934, `teleprompterHTML` ≈L935, `render` ≈L971-976)
- **Problema (IDI):** factor humano / accesibilidad — los overlays no son `dialog`, no mueven el foco al abrir ni lo devuelven al cerrar; un usuario de teclado/lector se pierde.
- **Acción:**
  - [ ] `overlayShellHTML` y el teleprompter renderizan con `role="dialog"`, `aria-modal="true"` y `aria-label` (el título del overlay).
  - [ ] Al abrir un overlay, mover el foco al primer control (o al botón de cerrar). Al cerrar, devolver el foco al elemento que lo abrió.
  - [ ] Trap de foco básico dentro del overlay (Tab no escapa al fondo).
- **Aceptación:** abrir un overlay anuncia un diálogo y coloca el foco dentro; cerrarlo devuelve el foco al disparador.

### T6 · Espera honesta en el robo asíncrono
- **Prioridad:** P1 · **Severidad:** media
- **Archivos:** `static/js/radar-loop.js` (`pollScriptTask` ≈L1079, `generatingHTML` ≈L909, `startGenSteps` ≈L983)
- **Problema (IDI):** Flow pide "reacción directa e inmediata" y "sentido de control". El robo real puede pollear **hasta ~90 s** mostrando solo pasos cosméticos rotando. La espera teatral de 1,7 s vende valor; 90 s sin progreso real genera ansiedad.
- **Acción:**
  - [ ] A partir de ~8 s sin respuesta, mostrar un mensaje honesto en el orbe ("Tu rival hablaba mucho, dame unos segundos más…").
  - [ ] Ofrecer "seguir navegando" mientras se genera en segundo plano (o, mínimo, un estado de progreso distinto del bucle de pasos).
- **Aceptación:** en un robo que tarda >8 s, el usuario ve un mensaje de progreso honesto, no solo los pasos rotando en bucle.

---

## P2 — Pulido (cuando P0/P1 estén cerradas)

### T7 · Escala tipográfica en `rem`
- **Prioridad:** P2 · **Severidad:** media
- **Archivos:** tokens `:root` del `<style>` de `templates/index.html`; espejo en `static/design-system.html` (≈L51)
- **Problema (IDI):** accesibilidad — "el tamaño del texto" es uno de tus 4 problemas comunes (pág. 15). Los tokens `--text-*` son `px` fijos → no escalan con el zoom de fuente del SO/navegador.
- **Acción:**
  - [ ] Convertir `--text-xs … --text-5xl` de `px` a `rem` (base 16px). Mantener los valores visuales.
  - [ ] Reflejar el cambio en `static/design-system.html` (su comentario ya avisa de mantenerlo sincronizado).
- **Aceptación:** subir el tamaño de fuente del navegador escala la UI proporcionalmente; el diseño no se rompe.

### T8 · Auditoría colorblind + targets táctiles
- **Prioridad:** P2 · **Severidad:** media/leve
- **Archivos:** `static/js/radar-loop.js` (`reelCardHTML` row-score ≈L311, badges TOP/VIRAL en `metricGridHTML` ≈L699); CSS `.rs--mobile`
- **Problema (IDI):** accesibilidad — "colorblindness" (pág. 15). Verificar que el dato no dependa **solo** del color (los `metric-delta` ya lo hacen bien con ↑↓; replicar ese patrón).
- **Acción:**
  - [ ] Asegurar que "explosivo/alto" (`.row-score.hi`) y los badges se distingan por **icono o etiqueta**, no solo por color.
  - [ ] Revisar que los targets táctiles en `rs--mobile` lleguen a **≥44px** (chips a 28px y `btn-sm` a 32px se quedan cortos en móvil).
- **Aceptación:** en simulación de daltonismo, el reel explosivo se identifica sin depender del color; targets móviles ≥44px.

### T9 · Deshacer al descartar guion
- **Prioridad:** P2 · **Severidad:** leve
- **Archivos:** `static/js/radar-loop.js` (handler `gui-discard` ≈L1541)
- **Problema (IDI):** control del usuario — descartar es destructivo y solo muestra un toast "Descartado." sin vuelta atrás.
- **Acción:**
  - [ ] Tras descartar, mostrar un toast con acción **"Deshacer"** que revierta `status` a `draft` (y, en prod, persista con `persistRecStatus`).
- **Aceptación:** descartar un guion y pulsar "Deshacer" lo restaura a "Por grabar".

---

## Verificación final (antes de dar por cerrado)

- [ ] `node --check static/js/radar-loop.js` en verde.
- [ ] Harness funcional monta la isla y renderiza feed sin errores (demo) — ver `docs/PLAN-radar-loop-rediseno.md` §7.
- [ ] `grep -n "prompt(" static/js/radar-loop.js` → 0 resultados.
- [ ] Recorrido manual demo: despertar → Hazlo mío → reveal → grabar; probar `Esc`, `Enter`, foco en overlays, toast de error persistente.
- [ ] Recorrido con plan real (prod, `isDemo()` falso): un robo, una idea, conectar IG, vincular reel — sin `window.prompt`.
- [ ] Probar deep-links del demo (`?plan=creador`/`?plan=agencia`, `?t=`, `?b=`) — todas las vistas siguen montando.

> **Nota para el agente:** cada tarea cita el principio IDI que la justifica para que entiendas el *por qué*, no solo el *qué*. Si una Acción choca con una decisión de producto del `docs/MISION-vision-producto.md`, **para y avisa** antes de ejecutarla — gana la constitución de producto.
