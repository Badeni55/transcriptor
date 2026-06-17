# Entry point serverless para Vercel (@vercel/python).
# Sirve la app Flask de Reelscript (en DEMO_MODE) reenviando TODAS las rutas a Flask
# — incluidas /static y /profile/radar — vía el routing de vercel.json.
# NOTA: esto es solo para la demo desplegada; producción sigue con Docker/VPS.
import os
import sys

# app.py vive en la raíz del repo (un nivel por encima de /api).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  — Vercel detecta y sirve esta WSGI app

# Vercel usa `app`; esta línea solo evita warnings de "import sin usar".
__all__ = ["app"]
