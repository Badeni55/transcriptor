# Plan — Reconstrucción de producto (motor de contenido multi-marca)

> **Fecha:** 2026-05-30 · **Rama:** `bernat` · **Decisiones:** todo de una pasada · transcribir→"añadir reel manual" en Radar · multi-gen escalable.

## Visión

El producto deja de ser "utilidad con features sueltas" → **motor de contenido que se alimenta y consume créditos**, con **ecosistema de contexto creciente por marca** (coste hundido = engancha).

## Nueva arquitectura de información (navegación)

Topbar de la isla `.rs`: **[selector de marca] · Dashboard | Ideas | Guiones · 🔥streak · ⚡créditos**

1. **Dashboard (= el Radar).** Lo primero al entrar:
   - Barra **ecosistema creciente** (nivel de la marca: reels analizados, guiones, fuerza de voz) → *coste hundido*.
   - Campo **"mete una idea →"** que salta a Ideas y dispara la cadena.
   - Hero **⚡ Llena mi semana**.
   - Feed de reels de la competencia → individualmente **✨ Hazlo mío**.
   - Acción secundaria/discreta **"+ Añadir reel manual"** (= transcribir degradado: pegas URL, entra al ecosistema).
2. **Ideas (= fábrica de consumo).**
   - Input "apunta una idea rápida".
   - **✨ 5 ideas** (expande). Sobre cada idea: **5 guiones**. Sobre cada guión: **5 hooks**.
   - Botón estrella **💥 Explosión creativa** = 5×5×5 de golpe (consumo masivo).
   - Guardas los que validas → van a **Guiones**.
3. **Guiones = solo validados** (los guardados desde Ideas). Lista con estado (pendiente/grabado).
4. **Multi-marca (agencia).** Selector de marca arriba. Cada marca = su set de reels/competidores/voz/guiones/ideas + su nivel de ecosistema. Cambiar marca recarga el contexto. "Añadir marca" (gated por plan).

## Mecánica de consumo de créditos (escalable)

| Acción | Coste (demo) |
|---|---|
| ✨ Hazlo mío (1 reel→guión) | 1 |
| 5 hooks | 1 |
| carrusel / linkedin / X | 1 |
| serie de 3 | 3 |
| ⚡ Llena mi semana | N (1 por reel) |
| ✨ 5 ideas | 1 |
| 5 guiones (sobre 1 idea) | 5 |
| 5 hooks (sobre 1 guión) | 1 |
| 💥 Explosión creativa (5×5×5) | ~30 |

El "ecosistema creciente": cada generación sube el **nivel de la marca** → copy que promete reels más potentes ("nivel 3 → tus guiones suenan un 40% más a ti").

## Implementación (demo, isla `.rs` ampliada)

- **RadarLoop → app multi-vista** dentro de la isla: tabs dashboard/ideas/guiones + selector de marca + overlays existentes (gen/script/result/prompter/fillweek).
- **Demo data multi-marca:** 3 marcas mock con datasets distintos (reels, voz, nivel).
- **Demo takeover:** ocultar chrome viejo de la app (sidebar, subtabs Ideas) cuando la isla está activa → UX limpia full-screen.
- **Nav de la app:** Radar/Dashboard primero, Transcribir degradado.

## Estado
- [x] Doc (este archivo)
- [x] Demo data multi-marca (3 marcas, datasets por marca, /api/brands)
- [x] Topbar: selector marca + nav dashboard/ideas/guiones
- [x] Dashboard: ecosistema + idea-input + llena semana + feed + añadir reel manual
- [x] Ideas: fábrica multi-gen (5 ideas/5 guiones/5 hooks) + 💥 Explosión creativa + guardar
- [x] Guiones: validados
- [x] CSS nuevos componentes + takeover demo
- [x] Verificado (node --check + harness funcional multi-marca)
