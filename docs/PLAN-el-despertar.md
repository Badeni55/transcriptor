# Plan — "El despertar" (Dashboard como sistema operativo)

> Implementa los principios de `MISION-vision-producto.md` en el Dashboard.
> Fuente de verdad: la constitución. Esto es el primer salto de "herramienta" → "OS".

## Qué cambia (de feed → a "tu oportunidad de hoy")

**Antes:** Dashboard = saludo + ecosistema + idea-input + whale + **feed infinito** de reels iguales.
**Después:** Dashboard = **el despertar**:

1. **Titular del día** (momento 1): *"Mientras dormías, N reels explotaron en tu nicho."* — grande, serif, emocional. Reemplaza el bloque momentum genérico.
2. **Tu oportunidad de hoy** (principio I — una respuesta, no menú): UNA card destacada con el reel de mayor explosión — thumbnail grande, por qué importa, y CTA primario gigante **✨ Hazlo mío**. Un solo foco.
3. **Barra de ecosistema** (principio II): protagonista, framing de progreso personal ("tu voz al N%").
4. **Acciones de momentum**: idea-launcher ("mete una idea") + **⚡ Llena mi semana**, como dos jugadas claras.
5. **Más oportunidades hoy** (curaduría, no catálogo): los siguientes 3 reels en grid compacto + **"Ver todas (N) →"** que despliega el feed completo (no infinito por defecto).
6. **Transcribir**: sigue escondido como "+ añadir reel" discreto.

## Principios aplicados
- I (una respuesta): la oportunidad destacada manda; el resto es secundario.
- II (te conoce): ecosistema protagonista, copy de progreso personal.
- III/IV (valor>consumo): ver es gratis y curado; el crédito en "Hazlo mío".
- V (continuidad): cada acción lleva al loop ya existente (gen→reveal→cinta).
- Tono: limpiar copys, FOMO con calma.

## Implementación (radar-loop.js + CSS)
1. `dashboardHTML()` reescrito al layout "el despertar".
2. `opportunityHTML(reel)` — card destacada.
3. `moreOpportunitiesHTML()` — 3 + "ver todas" (estado `S.feedExpanded`).
4. Acción `expand-feed` → `S.feedExpanded=true`.
5. CSS: `.oppty` (card destacada), `.awaken` (titular), grid compacto.
6. Copys revisados (sin emojis vacíos, tono socio).

## Verificación
- node --check radar-loop.js + JS inline + app.py.
- Harness funcional: dashboard "el despertar" monta y renderiza (titular, oportunidad, ecosistema, más oportunidades) sin errores.

## Estado
- [ ] Manifiesto (MISION-vision-producto.md) ✓ ya creado
- [ ] dashboardHTML "el despertar"
- [ ] opportunityHTML + moreOpportunities + expand
- [ ] CSS
- [ ] Verificado
