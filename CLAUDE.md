# Transcriptor

SaaS que transcribe reels de Instagram (descarga con yt-dlp/Apify, transcripción con Groq Whisper) y permite adaptar el texto con LLM. Sistema de créditos y planes de pago con Stripe.

## Stack
- Python + Flask (`app.py`)
- Celery + Redis para tareas async (`tasks.py`)
- SQLite (`schema.sql`, `transcriptions.db`)
- Docker + docker-compose para local y deploy
- Templates Jinja en `templates/`, estáticos en `static/`

## Servicios externos
- **Groq** — transcripción de audio (Whisper)
- **OpenRouter** — transformación de texto ("Hazlo tuyo"), modelo configurable
- **Supabase** — auth y base de datos de usuarios/créditos
- **Stripe** — pagos, suscripciones y webhooks
- **Apify** — descarga de reels como fallback
- **Hosting** — VPS propio con Docker + Traefik (dominio `reelscript.net`)

## Variables de entorno
Requeridas: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FLASK_SECRET_KEY`.
Opcionales: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `APIFY_TOKEN`, `STRIPE_TOPUP_PRICE`, `REDIS_URL`.

## Ejecución
- **Local**: `docker compose up` (levanta app + worker + Redis). La app escucha en `:5555`.
- **Deploy**: push a `prod` → crear release/tag → GitHub Action conecta por SSH al VPS, hace `docker compose up -d --build`.

## Convenciones
- Ramas: `dev` (trabajo) → `prod` (estable, default). Tags semver (`v0.x.y`) al pasar a prod.
- Commits estilo conventional: `feat:`, `fix:`, `chore:`, `refactor:`.
- No tocar `transcriptions.db` ni `venv/` ni `__pycache__/`.
- Cambios en `schema.sql` → avisar antes, implican migración.
- Cambios en `requirements.txt` → avisar antes.

## Operación
- Respuestas directas, sin preámbulos.
- Resultado primero, explicación solo si pregunto.
- No resumas lo que acabas de hacer.
- Rutas específicas con `@archivo`, no explores el repo entero.
- Antes de tareas con >3 pasos o que toquen varios archivos: plan corto primero, ejecución después.
- Errores: muestra el error real, no lo parafrasees.
- No instales dependencias sin preguntar.
