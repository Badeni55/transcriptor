# ROADMAP MAESTRO — ReelScript → 50k MRR (y más)
**Fecha:** 2026-06-13 · Basado en el informe de mercado (research cowork) + estado real del producto.
**Tesis:** estás solo en tu categoría → el riesgo no es la competencia, es el **churn** y la **fuga del funnel**. Se gana con **agencias + anual + un journey que no pierde**.

---

## 0. El norte y la matemática
**Objetivo: 50.000€ MRR.** No con 1.700 creadores baratos (cinta de correr, churn ~23% GRR/año en AI <50€), sino con **~670 clientes bien mezclados**:

| Segmento | Clientes | ARPU | MRR |
|---|---|---|---|
| Pro (creador) | ~380 | 25€ | 9.500€ |
| Estudio (creador pro) | ~120 | 50€ | 6.000€ |
| Agencia (+ marcas extra) | ~170 | 175€ | 29.750€ |
| Expansión/top-ups | — | — | 4.750€ |
| **Total** | **~670** | **~75€ blended** | **50.000€** |

**Dos verdades que gobiernan todo:**
1. **La agencia es el negocio** (1 agencia = 7 creadores en MRR, ~20 en LTV). El creador es el funnel y la prueba social.
2. **El anual es la defensa anti-churn** (lo divide entre 3). Ya está por defecto ✅.

---

## Planes y créditos (DEFINIDO — fuente de verdad)

| Plan | Precio (anual por defecto) | Marcas | Créditos / límites | Notas |
|---|---|---|---|---|
| **Trial** (al registrarse) | 0€ · **3 días** · sin tarjeta | 1 | **features Pro desbloqueadas, TOPE 10 créditos** | el muro salta al agotar el tope **O** a los 3 días |
| **Free** (post-trial) | 0€ | 1 | **3 análisis + 2 guiones / mes** (resetea) | watermark en exports · sin explosión |
| **Creator** ⭐ | **29€/mes** (NO se toca) | 1 | 200 créditos/mes · voz · métricas | el core/recomendado |
| **Estudio** *(nuevo)* | **59€/mes** | 3 | más créditos + calendario/prioridad | puente 29→129 |
| **Agencia** | **129€/mes** | **10** (+**10€/marca** extra) | pool de créditos · **asientos ILIMITADOS** · informe white-label PDF · aprobaciones | pricing **POR-MARCA**, no por-asiento |
| **Top-ups** | 100/€19 · 300/€49 · 1000/€139 | — | packs de créditos | expansión |

- 1 crédito = `COST_CENTS` (18). 1 «Hazlo mío»/análisis/desarrollo = 1 crédito; la **explosión** consume más.
- El límite real en runtime lo da el dict `PLANS` en `app.py` → **sincronizar con esta tabla**.
- **Anual por defecto** en todos los de pago (−30/40%). Charm pricing (terminación en 9).
- Explosión = solo planes de pago.

---

## 1. Principios (rigen cada decisión)
- **Time-to-value < 5 min.** El "aha" (señal de competidor → guion en tu voz) en la primera sesión. El día 0 decide (55% de las bajas son el día 1).
- **Una sola acción primaria por pantalla** (IDI). Reconocer > recordar.
- **Cobra DESPUÉS del primer éxito, nunca antes** (cobrar antes crea pagadores que churnean).
- **Mide todo** (no se optimiza lo que no se mide): activación, free→pago, muro, upgrade, churn.
- **Nada a medias.** Antes de cada euro de publi, QA del journey completo. Un botón que miente mata confianza.
- **El valor visible cada semana.** Si no abre la app en 2 semanas, cancela.

---

## FASE 0 — El journey no puede perder (ESTA SEMANA · casi hecho)
*Gate a todo lo demás. Sin esto, cada euro de publi se escurre.*
- [en curso] Hotfix: suggest-competitors 502 (JSON truncado), email duplicado → 409, copy del free viejo.
- [ ] QA con cuenta virgen del camino completo: registro → onboarding → primer guion → muro. Cero estados rotos.
- **KPI puerta:** registro funciona · activación ≥40% · 0 flujos a medias.

---

## FASE 1 — Activación + conversión del creador (el funnel de arriba)
*Multiplica TODO el funnel. Esfuerzo medio, impacto alto.*
1. **Free reverse-trial** (sustituir la cata de por vida): al registrarse, 7 días de **Pro completo** sin tarjeta → luego free ligero mensual (3 análisis + 2 guiones) con watermark. Llena el funnel Y da el aha completo. *Decisión tuya pendiente.*
2. **Onboarding sesión-1 pulido:** handle → competidores autodetectados → outliers + 1 guion en su voz, en <5 min. (Ya construido; falta que el auto-sugerir vaya fino tras el hotfix.)
3. **Paywall contextual** tras el primer guion exportado (hecho, verificar en QA).
4. **Herramientas gratuitas como funnel** (top-of-funnel + SEO): "analizador de hooks", "¿es viral este reel?". Captan sin registro y meten al funnel. *El playbook con el que Metricool llegó a 3M.*
- **KPIs:** activación ≥40% · free→pago ≥4%.

---

## FASE 2 — AGENCIA (el motor de MRR · ~60% del camino a 50k)
*La palanca de más impacto. Esfuerzo alto. Necesita 3 decisiones tuyas antes de construir.*
1. **Workspaces por marca/cliente** (cambiar contexto en 1 clic, datos aislados por cliente).
2. **Informe white-label PDF** — "esto funciona en el nicho de tu cliente + los guiones del mes". **La agencia lo revende a su cliente = lock-in puro.** (Motor de PDF becama ya disponible.)
3. **Pricing POR-MARCA, no por-asiento** (asientos ilimitados, +10€/marca extra). El per-seat castiga escalar; cobrar por marca es el modelo ganador (validado por research + tu instinto).
4. **Aprobaciones de cliente** (flujo de revisión).
5. **Tier Estudio €59** (cierra el salto 29→129; captura al creador que factura — el único creador que retiene bien).
- **Decisiones pendientes:** nº de marcas por tier · formato del informe white-label · modelo de aprobaciones.
- **KPIs:** mix MRR agencias ≥40% en mes 12 · churn agencias ≤3%/mes.

---

## FASE 3 — Retención + expansión (que no se vayan + gasten más)
*Cada punto de churn mensual recuperado vale ~6-8% de MRR a 12 meses. La expansión ya es ~36-40% del ARR nuevo en SaaS que escala.*
1. **Proactividad diaria concreta:** email/notif "@competidor petó con este vídeo · ×N su media". Convierte la app en hábito de calendario. (Digest ya existe; pulir contenido, no spamear vacíos.)
2. **Sugerencia de competidores** "gente de tu nicho sigue a @X" → llena el radar solo, sube el valor, loop de engagement.
3. **Cerebro gamificado a fondo:** niveles (hecho) + **rachas de publicación** (gamificación, ausente en TODO el nicho) + "llena mi semana" como reto + recompensas por conectar IG / entrenar voz / publicar.
4. **Top-ups en el momento de máxima intención** (crédito agotado tras un guion exportado) + cablear add-on **marca extra +150cr**.
5. **Cancel-flow con pausa** (salva ~20-25%) + **dunning** (recupera 20-40% del churn involuntario). Hecho ✅, monitorizar.
6. **Loop de prueba de valor (agencias):** métricas que demuestren que sus reels mejoraron → justifica seguir pagando y subir de plan.
- **KPIs:** churn creadores ≤7%/mes · % anual ≥35% de la base · expansión ≥30% del ARR nuevo.

---

## FASE 4 — Adquisición + escala hispana (CAC bajo sostenible)
*Tu foso: nadie hace viral-to-script en español. Sé el "Metricool del guion viral".*
1. **Moat hispano:** educación en español (mini-escuela de contenido viral, certificación para agencias), plantillas/datos de nichos ES/LatAm, precios en € y MXN, soporte en español.
2. **Programa de afiliados 30% recurrente** (estándar del nicho).
3. **Outreach directo a 50 agencias ES/LatAm** con el informe white-label como demo (el gancho que ninguna otra tool da).
4. **Motor de contenido orgánico** (el propio producto te dice qué grabar — úsalo para ReelScript).
- **KPI:** ~1.200-1.800 registros/mes en régimen.

---

## FASE 5 — Fiabilidad (la base, siempre activa)
*Un producto que falla a medias no convierte ni retiene.*
- Endurecer la descarga de IG (yt-dlp intermitente → reintento + cookies/Apify).
- Cerrar los P1 del doc de auditoría (botón falso ya resuelto en parte, persistencia de hooks, idioma de salida, pill de créditos).
- **Política de cancelación y reembolso limpia y ANUNCIADA** — en este nicho la queja nº1 es la facturación abusiva (Opus, Crayo); una política limpia es, en sí, un diferenciador de marketing.

---

## KPIs maestros (el cuadro de mando)
| Métrica | Objetivo |
|---|---|
| Activación (primer guion sesión 1) | ≥40% |
| Free → pago | ≥4% |
| % base en anual | ≥35% |
| Churn creadores | ≤7%/mes |
| Churn agencias | ≤3%/mes |
| Mix MRR agencias | ≥40% (mes 12) |
| Expansión (top-ups + marcas) | ≥30% del ARR nuevo |

---

## Secuencia recomendada (orden de ejecución)
1. **Fase 0** — cerrar el journey (esta semana). → ya puedes vender.
2. **Fase 1** — reverse-trial + herramientas gratis (funnel arriba).
3. **Fase 2** — Agencia + Estudio (el motor de MRR). *La que más mueve la aguja.*
4. **Fase 3** — retención/expansión (compone).
5. **Fase 4** — escala hispana (cuando el funnel convierte, métele gasolina).
6. **Fase 5** — fiabilidad, en paralelo siempre.

**Regla de oro:** no metas publi a tope hasta cerrar Fase 0 + el reverse-trial de Fase 1. Antes de eso, tráfico de prueba controlado para calibrar activación/conversión reales con PostHog/Stripe.
