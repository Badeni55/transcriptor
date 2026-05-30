# Estrategia: pivote de "transcriptor" a "Radar de competencia"

> **Fecha:** 2026-05-30
> **Rama:** `bernat`
> **Autor:** Bernat + Claude
> **Estado:** visión aprobada → plan de 3 fases → en ejecución
> **Propósito:** documento maestro del pivote de producto. Si se pierde el contexto de la sesión, este doc reconstruye el porqué, el qué y el cómo.

---

## 0. Problema que resolvemos

Nadie está pagando. No hay suscripciones. La causa raíz **no es el pricing ni el marketing**, es la **propuesta de valor**:

- La app está construida como **transcriptor de reels** → es una **utilidad de un solo uso** (commodity, lo hace ChatGPT gratis).
- El dashboard incita a **transcribir**, que es justo lo que NO monetiza de forma recurrente.
- Es un **nice-to-have**: lo usas 3 veces y lo olvidas. No hay razón para pagar 20€/mes.

**Nadie paga recurrente por una utilidad. Sí pagan por no quedarse nunca en blanco.**

---

## 1. El reframe (North Star)

> De **"transcriptor de reels"** → a **"tu sala de máquinas de contenido: lo que petó en tu nicho esta semana, convertido en guiones con TU voz, listos para grabar."**

El bucle de hábito que justifica el pago recurrente:

```
tus competidores publican cada día
      ↓
tú necesitas una idea cada día  (el dolor real: la página en blanco)
      ↓
la app te la sirve masticada y en tu voz
      ↓
pagas para no parar nunca
```

**Métrica norte nueva:** guiones-en-tu-voz generados por semana.
**NO** transcripciones. Hoy la app mide y celebra justo lo que no monetiza.

---

## 2. El nuevo flujo central — "el loop"

Todo gira en torno a 4 pasos, cada uno a un click del siguiente:

```
  ESPÍA            ROBA              HAZLO TUYO          GRABA
  Radar de    →   "Este petó,   →   Guión en tu     →   Teleprompter
  competencia      róbalo"           voz/formato         + marcar grabado
  (FEED, home)     (1 click)         (1 CRÉDITO)         (cierra bucle)
```

- **ESPÍA** = la home es un **feed de reels de tus competidores ordenados por lo que está explotando** (views/likes relativos a la media del creador). No abres a "transcribe una URL"; abres a "mira lo que petó en tu nicho mientras dormías".
- **ROBA** = en cada reel, botón gigante **"Hazlo mío"**. Un click.
- **HAZLO TUYO** = aquí se quema el crédito. Genera el guión adaptado a tu voz y formato. **El momento de valor = el momento de pago.**
- **GRABA** = teleprompter + `recording_status`. Cierra el bucle y devuelve al feed a por la siguiente.

---

## 3. Lo que YA está construido (esto es re-arquitectura, no greenfield)

El motor existe; está enterrado en un sub-tab "Ideas > Competidores". El 80% del trabajo es **IA/UX y jerarquía**, no backend nuevo.

| Pieza del motor | Ya existe en |
|---|---|
| Trackear competidores | `user_tracked_creators`, `creators_global` |
| Scrape async de sus reels | `scrape_creator_task` (tasks.py), `creator_reels_global` |
| Transcript caché compartido entre usuarios | `transcript_status` en `creator_reels_global` |
| Generar guión desde reel rival | `POST /api/competitors/reels/<id>/generate-script` (app.py ~5044) |
| Adaptar a TU voz | `assistants` + `assistant_name` en `scripts` |
| Favoritos / guardar como idea | `user_favorite_reels`, `POST .../save-as-idea` |
| Teleprompter + marcar grabado | `scripts.recording_status` (pending/recorded/discarded) |
| Emails de re-engagement | `emails.py` (secuencias día 1 / día 7, vía Resend) |
| Generación async + locks anti-race | `generate_script_competitor_task`, `script_generation_locks` |

---

## 4. Reconstrucción de la home

**Hoy:** abre incitando a transcribir → callejón sin salida monetizable.

**Nuevo: la home ES el Radar.**

- Feed de tarjetas de reels de competidores, ordenadas por **"índice de explosión"** = cuánto supera ese reel la media de views/likes del creador.
- Cada tarjeta: thumbnail, creador, métricas, badge **"🔥 3x su media"**.
- Acción primaria en cada tarjeta: **"Hazlo mío"**.
- Barra de estado emocional arriba: *"Esta semana tus 5 competidores publicaron 23 reels. 4 explotaron. Aún no has robado ninguno."* ← FOMO.
- Empty state (sin competidores): *"¿A quién quieres espiar?"* → añadir 1 competidor = primer wow inmediato (scrape en vivo, ya async).

---

## 5. Dónde se queman créditos — a clicks de distancia

El feed es **gratis** (engancha); cada acción sobre un reel **cuesta**:

| Acción | Coste | Por qué pagan |
|---|---|---|
| Ver el feed / métricas competencia | gratis | el gancho, el FOMO |
| **"Hazlo mío"** → guión en tu voz | 1 crédito | la acción estrella |
| "5 variantes de hook" | créditos | el hook es el 80% del resultado |
| "Conviértelo en carrusel / LinkedIn / X" | créditos | **multiplica formatos** de 1 idea |
| "Genérame una serie de 3" | créditos | continuidad de contenido |
| **"Llena mi semana"** (7 guiones de golpe) | 7 créditos | la acción ballena |

**Clave psicológica:** el momento de valor (ver el reel ganador + idea) es barato/gratis; el artefacto accionable (guión en tu voz listo para grabar) cuesta. Te enganchas al feed, pagas para actuar.

---

## 6. El moat: tu voz (y por qué reframea la transcripción)

Lo que separa esto de "pídeselo a ChatGPT": el guión sale **en tu voz, tu formato, tu estructura** — aprendida de tus propios reels transcritos + tus asistentes.

Esto da por fin **propósito a transcribir tus propios reels**: ya no es una utilidad suelta, es **entrenar tu modelo de voz**. *"Cuantos más reels tuyos transcribes, mejor suenan los guiones robados."* La transcripción pasa de ser el producto a ser **combustible del motor**.

---

## 7. Por qué vuelven cada día (FOMO / hábito)

- **Email diario/semanal "Lo que petó en tu nicho"** (infra `emails.py` + Resend ya existe): 3 reels que explotaron + botón "Hazlo mío". Puede ser el motor de retención por sí solo.
- **Badge "explotó"** en reels que superan X veces la media del creador.
- **Racha**: *"Llevas 5 días robando ideas, no la cagues hoy."*
- **Push/notif**: *"@competidor acaba de publicar un reel que ya tiene 3x su media."*

---

## 8. Onboarding nuevo (activación → wow → primer crédito)

1. *"¿De qué va tu contenido?"* → 1 pregunta.
2. *"¿A quién admiras / quieres superar?"* → añade 1-3 competidores. **Scrape en vivo** (ya async).
3. **Wow inmediato**: *"Mira, estos 3 reels suyos están petando ahora mismo."*
4. *"Pega 1 reel tuyo para que aprenda a sonar como tú"* (transcripción = onboarding del moat).
5. **"Hazlo mío" en un reel rival = primer crédito gratis regalado.** Sienten la magia antes de pagar.

---

## 9. Pricing / packaging

- **Free** = ver el Radar completo (FOMO máximo) + 1-2 "Hazlo mío" de regalo. Ven exactamente lo que se pierden.
- **Pagar** = transformar sin límite práctico + más competidores trackeados + formatos múltiples + email diario.
- El gating actual (`hasPaidPlan` en JS, `PLANS` en app.py) ya existe; cambia **QUÉ se gatea**: hoy se gatean features sueltas, mañana se gatea **la acción de robar**.

---

## 10. Plan de build — 3 fases

### FASE 1 — Mover el centro de gravedad (el Radar como home)
**Objetivo:** que abrir la app = ver el feed de competidores ordenado por explosión, con "Hazlo mío" como acción primaria. Máximo impacto en propuesta de valor, mínimo backend nuevo.

- **Backend:**
  - Endpoint de feed unificado del Radar: reels de todos los competidores trackeados del usuario, con **índice de explosión** calculado (views del reel / media de views del creador). Reusar/extender `GET /api/tracked-creators/reels` (~app.py:5818).
  - Ordenación por explosión + filtros (recientes / más explosivos).
  - Stats de cabecera: nº competidores, nº reels esta semana, nº "explotaron", nº robados.
- **Frontend (`index.html`):**
  - Nueva vista home/overview = Radar feed (hoy overview incita a transcribir).
  - Tarjeta de reel con badge de explosión + botón "Hazlo mío" → dispara `generate-script` (flujo ya existente, async con polling).
  - Empty state de captación de competidores.
  - Reordenar jerarquía de tabs: Radar primero; Transcribir pasa a secundario / "entrenar mi voz".
- **Riesgo/cuidado:** `index.html` ~22k líneas. Ediciones quirúrgicas. No romper el gating por plan (`display:none` + JS).

### FASE 2 — Email diario "Lo que petó en tu nicho"
**Objetivo:** retención. Traerlos de vuelta cada día con infra existente.

- **Backend:**
  - Nueva plantilla en `emails.py` (estilo de las existentes, bifurcación día1/día7).
  - Tarea Celery Beat diaria: por usuario con competidores, calcular top-3 reels que explotaron desde el último envío → email con "Hazlo mío" deep-links.
  - Respetar `email_marketing`, rate-limit y unsubscribe (ya implementados).
- **Frontend:** deep-link desde email a la acción "Hazlo mío" de un reel concreto.

### FASE 3 — Multiplicar formatos + "Llena mi semana"
**Objetivo:** subir el techo de consumo de créditos.

- **Backend:**
  - Variantes de transformación: carrusel / LinkedIn / X-thread / serie de 3, sobre `adapt_with_ai` (app.py ~1532) con prompts por formato.
  - "Llena mi semana": batch de N guiones desde N reels explosivos (cobra N créditos, async).
- **Frontend:** selector de formato en "Hazlo mío"; CTA "Llena mi semana" en el Radar.

---

## 11. Decisiones / notas abiertas

- **Índice de explosión:** definición v1 = `views_reel / media_views_ultimos_N_reels_del_creador`. Si falta histórico, fallback a likes o a ranking simple por views. Marcar badge solo si ≥ 2x.
- **Coste "Hazlo mío":** mantener 18¢ / 1 unidad monthly (ya implementado en `generate-script`). No tocar pricing en Fase 1.
- **Free taste:** decidir en Fase 1 si free ve el Radar completo o parcial. Recomendado: completo (FOMO) + 1-2 transformaciones gratis.
- **Deuda técnica heredada a vigilar** (de la auditoría): cooldowns/guards in-memory burlables en multi-worker; `/adapt` rechaza free mientras `/transcribe` no; plan-check no valida `stripe_subscription_id`.

---

## 12. Estado de ejecución

- [x] Visión aprobada (2026-05-30)
- [x] Documento de estrategia (este archivo)
- [ ] Fase 1 — Radar como home
- [ ] Fase 2 — Email diario
- [ ] Fase 3 — Formatos + Llena mi semana
