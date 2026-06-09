# Pre-producción / Restablecimiento — qué revisar antes de lanzar

> **Fecha:** 2026-05-30
> **Rama:** `bernat`
> **Para qué sirve:** lista exacta de todo lo tocado en local que **NO** debe ir a producción tal cual, lo que **SÍ** va y qué implica, y el checklist de despliegue. Si vuelves a esto dentro de semanas, esto te dice qué reconfigurar.

---

## 🔴 SOLO LOCAL — nunca debe llegar a producción

| Cosa | Estado | Acción antes de prod |
|---|---|---|
| **`DEMO_MODE`** (bypass de login + datos falsos) | Activado en local con `DEMO_MODE=1` | **En el VPS NO setear `DEMO_MODE`** (o `=0`). Default = off. Si está on en prod, **cualquiera entra sin login con datos falsos**. ⚠️ CRÍTICO. |
| **`.env`** (en la carpeta del transcriptor) | Creado en local, **gitignored** | No commitear nunca. Producción usa su propio `.env` en el VPS. |
| **`venv/`** | Creado en local, **gitignored** | Local only. Producción usa Docker. |
| **Servidor gunicorn local en `:5555`** | Corriendo en background | Solo para ver/testear en local. No tiene nada que ver con el deploy. |

### Cómo sé que DEMO_MODE no afecta a prod
- Es un flag de entorno: `DEMO_MODE = os.environ.get("DEMO_MODE","") == "1"` (app.py). Si no está la env var → `False`.
- El bloque JS de demo en `index.html` está envuelto en `{% if demo %}…{% endif %}`: **en prod no se emite ni un byte**.
- El bypass de auth (`require_auth_html`) solo se salta `if DEMO_MODE:` → en prod el login funciona igual que siempre.

---

## 🟢 SÍ va a producción (committeado) — y qué implica cada cosa

Estos son cambios de **producto** intencionales (commits de las 3 fases del Radar). Revisar, no revertir:

| Cambio | Commit | Implicación en prod |
|---|---|---|
| **Fase 1 — Radar como home** (índice de explosión, `/api/radar/stats`, nav, sort, badge, barra FOMO, "Hazlo mío") | `47dc172` | La **home por defecto pasa de Dashboard a Radar**. Decisión de producto: confirmar que es lo que quieres antes de mergear. Reversible cambiando `profTab("radar")` → `profTab("overview")` en `openProfile()`. |
| **Fase 2 — email diario "Lo que petó en tu nicho"** | `ed2f4d7` | **Requiere que Celery Beat esté corriendo** (ya corre en docker-compose con el worker). Se registra tarea `send_radar_digests` a las **08:00 UTC**. Manda emails reales vía Resend → asegúrate de que `RESEND_API_KEY` está en el `.env` de prod (ya debería). |
| **Fase 3 — "Llena mi semana"** (`/api/radar/fill-week/candidates` + botón) | `286ea5d` | Reusa el endpoint single-reel. Sin nuevas dependencias. |
| `from celery.schedules import crontab` en `tasks.py` | `ed2f4d7` | Celery ya está instalado; el import existe en la lib. Sin acción. |
| `require_auth_html` con guard `if DEMO_MODE` | (demo) | No-op en prod (DEMO_MODE off). |

### Lo que NO cambió (tranquilidad)
- **`schema.sql`**: sin cambios → **no hay migración de Supabase**.
- **`requirements.txt`**: sin cambios → no hay deps nuevas.
- Ninguna variable de entorno **nueva obligatoria**. `DEMO_MODE` es opcional y solo local.

---

## ✅ Checklist de despliegue a producción

1. **Confirmar `DEMO_MODE` NO está en el `.env` del VPS** (ni en docker-compose). ⚠️ Lo más importante.
2. Merge de `bernat` → `dev` → `prod` (o el flujo que uses). El deploy se dispara con push a `prod`.
3. El GitHub Action hace `git reset --hard origin/prod && docker compose up -d --build` → levanta app + worker + redis + traefik.
4. **Verificar que el worker+beat arrancan** (el email diario depende del beat): `docker compose logs worker | grep -i beat`.
5. **Smoke test post-deploy:**
   - `curl -I https://reelscript.net/es/` → `200`.
   - Login real → la home abre en el **Radar**.
   - Si tienes competidores trackeados: ver feed con badges de explosión, barra FOMO, botón "Hazlo mío" y "Llena mi semana".
6. **Probar con datos reales antes de confiar** (esto NO se pudo testear en local, solo con mocks):
   - "Hazlo mío" sobre un reel real → genera guion y cobra bien.
   - "Llena mi semana" → genera N guiones, cobra N.
   - (Opcional) Disparar el digest manual una vez: `docker compose exec worker python -c "from tasks import send_radar_digests; print(send_radar_digests())"`.

---

## ▶️ Cómo volver a levantar el MODO DEMO en local (para seguir el restyle)

```bash
cd /Users/bernatcasanas/Desktop/Claudito/raw/becama-saas/reelscript
DEMO_MODE=1 GROQ_API_KEY=d SUPABASE_URL=https://d.supabase.co SUPABASE_SERVICE_KEY=d \
  STRIPE_SECRET_KEY=sk STRIPE_WEBHOOK_SECRET=w FLASK_SECRET_KEY=s APP_URL=http://localhost:5555 \
  ./venv/bin/python -m gunicorn -b 127.0.0.1:5555 -w 1 -k gevent app:app
```
Abrir **http://127.0.0.1:5555/es/** → entra directo al Radar con usuario de prueba "creator" y datos falsos. No necesita Supabase ni claves reales.

Datos demo (4 competidores, 9 reels con explosión, 2 guiones) viven en el bloque `{% if demo %}` del `<head>` de `templates/index.html`. Para añadir/cambiar mocks (más reels, otros paneles), edita ahí el shim de `fetch`.

---

## 📍 Estado de archivos tocados

- `app.py` — `DEMO_MODE` flag, `demo` en context processor, guard en `require_auth_html` + (Fases 1·3) endpoints Radar.
- `tasks.py` — (Fase 2) tarea Beat `send_radar_digests` + import crontab.
- `emails.py` — (Fase 2) `send_radar_digest`.
- `templates/index.html` — bloque demo `{% if demo %}` en head + (Fases 1·3) UI Radar.
- `docs/ESTRATEGIA-pivote-radar.md` — visión + plan.
- `docs/PRE-PRODUCCION-restablecimiento.md` — este archivo.
- `.env`, `venv/` — locales, **gitignored**, no se suben.
