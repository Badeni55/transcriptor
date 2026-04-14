"""Transcriptor — Flask app con Supabase, créditos y Apify."""

import json
import logging
import os
import re
import sys
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone
from functools import wraps

import requests
import yt_dlp
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, redirect, render_template, request, session

load_dotenv()

# ── Validate required env vars ───────────────────────────────────────────────

REQUIRED_ENV_VARS = [
    "GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "FLASK_SECRET_KEY",
]
missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
if missing:
    print(f"[FATAL] Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

from supabase import create_client, Client  # noqa: E402 (after dotenv)

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
app.permanent_session_lifetime = timedelta(days=30)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True

# ── Config ───────────────────────────────────────────────────────────────────

GROQ_API_KEY          = os.environ.get("GROQ_API_KEY", "")
GROQ_URL              = "https://api.groq.com/openai/v1/audio/transcriptions"

# OpenRouter — para transformaciones de texto ("Hazlo tuyo")
OPENROUTER_API_KEY    = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL        = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL      = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-pro-preview-03-25")
SUPABASE_URL          = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
APIFY_TOKEN           = os.environ.get("APIFY_TOKEN", "")
STRIPE_SECRET_KEY     = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

FREE_DAILY_ANON  = 5   # transcripciones gratis para anónimos
FREE_DAILY_USER  = 5   # transcripciones gratis para registrados
FREE_DAILY_ADAPT = 5   # adaptaciones gratis para registrados (hazlo tuyo)
COST_CENTS       = 18   # $0.18 por uso de pago (~7 usos por $1.29)

UNLIMITED_EMAILS = {"davidmiragito@gmail.com"}  # sin límite ni coste

# ── Matriz de planes (fuente de verdad) ──────────────────────────────────────
PLANS = {
    "free": {
        "monthly_uses": 0,            # usa daily_free
        "daily_free": 5,
        "scripts_max": 5,
        "projects_max": 1,
        "assistants_max": 0,
        "history_days": None,          # persistente
        "seats": 1,
        "priority": False,
        "support": None,
    },
    "basic": {
        "monthly_uses": 30,
        "daily_free": 0,
        "scripts_max": None,           # ilimitado
        "projects_max": None,
        "assistants_max": 1,
        "history_days": None,
        "seats": 1,
        "priority": False,
        "support": "email",
    },
    "pro": {
        "monthly_uses": 100,
        "daily_free": 0,
        "scripts_max": None,
        "projects_max": None,
        "assistants_max": 5,
        "history_days": None,
        "seats": 1,
        "priority": False,
        "support": "email",
    },
    "agency": {
        "monthly_uses": 250,           # base, +50 por asiento extra
        "daily_free": 0,
        "scripts_max": None,
        "projects_max": None,
        "assistants_max": None,
        "history_days": None,
        "seats": 2,                    # 2 asientos incluidos
        "uses_per_seat": 50,
        "priority": True,
        "support": "email+chat",
    },
}

# Derivados para compatibilidad con código existente
PLAN_LIMITS = {p: v["monthly_uses"] or None for p, v in PLANS.items()}
ASSISTANT_LIMITS = {p: v["assistants_max"] for p, v in PLANS.items()}

# Topup: price ID de Stripe (one-time, multi-currency)
STRIPE_TOPUP_PRICE = os.environ.get("STRIPE_TOPUP_PRICE", "")

db: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

try:
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    STRIPE_OK = bool(STRIPE_SECRET_KEY)
except ImportError:
    STRIPE_OK = False

# ── Rate limiting ────────────────────────────────────────────────────────────

from flask_limiter import Limiter  # noqa: E402
from flask_limiter.util import get_remote_address  # noqa: E402

limiter = Limiter(app=app, key_func=get_remote_address, default_limits=["200 per hour"], storage_uri="memory://")


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"error": "Too many requests. Please slow down.", "retry_after": str(e.description)}), 429


# ── Security headers ────────────────────────────────────────────────────────

@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Server"] = "ReelScript"
    return response


# ── Input validators ────────────────────────────────────────────────────────

def validate_url(url):
    if not url:
        return "URL is required"
    if len(url) > 500:
        return "URL too long"
    if not url.startswith(("https://www.instagram.com/", "https://instagram.com/",
                           "https://www.tiktok.com/", "https://vm.tiktok.com/",
                           "https://vt.tiktok.com/")):
        return "Only Instagram and TikTok URLs are supported"
    return None


def validate_adapt(data):
    text = (data.get("text") or "").strip()
    if not text:
        return "Text is required"
    if len(text) > 10000:
        return "Text too long (max 10,000 characters)"
    style = (data.get("style") or "").strip()
    valid = {"viral", "divertido", "linkedin", "storytelling", "hooks", "custom"}
    if style and style not in valid and not data.get("assistant_id"):
        return f"Invalid style"
    if len(data.get("custom_prompt") or "") > 2000:
        return "Custom prompt too long (max 2,000 characters)"
    return None


def validate_email(email):
    return bool(re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email))


# ── Auth helpers ──────────────────────────────────────────────────────────────

def current_user() -> dict | None:
    return session.get("user")


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "No autenticado"}), 401
        return f(*args, **kwargs)
    return wrapper


def get_profile(user_id: str) -> dict:
    """Devuelve el perfil del usuario, reseteando los contadores diarios si hace falta."""
    result = db.table("profiles").select("*").eq("id", user_id).execute()
    if not result.data:
        db.table("profiles").insert({"id": user_id}).execute()
        return {"id": user_id, "credits_cents": 0,
                "free_used_today": 0, "free_adapt_used_today": 0,
                "free_reset_date": str(date.today()),
                "free_adapt_reset_date": str(date.today())}
    profile = result.data[0]
    updates = {}
    if profile.get("free_reset_date") != str(date.today()):
        updates["free_used_today"] = 0
        updates["free_reset_date"] = str(date.today())
        profile["free_used_today"] = 0
    if profile.get("free_adapt_reset_date") != str(date.today()):
        updates["free_adapt_used_today"] = 0
        updates["free_adapt_reset_date"] = str(date.today())
        profile["free_adapt_used_today"] = 0
    if updates:
        db.table("profiles").update(updates).eq("id", user_id).execute()
    # Garantizar que los campos existen aunque la columna sea nueva
    profile.setdefault("free_adapt_used_today", 0)
    profile.setdefault("free_adapt_reset_date", str(date.today()))
    return profile


def get_client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "unknown")


def get_or_reset_ip_usage(ip: str) -> dict:
    today = str(date.today())
    result = db.table("ip_usage").select("*").eq("ip", ip).execute()
    if not result.data:
        db.table("ip_usage").insert({"ip": ip, "used_today": 0, "reset_date": today}).execute()
        return {"ip": ip, "used_today": 0}
    usage = result.data[0]
    if usage["reset_date"] != today:
        db.table("ip_usage").update({"used_today": 0, "reset_date": today}).eq("ip", ip).execute()
        usage["used_today"] = 0
    return usage


def check_monthly_limit(profile: dict) -> tuple[bool, str | None]:
    """Comprueba si el usuario con plan de pago ha superado su límite mensual.
    Resetea el contador si toca. Devuelve (ok, error_msg)."""
    plan = profile.get("plan", "free")
    limit = PLAN_LIMITS.get(plan)
    if limit is None:
        return True, None  # plan free usa otro sistema

    # Resetear si toca
    now = datetime.now(timezone.utc)
    reset_at = profile.get("usage_reset_at")
    if reset_at:
        if isinstance(reset_at, str):
            try:
                reset_dt = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            except ValueError:
                reset_dt = now
        else:
            reset_dt = reset_at
        if now >= reset_dt:
            next_reset = (now.replace(day=1) + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=timezone.utc)
            db.table("profiles").update({
                "monthly_usage": 0,
                "usage_reset_at": next_reset.isoformat(),
            }).eq("id", profile["id"]).execute()
            profile["monthly_usage"] = 0

    usage = profile.get("monthly_usage", 0)
    if usage >= limit:
        return False, f"Has alcanzado el límite de {limit} transcripciones/mes de tu plan. Mejora tu plan para continuar."
    return True, None


# ── Download / transcription helpers ─────────────────────────────────────────

def detect_platform(url: str) -> str:
    if "instagram.com" in url:
        return "instagram"
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    if "tiktok.com" in url:
        return "tiktok"
    return "otro"


def _ytdlp(url: str, output_dir: str) -> str:
    out = os.path.join(output_dir, "audio")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "128"}],
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return out + ".mp3"


def _apify_instagram(url: str, output_dir: str) -> str:
    """Descarga un reel de Instagram vía Apify y devuelve la ruta del mp3."""
    actor_url = (
        f"https://api.apify.com/v2/acts/apify~instagram-scraper"
        f"/run-sync-get-dataset-items?token={APIFY_TOKEN}&memory=256"
    )
    resp = requests.post(
        actor_url,
        json={"directUrls": [url], "resultsLimit": 1},
        timeout=120,
    )
    resp.raise_for_status()
    items = resp.json()
    if not items:
        raise ValueError("Apify no devolvió resultados para esta URL")

    item = items[0]
    video_url = item.get("videoUrl") or item.get("video_url")
    if not video_url:
        raise ValueError("No se encontró videoUrl en la respuesta de Apify")

    video_path = os.path.join(output_dir, "video.mp4")
    with requests.get(video_url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(video_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

    mp3_path = os.path.join(output_dir, "audio.mp3")
    ret = os.system(f'ffmpeg -i "{video_path}" -vn -ar 44100 -ac 2 -b:a 128k "{mp3_path}" -y -loglevel quiet')
    if ret != 0 or not os.path.exists(mp3_path):
        raise ValueError("Error al convertir vídeo a audio con FFmpeg")
    return mp3_path


def download_audio(url: str, output_dir: str, platform: str) -> str:
    """Intenta Apify para Instagram; yt-dlp como fallback y para el resto."""
    if platform == "instagram" and APIFY_TOKEN:
        try:
            return _apify_instagram(url, output_dir)
        except Exception:
            pass  # fallback silencioso
    return _ytdlp(url, output_dir)


def transcribe_with_groq(audio_path: str, language: str | None = None) -> str:
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
    with open(audio_path, "rb") as f:
        files = {"file": ("audio.mp3", f, "audio/mpeg")}
        data = {"model": "whisper-large-v3", "response_format": "json"}
        if language:
            data["language"] = language
        resp = requests.post(GROQ_URL, headers=headers, files=files, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()["text"]


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route("/auth/register", methods=["POST"])
@limiter.limit("5 per minute;20 per hour")
def auth_register():
    body = request.get_json()
    email    = (body.get("email") or "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email y contraseña requeridos"}), 400
    if len(password) < 6:
        return jsonify({"error": "La contraseña debe tener mínimo 6 caracteres"}), 400

    try:
        result = db.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user = result.user
        session.permanent = True
        session["user"] = {"id": str(user.id), "email": user.email}
        # Save terms acceptance + affiliate ref
        upsert_data = {"id": str(user.id), "terms_accepted_at": datetime.now(timezone.utc).isoformat()}
        affiliate_ref = body.get("affiliate_ref", "").strip()
        if affiliate_ref:
            upsert_data["affiliate_ref"] = affiliate_ref
        db.table("profiles").upsert(upsert_data).execute()
        return jsonify({"ok": True, "email": user.email})
    except Exception as e:
        msg = str(e).lower()
        if "already registered" in msg or "already exists" in msg or "duplicate" in msg:
            return jsonify({"error": "Este email ya está registrado"}), 409
        return jsonify({"error": "Error al crear la cuenta"}), 500


@app.route("/auth/login", methods=["POST"])
@limiter.limit("10 per minute;30 per hour")
def auth_login():
    body = request.get_json()
    email    = (body.get("email") or "").strip().lower()
    password = body.get("password", "")

    try:
        # Llamada directa a la REST API de GoTrue (funciona con service role key)
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Email o contraseña incorrectos"}), 401
        data = resp.json()
        user = data["user"]
        session.permanent = True
        session["user"] = {"id": user["id"], "email": user["email"]}
        return jsonify({"ok": True, "email": user["email"]})
    except Exception:
        return jsonify({"error": "Error de conexión"}), 500


@app.route("/auth/forgot-password", methods=["POST"])
@limiter.limit("3 per minute;10 per hour")
def forgot_password():
    body = request.get_json() or {}
    email = (body.get("email") or "").strip().lower()
    if not email or not validate_email(email):
        return jsonify({"error": "Valid email required"}), 400
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/recover",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Content-Type": "application/json"},
            json={"email": email, "redirect_to": request.host_url.rstrip("/") + "/reset-password"},
            timeout=10,
        )
        if resp.status_code not in (200, 204):
            return jsonify({"error": "Could not send reset email"}), 500
        return jsonify({"ok": True})
    except Exception:
        logger.error("Forgot password error", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/auth/reset-password", methods=["POST"])
@limiter.limit("5 per minute")
def reset_password():
    body = request.get_json() or {}
    access_token = (body.get("access_token") or "").strip()
    new_password = body.get("password", "")

    if not access_token:
        return jsonify({"error": "Token required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    try:
        resp = requests.put(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"password": new_password},
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Invalid or expired token"}), 400
        return jsonify({"ok": True})
    except Exception:
        logger.error("Reset password error", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/auth/google")
def auth_google():
    """Redirect to Google OAuth via Supabase."""
    redirect_to = request.host_url.rstrip("/")
    url = f"{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to={redirect_to}"
    return jsonify({"url": url})


@app.route("/auth/callback", methods=["POST"])
def auth_callback():
    """Exchange OAuth access_token for a Flask session."""
    body = request.get_json() or {}
    access_token = (body.get("access_token") or "").strip()
    if not access_token:
        return jsonify({"error": "Token required"}), 400

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Invalid token"}), 401

        user = resp.json()
        session.permanent = True
        session["user"] = {"id": user["id"], "email": user.get("email", "")}

        # Ensure profile exists
        prof = db.table("profiles").select("id").eq("id", user["id"]).execute()
        if not prof.data:
            db.table("profiles").insert({"id": user["id"]}).execute()

        return jsonify({"ok": True, "email": user.get("email", "")})
    except Exception as e:
        logger.error(f"OAuth callback error: {e}", exc_info=True)
        return jsonify({"error": "Authentication failed"}), 500


@app.route("/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/auth/me")
def auth_me():
    user = current_user()
    if not user:
        return jsonify({"user": None, "free_daily_anon": FREE_DAILY_ANON})
    profile = get_profile(user["id"])
    plan = profile.get("plan", "free")
    return jsonify({
        "user": user,
        "credits_cents":   profile["credits_cents"],
        "free_used_today": profile["free_used_today"],
        "free_daily_limit": FREE_DAILY_USER,
        "plan": plan,
        "monthly_usage": profile.get("monthly_usage", 0),
        "monthly_limit": PLAN_LIMITS.get(plan),
        "avatar_seed": profile.get("avatar_seed", "default"),
        "has_stripe_sub": bool(profile.get("stripe_subscription_id")),
    })


# ── Transcription route ───────────────────────────────────────────────────────

from tasks import transcribe_task  # noqa: E402

@app.route("/transcribe", methods=["POST"])
@limiter.limit("10 per minute;50 per hour;200 per day")
def transcribe():
    body = request.get_json() or {}
    url = (body.get("url") or "").strip()
    language = (body.get("language") or "").strip() or None

    err = validate_url(url)
    if err:
        return jsonify({"error": err}), 400
    if not GROQ_API_KEY:
        return jsonify({"error": "Service unavailable"}), 500

    platform = detect_platform(url)
    if platform == "youtube":
        return jsonify({
            "error": "YouTube estará disponible próximamente en el plan de pago. "
                     "Por ahora, puedes transcribir reels de Instagram y vídeos de TikTok."
        }), 400

    user = current_user()

    # ── Comprobar límites / saldo ─────────────────────────────────────────
    if user and user.get("email", "").lower() in UNLIMITED_EMAILS:
        pass
    elif user is None:
        ip = get_client_ip()
        ip_usage = get_or_reset_ip_usage(ip)
        if ip_usage["used_today"] >= FREE_DAILY_ANON:
            return jsonify({
                "error": f"Límite diario alcanzado ({FREE_DAILY_ANON} gratis/día sin cuenta). "
                         "Regístrate para obtener más transcripciones gratuitas."
            }), 429
    else:
        profile = get_profile(user["id"])
        user_plan = profile.get("plan", "free")
        if user_plan in ("basic", "pro", "agency"):
            ok, err_msg = check_monthly_limit(profile)
            if not ok:
                return jsonify({"error": err_msg}), 429
        elif profile["credits_cents"] >= COST_CENTS:
            pass
        elif profile["free_used_today"] < FREE_DAILY_USER:
            pass
        else:
            return jsonify({
                "error": f"Has usado tus {FREE_DAILY_USER} transcripciones gratuitas de hoy. "
                         "Recarga saldo para continuar sin límite."
            }), 429

    # ── Actualizar contador antes de encolar ──────────────────────────────
    is_unlimited = user and user.get("email", "").lower() in UNLIMITED_EMAILS
    cost_cents = 0

    if user is None:
        db.table("ip_usage").update(
            {"used_today": ip_usage["used_today"] + 1}
        ).eq("ip", ip).execute()
    elif not is_unlimited:
        profile = get_profile(user["id"])
        user_plan = profile.get("plan", "free")
        if user_plan in ("basic", "pro", "agency"):
            # Incrementar uso mensual
            db.table("profiles").update({
                "monthly_usage": profile.get("monthly_usage", 0) + 1
            }).eq("id", user["id"]).execute()
        elif profile["credits_cents"] >= COST_CENTS:
            cost_cents = COST_CENTS
            db.table("profiles").update(
                {"credits_cents": profile["credits_cents"] - cost_cents}
            ).eq("id", user["id"]).execute()
        else:
            db.table("profiles").update(
                {"free_used_today": profile["free_used_today"] + 1}
            ).eq("id", user["id"]).execute()

    # ── Encolar tarea ─────────────────────────────────────────────────────
    task = transcribe_task.delay(
        url,
        language,
        user["id"] if user else None,
        get_client_ip() if not user else None,
    )

    return jsonify({"task_id": task.id, "cost_cents": cost_cents})


@app.route("/task/<task_id>")
def task_status(task_id):
    task = transcribe_task.AsyncResult(task_id)

    if task.state == "PENDING":
        return jsonify({"state": "pending", "step": "En cola..."})
    elif task.state == "PROGRESS":
        return jsonify({"state": "progress", "step": task.info.get("step", "Procesando...")})
    elif task.state == "SUCCESS":
        result = task.result
        if not result.get("ok"):
            return jsonify({"state": "error", "error": result.get("error", "Error desconocido")})
        payload = {"state": "success", "text": result["text"], "platform": result["platform"]}
        user = current_user()
        if user:
            updated = get_profile(user["id"])
            payload["credits_cents"] = updated["credits_cents"]
            payload["free_used_today"] = updated["free_used_today"]
        return jsonify(payload)
    elif task.state == "FAILURE":
        return jsonify({"state": "error", "error": str(task.info)})
    else:
        return jsonify({"state": "progress", "step": "Procesando..."})


# ── History routes ────────────────────────────────────────────────────────────

@app.route("/history")
@require_auth
def history():
    user = current_user()
    rows = (
        db.table("transcriptions")
        .select("id, url, platform, language, text, cost_cents, created_at")
        .eq("user_id", user["id"])
        .order("id", desc=True)
        .limit(50)
        .execute()
    )
    return jsonify(rows.data)


@app.route("/history/<int:tid>", methods=["DELETE"])
@require_auth
def delete_transcription(tid: int):
    user = current_user()
    db.table("transcriptions").delete().eq("id", tid).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/download/<int:tid>")
@require_auth
def download_transcription(tid: int):
    user = current_user()
    result = (
        db.table("transcriptions")
        .select("url, text, created_at")
        .eq("id", tid)
        .eq("user_id", user["id"])
        .execute()
    )
    if not result.data:
        return jsonify({"error": "No encontrado"}), 404
    row = result.data[0]
    content = f"URL: {row['url']}\nFecha: {row['created_at']}\n\n{row['text']}"
    return Response(
        content,
        mimetype="text/plain",
        headers={"Content-Disposition": f"attachment; filename=transcripcion_{tid}.txt"},
    )


# ── Stripe / payments ─────────────────────────────────────────────────────────

@app.route("/checkout", methods=["POST"])
@limiter.limit("5 per minute;20 per hour")
@require_auth
def create_checkout():
    if not STRIPE_OK:
        return jsonify({"error": "El sistema de pagos aún no está disponible. Vuelve pronto."}), 503

    if not STRIPE_TOPUP_PRICE:
        return jsonify({"error": "Topup no configurado"}), 500

    body = request.get_json()
    currency = body.get("currency", "usd").lower()
    if currency not in ("usd", "eur"):
        currency = "usd"

    # Ambas divisas dan 7 usos (7 × 18 = 126 cents de saldo)
    amount_cents = 126

    user = current_user()
    try:
        checkout_session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            currency=currency,
            line_items=[{"price": STRIPE_TOPUP_PRICE, "quantity": 1}],
            mode="payment",
            success_url=request.host_url + "?topup=success",
            cancel_url=request.host_url + "?topup=cancel",
            metadata={"user_id": user["id"], "amount_cents": str(amount_cents)},
        )
        db.table("payments").insert({
            "user_id":          user["id"],
            "stripe_session_id": checkout_session.id,
            "amount_cents":     amount_cents,
            "status":           "pending",
        }).execute()
        return jsonify({"url": checkout_session.url})
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Please try again."}), 500


@app.route("/stripe-webhook", methods=["POST"])
@limiter.exempt
def stripe_webhook():
    if not STRIPE_OK or not STRIPE_WEBHOOK_SECRET:
        return "", 200

    payload    = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")

    if not sig_header:
        return jsonify({"error": "Missing signature"}), 400

    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        return jsonify({"error": "Invalid payload"}), 400
    except Exception:
        logger.warning(f"Invalid Stripe signature from IP: {get_client_ip()}")
        return "", 400

    if event["type"] == "checkout.session.completed":
        obj               = event["data"]["object"]
        stripe_session_id = obj["id"]
        user_id           = obj["metadata"]["user_id"]

        if obj["metadata"].get("type") == "subscription":
            # ── Suscripción ──────────────────────────────────────────
            line_items = stripe_lib.checkout.Session.list_line_items(stripe_session_id)
            price_id = line_items.data[0].price.id if line_items.data else None
            plan = PRICE_TO_PLAN.get(price_id, "basic")
            db.table("profiles").update({
                "plan": plan,
                "stripe_subscription_id": obj.get("subscription"),
            }).eq("id", user_id).execute()
        else:
            # ── Recarga de créditos (flujo existente) ────────────────
            amount_cents = int(obj["metadata"]["amount_cents"])

            db.table("payments").update({
                "status":                "completed",
                "stripe_payment_intent": obj.get("payment_intent"),
            }).eq("stripe_session_id", stripe_session_id).execute()

            profile = get_profile(user_id)
            db.table("profiles").update({
                "credits_cents": profile["credits_cents"] + amount_cents
            }).eq("id", user_id).execute()

            # ── Registrar conversión de afiliado ─────────────────────
            ref_result = db.table("profiles").select("affiliate_ref").eq("id", user_id).single().execute()
            ref = ref_result.data.get("affiliate_ref") if ref_result.data else None
            if ref:
                affiliate = db.table("affiliates").select("commission_pct").eq("code", ref).single().execute()
                if affiliate.data:
                    pct = affiliate.data["commission_pct"]
                    commission = int(amount_cents * pct / 100)
                    db.table("affiliate_conversions").insert({
                        "affiliate_code": ref,
                        "user_id": user_id,
                        "amount_cents": amount_cents,
                        "commission_cents": commission,
                        "stripe_session_id": stripe_session_id,
                    }).execute()

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        db.table("profiles").update({
            "plan": "free",
            "stripe_subscription_id": None,
        }).eq("stripe_subscription_id", sub["id"]).execute()

    return "", 200


# ── Subscription endpoints ───────────────────────────────────────────────────

PRICE_TO_PLAN = {
    "price_1TI14pCWQn5Tis1WycY83MrR": "basic",
    "price_1TI15ACWQn5Tis1WKNbdhFW1": "pro",
    "price_1TI15NCWQn5Tis1WwIIb1TX1": "agency",
}


@app.route("/create-subscription-checkout", methods=["POST"])
@limiter.limit("5 per minute;20 per hour")
@require_auth
def create_subscription_checkout():
    if not STRIPE_OK:
        return jsonify({"error": "Pagos no disponibles"}), 503

    body = request.get_json()
    price_id = body.get("price_id", "")
    if price_id not in PRICE_TO_PLAN:
        return jsonify({"error": "Price ID no válido"}), 400

    currency = body.get("currency", "usd").lower()
    if currency not in ("usd", "eur"):
        currency = "usd"

    user = current_user()
    try:
        checkout_session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            currency=currency,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=request.host_url + "?subscribed=true",
            cancel_url=request.host_url + "?sub_cancel=true",
            metadata={"user_id": user["id"], "type": "subscription"},
        )
        return jsonify({"url": checkout_session.url})
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Please try again."}), 500


@app.route("/manage-subscription", methods=["POST"])
@require_auth
def manage_subscription():
    """Create a Stripe Customer Portal session so users can manage/cancel."""
    if not STRIPE_OK:
        return jsonify({"error": "Payments unavailable"}), 503

    user = current_user()
    profile = get_profile(user["id"])
    sub_id = profile.get("stripe_subscription_id")
    if not sub_id:
        return jsonify({"error": "No active subscription"}), 400

    try:
        sub = stripe_lib.Subscription.retrieve(sub_id)
        portal = stripe_lib.billing_portal.Session.create(
            customer=sub.customer,
            return_url=request.host_url,
        )
        return jsonify({"url": portal.url})
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Please try again."}), 500


@app.route("/cancel-subscription", methods=["POST"])
@require_auth
def cancel_subscription():
    if not STRIPE_OK:
        return jsonify({"error": "Pagos no disponibles"}), 503

    user = current_user()
    profile = get_profile(user["id"])
    sub_id = profile.get("stripe_subscription_id")
    if not sub_id:
        return jsonify({"error": "No tienes suscripción activa"}), 400

    try:
        stripe_lib.Subscription.modify(sub_id, cancel_at_period_end=True)
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Please try again."}), 500


# ── Adapt route ───────────────────────────────────────────────────────────────

_JSON_SCRIPT_SCHEMA = (
    'Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta: '
    '{"hook": "las primeras 1-3 líneas que paran el scroll", '
    '"body": ["línea 1 del desarrollo", "línea 2", "..."], '
    '"closing": "la línea final que ancla"}. '
    'Sin markdown, sin ```json, sin texto antes ni después. Solo el JSON.'
)

_JSON_HOOKS_SCHEMA = (
    'Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta: '
    '{"hooks": [{"type": "TRANSFORMACIÓN", "text": "hook aquí"}, '
    '{"type": "NEGATIVO", "text": "hook aquí"}, '
    '{"type": "ENEMIGO", "text": "hook aquí"}, '
    '{"type": "CURIOSIDAD", "text": "hook aquí"}, '
    '{"type": "PROMESA", "text": "hook aquí"}]}. '
    'Sin markdown, sin ```json, sin texto antes ni después. Solo el JSON.'
)

STYLE_PROMPTS = {

    "viral": (
        "Eres un guionista de reels. Tu trabajo es reescribir este guión para máximo impacto. "
        "Reglas: el hook tiene que parar el scroll en los primeros 3 segundos — sin preámbulo, sin 'hola', sin contexto. "
        "El valor empieza de golpe después del hook, nunca hay transición. "
        "La tensión se mantiene hasta el final desvelando el insight de forma progresiva, nunca de golpe. "
        "Frases de máximo 15 palabras. Cierre contundente que ancla, sin CTA explícito. "
        "Nunca uses: 'increíble', 'brutal', 'chicos', 'os va a flipar', 'en el panorama actual', "
        "'es fundamental entender que', 'descubre cómo', 'cree en ti'. "
        "El resultado tiene que poder leerse frase por frase con viñetas (▸). "
        "Si lo lees en voz alta y no para el scroll en los primeros 3 segundos, reescríbelo. "
        + _JSON_SCRIPT_SCHEMA
    ),

    "divertido": (
        "Eres un guionista de reels. Reescribe este guión con el tono de alguien que cuenta algo en un bar a un colega — sin filtro, sin pose. "
        "Reglas: incluye muletillas naturales donde salgan solas, no forzadas. "
        "Mete al menos un momento de ironía seca o humor que salga de la situación, nunca un chiste preparado. "
        "Si hay un error propio que contar, cuéntalo dentro del desarrollo, nunca al principio. "
        "Las frases incompletas que se corrigen son bienvenidas: 'Es como si... bueno, te lo explico de otra forma.' "
        "Nunca uses entusiasmo artificial, emojis, exclamaciones ni motivacional. "
        "El guión tiene que sonar exactamente igual que un audio de WhatsApp a un colega. "
        "Si lo lees en voz alta y suena raro o artificial, reescríbelo. "
        + _JSON_SCRIPT_SCHEMA
    ),

    "linkedin": (
        "Eres un guionista de contenido. Reescribe este guión en formato LinkedIn: tono profesional pero directo, sin distancia. "
        "Primera persona siempre. Una sola idea, desarrollada con lógica clara. "
        "Datos concretos si los hay — ningún dato inventado. "
        "Párrafos de máximo 2-3 líneas con espacio entre ellos. "
        "Sin frases vacías ('en el panorama actual', 'es fundamental', 'cabe destacar', 'valor añadido', 'solución integral'). "
        "Sin motivacional. Cierre que deja una pregunta abierta o una afirmación que genera reacción — nunca una conclusión envuelta en papel de regalo. "
        "El lector tiene que terminar pensando, no sintiéndose inspirado. "
        + _JSON_SCRIPT_SCHEMA
    ),

    "storytelling": (
        "Eres un guionista de reels. Reescribe este guión como una historia real con escena concreta. "
        "Reglas: empieza en el momento exacto donde ocurre algo — no con contexto ni presentación. "
        "Muestra el error o el problema desde dentro: qué pensabas en ese momento, qué hiciste, qué pasó. "
        "El insight tiene que salir de la historia de forma natural, nunca explicado por encima como moraleja. "
        "Tensión narrativa: el lector tiene que querer saber qué pasó después. "
        "Sin 'y esto me enseñó que...', sin conclusiones explícitas, sin motivacional. "
        "El cierre es una frase corta que deja el peso de la historia caer. "
        "Si la historia no genera tensión, no es una historia — es un resumen. Reescríbela. "
        + _JSON_SCRIPT_SCHEMA
    ),

    "hooks": (
        "Eres un guionista de reels. Dame exactamente 5 hooks para este guión, uno de cada tipo. "
        "Reglas para todos: tienen que incluir términos específicos del nicho para filtrar a la audiencia correcta desde el primer segundo. "
        "Ningún hook puede dar el valor completo — si el viewer puede llevarse el insight sin ver el vídeo, el hook falla. "
        "Los 5 tipos — "
        "TRANSFORMACIÓN: salto de A a B con dato concreto y creíble. "
        "NEGATIVO: ataca una creencia instalada en el nicho. "
        "ENEMIGO: el error que sigue cometiendo la audiencia. "
        "CURIOSIDAD: abre una puerta sin revelar nada, obliga a seguir para entender. "
        "PROMESA: resultado concreto y específico con condición real. "
        + _JSON_HOOKS_SCHEMA
    ),

}

_JSON_CUSTOM_SUFFIX = (
    " " + _JSON_SCRIPT_SCHEMA
)

CUSTOM_BASE = (
    "Eres un guionista de reels. "
    "Reglas que aplican siempre independientemente de las instrucciones custom: "
    "nunca 'chicos', 'increíble', 'brutal', 'en el panorama actual', 'es fundamental entender que', "
    "'descubre cómo', 'cree en ti', 'todo es posible'. "
    "Nunca empezar con 'Hola', 'En este vídeo' o 'Hoy vamos a hablar de'. "
    "El guión va frase por frase con viñetas (▸). Cada frase máximo 15 palabras. "
    "El valor empieza después del hook sin transición. "
    "Momentos personales van dentro del desarrollo, nunca al principio. "
    "Si lo lees en voz alta y suena a texto escrito, reescríbelo. "
    "Ahora aplica estas instrucciones adicionales:\n"
)


def _parse_ai_json(raw: str, style: str) -> dict:
    """Parse JSON from LLM response with robust fallback."""
    text = raw.strip()
    # Strip markdown fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON object from surrounding text
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                data = None
        else:
            data = None

    if data is None:
        app.logger.warning("[adapt] JSON parse failed for style=%s, raw=%s", style, raw[:200])
        return {"hook": "", "body": [raw], "closing": ""}

    # Validate structure
    if style == "hooks":
        if "hooks" not in data or not isinstance(data["hooks"], list):
            app.logger.warning("[adapt] Invalid hooks structure for style=%s", style)
            return {"hooks": [{"type": "RESULTADO", "text": raw}]}
    else:
        if "body" in data and isinstance(data["body"], str):
            data["body"] = [data["body"]]
        if "hook" not in data or "body" not in data:
            app.logger.warning("[adapt] Missing keys for style=%s, keys=%s", style, list(data.keys()))
            return {"hook": "", "body": [raw], "closing": ""}
        if not isinstance(data["body"], list):
            data["body"] = [str(data["body"])]
        data.setdefault("closing", "")

    return data


def _call_llm(system: str, user_content: str, temperature: float = 0.8, max_tokens: int = 20000) -> str:
    """Call OpenRouter/Groq and return raw text response."""
    api_key = OPENROUTER_API_KEY or GROQ_API_KEY
    url = OPENROUTER_URL if OPENROUTER_API_KEY else "https://api.groq.com/openai/v1/chat/completions"
    model = OPENROUTER_MODEL if OPENROUTER_API_KEY else "llama-3.3-70b-versatile"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **({"HTTP-Referer": "https://reelscript.net", "X-Title": "ReelScript"} if OPENROUTER_API_KEY else {}),
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def adapt_with_ai(text: str, style: str, custom_prompt: str = "") -> dict:
    if style == "custom":
        if not custom_prompt:
            raise ValueError("Escribe tus instrucciones en el campo Custom")
        system = CUSTOM_BASE + custom_prompt + _JSON_CUSTOM_SUFFIX
    else:
        system = STYLE_PROMPTS.get(style)
        if not system:
            raise ValueError("Estilo no válido")

    raw = _call_llm(system, text)
    return _parse_ai_json(raw, style)


@app.route("/saved-scripts")
@require_auth
def saved_scripts():
    user = current_user()
    rows = db.table("saved_scripts") \
        .select("*") \
        .eq("user_id", user["id"]) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()
    return jsonify(rows.data)


@app.route("/saved-scripts/<script_id>", methods=["DELETE"])
@require_auth
def delete_saved_script(script_id):
    user = current_user()
    db.table("saved_scripts") \
        .delete() \
        .eq("id", script_id) \
        .eq("user_id", user["id"]) \
        .execute()
    return jsonify({"ok": True})


@app.route("/save-script", methods=["POST"])
def save_script():
    user = current_user()
    if not user:
        return jsonify({"error": "No autenticado"}), 401
    body = request.get_json()
    db.table("saved_scripts").insert({
        "user_id": user["id"],
        "style": body.get("style", ""),
        "content": body.get("content", ""),
    }).execute()
    return jsonify({"ok": True})


@app.route("/adapt", methods=["POST"])
@limiter.limit("20 per minute;100 per hour")
def adapt():
    body          = request.get_json() or {}
    text          = (body.get("text") or "").strip()
    style         = (body.get("style") or "").strip()
    custom_prompt = (body.get("custom_prompt") or "").strip()
    assistant_id  = (body.get("assistant_id") or "").strip()

    err = validate_adapt(body)
    if err:
        return jsonify({"error": err}), 400
    if not GROQ_API_KEY:
        return jsonify({"error": "Service unavailable"}), 500
    if not style and not custom_prompt and not assistant_id:
        return jsonify({"error": "Select a style"}), 400

    # If assistant_id, override style to use assistant's instructions
    if assistant_id:
        ast_result = db.table("assistants").select("instructions").eq("id", assistant_id).execute()
        if ast_result.data:
            style = "custom"
            custom_prompt = ast_result.data[0]["instructions"]
        else:
            return jsonify({"error": "Assistant not found"}), 404

    user = current_user()
    cost_cents = 0

    # ── Comprobar límites / saldo (adapt usa free_adapt_used_today) ──────────
    if user and user.get("email", "").lower() in UNLIMITED_EMAILS:
        pass  # sin límite ni coste para cuentas admin
    elif user is None:
        return jsonify({
            "error": "Regístrate gratis para usar Hazlo tuyo."
        }), 429
    else:
        profile = get_profile(user["id"])
        user_plan = profile.get("plan", "free")
        if user_plan in ("basic", "pro", "agency"):
            ok, err_msg = check_monthly_limit(profile)
            if not ok:
                return jsonify({"error": err_msg}), 429
            cost_cents = 0
        elif profile["credits_cents"] >= COST_CENTS:
            cost_cents = COST_CENTS
        elif profile.get("free_adapt_used_today", 0) < FREE_DAILY_ADAPT:
            cost_cents = 0
        else:
            return jsonify({
                "error": f"Has usado tus {FREE_DAILY_ADAPT} adaptaciones gratuitas de hoy. "
                         "Recarga saldo para continuar."
            }), 429

    try:
        result = adapt_with_ai(text, style, custom_prompt)
    except requests.HTTPError as e:
        return jsonify({"error": f"Error de la API: {e}"}), 502
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Please try again."}), 500

    # Actualizar contadores
    is_unlimited = user and user.get("email", "").lower() in UNLIMITED_EMAILS
    if not is_unlimited and user:
        if profile.get("plan", "free") in ("basic", "pro", "agency"):
            db.table("profiles").update({
                "monthly_usage": profile.get("monthly_usage", 0) + 1
            }).eq("id", user["id"]).execute()
        elif cost_cents > 0:
            db.table("profiles").update(
                {"credits_cents": profile["credits_cents"] - cost_cents}
            ).eq("id", user["id"]).execute()
        else:
            db.table("profiles").update(
                {"free_adapt_used_today": profile.get("free_adapt_used_today", 0) + 1}
            ).eq("id", user["id"]).execute()

    payload: dict = {"result": result, "cost_cents": cost_cents}
    if user:
        updated = get_profile(user["id"])
        payload["credits_cents"]   = updated["credits_cents"]
        payload["free_used_today"] = updated["free_used_today"]
    return jsonify(payload)


_HOOK_REGEN_PROMPT = (
    "Eres un guionista de reels. Se te da un guión ya escrito (body + closing). "
    "Tu trabajo es escribir UN SOLO hook alternativo para este guión. "
    "El hook tiene que parar el scroll en los primeros 3 segundos — sin preámbulo, sin 'hola', sin contexto. "
    "Nunca uses: 'increíble', 'brutal', 'chicos', 'os va a flipar'. "
    "Devuelve ÚNICAMENTE un objeto JSON: {\"hook\": \"tu nuevo hook aquí\"}. "
    "Sin markdown, sin ```json, sin texto antes ni después. Solo el JSON."
)


@app.route("/transform-hook", methods=["POST"])
def transform_hook():
    """Regenerate only the hook, keeping body and closing intact."""
    data = request.get_json() or {}
    original_text = data.get("text", "").strip()
    body = data.get("body", [])
    closing = data.get("closing", "")

    if not original_text and not body:
        return jsonify({"error": "No text provided"}), 400

    context = "\n".join(body) + ("\n" + closing if closing else "")
    user_msg = f"Guión actual:\n{context}\n\nTexto original del que salió:\n{original_text}"

    try:
        raw = _call_llm(_HOOK_REGEN_PROMPT, user_msg, temperature=0.9)
        parsed = _parse_ai_json(raw, "hook_regen")
        new_hook = parsed.get("hook", raw)
    except Exception as e:
        logger.error(f"Hook regen failed: {e}", exc_info=True)
        return jsonify({"error": "Failed to regenerate hook"}), 502

    return jsonify({"hook": new_hook})


# ── Assistants ────────────────────────────────────────────────────────────────


@app.route("/assistants", methods=["GET"])
@require_auth
def list_assistants():
    user = current_user()
    rows = db.table("assistants").select("*").eq("user_id", user["id"]).order("created_at").execute()
    return jsonify(rows.data)


@app.route("/assistants", methods=["POST"])
@require_auth
def create_assistant():
    user = current_user()
    body = request.get_json()
    name = (body.get("name") or "").strip()
    instructions = (body.get("instructions") or "").strip()

    if not name or not instructions:
        return jsonify({"error": "Name and instructions required"}), 400

    profile = get_profile(user["id"])
    plan = profile.get("plan", "free")
    limit = ASSISTANT_LIMITS.get(plan)

    if plan == "free":
        return jsonify({"error": "Upgrade your plan to create assistants"}), 403

    if limit is not None:
        count = db.table("assistants").select("id", count="exact").eq("user_id", user["id"]).execute()
        current = count.count if hasattr(count, "count") else len(count.data)
        if current >= limit:
            return jsonify({"error": f"Your plan allows up to {limit} assistant(s)"}), 403

    row = db.table("assistants").insert({
        "user_id": user["id"],
        "name": name,
        "instructions": instructions,
    }).execute()
    return jsonify(row.data[0] if row.data else {"ok": True})


@app.route("/assistants/<assistant_id>", methods=["PUT"])
@require_auth
def update_assistant(assistant_id):
    user = current_user()
    body = request.get_json()
    updates = {}
    if "name" in body:
        updates["name"] = body["name"]
    if "instructions" in body:
        updates["instructions"] = body["instructions"]
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400
    db.table("assistants").update(updates).eq("id", assistant_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/assistants/<assistant_id>", methods=["DELETE"])
@require_auth
def delete_assistant(assistant_id):
    user = current_user()
    db.table("assistants").delete().eq("id", assistant_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


# ── Scripts & Projects (pro/agency) ──────────────────────────────────────────

@app.route("/scripts", methods=["GET"])
@require_auth
def list_scripts():
    user = current_user()
    project_id = request.args.get("project_id")
    q = db.table("scripts").select("*").eq("user_id", user["id"])
    if project_id:
        q = q.eq("project_id", project_id)
    rows = q.order("created_at", desc=True).limit(100).execute()
    return jsonify(rows.data)


@app.route("/scripts", methods=["POST"])
@require_auth
def create_script():
    user = current_user()
    body = request.get_json()
    row = db.table("scripts").insert({
        "user_id": user["id"],
        "title": body.get("title", "Sin título"),
        "transcription": body.get("transcription"),
        "script": body.get("script"),
        "reel_url": body.get("reel_url"),
        "project_id": body.get("project_id"),
    }).execute()
    return jsonify(row.data[0] if row.data else {"ok": True})


@app.route("/scripts/<script_id>", methods=["DELETE"])
@require_auth
def delete_script(script_id):
    user = current_user()
    db.table("scripts").delete().eq("id", script_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/projects", methods=["GET"])
@require_auth
def list_projects():
    user = current_user()
    rows = db.table("projects").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return jsonify(rows.data)


@app.route("/projects", methods=["POST"])
@require_auth
def create_project():
    user = current_user()
    profile = get_profile(user["id"])
    plan = profile.get("plan", "free")
    max_proj = PLANS.get(plan, PLANS["free"])["projects_max"]
    if max_proj is not None:
        count = db.table("projects").select("id", count="exact").eq("user_id", user["id"]).execute()
        current = count.count if hasattr(count, "count") else len(count.data)
        if current >= max_proj:
            return jsonify({"error": f"Has alcanzado el límite de {max_proj} proyecto(s) en tu plan. Sube de plan para tener ilimitados."}), 403
    body = request.get_json()
    row = db.table("projects").insert({
        "user_id": user["id"],
        "name": body.get("name", "Sin nombre"),
        "style_prompt": body.get("style_prompt", ""),
    }).execute()
    return jsonify(row.data[0] if row.data else {"ok": True})


@app.route("/projects/<project_id>", methods=["DELETE"])
@require_auth
def delete_project(project_id):
    user = current_user()
    db.table("projects").delete().eq("id", project_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/projects/<project_id>/assistant", methods=["PUT"])
@require_auth
def assign_assistant_to_project(project_id):
    user = current_user()
    body = request.get_json()
    assistant_id = body.get("assistant_id") or None
    db.table("projects").update({"assistant_id": assistant_id}).eq("id", project_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


# ── Avatar ────────────────────────────────────────────────────────────────────

@app.route("/profile/avatar", methods=["POST"])
@require_auth
def update_avatar():
    user = current_user()
    body = request.get_json()
    seed = body.get("seed", "default")
    allowed = {"shadow","reel","script","pixel","ninja","ghost","robot","alien","wizard","punk","hacker","glitch"}
    if seed not in allowed:
        return jsonify({"error": "Invalid seed"}), 400
    db.table("profiles").update({"avatar_seed": seed}).eq("id", user["id"]).execute()
    return jsonify({"ok": True, "avatar_seed": seed})


# ── Projects (PATCH) ─────────────────────────────────────────────────────────

@app.route("/projects/<project_id>", methods=["PATCH"])
@require_auth
def update_project(project_id):
    user = current_user()
    body = request.get_json()
    updates = {}
    if "name" in body:
        updates["name"] = body["name"]
    if "style_prompt" in body:
        updates["style_prompt"] = body["style_prompt"]
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400
    db.table("projects").update(updates).eq("id", project_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


# ── Scripts (PATCH for performance) ──────────────────────────────────────────

@app.route("/scripts/<script_id>", methods=["PATCH"])
@require_auth
def update_script(script_id):
    user = current_user()
    body = request.get_json()
    updates = {}
    for key in ("title", "transcription", "script", "performance_notes", "views_count", "engagement_rate", "project_id", "likes", "comments", "saves", "metrics_image_url", "published_at"):
        if key in body:
            updates[key] = body[key]
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400
    db.table("scripts").update(updates).eq("id", script_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


# ── Agency ───────────────────────────────────────────────────────────────────

@app.route("/agency/invite", methods=["POST"])
@require_auth
def invite_member():
    user = current_user()
    profile = get_profile(user["id"])
    if profile.get("plan") != "agency":
        return jsonify({"error": "Agency plan required"}), 403

    body = request.get_json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email required"}), 400

    result = db.table("agency_members").insert({
        "agency_owner_id": user["id"],
        "invited_email": email,
        "status": "pending",
    }).execute()

    token = result.data[0]["invite_token"] if result.data else None
    invite_url = f"{request.host_url}join?token={token}"
    return jsonify({"invite_url": invite_url, "token": token})


@app.route("/agency/join", methods=["POST"])
def join_agency():
    user = current_user()
    if not user:
        return jsonify({"error": "Login required"}), 401

    body = request.get_json()
    token = body.get("token", "")
    if not token:
        return jsonify({"error": "Token required"}), 400

    result = db.table("agency_members").select("*").eq("invite_token", token).eq("status", "pending").execute()
    if not result.data:
        return jsonify({"error": "Invalid or expired invite"}), 404

    invite = result.data[0]
    db.table("agency_members").update({
        "member_id": user["id"],
        "status": "active",
    }).eq("invite_token", token).execute()

    return jsonify({"ok": True, "agency_owner_id": invite["agency_owner_id"]})


@app.route("/agency/members")
@require_auth
def get_members():
    user = current_user()
    rows = db.table("agency_members").select("*").eq("agency_owner_id", user["id"]).execute()
    # Enrich with profile data for active members
    members = []
    for row in rows.data:
        member = dict(row)
        if row.get("member_id"):
            prof = db.table("profiles").select("avatar_seed, monthly_usage").eq("id", row["member_id"]).execute()
            if prof.data:
                member["avatar_seed"] = prof.data[0].get("avatar_seed", "default")
                member["monthly_usage"] = prof.data[0].get("monthly_usage", 0)
        members.append(member)
    return jsonify(members)


@app.route("/agency/members/<member_id>", methods=["DELETE"])
@require_auth
def remove_member(member_id):
    user = current_user()
    db.table("agency_members").delete().eq("agency_owner_id", user["id"]).eq("id", member_id).execute()
    return jsonify({"ok": True})


# ── Profile data (extended) ──────────────────────────────────────────────────

@app.route("/profile/data")
@require_auth
def profile_data():
    """Full profile data for the profile hub."""
    user = current_user()
    profile = get_profile(user["id"])
    plan = profile.get("plan", "free")

    data = {
        "email": user["email"],
        "plan": plan,
        "avatar_seed": profile.get("avatar_seed", "default"),
        "credits_cents": profile["credits_cents"],
        "monthly_usage": profile.get("monthly_usage", 0),
        "monthly_limit": PLAN_LIMITS.get(plan),
    }

    # Projects + script counts (all plans)
    projects = db.table("projects").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    for p in projects.data:
        count = db.table("scripts").select("id", count="exact").eq("project_id", p["id"]).execute()
        p["script_count"] = count.count if hasattr(count, "count") else 0
    data["projects"] = projects.data

    recent = db.table("scripts").select("id, title, project_id, created_at").eq("user_id", user["id"]).order("created_at", desc=True).limit(5).execute()
    data["recent_scripts"] = recent.data

    return jsonify(data)


# ── Metrics ──────────────────────────────────────────────────────────────────

@app.route("/metrics/summary")
@require_auth
def metrics_summary():
    user = current_user()
    project_id = request.args.get("project_id")

    q = db.table("scripts").select("views_count, likes, comments, saves, engagement_rate").eq("user_id", user["id"])
    if project_id:
        q = q.eq("project_id", project_id)
    rows = q.execute()

    total_views = sum(r.get("views_count") or 0 for r in rows.data)
    total_likes = sum(r.get("likes") or 0 for r in rows.data)
    total_comments = sum(r.get("comments") or 0 for r in rows.data)
    total_saves = sum(r.get("saves") or 0 for r in rows.data)
    rates = [r.get("engagement_rate") for r in rows.data if r.get("engagement_rate")]
    avg_engagement = round(sum(rates) / len(rates), 2) if rates else 0

    return jsonify({
        "total_views": total_views,
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_saves": total_saves,
        "avg_engagement": avg_engagement,
        "scripts_with_metrics": len([r for r in rows.data if r.get("views_count")]),
    })


@app.route("/metrics/winners")
@require_auth
def metrics_winners():
    user = current_user()
    rank_by = request.args.get("rank_by", "views_count")
    limit = min(int(request.args.get("limit", 5)), 20)
    project_id = request.args.get("project_id")

    valid_fields = {"views_count", "likes", "comments", "saves", "engagement_rate"}
    if rank_by not in valid_fields:
        rank_by = "views_count"

    q = db.table("scripts").select("*").eq("user_id", user["id"]).not_.is_(rank_by, "null")
    if project_id:
        q = q.eq("project_id", project_id)
    rows = q.order(rank_by, desc=True).limit(limit).execute()

    return jsonify(rows.data)


# ── Ideas ─────────────────────────────────────────────────────────────────────

IDEA_CATEGORIES = {"educational", "storytelling", "opinion", "tutorial", "humor",
                   "case_study", "motivation", "trend", "behind_scenes", "list"}

IDEA_BASE_PROMPT = (
    "Eres un asistente de creación de contenido para creators de Instagram, "
    "TikTok y reels. Recibes una idea cruda del usuario y la conviertes en "
    "un borrador de guión estructurado en 3 partes: intro, desarrollo y cierre.\n\n"
    "REGLAS:\n"
    "- No inventes datos, números ni casos. Si la idea es vaga, desarrolla el concepto sin meter ejemplos falsos.\n"
    "- Frases cortas, máximo 15 palabras.\n"
    "- Sin 'increíble', sin 'chicos', sin paja.\n"
    "- El guión debe sonar hablado, no escrito.\n"
    "- La intro tiene que parar el scroll en los primeros 3 segundos.\n\n"
    "CATEGORÍAS DISPONIBLES:\n"
    "educational, storytelling, opinion, tutorial, humor, case_study, motivation, trend, behind_scenes, list\n\n"
    "Devuelve EXCLUSIVAMENTE un JSON válido, sin texto antes ni después, sin markdown:\n"
    '{"title":"string corto max 60 chars","category":"una de las categorías","script_draft":{"intro":"1-2 frases hook","desarrollo":"3-5 frases contenido","cierre":"1-2 frases cierre"}}'
)


def resolve_assistant_prompt(assistant_id, user_id=None):
    """Returns the style instructions for an assistant_id."""
    if not assistant_id:
        return ""
    # Predefined?
    if assistant_id in STYLE_PROMPTS:
        return STYLE_PROMPTS[assistant_id]
    # Custom assistant from DB?
    result = db.table("assistants").select("instructions").eq("id", assistant_id).execute()
    if result.data:
        return CUSTOM_BASE + result.data[0]["instructions"]
    return ""


def develop_idea(raw_text, assistant_id=None, user_id=None, language="es"):
    """Call AI to develop a raw idea into structured script draft."""
    style_block = resolve_assistant_prompt(assistant_id, user_id)
    system = IDEA_BASE_PROMPT
    if style_block:
        system += f"\n\nESTILO ESPECÍFICO PARA ESTE GUIÓN:\n{style_block}"

    api_key = OPENROUTER_API_KEY or GROQ_API_KEY
    url = OPENROUTER_URL if OPENROUTER_API_KEY else "https://api.groq.com/openai/v1/chat/completions"
    model = OPENROUTER_MODEL if OPENROUTER_API_KEY else "llama-3.3-70b-versatile"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **({"HTTP-Referer": "https://reelscript.net", "X-Title": "ReelScript"} if OPENROUTER_API_KEY else {}),
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Idioma de salida: {language}. Idea cruda del usuario: {raw_text}"},
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"].strip()

    # Parse JSON from response
    import json as json_mod
    # Strip markdown fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json_mod.loads(content)


@app.route("/ideas", methods=["POST"])
@require_auth
@limiter.limit("20 per minute")
def create_idea():
    user = current_user()
    body = request.get_json() or {}
    raw_text = (body.get("raw_text") or "").strip()
    language = body.get("language", "es")
    project_id = body.get("project_id") or None
    assistant_id = body.get("assistant_id") or None

    if not raw_text or len(raw_text) < 5:
        return jsonify({"error": "Idea text too short (min 5 chars)"}), 400
    if len(raw_text) > 5000:
        return jsonify({"error": "Idea text too long (max 5000 chars)"}), 400

    develop = body.get("develop", True)

    # Resolve assistant: body > user default > neutral
    if not assistant_id:
        prof = db.table("profiles").select("default_idea_assistant").eq("id", user["id"]).execute()
        if prof.data and prof.data[0].get("default_idea_assistant"):
            assistant_id = prof.data[0]["default_idea_assistant"]

    if develop:
        try:
            result = develop_idea(raw_text, assistant_id, user["id"], language)
        except Exception as e:
            logger.error(f"Idea development failed: {e}", exc_info=True)
            # Fallback: save as draft instead of failing
            row = db.table("ideas").insert({
                "user_id": user["id"], "project_id": project_id,
                "raw_text": raw_text, "assistant_id": assistant_id, "status": "draft",
            }).execute()
            return jsonify({"ok": True, "status": "draft", "fallback": True,
                            "idea": row.data[0] if row.data else None,
                            "error": "Could not develop — saved as draft"}), 200
    else:
        result = {}

    row = db.table("ideas").insert({
        "user_id": user["id"],
        "project_id": project_id,
        "raw_text": raw_text,
        "assistant_id": assistant_id,
        "title": result.get("title"),
        "category": result.get("category"),
        "script_draft": result.get("script_draft"),
        "status": "developed" if develop else "draft",
    }).execute()

    return jsonify(row.data[0] if row.data else result)


@app.route("/ideas")
@require_auth
def list_ideas():
    user = current_user()
    q = db.table("ideas").select("*").eq("user_id", user["id"])
    project_id = request.args.get("project_id")
    category = request.args.get("category")
    assistant_id = request.args.get("assistant_id")
    if project_id:
        q = q.eq("project_id", project_id)
    if category:
        q = q.eq("category", category)
    if assistant_id:
        q = q.eq("assistant_id", assistant_id)
    limit = min(int(request.args.get("limit", 50)), 100)
    offset = int(request.args.get("offset", 0))
    rows = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return jsonify(rows.data)


@app.route("/ideas/<idea_id>")
@require_auth
def get_idea(idea_id):
    user = current_user()
    row = db.table("ideas").select("*").eq("id", idea_id).eq("user_id", user["id"]).execute()
    if not row.data:
        return jsonify({"error": "Not found"}), 404
    return jsonify(row.data[0])


@app.route("/ideas/<idea_id>", methods=["PATCH"])
@require_auth
def update_idea(idea_id):
    user = current_user()
    body = request.get_json() or {}
    updates = {}
    for key in ("title", "category", "script_draft", "project_id", "assistant_id", "status"):
        if key in body:
            updates[key] = body[key]
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db.table("ideas").update(updates).eq("id", idea_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/ideas/<idea_id>", methods=["DELETE"])
@require_auth
def delete_idea(idea_id):
    user = current_user()
    db.table("ideas").delete().eq("id", idea_id).eq("user_id", user["id"]).execute()
    return jsonify({"ok": True})


@app.route("/ideas/<idea_id>/develop", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")
def develop_idea_endpoint(idea_id):
    """Develop a draft idea that was saved without AI processing."""
    user = current_user()
    row = db.table("ideas").select("*").eq("id", idea_id).eq("user_id", user["id"]).execute()
    if not row.data:
        return jsonify({"error": "Not found"}), 404

    idea = row.data[0]
    if idea.get("status") != "draft":
        return jsonify({"error": "This idea is already developed. Use /regenerate to redo it."}), 400

    body = request.get_json() or {}
    assistant_id = body.get("assistant_id") or idea.get("assistant_id")
    language = body.get("language", "es")

    try:
        result = develop_idea(idea["raw_text"], assistant_id, user["id"], language)
    except Exception as e:
        logger.error(f"Idea development failed: {e}", exc_info=True)
        return jsonify({"error": "Failed to develop. Try again."}), 502

    db.table("ideas").update({
        "assistant_id": assistant_id,
        "title": result.get("title"),
        "category": result.get("category"),
        "script_draft": result.get("script_draft"),
        "status": "developed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    return jsonify(result)


@app.route("/ideas/<idea_id>/regenerate", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")
def regenerate_idea(idea_id):
    user = current_user()
    row = db.table("ideas").select("*").eq("id", idea_id).eq("user_id", user["id"]).execute()
    if not row.data:
        return jsonify({"error": "Not found"}), 404

    idea = row.data[0]
    body = request.get_json() or {}
    assistant_id = body.get("assistant_id") or idea.get("assistant_id")
    language = body.get("language", "es")

    try:
        result = develop_idea(idea["raw_text"], assistant_id, user["id"], language)
    except Exception as e:
        logger.error(f"Idea regeneration failed: {e}", exc_info=True)
        return jsonify({"error": "Failed to regenerate. Try again."}), 502

    db.table("ideas").update({
        "assistant_id": assistant_id,
        "title": result.get("title"),
        "category": result.get("category"),
        "script_draft": result.get("script_draft"),
        "status": "developed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    return jsonify(result)


@app.route("/ideas/<idea_id>/to-script", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")
def idea_to_script(idea_id):
    user = current_user()
    row = db.table("ideas").select("*").eq("id", idea_id).eq("user_id", user["id"]).execute()
    if not row.data:
        return jsonify({"error": "Not found"}), 404

    idea = row.data[0]
    body = request.get_json() or {}
    style = body.get("style", "viral")
    draft = idea.get("script_draft") or {}
    full_text = f"{draft.get('intro', '')}\n{draft.get('desarrollo', '')}\n{draft.get('cierre', '')}"

    try:
        result = adapt_with_ai(full_text, style)
    except Exception as e:
        logger.error(f"Idea to script failed: {e}", exc_info=True)
        return jsonify({"error": "Failed to generate script. Try again."}), 502

    # Flatten to text for ideas flow (ideas expects plain string)
    if isinstance(result, dict) and "hook" in result:
        flat = result["hook"] + "\n" + "\n".join(result.get("body", [])) + "\n" + result.get("closing", "")
        result = flat.strip()

    db.table("ideas").update({
        "status": "scripted",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    return jsonify({"script": result, "idea_id": idea_id})


@app.route("/me/preferences")
@require_auth
def get_preferences():
    user = current_user()
    prof = db.table("profiles").select("default_idea_assistant").eq("id", user["id"]).execute()
    data = prof.data[0] if prof.data else {}
    return jsonify({"default_idea_assistant": data.get("default_idea_assistant")})


@app.route("/me/preferences", methods=["PATCH"])
@require_auth
def update_preferences():
    user = current_user()
    body = request.get_json() or {}
    updates = {}
    if "default_idea_assistant" in body:
        updates["default_idea_assistant"] = body["default_idea_assistant"]
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400
    db.table("profiles").update(updates).eq("id", user["id"]).execute()
    return jsonify({"ok": True})


# ── Affiliate program ────────────────────────────────────────────────────────

@app.route("/affiliate/apply", methods=["POST"])
@limiter.limit("3 per hour")
def affiliate_apply():
    body = request.get_json() or {}
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    handle = (body.get("handle") or "").strip()
    audience = body.get("audience_size", "")

    if not name or not email:
        return jsonify({"error": "Name and email required"}), 400
    if len(name) > 100:
        return jsonify({"error": "Name too long"}), 400
    if not validate_email(email):
        return jsonify({"error": "Invalid email address"}), 400

    # Check if already an affiliate
    existing = db.table("affiliates").select("code, status").eq("email", email).execute()
    if existing.data:
        code = existing.data[0]["code"]
        return jsonify({
            "ok": True, "already_exists": True,
            "code": code, "link": f"{request.host_url}?ref={code}",
        })

    # Generate unique code from handle or name
    base = re.sub(r"[^a-z0-9]", "", (handle or name).lower())[:12]
    if not base:
        base = "creator"
    code = base
    suffix = 1
    while True:
        check = db.table("affiliates").select("id").eq("code", code).execute()
        if not check.data:
            break
        code = f"{base}{suffix}"
        suffix += 1

    db.table("affiliates").insert({
        "name": name, "email": email, "code": code,
        "handle": handle, "audience_size": audience,
        "commission_pct": 30, "status": "active",
    }).execute()

    return jsonify({
        "ok": True, "already_exists": False,
        "code": code, "link": f"{request.host_url}?ref={code}",
    })


@app.route("/affiliate/click", methods=["POST"])
@limiter.limit("30 per minute")
def affiliate_click():
    body = request.get_json()
    code = (body.get("code") or "").strip()
    if not code:
        return jsonify({"ok": False}), 400
    # Increment click count
    aff = db.table("affiliates").select("id, total_clicks").eq("code", code).execute()
    if aff.data:
        db.table("affiliates").update({
            "total_clicks": (aff.data[0].get("total_clicks") or 0) + 1
        }).eq("code", code).execute()
    return jsonify({"ok": True})


@app.route("/affiliate/dashboard")
@require_auth
def affiliate_dashboard_data():
    user = current_user()
    aff = db.table("affiliates").select("*").eq("user_id", user["id"]).execute()
    if not aff.data:
        return jsonify({"error": "Not an affiliate"}), 404

    affiliate = aff.data[0]
    conversions = db.table("affiliate_conversions").select("*").eq(
        "affiliate_code", affiliate["code"]
    ).order("created_at", desc=True).execute()

    total_earned = sum(c.get("commission_cents", 0) for c in conversions.data)
    total_conversions = len(conversions.data)
    total_clicks = affiliate.get("total_clicks", 0)
    conv_rate = round(total_conversions / total_clicks * 100, 1) if total_clicks > 0 else 0

    return jsonify({
        "affiliate": {
            "code": affiliate["code"],
            "name": affiliate.get("name"),
            "status": affiliate.get("status", "active"),
            "commission_pct": affiliate.get("commission_pct", 30),
        },
        "stats": {
            "total_clicks": total_clicks,
            "total_conversions": total_conversions,
            "conversion_rate": conv_rate,
            "total_earned_cents": total_earned,
        },
        "conversions": conversions.data,
    })


# ── GDPR endpoints ───────────────────────────────────────────────────────────

@app.route("/account/export")
@require_auth
def export_account():
    user = current_user()
    profile = db.table("profiles").select("*").eq("id", user["id"]).execute()
    projects = db.table("projects").select("*").eq("user_id", user["id"]).execute()
    scripts = db.table("scripts").select("*").eq("user_id", user["id"]).execute()
    transcriptions = db.table("transcriptions").select("*").eq("user_id", user["id"]).execute()
    saved = db.table("saved_scripts").select("*").eq("user_id", user["id"]).execute()

    payload = {
        "profile": profile.data[0] if profile.data else None,
        "projects": projects.data,
        "scripts": scripts.data,
        "transcriptions": transcriptions.data,
        "saved_scripts": saved.data,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    response = jsonify(payload)
    response.headers["Content-Disposition"] = "attachment; filename=reelscript-data-export.json"
    return response


@app.route("/account", methods=["DELETE"])
@require_auth
@limiter.limit("2 per hour")
def delete_account():
    user = current_user()
    uid = user["id"]

    try:
        profile = db.table("profiles").select("*").eq("id", uid).execute()
        if not profile.data:
            return jsonify({"error": "Profile not found"}), 404

        prof = profile.data[0]

        # 1. Audit log
        db.table("deletion_log").insert({
            "user_id": uid,
            "email": user.get("email"),
        }).execute()

        # 2. Cancel Stripe subscription if exists
        sub_id = prof.get("stripe_subscription_id")
        if sub_id and STRIPE_OK:
            try:
                stripe_lib.Subscription.delete(sub_id)
            except Exception as e:
                logger.error(f"Stripe cancellation failed for {uid}: {e}")
                return jsonify({"error": "Could not cancel subscription. Contact support."}), 500

        # 3. Delete user data (cascade should handle most, but be explicit)
        db.table("assistants").delete().eq("user_id", uid).execute()
        db.table("scripts").delete().eq("user_id", uid).execute()
        db.table("projects").delete().eq("user_id", uid).execute()
        db.table("saved_scripts").delete().eq("user_id", uid).execute()
        db.table("transcriptions").delete().eq("user_id", uid).execute()
        db.table("agency_members").delete().eq("agency_owner_id", uid).execute()
        db.table("profiles").delete().eq("id", uid).execute()

        # 4. Delete auth user
        db.auth.admin.delete_user(uid)

        # 5. Clear session
        session.clear()

        return jsonify({"ok": True})

    except Exception as e:
        logger.error(f"Account deletion failed for {uid}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error. Contact support."}), 500


# ── Main ──────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    accept = request.headers.get("Accept-Language", "")
    if accept.lower().startswith("en"):
        return redirect("/en/", code=302)
    return redirect("/es/", code=302)


@app.route("/es/")
def index_es():
    return render_template("index.html", lang="es")


@app.route("/en/")
def index_en():
    return render_template("index.html", lang="en")


# ── Pillar pages ─────────────────────────────────────────────────────────────

PILLAR_PAGES = {
    "es": {
        "transcribir-reel-instagram": {
            "title": "Transcribir reel de Instagram gratis · ReelScript",
            "description": "Pega el link de cualquier reel de Instagram y saca el texto en 10 segundos. Gratis, sin tarjeta, sin registro.",
            "canonical": "https://reelscript.net/es/transcribir-reel-instagram",
            "alt": "en/instagram-reel-transcript",
            "h2_seo": "Transcribe un reel de Instagram en 10 segundos",
            "how_to_label": "Cómo hacerlo",
            "faq_label": "Preguntas frecuentes",
            "cta_label": "Probar ahora →",
            "intro_paragraphs": [
                "Grabas un reel que funciona. Lo subes. Fin. Mal. Ese audio vale para cinco cosas más y lo estás tirando: un post de LinkedIn, un hilo, cinco hooks para grabar mañana, o leerlo en el teleprompter para el siguiente video. Todo está ahí, en el audio que ya tienes.",
                "ReelScript es un gestor de contenido para creadores. Transcribes el reel, lo reformateas con IA en el estilo que quieras y guardas todo en proyectos organizados. La transcripción la hace Whisper — el modelo de OpenAI, lo mejor que hay para esto. No vamos a ponernos medallas por algo que no hemos inventado nosotros. Jaja.",
                "Pegas el link. Pulsas transcribir. En 10 segundos tienes el guión completo. Luego decides: viral, LinkedIn, historia, hooks, o leerlo en el teleprompter integrado para grabar el siguiente sin improvisar. Un click por cosa.",
            ],
            "how_to_steps": [
                "Copia el link del reel de Instagram desde la app (Compartir → Copiar link) o desde el navegador.",
                "Pégalo en el campo de arriba y pulsa «Transcribir».",
                "En 10 segundos tienes el texto completo. Cópialo, reformatéalo con IA o ábrelo en el teleprompter.",
            ],
            "faq": [
                {"q": "¿Funciona con reels privados o de cuentas privadas?", "a": "No. Solo reels públicos. Si el perfil o el reel están en privado, no podemos acceder al audio."},
                {"q": "¿La transcripción tiene marca de agua o límite de caracteres?", "a": "No. El texto es tuyo. Sin marca de agua, sin cortes. Lo que devuelve Whisper es lo que ves."},
                {"q": "¿Qué más puedo hacer con el texto, además de copiarlo?", "a": "Reformatearlo con IA (viral, LinkedIn, historia, 5 hooks), guardarlo en un proyecto, asignarle un asistente con tu estilo personal, añadir métricas de rendimiento o leerlo en el teleprompter integrado para grabar el siguiente video."},
                {"q": "¿En qué idiomas funciona?", "a": "En los que soporta Whisper — más de 90. Español, inglés, francés, portugués, alemán, italiano, japonés... Si el reel está en ese idioma, lo transcribe."},
                {"q": "¿Es gratis?", "a": "Sí. 5 transcripciones gratis al día sin registrarte. Con cuenta gratuita (sin tarjeta) sube a 250 al mes."},
            ],
            "closing": "Eso es todo. Arriba tienes el input.",
        },
        "transcribir-tiktok": {
            "title": "Transcribir TikTok a texto gratis · ReelScript",
            "description": "Pega el link de cualquier TikTok y obtén la transcripción completa en segundos. Sin registro, sin tarjeta.",
            "canonical": "https://reelscript.net/es/transcribir-tiktok",
            "alt": "en/tiktok-to-text",
            "h2_seo": "Transcribe cualquier TikTok a texto en segundos",
            "how_to_label": "Cómo hacerlo",
            "faq_label": "Preguntas frecuentes",
            "cta_label": "Probar ahora →",
            "intro_paragraphs": [
                "Hay TikToks que explican algo en 60 segundos que llevaría 600 palabras escribir. Ese texto existe — está en el audio. Lo que no tienes es tiempo para transcribirlo a mano. Nadie lo tiene, para ser honestos.",
                "ReelScript no es solo una herramienta de transcripción — es donde gestionas todo tu contenido. Pegas el link del TikTok, en 10 segundos tienes el texto, y desde ahí decides qué hacer: copiarlo, reformatearlo con IA, guardarlo en un proyecto o cargarlo en el teleprompter para grabarte a ti mismo leyendo el guión sin tener que memorizar nada.",
                "Funciona con cualquier TikTok público. La transcripción la hace Whisper, soporta más de 90 idiomas y la precisión es alta si el audio es claro.",
            ],
            "how_to_steps": [
                "Abre el TikTok en la app o el navegador. Pulsa «Compartir» → «Copiar link».",
                "Pega el link en el campo de arriba y pulsa «Transcribir».",
                "Tienes el texto. Cópialo, reformatéalo con IA o ábrelo en el teleprompter.",
            ],
            "faq": [
                {"q": "¿Funciona con TikToks privados?", "a": "No. Solo TikToks públicos. Si la cuenta o el video está en privado, no podemos acceder al audio."},
                {"q": "¿Qué pasa si el TikTok no tiene voz, solo música?", "a": "La transcripción saldrá vacía o con ruido. Whisper transcribe voz humana — si no hay voz, no hay texto útil."},
                {"q": "¿Puedo guardar los textos transcritos?", "a": "Sí. Si tienes cuenta, todos los textos se guardan en tu historial y puedes organizarlos en proyectos. Con cuenta gratuita ya tienes acceso a esto."},
                {"q": "¿Hay límite de duración del video?", "a": "Los TikToks normalmente son cortos, así que no es un problema real. Para videos muy largos la transcripción puede tardar más."},
                {"q": "¿Es gratis?", "a": "Sí. 5 transcripciones gratis al día sin cuenta. Con cuenta gratuita, 250 al mes."},
            ],
            "closing": "El input está arriba. Tarda menos en probarlo que en seguir leyendo esto.",
        },
        "reel-a-linkedin": {
            "title": "Convertir reel a post de LinkedIn con IA · ReelScript",
            "description": "Transcribe cualquier reel o video y conviértelo en un post de LinkedIn con un click. IA que escribe como tú.",
            "canonical": "https://reelscript.net/es/reel-a-linkedin",
            "alt": "en/reel-to-linkedin",
            "h2_seo": "Del reel al post de LinkedIn en dos clicks",
            "how_to_label": "Cómo hacerlo",
            "faq_label": "Preguntas frecuentes",
            "cta_label": "Probar ahora →",
            "intro_paragraphs": [
                "Grabas un video para Instagram o TikTok. Funciona. Y luego no lo reutilizas en LinkedIn porque convertir el audio en un post profesional lleva tiempo que no tienes. Es una pena, porque el mensaje ya lo validaste — solo cambia el canal.",
                "ReelScript lo hace en dos pasos. Primero transcribe el reel — 10 segundos. Luego le dices «LinkedIn» y la IA lo reformatea: tono reflexivo, párrafos cortos, pregunta al final. El texto es tuyo, la IA solo lo ordena. Si tienes un asistente configurado con tu estilo, lo aplicará automáticamente.",
                "Y si quieres leer el guión en cámara antes de publicarlo en LinkedIn, el teleprompter integrado te lo muestra a la velocidad que necesitas. Sin memorizar, sin improvisar.",
            ],
            "how_to_steps": [
                "Pega el link del reel arriba y transcríbelo.",
                "En el panel «Hazlo tuyo», selecciona el estilo «LinkedIn».",
                "La IA reformatea el guión con tono profesional. Cópialo y publícalo, o ábrelo en el teleprompter.",
            ],
            "faq": [
                {"q": "¿El post de LinkedIn suena a IA?", "a": "Depende de tu guión original. La IA reformatea lo que ya dijiste en el video — si tu voz es auténtica en el reel, el post también lo será."},
                {"q": "¿Puedo guardar el resultado en un proyecto?", "a": "Sí. Puedes guardar cualquier guión en proyectos organizados, asignarle métricas de rendimiento y rastrear qué contenido funciona mejor."},
                {"q": "¿Puedo ajustar el tono antes de publicar?", "a": "Sí. El texto que devuelve la IA es editable. Cópialo y ajusta lo que no encaje con tu estilo — o crea un asistente personalizado para que siempre salga como quieres."},
                {"q": "¿Qué pasa si el reel es muy corto, de 15 segundos?", "a": "Sale un post corto. Un reel de 15 segundos bien grabado puede dar un post de LinkedIn perfectamente legible."},
            ],
            "closing": "El reel ya lo tienes. El post tarda 10 segundos más. Arriba el input.",
        },
        "hooks-desde-reel": {
            "title": "Generar hooks desde un reel con IA · ReelScript",
            "description": "Extrae 5 hooks de apertura de cualquier reel o video en un click. Para Instagram, TikTok, YouTube Shorts.",
            "canonical": "https://reelscript.net/es/hooks-desde-reel",
            "alt": "en/hooks-from-video",
            "h2_seo": "5 hooks de apertura desde cualquier reel, en un click",
            "how_to_label": "Cómo hacerlo",
            "faq_label": "Preguntas frecuentes",
            "cta_label": "Probar ahora →",
            "intro_paragraphs": [
                "El hook decide si alguien sigue viendo o no. Los primeros 2 segundos. Y la mayoría de creadores los improvisan, los repiten o los copian de otros sin entender por qué funcionan. Normal, es lo más difícil de escribir.",
                "Si tienes un reel que funcionó — retención, comentarios, guardados — el hook ya está en el guión. ReelScript lo transcribe y genera 5 variaciones de apertura distintas: pregunta directa, dato, confesión, provocación, promesa concreta. Tú eliges cuál graba mañana. Y si quieres leerlo sin improvisar, lo abres en el teleprompter y listo.",
                "No es escribir hooks desde cero. Es extraer los que ya funcionaron y multiplicarlos. ReelScript guarda todo en proyectos para que puedas ver qué hooks tienen mejor rendimiento a lo largo del tiempo.",
            ],
            "how_to_steps": [
                "Transcribe el reel que quieras usar como base.",
                "En «Hazlo tuyo», selecciona el estilo «5 hooks».",
                "La IA te devuelve 5 aperturas distintas. Guarda las que quieras o ábrelas en el teleprompter.",
            ],
            "faq": [
                {"q": "¿Los hooks son genéricos o específicos al video?", "a": "Específicos. La IA trabaja con el guión transcrito — si el reel habla de edición de video, los hooks hablan de edición de video."},
                {"q": "¿Puedo usar hooks de un video de otra persona como referencia?", "a": "Puedes transcribir cualquier reel público y ver cómo estructura los hooks. Lo que hagas con ellos es tu responsabilidad."},
                {"q": "¿Para qué formatos sirven?", "a": "Para cualquier video corto: Instagram Reels, TikTok, YouTube Shorts. También sirven como primera frase de un post o hilo."},
                {"q": "¿Puedo grabarme leyendo los hooks?", "a": "Sí. Puedes abrir cualquier guión en el teleprompter integrado de ReelScript y grabarte leyéndolo a cámara, sin cortes ni improvisar."},
                {"q": "¿Cuántos hooks genera?", "a": "5 por defecto. Suficientes para tener variedad sin saturarte."},
            ],
            "closing": "Los hooks de tus próximas grabaciones están en los reels que ya tienes. Arriba el input.",
        },
        "transcribir-audio-video": {
            "title": "Transcribir audio de video a texto gratis · ReelScript",
            "description": "Convierte el audio de cualquier reel o video a texto en segundos. Compatible con Instagram y TikTok. Sin instalar nada.",
            "canonical": "https://reelscript.net/es/transcribir-audio-video",
            "alt": "en/free-video-transcription",
            "h2_seo": "Convierte el audio de cualquier video a texto",
            "how_to_label": "Cómo hacerlo",
            "faq_label": "Preguntas frecuentes",
            "cta_label": "Probar ahora →",
            "intro_paragraphs": [
                "Transcribir audio de video a mano tarda lo que dura el video, más el tiempo de tipeo. Para un reel de 60 segundos, 5 minutos. Para varios al día, una tarde. Es tiempo que ningún creador tiene — ni debería gastar en esto.",
                "ReelScript coge el link, extrae el audio y lo pasa por Whisper. En 10 segundos tienes el texto. Pero no es solo transcripción — es el punto de partida de tu gestión de contenido. Desde el texto puedes reformatear con IA, organizar en proyectos, crear guiones para futuras grabaciones y leerlos en el teleprompter integrado.",
                "Compatible con Instagram Reels y TikTok. Sin instalar nada, sin subir archivos.",
            ],
            "how_to_steps": [
                "Copia el link del reel o TikTok que quieres transcribir.",
                "Pégalo en el campo de arriba y pulsa «Transcribir».",
                "Tienes el texto del audio en segundos. Cópialo, trabájalo con IA o ábrelo en el teleprompter.",
            ],
            "faq": [
                {"q": "¿Funciona con cualquier tipo de video?", "a": "Con reels de Instagram y TikToks públicos. No con YouTube (de momento), ni con archivos locales."},
                {"q": "¿Qué precisión tiene la transcripción?", "a": "Alta, si el audio es claro. Whisper supera el 95% de precisión en condiciones normales. Con ruido de fondo o música alta puede cometer errores."},
                {"q": "¿Puedo organizar los textos transcritos?", "a": "Sí. Con cuenta gratuita puedes guardarlos en proyectos, asignarles asistentes con tu estilo y rastrear métricas de rendimiento."},
                {"q": "¿Necesito instalar algo?", "a": "No. Funciona en el navegador. Sin extensiones, sin apps."},
                {"q": "¿Es gratis?", "a": "Sí. 5 transcripciones gratis al día sin cuenta. Con cuenta gratuita, 250 al mes sin tarjeta."},
            ],
            "closing": "Nada más que decir. El input está arriba.",
        },
    },
    "en": {
        "instagram-reel-transcript": {
            "title": "Instagram Reel Transcript — Free Online · ReelScript",
            "description": "Paste any Instagram reel URL and get the full transcript in 10 seconds. Free, no card, no signup.",
            "canonical": "https://reelscript.net/en/instagram-reel-transcript",
            "alt": "es/transcribir-reel-instagram",
            "h2_seo": "Transcribe any Instagram reel in 10 seconds",
            "how_to_label": "How to do it",
            "faq_label": "Frequently asked questions",
            "cta_label": "Try it now →",
            "intro_paragraphs": [
                "You record a reel that works. You post it. Done. That audio is worth five more things and you're throwing it away: a LinkedIn post, a thread, five hooks for tomorrow's recording, or reading it on the teleprompter to nail the next one without improvising.",
                "ReelScript is a content manager for creators. You transcribe the reel, reformat it with AI in whatever style you want, and save everything in organized projects. The transcription runs on Whisper — OpenAI's model, the best thing out there for this. Not taking credit for that. Ha.",
                "Paste the link. Hit transcribe. In 10 seconds you have the full script. Then pick: viral, LinkedIn, story, hooks, or load it into the built-in teleprompter to record the next video without winging it. One click per thing.",
            ],
            "how_to_steps": [
                "Copy the Instagram reel link from the app (Share → Copy link) or your browser.",
                "Paste it into the field above and hit «Transcribe».",
                "In 10 seconds you have the full text. Copy it, reformat with AI, or open it in the teleprompter.",
            ],
            "faq": [
                {"q": "Does it work with private reels or private accounts?", "a": "No. Public reels only. If the profile or reel is private, we can't access the audio."},
                {"q": "Does the transcript have a watermark or character limit?", "a": "No. The text is yours. No watermark, no cuts. What Whisper returns is what you see."},
                {"q": "What else can I do with the text besides copy it?", "a": "Reformat it with AI (viral, LinkedIn, story, 5 hooks), save it in a project, assign a custom assistant with your style, add performance metrics, or read it in the built-in teleprompter to record your next video."},
                {"q": "What languages does it support?", "a": "Any language Whisper supports — over 90. Spanish, English, French, Portuguese, German, Italian, Japanese... If the reel is in that language, it transcribes it."},
                {"q": "Is it free?", "a": "Yes. 5 free transcriptions per day without signing up. With a free account (no card) it goes up to 250 per month."},
            ],
            "closing": "That's it. The input is above.",
        },
        "tiktok-to-text": {
            "title": "TikTok to Text — Free Transcript · ReelScript",
            "description": "Paste any TikTok URL and get the full transcript in seconds. No signup, no credit card.",
            "canonical": "https://reelscript.net/en/tiktok-to-text",
            "alt": "es/transcribir-tiktok",
            "h2_seo": "Convert any TikTok to text in seconds",
            "how_to_label": "How to do it",
            "faq_label": "Frequently asked questions",
            "cta_label": "Try it now →",
            "intro_paragraphs": [
                "Some TikToks explain in 60 seconds what would take 600 words to write. That text exists — it's in the audio. What you don't have is time to transcribe it by hand. Nobody does, honestly.",
                "ReelScript isn't just a transcription tool — it's where you manage your content. Paste the TikTok link, in 10 seconds you have the text, and from there: copy it, reformat with AI, save it in a project, or load it into the teleprompter to record yourself reading the script without memorizing a thing.",
                "Works with any public TikTok. Transcription runs on Whisper, supports 90+ languages, high accuracy if the audio is clear.",
            ],
            "how_to_steps": [
                "Open the TikTok in the app or browser. Tap Share → Copy link.",
                "Paste the link in the field above and hit Transcribe.",
                "You have the text. Copy it, reformat with AI, or open it in the teleprompter.",
            ],
            "faq": [
                {"q": "Does it work with private TikToks?", "a": "No. Public TikToks only. If the account or video is private, we can't access the audio."},
                {"q": "What if the TikTok has no voice, just music?", "a": "The transcript will be empty or garbled. Whisper transcribes human speech — no voice, no useful text."},
                {"q": "Can I save the transcripts?", "a": "Yes. With an account, all texts are saved in your history and you can organize them in projects. Free account gets you this."},
                {"q": "Is there a video length limit?", "a": "TikToks are usually short, not a real issue. Very long videos may take a bit longer to process."},
                {"q": "Is it free?", "a": "Yes. 5 free transcriptions per day without an account. With a free account, 250 per month."},
            ],
            "closing": "The input is above. Faster to try than to keep reading.",
        },
        "reel-to-linkedin": {
            "title": "Reel to LinkedIn Post with AI · ReelScript",
            "description": "Transcribe any reel or video and turn it into a LinkedIn post in one click. AI that writes like you.",
            "canonical": "https://reelscript.net/en/reel-to-linkedin",
            "alt": "es/reel-a-linkedin",
            "h2_seo": "From reel to LinkedIn post in two clicks",
            "how_to_label": "How to do it",
            "faq_label": "Frequently asked questions",
            "cta_label": "Try it now →",
            "intro_paragraphs": [
                "You record a video for Instagram or TikTok. It works. Gets engagement. And then you don't repurpose it on LinkedIn because turning audio into a proper post takes time you don't have. Which is a shame — you already validated the message. Just changing the channel.",
                "ReelScript does it in two steps. Transcribe the reel — 10 seconds. Tell it «LinkedIn» — the AI reformats it: reflective tone, short paragraphs, question at the end. Your words, the AI just structures them. If you have a custom assistant set up with your style, it applies it automatically.",
                "And if you want to read the script on camera before publishing, the built-in teleprompter shows it at whatever speed you need. No memorizing, no winging it.",
            ],
            "how_to_steps": [
                "Paste the reel link above and transcribe it.",
                "In the «Make it yours» panel, select the «LinkedIn» style.",
                "The AI reformats the script. Copy and publish, or open it in the teleprompter.",
            ],
            "faq": [
                {"q": "Does the LinkedIn post sound like AI?", "a": "Depends on your original script. The AI reformats what you already said — if your voice is authentic in the reel, the post will be too."},
                {"q": "Can I save the result in a project?", "a": "Yes. You can save any script in organized projects, add performance metrics, and track what content performs best over time."},
                {"q": "Can I edit the tone before publishing?", "a": "Yes. The text the AI returns is fully editable. Or create a custom assistant so it always comes out how you want."},
                {"q": "What if the reel is very short, like 15 seconds?", "a": "You get a short post. A well-recorded 15-second reel can produce a perfectly readable LinkedIn post."},
            ],
            "closing": "You already have the reel. The post takes 10 more seconds. Input is above.",
        },
        "hooks-from-video": {
            "title": "Generate Video Hooks with AI · ReelScript",
            "description": "Extract 5 opening hooks from any reel or video in one click. For Instagram, TikTok, YouTube Shorts.",
            "canonical": "https://reelscript.net/en/hooks-from-video",
            "alt": "es/hooks-desde-reel",
            "h2_seo": "5 opening hooks from any reel, in one click",
            "how_to_label": "How to do it",
            "faq_label": "Frequently asked questions",
            "cta_label": "Try it now →",
            "intro_paragraphs": [
                "The hook decides whether someone keeps watching or not. The first 2 seconds. Most creators improvise them, repeat them, or copy them from others without understanding why they work. Fair enough — it's the hardest thing to write.",
                "If you have a reel that performed — good retention, comments, saves — the hook is already in the script. ReelScript transcribes it and generates 5 different opening variations: direct question, surprising stat, confession, provocation, concrete promise. You pick which one you record tomorrow. Want to read it without improvising? Open it in the teleprompter and go.",
                "Not writing hooks from scratch. Extracting the ones that already worked and multiplying them. ReelScript saves everything in projects so you can track which hooks get the best results over time.",
            ],
            "how_to_steps": [
                "Transcribe the reel you want to use as a base.",
                "In «Make it yours», select the «5 hooks» style.",
                "The AI returns 5 different openings. Save the ones you like or open them in the teleprompter.",
            ],
            "faq": [
                {"q": "Are the hooks generic or specific to the video?", "a": "Specific. The AI works with your transcribed script — if the reel is about video editing, the hooks are about video editing."},
                {"q": "Can I use hooks from someone else's video as reference?", "a": "You can transcribe any public reel and see how their hooks are structured. What you do with them is on you."},
                {"q": "What formats are these hooks for?", "a": "Any short video: Instagram Reels, TikTok, YouTube Shorts. Also work as the first line of a post or thread."},
                {"q": "Can I record myself reading the hooks?", "a": "Yes. Open any script in ReelScript's built-in teleprompter and record yourself reading it on camera. No cuts, no winging it."},
                {"q": "How many hooks does it generate?", "a": "5 by default. Enough variety without overwhelming you."},
            ],
            "closing": "The hooks for your next recordings are in the reels you already have. Input is above.",
        },
        "free-video-transcription": {
            "title": "Free Video Transcription Online · ReelScript",
            "description": "Convert audio from any reel or video to text in seconds. Works with Instagram and TikTok. No install needed.",
            "canonical": "https://reelscript.net/en/free-video-transcription",
            "alt": "es/transcribir-audio-video",
            "h2_seo": "Convert any video audio to text",
            "how_to_label": "How to do it",
            "faq_label": "Frequently asked questions",
            "cta_label": "Try it now →",
            "intro_paragraphs": [
                "Transcribing video audio by hand takes as long as the video, plus typing time. For a 60-second reel, 5 minutes. For several a day, an afternoon. Time no creator has — or should spend on this.",
                "ReelScript takes the link, pulls the audio, runs it through Whisper. In 10 seconds you have the text. But it's not just transcription — it's the starting point for your content management. From the text: reformat with AI, organize in projects, build scripts for future recordings, and read them in the built-in teleprompter.",
                "Works with public Instagram Reels and TikTok. No install, no file uploads.",
            ],
            "how_to_steps": [
                "Copy the reel or TikTok link you want to transcribe.",
                "Paste it in the field above and hit Transcribe.",
                "You have the audio text in seconds. Copy it, work it with AI, or open it in the teleprompter.",
            ],
            "faq": [
                {"q": "Does it work with any video type?", "a": "With public Instagram Reels and TikToks. Not YouTube (for now), not local files."},
                {"q": "How accurate is the transcription?", "a": "High, if the audio is clear. Whisper exceeds 95% accuracy under normal conditions. Heavy background noise or music can cause errors."},
                {"q": "Can I organize the transcribed texts?", "a": "Yes. With a free account you can save them in projects, assign custom assistants, and track performance metrics."},
                {"q": "Do I need to install anything?", "a": "No. Works in the browser. No extensions, no apps."},
                {"q": "Is it free?", "a": "Yes. 5 free transcriptions per day without an account. With a free account, 250 per month, no card required."},
            ],
            "closing": "Nothing more to say. The input is above.",
        },
    },
}


@app.route("/<lang>/<slug>")
def pillar_page(lang, slug):
    if lang not in ("es", "en"):
        abort(404)
    page_data = PILLAR_PAGES.get(lang, {}).get(slug)
    if not page_data:
        abort(404)
    return render_template("index.html", pillar=page_data, lang=lang)


@app.route("/sitemap.xml")
def sitemap():
    BASE = "https://reelscript.net"
    # Home pages
    urls = [
        {"loc": f"{BASE}/es/", "priority": "1.0", "freq": "weekly",
         "hreflang_es": f"{BASE}/es/", "hreflang_en": f"{BASE}/en/"},
        {"loc": f"{BASE}/en/", "priority": "1.0", "freq": "weekly",
         "hreflang_es": f"{BASE}/es/", "hreflang_en": f"{BASE}/en/"},
    ]
    # Pillar pages with cross-language hreflang
    for lang, pages in PILLAR_PAGES.items():
        for slug, data in pages.items():
            alt = data.get("alt", "")
            alt_lang = "en" if lang == "es" else "es"
            urls.append({
                "loc": f"{BASE}/{lang}/{slug}",
                "priority": "0.9",
                "freq": "monthly",
                "hreflang_es": f"{BASE}/es/{slug}" if lang == "es" else f"{BASE}/{alt}",
                "hreflang_en": f"{BASE}/en/{slug}" if lang == "en" else f"{BASE}/{alt}",
            })

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
    xml += 'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    for u in urls:
        xml += "  <url>\n"
        xml += f"    <loc>{u['loc']}</loc>\n"
        xml += f"    <changefreq>{u['freq']}</changefreq>\n"
        xml += f"    <priority>{u['priority']}</priority>\n"
        xml += f'    <xhtml:link rel="alternate" hreflang="es" href="{u["hreflang_es"]}"/>\n'
        xml += f'    <xhtml:link rel="alternate" hreflang="en" href="{u["hreflang_en"]}"/>\n'
        xml += f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}/"/>\n'
        xml += "  </url>\n"
    xml += "</urlset>"
    return Response(xml, mimetype="application/xml")


@app.route("/robots.txt")
def robots():
    txt = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /auth/\n"
        "Disallow: /stripe-webhook\n"
        "Disallow: /checkout\n"
        "Disallow: /task/\n"
        "\n"
        "Sitemap: https://reelscript.net/sitemap.xml\n"
    )
    return Response(txt, mimetype="text/plain")


@app.route("/affiliate")
def affiliate_page():
    return render_template("affiliate.html")


@app.route("/cookies")
def cookies_page():
    return render_template("cookies.html")


@app.route("/privacy")
def privacy_page():
    return render_template("privacy.html")


@app.route("/terms")
def terms_page():
    return render_template("terms.html")


@app.route("/legal")
def legal_notice_page():
    return render_template("legal.html")


@app.route("/forgot-password")
def forgot_password_page():
    return render_template("forgot-password.html")


@app.route("/reset-password")
def reset_password_page():
    return render_template("reset-password.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5555))
    app.run(debug=True, host="0.0.0.0", port=port)
