# Reelscript — qué debe ser (blueprint de producto)

> Documento vivo. Norte del producto antes de cablear BBDD/internals. Lo demás
> (esquema, gating real, billing) se implementa **coherente con esto**.
> Última actualización: 2026-06-01.

---

## 1. La tesis (una frase)

**Reelscript convierte el contenido que YA funciona en tu nicho en guiones en TU
voz, listos para grabar — y aprende de lo que publicas para sonar cada vez más a
ti.** No es un transcriptor: es un **sistema operativo de contenido**. El
transcriptor es la puerta de entrada; el producto es el *loop*.

## 2. El loop (el corazón del producto)

```
ESPIAR → DETECTAR lo que explota → ROBARLO a tu voz → PUBLICAR → MEDIR
                          ▲                                          │
                          └──────── el sistema APRENDE ◀─────────────┘
```

Cada vuelta deja **contexto** (tu voz, qué funciona en tu cuenta, tu nicho). Ese
contexto es el **moat** y se hace visible en **Cerebro**. Coste hundido que se
vuelve activo creciente: cuanto más usas Reelscript, peor es irte.

**Los 4 momentos ("el despertar"):**
1. **Despiertas** — "mientras no mirabas, X reels explotaron en tu nicho".
2. **Una respuesta** — tu oportunidad de hoy (no un dashboard que pensar, una jugada que hacer).
3. **Hazlo mío** — guion en tu voz en ~1 min (hook + beats + cierre).
4. **Cierra el loop** — grabas (teleprompter) → publicas → métricas → el sistema aprende.

## 3. Las dos formas de usarlo — PLANES

El mismo producto a dos **alturas**. La diferencia no es "más features": es
**una marca vs un portfolio de marcas + equipo**.

### Plan Creador (1 marca)
- Una marca: su Radar, Ideas, Guiones, Métricas, Cerebro.
- Para el creador individual / marca personal.
- Entra directo al **Radar de su marca** (sin nivel portfolio).

### Plan Agencia (N marcas + equipo)
- **Nivel Portfolio** encima del radar: resumen de *todas* las marcas → **zoom** a una.
- Gestión de marcas (añadir/archivar), **equipo** (miembros con roles, marcas asignadas).
- Para agencias / gestores que llevan varias cuentas.

| | **Creador** | **Agencia** |
|---|---|---|
| Marcas | 1 | N (límite por plan) |
| Vista portfolio (todas las marcas) | — | ✅ fila por marca → zoom |
| Equipo / miembros | — | ✅ roles + asignación de marcas |
| Radar · Ideas · Guiones · Métricas · Cerebro | ✅ (su marca) | ✅ (por marca) |
| Créditos | mensuales | mensuales (pool de cuenta, repartible) |
| Conexión IG / círculo de aprendizaje | ✅ | ✅ por marca |

> Gating: se lee del **plan real del usuario** (`/auth/me` → `profiles.plan`).
> En demo se puede alternar para ver ambas vistas.

## 4. La experiencia — las pantallas (app "Signal")

Layout consola: **rail 64px + command bar + contenido**. Frío monocromo, acento
azul `#4f7cff`, Space Grotesk (titulares) · Hanken (UI) · JetBrains Mono (datos).
El isotipo naranja se mantiene como ancla de marca.

| Pantalla | Qué es | Creador | Agencia |
|---|---|---|---|
| **Portfolio** | Resumen de todas las marcas (fila por marca: señal top del día, explosivos, racha, voz, "Abrir →") + statbar agregada (marcas, reels, explosivos, *piden atención*) | — | ✅ pantalla de entrada |
| **Radar** (por marca) | "Señales de hoy": feature card de la oportunidad #1 + feed tabla de señales del nicho. El despertar. | ✅ | ✅ (tras zoom) |
| **Ideas** | Fábrica: idea suelta → 5 guiones → 5 hooks. "Explosión creativa". | ✅ | ✅ |
| **Guiones** | Todo lo creado aterriza aquí (robado, fábrica, llena-semana). Estados: borrador / grabado. Teleprompter. | ✅ | ✅ |
| **Métricas** | Conectar Instagram → círculo de aprendizaje (qué hooks/temas/duración funcionan **en tu cuenta**). | ✅ | ✅ por marca |
| **Cerebro** | Base de conocimiento de la marca: voz (tono, frases, estructura, duración, qué evitar), fuentes del conocimiento, competidores. El moat visible. | ✅ | ✅ por marca |
| **Equipo** | Miembros, roles, marcas asignadas. | — | ✅ |
| **Plan / Créditos / Ajustes** | Suscripción, topups, consumo, tema. | ✅ | ✅ |

**Navegación Agencia — dos niveles explícitos (macro / micro):**
- **MACRO** = rail **"Portfolio"** (icono capas): el general, todas las marcas. Siempre a un clic.
- **MICRO** = rail **"Radar"** (icono grid): la marca **activa**. Ideas/Guiones/Métricas/Cerebro operan sobre esa marca.
- Entras a una marca: "Abrir" en el Portfolio o eligiéndola en el `brand-switch`.
- Volver al macro: rail "Portfolio", `brand-switch → "Todas las marcas"`, o el breadcrumb `Todas las marcas / DAVID AUTOMATIZA / RADAR`.

**Creador:** sin "Portfolio", sin "Equipo", **sin selector de marca** (etiqueta estática). Entra directo a su Radar.

## 5. Modelo de datos (alto nivel — coherente, sin cerrar esquema aún)

```
Account (= profiles)               plan: creador | agencia · credits · stripe_sub
  └─ Brand (1 si creador, N si agencia)   nombre, color, handle IG, nivel, voz%
       ├─ TrackedCreator[]          competidores vigilados
       │     └─ Signal/Reel[]       reels detectados (explosion_score, views…)
       ├─ Idea[] → Script/Guion[]   fábrica + estados (draft/recorded/discarded)
       ├─ Publication[]             reels publicados + métricas (círculo)
       └─ VoiceProfile              tono, frases, estructura… (Cerebro)
  └─ Member[] (agency_members)      rol + marcas asignadas  [solo agencia]
  └─ CreditLedger                   consumo por acción (pool de cuenta)
```

Mapeo a lo existente: `profiles` (plan/créditos), `saved_scripts` (guiones),
`ideas`, `projects`, `assistants`, `agency_members`, `transcriptions`.

**VoiceProfile (moat) — v0.19, backend hecho:** tabla `voice_profiles` (migración en
PRE-DEPLOY). `derive_voice_profile()` extrae la voz (tono, muletillas, estructura,
duración, qué evitar, evidencia) de las transcripciones de los reels del propio
creador; **se inyecta en TODA generación** (`adapt_with_ai(..., voice=...)` → /adapt,
generate-script sync y async). **"voz al N%"** = confianza del LLM atenuada por tamaño
de muestra (cold-start honesto: 1 reel ≈ 48%, 5 ≈ 80%). API: `POST /api/voice/onboard`
(captura) + `GET /api/voice` (Cerebro/voz%). **Falta (frontend):** paso de onboarding
"pega 1-2 reels tuyos" y que Cerebro pinte la evidencia real (hoy demo).

**Loop de medición (C) — v0.19, backend hecho:** al refrescar métricas IG, cada reel
publicado se **atribuye a su guión por el CONTENIDO HABLADO** — se transcribe el audio del
reel (Apify/yt-dlp + Groq, **cacheado en `transcriptions` por url**, idempotente, tope
6/refresco) y se compara (Jaccard) con el **cuerpo del guión** `scripts.script`, no con el
caption (que casi nunca es el guion). Caption = respaldo. Sus métricas se escriben en
`scripts.views_count/…`. `compute_what_works()` saca qué supera tu mediana (hook/duración/
longitud) y **realimenta el VoiceProfile** (`what_works` → el prompt de generación lo prioriza:
el moat se compone con cada publicación). `next_series_suggestion()` alimenta Radar/email.
**Aprendizaje real en la generación:** `adapt_with_ai` inyecta tus **guiones ganadores como
molde few-shot** (`top_scripts_for_voice`, mayor `views_count`, truncados) + una **señal
negativa** de lo que te hunde (`underperformers_signal`, solo el patrón). No rompe el JSON
(hook/body/closing) — es contexto, con reafirmación del formato al final.
API: `POST /api/metrics/learn` (atribuir+aprender) + `GET /api/metrics/insights`.
**Falta (frontend):** Métricas postea los reels IG a `/learn` y pinta el resultado; Radar/email
muestran el "siguiente de la serie". Tabla `Publication` separada = opcional v2 (reels orgánicos).

**Falta consolidar (resto):** entidad **Brand** de primera clase (hoy `S.brands` vive
en front), `TrackedCreator`/`Signal`.

## 6. Economía de créditos

Coste por acción (del motor actual):

| Acción | Créditos |
|---|---|
| Robar reel → guion ("Hazlo mío") | 1 |
| 5 hooks alternativos | 1 |
| Otro formato (carrusel / LinkedIn / X) | 1 |
| Serie de 3 | 3 |
| 5 ideas | 1 |
| 5 guiones (desde idea) | 5 |
| 💥 Explosión creativa (5×5×5) | 30 |
| Llena mi semana (N reels) | N |
| Grabar (teleprompter) | 0 |

Cada plan trae X créditos/mes (suscripción) + topups (Stripe). **Agencia = pool
único de cuenta**: sin cupo por marca, sin límites por marca. Si gastas, recargas.
(No se reparte por marca de momento.)

## 7. Qué desbloquea Agencia (gating)

- Añadir/gestionar **>1 marca**.
- Vista **Portfolio** + zoom.
- **Equipo**: invitar miembros, roles, asignar marcas.
- (Posible) límites mayores: competidores vigilados, análisis IG/semana.

## 8. Estado y roadmap

- ✅ Radar "Signal" de 1 marca (rail + command bar + statbar + feature + feed tabla, azul + Space Grotesk + mono).
- ✅ Loop: Radar → Ideas → Guiones → Métricas → Cerebro (isla `.rs`).
- ✅ **Portfolio Agencia** (fila por marca → zoom) + breadcrumb "Todas las marcas / …" + statbar agregada.
- ✅ **Toggle de plan en demo** (Creador ↔ Agencia) en el command bar + deep-link `?t=<tab>` / `?b=<marca>`.
- ✅ **Zoom por marca**: al abrir una marca, statbar y feed reflejan SUS datos (en demo, variación por marca; en prod vendrá de `/api/...?brand=`).
- ✅ **Piel Signal en todas las pestañas** (Ideas/Guiones/Métricas/Cerebro): cabecera `phead` (eyebrow mono + título Space Grotesk) + `canvas`. Métricas en paleta fría.
- ✅ **Equipo** (Agencia): miembros, roles (Owner/Editor/Solo lectura), marcas asignadas, pool de créditos. UI lista; invitar/editar → pendiente de BBDD.
- ⏭️ **Gating por plan real** (creador/agencia desde `/auth/me` → `profiles.plan`). Hoy en demo arranca en Agencia; el toggle solo existe en demo.
- ⏭️ Consolidar **modelo de datos** (Brand, Signal, Publication, VoiceProfile, Member) + BBDD coherente → conectar invitar/roles, feed/cerebro reales por marca.
- ⏭️ Takeover Signal en **producción** (hoy solo en demo).

---

### Decisiones tomadas (2026-06-01)
1. **Créditos Agencia:** ✅ pool único de cuenta. Sin cupo ni límites por marca. Consumibles → recargas (topup). Suscripción trae X créditos/mes.
2. **Límites por plan:** sin límites por marca de momento.
3. **Demo:** toggle Creador ↔ Agencia para iterar ambas vistas.

### Pricing (cerrado · v0.19)
| Plan | Precio | Incluye |
|---|---|---|
| **Free** | €0 | Radar + **5 «Hazlo mío» de por vida** |
| **Creador** | **€29/mes** · €276/año | 100 créditos/mes · 1 marca · Cerebro/voz/métricas/formatos |
| **Agencia** | **€129/mes** · €1290/año | pool **500 créditos/mes** · 3 marcas · 3 asientos |

- **Add-ons (Agencia):** marca extra €35/mes · asiento extra €19/mes.
- **Topups (one-time):** 100cr/€19 · 300cr/€49 · 1000cr/€139.
- **Anual = 2 meses gratis.** 1 crédito = `COST_CENTS` (18¢) de saldo. Pool de cuenta (sin reparto por marca).
- Stripe: price IDs **por env** (`STRIPE_PRICE_*`, ver `.env.example`). Checkout manda `{plan,cycle}`, el server resuelve el price. Webhook acredita créditos al pagar y en cada renovación.
- **`pro` = legacy** (grandfathering): no se ofrece, pero suscripciones activas lo conservan.

> ⚠️ **Migración pendiente (aplicar a mano en Supabase):**
> ```sql
> ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_lifetime_uses INTEGER NOT NULL DEFAULT 0;
> ```
> Hasta aplicarla, el contador de los 5 «Hazlo mío» free no persiste (lee 0).

### Decisiones aún abiertas
- **Roles de equipo** (qué puede hacer un miembro) — más adelante.
- USD: precios de display aproximados; Stripe cobra la divisa del price.
