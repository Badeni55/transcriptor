"""
v0.14.24 — Email activation flow (Resend).

Módulo único para el envío de emails transaccionales y de activación.
Cubre: render de templates ES/EN, decisión de bifurcación día 1 / día 7,
envío vía Resend HTTP API, logging en email_log, tracking PostHog.

PII policy: nunca loggear email completo a INFO/WARNING — solo user_id.
Emails completos solo a DEBUG (deshabilitado en prod).
"""

import os
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

import requests
from supabase import create_client

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_API_URL = "https://api.resend.com/emails"
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Reelscript <contacto@reelscript.net>")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "contacto@reelscript.net")
APP_URL = os.environ.get("APP_URL", "https://reelscript.net")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

POSTHOG_API_KEY = os.environ.get("POSTHOG_API_KEY", "")
POSTHOG_HOST = os.environ.get("POSTHOG_HOST", "https://eu.posthog.com")

_db_client = None
_posthog_client = None


def _db():
    global _db_client
    if _db_client is None:
        _db_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _db_client


def _posthog():
    global _posthog_client
    if _posthog_client is None and POSTHOG_API_KEY:
        try:
            from posthog import Posthog
            _posthog_client = Posthog(POSTHOG_API_KEY, host=POSTHOG_HOST)
        except Exception as e:
            logger.warning("PostHog init failed: %s", e)
            _posthog_client = False
    return _posthog_client or None


def track(event, distinct_id, properties=None):
    """Best-effort PostHog capture. No-op si no hay API key o falla."""
    ph = _posthog()
    if not ph:
        return
    try:
        ph.capture(distinct_id=distinct_id, event=event, properties=properties or {})
    except Exception as e:
        logger.warning("PostHog capture failed: %s", e)


def track_script_generated(user_id, props=None):
    """Bloque growth-1 — instrumentación de ACTIVACIÓN.

    Llamar tras insertar con éxito un guion (sync en app.py o async en tasks.py).
    Cuenta los guiones del usuario y dispara:
      - `script_generated`   (siempre).
      - `first_script_generated`  SOLO la primera vez (0→1). Esta es la métrica
        de activación del research («primer guion en sesión 1»): añade
        `hours_since_signup` para que el funnel active = first_script <24h sea
        trivial en PostHog. Best-effort: cualquier fallo es no-op silencioso.
    Idempotente de facto: depende del count real en DB, no de un flag local."""
    props = dict(props or {})
    try:
        db = _db()
        cnt = (db.table("scripts").select("id", count="exact")
                 .eq("user_id", user_id).execute())
        total = cnt.count if cnt.count is not None else len(cnt.data or [])
    except Exception as e:
        logger.warning("track_script_generated count failed user=%s err=%s", user_id, e)
        total = None

    props["script_count"] = total
    track("script_generated", user_id, props)

    if total == 1:
        hours = None
        try:
            prof = (db.table("profiles")
                      .select("created_at, terms_accepted_at")
                      .eq("id", user_id).single().execute())
            stamp = (prof.data or {}).get("created_at") or (prof.data or {}).get("terms_accepted_at")
            if stamp:
                from datetime import datetime, timezone
                signed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
                hours = round((datetime.now(timezone.utc) - signed).total_seconds() / 3600.0, 2)
        except Exception:
            pass
        track("first_script_generated", user_id, {**props, "hours_since_signup": hours})


# ── Templates ─────────────────────────────────────────────────────────────

def _btn(href, label):
    return (
        f'<a href="{href}" style="display:inline-block;background:#ef6a29;'
        f'color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:600;'
        f'text-decoration:none;font-size:16px;margin:18px 0">{label}</a>'
    )


def _wrap_html(body_html, unsubscribe_url, lang="es"):
    foot_unsub = "darse de baja" if lang == "es" else "unsubscribe"
    return (
        '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" '
        '"http://www.w3.org/TR/html4/loose.dtd">\n'
        '<html><body style="margin:0;padding:24px;background:#fafafa;'
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;'
        'color:#1a1a1a;line-height:1.6">'
        '<div style="max-width:560px;margin:0 auto;background:#ffffff;'
        'border-radius:12px;padding:32px 28px">'
        f'<img src="{APP_URL}/static/img/branding/isotipo-128.png" '
        'alt="Reelscript" width="48" height="48" '
        'style="display:block;margin-bottom:24px;border:0">'
        f'{body_html}'
        '<p style="margin-top:36px;font-size:11px;color:#888;line-height:1.6">'
        f'<a href="{APP_URL}" style="color:#888;text-decoration:none">reelscript.net</a> · '
        f'<a href="{unsubscribe_url}" style="color:#888;text-decoration:underline">{foot_unsub}</a>'
        '</p></div></body></html>'
    )


def _wrap_text(body_text, unsubscribe_url, lang="es"):
    foot = (
        "reelscript.net · darse de baja: " if lang == "es"
        else "reelscript.net · unsubscribe: "
    )
    return f"{body_text}\n\n{foot}{unsubscribe_url}"


# template_key → (lang → {subject, body_html_inner, body_text_inner, cta_href})
# body_html_inner ya incluye el botón inline.
TEMPLATES = {
    "welcome": {
        "es": {
            "subject": "tío transcríbete un reel o qué",
            "html": (
                "<p>hola creador.</p>"
                "<p>bro acabas de entrar a reelscript y eso ya es mucho.</p>"
                "<p>lo siguiente es que pulses un botón. en serio. te hemos dejado un reel "
                "viral en el dashboard, le das y en 30 segundos lo tienes en texto. sin "
                "tutoriales ni mierdas.</p>"
                + _btn(f"{APP_URL}/profile/overview", "vamos →")
            ),
            "text": (
                "hola creador.\n\n"
                "bro acabas de entrar a reelscript y eso ya es mucho.\n\n"
                "lo siguiente es que pulses un botón. en serio. te hemos dejado un reel "
                "viral en el dashboard, le das y en 30 segundos lo tienes en texto. sin "
                "tutoriales ni mierdas.\n\n"
                f"vamos: {APP_URL}/profile/overview"
            ),
        },
        "en": {
            "subject": "yo transcribe a reel already",
            "html": (
                "<p>hey creator.</p>"
                "<p>bro you just hit reelscript and that's already a lot.</p>"
                "<p>next step: press one button. for real. we left you a viral reel in the "
                "dashboard, hit it and in 30 seconds you get the text. no tutorials, no bs.</p>"
                + _btn(f"{APP_URL}/profile/overview", "let's go →")
            ),
            "text": (
                "hey creator.\n\n"
                "bro you just hit reelscript and that's already a lot.\n\n"
                "next step: press one button. for real. we left you a viral reel in the "
                "dashboard, hit it and in 30 seconds you get the text. no tutorials, no bs.\n\n"
                f"let's go: {APP_URL}/profile/overview"
            ),
        },
    },
    "day1_no_transcribe": {
        "es": {
            "subject": "ayer no apareciste fr",
            "html": (
                "<p>hola creador.</p>"
                "<p>te registraste y no has hecho nada. literalmente nada.</p>"
                "<p>pega una url de instagram o tiktok, dale al botón, y tienes el guion "
                "completo. eso es todo. no hay truco.</p>"
                + _btn(f"{APP_URL}/profile/overview", "va →")
            ),
            "text": (
                "hola creador.\n\n"
                "te registraste y no has hecho nada. literalmente nada.\n\n"
                "pega una url de instagram o tiktok, dale al botón, y tienes el guion "
                "completo. eso es todo. no hay truco.\n\n"
                f"va: {APP_URL}/profile/overview"
            ),
        },
        "en": {
            "subject": "yesterday you ghosted us",
            "html": (
                "<p>hey creator.</p>"
                "<p>you signed up and did nothing. literally nothing.</p>"
                "<p>paste an instagram or tiktok url, hit the button, and you get the full "
                "script. that's it. no catch.</p>"
                + _btn(f"{APP_URL}/profile/overview", "go →")
            ),
            "text": (
                "hey creator.\n\n"
                "you signed up and did nothing. literally nothing.\n\n"
                "paste an instagram or tiktok url, hit the button, and you get the full "
                "script. that's it. no catch.\n\n"
                f"go: {APP_URL}/profile/overview"
            ),
        },
    },
    "day1_transcribed": {
        "es": {
            "subject": "mira esto antes de hacer otro reel",
            "html": (
                "<p>hola creador.</p>"
                "<p>ok ya transcribiste uno. respect.</p>"
                "<p>ahora la parte que casi nadie ve: hemos analizado tus métricas y ahí "
                "hay cosas. patrones de lo que te funciona. abre y míralo, te ahorra mil "
                "horas pensando qué grabar.</p>"
                + _btn(f"{APP_URL}/profile/metrics", "ver mis métricas →")
            ),
            "text": (
                "hola creador.\n\n"
                "ok ya transcribiste uno. respect.\n\n"
                "ahora la parte que casi nadie ve: hemos analizado tus métricas y ahí hay "
                "cosas. patrones de lo que te funciona. abre y míralo, te ahorra mil "
                "horas pensando qué grabar.\n\n"
                f"ver mis métricas: {APP_URL}/profile/metrics"
            ),
        },
        "en": {
            "subject": "check this before your next reel",
            "html": (
                "<p>hey creator.</p>"
                "<p>ok you transcribed one. respect.</p>"
                "<p>now the part almost nobody sees: we analyzed your metrics and there's "
                "stuff there. patterns of what works for you. open it and look — saves you "
                "a thousand hours thinking about what to record.</p>"
                + _btn(f"{APP_URL}/profile/metrics", "see my metrics →")
            ),
            "text": (
                "hey creator.\n\n"
                "ok you transcribed one. respect.\n\n"
                "now the part almost nobody sees: we analyzed your metrics and there's "
                "stuff there. patterns of what works for you. open it and look — saves you "
                "a thousand hours thinking about what to record.\n\n"
                f"see my metrics: {APP_URL}/profile/metrics"
            ),
        },
    },
    "day7_no_transcribe": {
        "es": {
            "subject": "última y nos piramos",
            "html": (
                "<p>hola creador.</p>"
                "<p>una semana registrado y cero.</p>"
                "<p>o la liamos nosotros explicándolo, o esto no es para ti.</p>"
                "<p>si es lo primero, contesta este email y te ayudo personalmente. si es "
                "lo segundo, all good.</p>"
                + _btn("mailto:contacto@reelscript.net?subject=ayuda", "contestar")
            ),
            "text": (
                "hola creador.\n\n"
                "una semana registrado y cero.\n\n"
                "o la liamos nosotros explicándolo, o esto no es para ti.\n\n"
                "si es lo primero, contesta este email y te ayudo personalmente. si es "
                "lo segundo, all good."
            ),
        },
        "en": {
            "subject": "last one and we're out",
            "html": (
                "<p>hey creator.</p>"
                "<p>a week signed up and zero.</p>"
                "<p>either we're failing to explain it, or this isn't for you.</p>"
                "<p>if it's the first, reply to this email and i'll help you personally. "
                "if it's the second, all good.</p>"
                + _btn("mailto:contacto@reelscript.net?subject=help", "reply")
            ),
            "text": (
                "hey creator.\n\n"
                "a week signed up and zero.\n\n"
                "either we're failing to explain it, or this isn't for you.\n\n"
                "if it's the first, reply to this email and i'll help you personally. "
                "if it's the second, all good."
            ),
        },
    },
    "day7_no_adapt": {
        "es": {
            "subject": "tu transcripción está ahí muriendo",
            "html": (
                "<p>hola creador.</p>"
                "<p>transcribiste un reel y lo dejaste pudriéndose.</p>"
                "<p>la transcripción es el principio, no el final, crack. métela en hazlo "
                "tuyo y te lo adapta a linkedin, historia, hooks, lo que necesites. en "
                "segundos.</p>"
                + _btn(f"{APP_URL}/profile/adapt", "transformar →")
            ),
            "text": (
                "hola creador.\n\n"
                "transcribiste un reel y lo dejaste pudriéndose.\n\n"
                "la transcripción es el principio, no el final, crack. métela en hazlo "
                "tuyo y te lo adapta a linkedin, historia, hooks, lo que necesites. en "
                "segundos.\n\n"
                f"transformar: {APP_URL}/profile/adapt"
            ),
        },
        "en": {
            "subject": "your transcription is dying out there",
            "html": (
                "<p>hey creator.</p>"
                "<p>you transcribed a reel and left it rotting.</p>"
                "<p>the transcription is the start, not the end, crack. drop it in make "
                "it yours and it adapts to linkedin, story, hooks, whatever you need. in "
                "seconds.</p>"
                + _btn(f"{APP_URL}/profile/adapt", "transform →")
            ),
            "text": (
                "hey creator.\n\n"
                "you transcribed a reel and left it rotting.\n\n"
                "the transcription is the start, not the end, crack. drop it in make it "
                "yours and it adapts to linkedin, story, hooks, whatever you need. in "
                "seconds.\n\n"
                f"transform: {APP_URL}/profile/adapt"
            ),
        },
    },
}


# ── Resend HTTP ───────────────────────────────────────────────────────────

def _send_via_resend(to_email, subject, html, text):
    """Envía vía Resend HTTP API. Devuelve (resend_id, error_str)."""
    if not RESEND_API_KEY:
        return None, "RESEND_API_KEY not configured"
    try:
        r = requests.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": EMAIL_FROM,
                "to": [to_email],
                "subject": subject,
                "html": html,
                "text": text,
                "reply_to": EMAIL_REPLY_TO,
            },
            timeout=15,
        )
        if r.status_code >= 400:
            return None, f"resend_http_{r.status_code}: {r.text[:200]}"
        data = r.json()
        return data.get("id"), None
    except Exception as e:
        return None, f"resend_exception: {type(e).__name__}"


# ── Decision logic ───────────────────────────────────────────────────────

class MissingTableError(Exception):
    """Raised when Supabase reports the queried table doesn't exist (PGRST205).
    Distinta de errores de red/timeout — un nombre de tabla mal escrito debe
    fallar ruidosamente en vez de devolver 0 silenciosamente."""


def _count(table, user_id):
    try:
        r = _db().table(table).select("id", count="exact").eq("user_id", user_id).execute()
        return r.count or 0
    except Exception as e:
        # PGRST205 = "Could not find the table ... in the schema cache".
        # Re-lanzamos para evitar que un typo de tabla cause comportamiento
        # silenciosamente incorrecto (e.g. emails day7_no_adapt enviados a
        # users con scripts porque el count siempre era 0).
        err_str = str(e)
        if "PGRST205" in err_str or "schema cache" in err_str:
            logger.error("count: missing table table=%s err=%s", table, err_str)
            raise MissingTableError(f"table {table!r} not found: {err_str}") from e
        logger.warning("count failed table=%s user=%s err=%s", table, user_id, e)
        return 0


def decide_template(user_id, slot):
    """
    slot: 'day1' or 'day7'
    Returns final template_key or None (skip — already activated).
    """
    transcribe_count = _count("transcriptions", user_id)
    if slot == "day1":
        return "day1_transcribed" if transcribe_count >= 1 else "day1_no_transcribe"
    if slot == "day7":
        if transcribe_count == 0:
            return "day7_no_transcribe"
        adapt_count = _count("scripts", user_id)
        if adapt_count == 0:
            return "day7_no_adapt"
        return None
    return None


# ── Send pipeline ─────────────────────────────────────────────────────────

def _user_email(user_id):
    """Return (email, email_confirmed_at) tuple from auth.users via admin API."""
    try:
        result = _db().auth.admin.get_user_by_id(user_id)
        u = result.user
        return (u.email, getattr(u, "email_confirmed_at", None))
    except Exception as e:
        logger.warning("get_user_by_id failed user=%s err=%s", user_id, e)
        return (None, None)


def _profile(user_id):
    try:
        r = _db().table("profiles").select(
            "lang, email_marketing, unsubscribe_token"
        ).eq("id", user_id).single().execute()
        return r.data or {}
    except Exception as e:
        logger.warning("profile fetch failed user=%s err=%s", user_id, e)
        return {}


def _rate_limited(user_id):
    """True si user ya recibió >=3 emails en las últimas 24h."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    try:
        r = _db().table("email_log").select(
            "id", count="exact"
        ).eq("user_id", user_id).eq("status", "sent").gte("sent_at", cutoff).execute()
        return (r.count or 0) >= 3
    except Exception as e:
        logger.warning("rate_limited check failed user=%s err=%s", user_id, e)
        return False


def send_template(user_id, template_key):
    """
    Render + send + update email_log row matching (user_id, template_key).
    Para slots con bifurcación (day1_pending / day7_pending), llamar primero
    a process_pending_row() que reescribe el template_key al final.
    """
    profile = _profile(user_id)
    email, confirmed_at = _user_email(user_id)

    db = _db()

    # Skips defensivos:
    if not email:
        db.table("email_log").update({
            "status": "skipped", "error": "no_email", "sent_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        return False
    if not confirmed_at:
        db.table("email_log").update({
            "status": "skipped", "error": "email_not_confirmed", "sent_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        return False
    if not profile.get("email_marketing", True):
        db.table("email_log").update({
            "status": "skipped", "error": "marketing_opted_out", "sent_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        return False
    if _rate_limited(user_id):
        db.table("email_log").update({
            "status": "skipped", "error": "rate_limited"
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        return False

    lang = profile.get("lang") or "es"
    if lang not in ("es", "en"):
        lang = "es"
    tpl = TEMPLATES.get(template_key, {}).get(lang)
    if not tpl:
        db.table("email_log").update({
            "status": "failed", "error": f"template_missing:{template_key}:{lang}"
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        return False

    token = profile.get("unsubscribe_token") or ""
    unsub_url = f"{APP_URL}/unsubscribe?token={token}"
    html = _wrap_html(tpl["html"], unsub_url, lang)
    text = _wrap_text(tpl["text"], unsub_url, lang)

    resend_id, err = _send_via_resend(email, tpl["subject"], html, text)
    now = datetime.now(timezone.utc).isoformat()
    if err:
        db.table("email_log").update({
            "status": "failed", "error": err, "sent_at": now
        }).eq("user_id", user_id).eq("template_key", template_key).execute()
        track("email_failed", user_id, {"template_key": template_key, "error": err})
        logger.warning("email_failed user=%s template=%s err=%s", user_id, template_key, err)
        return False

    db.table("email_log").update({
        "status": "sent", "sent_at": now, "resend_id": resend_id
    }).eq("user_id", user_id).eq("template_key", template_key).execute()
    track("email_sent", user_id, {"template_key": template_key, "resend_id": resend_id})
    logger.info("email_sent user=%s template=%s resend_id=%s", user_id, template_key, resend_id)
    return True


def process_pending_row(row):
    """
    row: dict from email_log. Si template_key es 'day1_pending' o 'day7_pending',
    decide y reescribe el row con el template final, luego envía.
    """
    user_id = row["user_id"]
    pending = row["template_key"]

    if pending in ("day1_pending", "day7_pending"):
        slot = "day1" if pending == "day1_pending" else "day7"
        final_key = decide_template(user_id, slot)
        if final_key is None:
            # ya activado, skip
            _db().table("email_log").update({
                "status": "skipped", "error": "already_activated",
                "sent_at": datetime.now(timezone.utc).isoformat()
            }).eq("user_id", user_id).eq("template_key", pending).execute()
            track("email_skipped", user_id, {"template_key": pending, "reason": "already_activated"})
            return
        # rename pending → final_key (idempotente: ON CONFLICT no aplica, ya pasó UNIQUE check)
        try:
            _db().table("email_log").update({
                "template_key": final_key
            }).eq("user_id", user_id).eq("template_key", pending).execute()
        except Exception as e:
            logger.warning("rename pending failed user=%s err=%s", user_id, e)
            return
        send_template(user_id, final_key)
    else:
        send_template(user_id, pending)


def fetch_pending_emails(limit=100):
    """Returns list of email_log rows queued and due."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        r = _db().table("email_log").select(
            "user_id, template_key, scheduled_for"
        ).eq("status", "queued").lte("scheduled_for", now).order(
            "scheduled_for", desc=False
        ).limit(limit).execute()
        return r.data or []
    except Exception as e:
        logger.warning("fetch_pending_emails failed: %s", e)
        return []


# ── v0.16.x Radar: email diario "Lo que petó en tu nicho" ──────────────────
# Dinámico (reels distintos por usuario) → no usa TEMPLATES estático ni
# send_template. Idempotente por día vía UNIQUE(user_id, template_key) con
# template_key = "radar_digest_<YYYY-MM-DD>". El cálculo de qué reels enviar
# (explosión >= 2x, últimas 48h) lo hace la tarea Beat tasks.send_radar_digests,
# que pasa aquí la lista ya filtrada/ordenada.

def _radar_digest_body(reels, lang, next_suggestion=None):
    """Devuelve (inner_html, inner_text). reels: lista de dicts con
    {username, caption, views, explosion}. Texto-forward (sin depender de
    imágenes — muchos clientes de correo bloquean data: URIs / hotlinks IG).

    next_suggestion (opcional): dict {title, views, ...} de
    next_series_suggestion → renderiza un bloque "el siguiente de esa serie"
    ANTES del listado de reels. None = no se renderiza (firma retrocompatible)."""
    es = lang == "es"
    radar_url = f"{APP_URL}/profile/radar"
    intro = ("esto petó en tu nicho en las últimas 48h. róbalo antes que nadie 👇"
             if es else
             "this blew up in your niche in the last 48h. steal it before anyone else 👇")
    cta_card = "✨ Hazlo mío →" if es else "✨ Make it mine →"
    cta_big = "abrir mi Radar →" if es else "open my Radar →"
    avg = "su media" if es else "their avg"
    views_w = "vistas" if es else "views"

    cards_html = []
    cards_text = []
    for r in reels:
        user = "@" + str(r.get("username") or "")
        exp = r.get("explosion") or 0
        try:
            exp_txt = (str(int(round(exp))) if exp >= 10 else f"{float(exp):.1f}")
        except Exception:
            exp_txt = "2"
        views = r.get("views") or 0
        try:
            views_fmt = f"{int(views):,}".replace(",", ".")
        except Exception:
            views_fmt = str(views)
        cap = (str(r.get("caption") or "").strip().replace("\n", " "))
        if len(cap) > 120:
            cap = cap[:120].rstrip() + "…"
        cap_html = (cap or ("(sin texto)" if es else "(no caption)"))
        cards_html.append(
            '<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;'
            'border:1px solid #eee;border-radius:10px"><tr><td style="padding:16px 18px">'
            f'<div style="font-weight:700;color:#1a1a1a;font-size:15px">{user}</div>'
            f'<div style="margin:6px 0;font-size:13px"><span style="background:#ff2d55;'
            'color:#fff;border-radius:999px;padding:2px 9px;font-weight:700;font-size:12px">'
            f'🔥 {exp_txt}x {avg}</span> &nbsp;<span style="color:#666">{views_fmt} {views_w}</span></div>'
            f'<div style="color:#444;font-size:14px;margin:8px 0 4px">{cap_html}</div>'
            f'<a href="{radar_url}" style="display:inline-block;margin-top:8px;color:#ef6a29;'
            f'font-weight:600;text-decoration:none;font-size:14px">{cta_card}</a>'
            '</td></tr></table>'
        )
        cards_text.append(
            f"{user} · 🔥 {exp_txt}x {avg} · {views_fmt} {views_w}\n  {cap}\n  {cta_card} {radar_url}"
        )

    # Bloque "el siguiente de esa serie, en tu voz" — antes del listado de reels.
    sug_html = ""
    sug_text = ""
    if next_suggestion:
        s_title = (str(next_suggestion.get("title") or "").strip()
                   or ("tu último guion" if es else "your last script"))
        s_views = next_suggestion.get("views")
        try:
            views_part = f" (×{int(s_views):,})".replace(",", ".") if s_views else ""
        except Exception:
            views_part = ""
        cta_next = "✍️ El siguiente, en mi voz →" if es else "✍️ The next one, in my voice →"
        if es:
            sug_line = (f"Lo que grabaste sobre «{s_title}» está rindiendo{views_part}. "
                        "¿El siguiente de esa serie, en tu voz?")
        else:
            sug_line = (f"What you recorded about “{s_title}” is taking off{views_part}. "
                        "The next one in that series, in your voice?")
        sug_html = (
            '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;'
            'border:1px solid #ffe0b2;background:#fff8f0;border-radius:10px">'
            '<tr><td style="padding:16px 18px">'
            f'<div style="color:#1a1a1a;font-size:15px;line-height:1.45">{sug_line}</div>'
            f'<a href="{radar_url}" style="display:inline-block;margin-top:10px;color:#ef6a29;'
            f'font-weight:600;text-decoration:none;font-size:14px">{cta_next}</a>'
            '</td></tr></table>'
        )
        sug_text = f"{sug_line}\n  {cta_next} {radar_url}\n\n"

    inner_html = (
        "<p>hola creador 👋</p>"
        f"<p>{intro}</p>"
        + sug_html
        + "".join(cards_html)
        + _btn(radar_url, cta_big)
    )
    inner_text = (
        "hola creador 👋\n\n"
        f"{intro}\n\n"
        + sug_text
        + "\n\n".join(cards_text)
        + f"\n\n{cta_big} {radar_url}"
    )
    return inner_html, inner_text


def send_radar_digest(user_id, reels, day_key, next_suggestion=None):
    """Envía el digest diario del Radar. Idempotente por (user_id, día).

    reels: lista ya filtrada/ordenada (top reels explosivos). day_key:
    'YYYY-MM-DD' UTC. next_suggestion (opcional): dict de next_series_suggestion
    → bloque "el siguiente de esa serie, en tu voz" antes del listado.
    Devuelve dict {sent|skipped|error}.
    """
    if not reels:
        return {"skipped": "no_reels"}

    key = f"radar_digest_{day_key}"
    db = _db()
    now = datetime.now(timezone.utc).isoformat()

    # Idempotencia atómica: insertar fila queued. Si choca con UNIQUE
    # (user_id, template_key) → ya gestionado hoy, salir sin reenviar.
    try:
        db.table("email_log").insert({
            "user_id": user_id, "template_key": key,
            "status": "queued", "scheduled_for": now,
        }).execute()
    except Exception:
        return {"skipped": "already_today"}

    def _skip(reason):
        db.table("email_log").update({
            "status": "skipped", "error": reason, "sent_at": now
        }).eq("user_id", user_id).eq("template_key", key).execute()
        return {"skipped": reason}

    profile = _profile(user_id)
    email, confirmed_at = _user_email(user_id)
    if not email:
        return _skip("no_email")
    if not confirmed_at:
        return _skip("email_not_confirmed")
    if not profile.get("email_marketing", True):
        return _skip("marketing_opted_out")
    if _rate_limited(user_id):
        return _skip("rate_limited")

    lang = profile.get("lang") or "es"
    if lang not in ("es", "en"):
        lang = "es"
    token = profile.get("unsubscribe_token") or ""
    unsub_url = f"{APP_URL}/unsubscribe?token={token}"

    n = len(reels)
    if lang == "es":
        subject = (f"🔥 {n} reels petaron en tu nicho"
                   if n > 1 else "🔥 un reel acaba de petar en tu nicho")
    else:
        subject = (f"🔥 {n} reels just blew up in your niche"
                   if n > 1 else "🔥 a reel just blew up in your niche")

    inner_html, inner_text = _radar_digest_body(reels, lang, next_suggestion)
    html = _wrap_html(inner_html, unsub_url, lang)
    text = _wrap_text(inner_text, unsub_url, lang)

    resend_id, err = _send_via_resend(email, subject, html, text)
    now2 = datetime.now(timezone.utc).isoformat()
    if err:
        db.table("email_log").update({
            "status": "failed", "error": err, "sent_at": now2
        }).eq("user_id", user_id).eq("template_key", key).execute()
        track("email_failed", user_id, {"template_key": "radar_digest", "error": err})
        return {"error": err}

    db.table("email_log").update({
        "status": "sent", "sent_at": now2, "resend_id": resend_id
    }).eq("user_id", user_id).eq("template_key", key).execute()
    track("email_sent", user_id, {"template_key": "radar_digest",
                                  "resend_id": resend_id, "reels": n})
    logger.info("radar_digest sent user=%s reels=%s", user_id, n)
    return {"sent": True}


# ── Signup hook ───────────────────────────────────────────────────────────

def gen_unsubscribe_token():
    return secrets.token_urlsafe(32)


def enqueue_signup_emails(user_id, lang="es"):
    """
    Called from /auth/register (and /auth/callback for new OAuth signups).
    Idempotente vía UNIQUE(user_id, template_key): re-llamadas no insertan duplicados.

    Inserts:
      - welcome (scheduled_for=NOW)
      - day1_pending (scheduled_for=NOW+24h)
      - day7_pending (scheduled_for=NOW+7d)

    NO envía welcome aquí — se delega a Celery (tasks.send_email_now.delay).
    """
    if lang not in ("es", "en"):
        lang = "es"
    now = datetime.now(timezone.utc)
    rows = [
        {"user_id": user_id, "template_key": "welcome",
         "status": "queued", "scheduled_for": now.isoformat()},
        {"user_id": user_id, "template_key": "day1_pending",
         "status": "queued", "scheduled_for": (now + timedelta(hours=24)).isoformat()},
        {"user_id": user_id, "template_key": "day7_pending",
         "status": "queued", "scheduled_for": (now + timedelta(days=7)).isoformat()},
    ]
    try:
        _db().table("email_log").upsert(
            rows, on_conflict="user_id,template_key", ignore_duplicates=True
        ).execute()
        for r in rows:
            track("email_queued", user_id, {
                "template_key": r["template_key"],
                "scheduled_for": r["scheduled_for"],
            })
        return True
    except Exception as e:
        logger.warning("enqueue_signup_emails failed user=%s err=%s", user_id, e)
        return False
