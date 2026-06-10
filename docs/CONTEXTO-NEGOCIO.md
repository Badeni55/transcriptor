# Reelscript — Contexto de negocio (qué hay, cómo se cobra, hacia dónde)

> **Fecha:** 2026-06-10 · **Para:** Bernat (dueño del modelo de negocio y la venta)
> **Fuentes:** `PARA-BERNAT.md` (David, 09-jun) · código en producción v0.21.6 (`app.py` dict `PLANS`/`TOPUPS`) · `MISION-vision-producto.md` · `PRODUCTO.md`
> **Qué es este doc:** la foto de negocio actual + las decisiones del 10-jun + la propuesta de escalera de pricing. El detalle técnico vive en `CLAUDE.md` del repo; la constitución de producto en `MISION-vision-producto.md`.

---

## 1. Qué es Reelscript hoy (en una frase)

El **sistema operativo del creador contra la página en blanco**: radar de lo que explota en tu nicho → lo robas a tu voz → grabas con teleprompter → las métricas entrenan tu Cerebro. El mensaje de marca que debe respirar todo: **«Copia lo que ya funciona.»**

## 2. Qué hay en producción (v0.21.6 · reelscript.net)

- **La isla ES la app entera** (takeover siempre activo). Rail: Radar · Guiones · Métricas · Cerebro · Analizar · Configuración + captura de ideas global (bombilla).
- **Loop completo operativo:** señales de competidores → «Hazlo mío» → guion en tu voz (VoiceProfile se inyecta en TODA generación) → teleprompter → métricas IG que atribuyen reels publicados a guiones por contenido hablado y realimentan la voz (`what_works`).
- **Voz = moat:** «voz al N%» honesto (1 reel ≈ 48%, 5 ≈ 80%). Irse = empezar de cero con un sistema que no te conoce.
- **Multi-marca Agency:** Portfolio macro → zoom a marca (Spaces), equipo con roles, pool de créditos de cuenta.
- **Rendimiento:** generación batch en paralelo (gevent Pool 8); modelo `gemini-2.5-flash` (el pro se colgaba).
- **Interop:** `llms.txt` servido en `/llms.txt` (primer paso de la visión agentes/API).
- Ramas alineadas sin deriva: `prod` = `bernat` = `feature/isla-v2` (`2f520c6`).

## 3. Cómo se cobra HOY (verificado en código, no en docs viejos)

### Planes (suscripción Stripe, mensual o anual = 2 meses gratis)

| Plan | Precio | Créditos | Marcas | Asientos | Notas |
|---|---|---|---|---|---|
| **Free** | €0 | **12 «Hazlo mío» de por vida** (no resetean) | 1 | 1 | Ver el Radar es gratis (principio: lo barato es ver) |
| **Creator** | **€29/mes** · €276/año | **200 cr/mes** | 1 | 1 | Cerebro, voz, métricas, formatos |
| **Agency** | **€129/mes** · €1.290/año | **pool 800 cr/mes** (cuenta, no por marca) | 3 | 3 | Portfolio + equipo + roles |
| `pro` (legacy) | — | 50 cr/mes | 1 | 1 | Grandfathering, no se ofrece |

### Add-ons y topups

- **Marca extra: €14,99/mes** — ⚠️ debe dar **+150 cr/mes al pool**; hoy solo cobra el precio, los créditos NO están cableados (TODO en código).
- **Asiento extra: €14,99/mes.**
- **Topups one-time:** 100 cr/€19 · 300 cr/€49 · 1.000 cr/€139.

### Coste por acción (lo que consume el usuario)

| Acción | Créditos |
|---|---|
| Robar reel → guion («Hazlo mío») | 1 |
| 5 hooks alternativos · otro formato · 5 ideas | 1 |
| Serie de 3 | 3 |
| 5 guiones desde una idea | 5 |
| 💥 Explosión creativa (5×5×5) — **solo planes de pago** | 30 |
| Grabar (teleprompter) · ver Radar/métricas | 0 |

### Unit economics

- **Ingreso por crédito según vía:** Creator anual 11,5¢ · topup 1000 13,9¢ · Creator mensual 14,5¢ · Agency 16,1¢ · topup 300 16,3¢ · topup 100 19¢ · marca extra (cuando se cablee) 10¢.
- **Coste variable por crédito** (Groq Whisper + Gemini Flash + Apify): estimación **2–4¢** [inferencia, no medido en repo] → margen bruto >75–85%. El negocio no se juega en el margen por crédito: se juega en **conversión free→paid y churn**.
- Unidad de cuenta interna: 1 crédito = `COST_CENTS` (18¢) de saldo.

> ⚠️ **Incoherencias detectadas (2026-06-10):** (1) `PRODUCTO.md` §Pricing está desfasado — dice Creator 100cr / Agency 500cr / marca €35 / free 5 usos; la verdad es 200/800/€14,99/12. (2) En código, `credits_month` (100/500) quedó viejo; el límite real lo da `monthly_uses` (200/800). David ya lo apunta como deuda: una sola fuente de verdad en DB (`load_plans_config()`).

## 4. El modelo de negocio (cómo se gana dinero)

1. **Embudo:** SEO (10 pillar pages ES/EN) + contenido → Free (12 robos lifetime, ve el Radar gratis) → el gancho es **quedarse sin robos justo cuando le funciona** → Creator €29.
2. **Expansión:** Creator → Agency (más marcas + equipo) → add-ons por marca/asiento → topups cuando el pool se queda corto. Cada marca extra = un cerebro vivo que se paga (metáfora Spaces).
3. **Retención (el foso):** el VoiceProfile mejora con cada publicación. A más uso, más le cuesta irse. Métrica norte: **reels publicados**, no créditos quemados — el usuario que publica crece, vuelve y gasta.
4. **LTV estimado** [inferencia con benchmarks creator-economy]: Creator con churn 10–15%/mes → LTV ≈ €190–290. Agency con churn 5–7% → LTV ≈ €1.800–2.600. La palanca nº1 del LTV es que el usuario conecte IG y publique (activa el moat).
5. **Futuro (no urgente):** API pública + MCP cobrando contra el mismo sistema de créditos → Reelscript como infraestructura para agentes. Decisión de pricing por uso ANTES de construir; validar con un MVP (1 API + 1 MCP en registro).

## 5. Decisiones tomadas — 2026-06-10 (Bernat)

1. **Prioridad: LANDING NUEVA primero.** Es el bloque que vende; el producto ya está desplegado.
2. **Vídeos de la landing: NO vídeo.** Animaciones/mockups de la UI (CSS/JS) sobre las waves. Cero mantenimiento cuando evolucione la UI. Las **waves se mantienen** (seña de identidad, petición de David).
3. **Agency en `/profile/radar` y `/profile/overview` → abre PORTFOLIO (vista macro)**, no el Radar de la marca activa. ⚠️ **Contradice lo implementado** — David lo dejó en Radar y pidió confirmación: **hay que avisarle para que lo cambie** (o se cambia en la próxima sesión de código, avisando antes de tocar la isla).
4. **Pricing: repensar la escalera completa** (ver §6). No se cambia ningún precio hasta decidir escenario.

## 6. Escalera de pricing — análisis y escenarios (propuesta, decisión pendiente)

### Problemas de la escalera actual

1. **Salto €29 → €129 (4,4×) sin peldaño.** El creador que crece a 2 marcas sin equipo no tiene plan: la marca extra solo existe como add-on de Agency.
2. **Free de 12 robos lifetime no enseña el moat:** el valor compuesto (voz, métricas, Cerebro) necesita semanas; 12 robos se gastan antes de sentirlo. Convierte por escasez, no por valor.
3. **Sin decoy/anclaje para el creador individual:** Agency ancla para agencias, pero el solo-creator compara €29 contra €0.
4. **Topup 1000 (13,9¢/cr) más barato que Creator mensual (14,5¢/cr):** un power-user fidelizado podría optimizar contra ti. Aceptable (cash upfront), vigilar.
5. **Marca extra a 10¢/cr será la vía más barata** cuando se cableen los +150cr — bien para expansión, pero refuerza que falta el peldaño intermedio nativo.

### Escenarios

| | **A — Puente** | **B — Subida con landing** | **C — Por marca (estructural)** |
|---|---|---|---|
| Movimiento | Añadir **Creator Pro €59/mes**: 450 cr, 2 marcas, 1 asiento | **Creator €39** · Agency €149, aprovechando que aún no hay base que proteger (la landing nueva es el momento de subir sin coste de grandfathering) | Base €29 (1 marca) + **€15/marca adicional** en todos los planes; Agency = capa equipo/portfolio €99 + marcas |
| Qué resuelve | El salto 4,4× | Percepción de valor («tu estratega diario» no vale lo que un café/día… vale más) + margen | Alinea cobro con la metáfora Spaces: cada marca = un cerebro que se paga. Expansión MRR natural |
| Riesgo | Canibaliza Agency si el límite de asientos no se respeta | Menos conversión en frío; mitigable con anual agresivo | Complejidad de billing + migración de Agency actual |
| Cuándo | Ya, con la landing | Solo en el release de la landing nueva (cambio de precio = cambio de historia) | Q3, tras validar conversión con A/B |

**Mi recomendación** [inferencia]: **B + A en el lanzamiento de la landing** (subir Creator a €39 con la historia nueva + crear el peldaño €59), y dejar **C como evolución estructural** cuando haya datos de cuántos creators piden 2ª marca. Antes de cualquier cambio: cablear los +150cr/marca y la fuente única de créditos en DB (que el sistema cobre lo que dice que cobra).

## 7. Plan de continuación (orden de trabajo)

1. **Landing nueva** (Bernat): mensaje «Copia lo que ya funciona» · waves · animaciones de UI (sin vídeo) · pricing al día · IDI (una acción primaria por sección, jerarquía, escaneable, accesible). Empty states y CTAs alineados al mensaje.
2. **Avisar a David:** decisión Portfolio (§5.3) + no pisarse en la isla (`radar-loop.js`, `index.html`, CSS — avisar antes de tocar).
3. **Deuda económica** (sesión de código corta): +150cr/marca extra · `credits_available` desde DB · quitar barra «gratis/día» a logueados · «Últimas transcripciones» → «Últimos análisis» · archivar precios viejos en Stripe · actualizar `PRODUCTO.md` §Pricing.
4. **Decidir escenario de pricing** (§6) antes de publicar la landing (la landing pinta los precios).
5. **Después:** API + MCP (validar demanda con MVP mínimo; pricing por uso = decisión de negocio previa).

## 8. Protocolo para no pisarse (de David)

Todo va por `feature/isla-v2` → `prod` (merge `--no-ff` + tag + Release a mano en GitHub, que dispara el deploy). Tras tocar la isla: `node --check static/js/radar-loop.js` + `scripts/verify-island.mjs` (30/30) + `py_compile app.py` si hay backend. Respetar `isDemo()` y la lógica de créditos.
