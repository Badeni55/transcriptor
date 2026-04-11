# Transcriptor

## Stack
- Python + Flask (`app.py`)
- Celery + Redis para tareas async (`tasks.py`)
- SQLite (`schema.sql`, `transcriptions.db`)
- Docker + docker-compose para local y deploy
- Templates Jinja en `templates/`, estáticos en `static/`

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
