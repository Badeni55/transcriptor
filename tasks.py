import os
import time
import logging
import tempfile
from datetime import datetime, timezone
import requests
import yt_dlp
from celery import Celery
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger(__name__)


def _download_thumbnail_b64(url):
    """Download an image URL and return it as a small data-URL base64 JPEG."""
    if not url:
        return None
    try:
        from PIL import Image
        from io import BytesIO
        import base64
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content))
        img.thumbnail((320, 400))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=75, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        logger.warning("Thumbnail download failed for %s: %s", url, e)
        return None

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("reelscript", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
    task_track_started=True,
)

# v0.14.24: beat schedule — process_pending_emails cada 1h
celery_app.conf.beat_schedule = {
    "process-pending-emails": {
        "task": "tasks.process_pending_emails",
        "schedule": 3600.0,
    },
}
celery_app.conf.timezone = "UTC"


# v0.14.24: email tasks
@celery_app.task(name="tasks.send_email_now")
def send_email_now(user_id, template_key):
    """Welcome email (T+0) — disparado fire-and-forget desde signup.
    Para day1/day7 usar process_pending_emails (beat)."""
    try:
        from emails import send_template, process_pending_row
        if template_key in ("day1_pending", "day7_pending"):
            process_pending_row({"user_id": user_id, "template_key": template_key})
        else:
            send_template(user_id, template_key)
    except Exception as e:
        logger.warning("send_email_now failed user=%s template=%s err=%s",
                       user_id, template_key, e)


@celery_app.task(name="tasks.process_pending_emails")
def process_pending_emails():
    """Beat task: cada 1h chequea email_log queued and due.
    Bifurca day1_pending / day7_pending y envía. Idempotente."""
    try:
        from emails import fetch_pending_emails, process_pending_row
        rows = fetch_pending_emails(limit=200)
        if not rows:
            return {"processed": 0}
        sent = 0
        for row in rows:
            try:
                process_pending_row(row)
                sent += 1
            except Exception as e:
                logger.warning("process row failed user=%s template=%s err=%s",
                               row.get("user_id"), row.get("template_key"), e)
        return {"processed": sent}
    except Exception as e:
        logger.error("process_pending_emails failed: %s", e, exc_info=True)
        return {"error": str(e)[:200]}

def detect_platform(url):
    if "instagram.com" in url:
        return "instagram"
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    if "tiktok.com" in url:
        return "tiktok"
    return "otro"

def _ytdlp(url, output_dir):
    out = os.path.join(output_dir, "audio")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "128"}],
        "quiet": True,
        "no_warnings": True,
    }
    thumbnail_url = None
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info:
            thumbnail_url = info.get("thumbnail")
            if not thumbnail_url:
                thumbs = info.get("thumbnails") or []
                if thumbs:
                    thumbnail_url = thumbs[-1].get("url")
    return out + ".mp3", thumbnail_url

def _apify_instagram(url, output_dir):
    """Returns (mp3_path, thumbnail_url, apify_item) where apify_item is the
    full Apify response dict (contains views/likes/comments/shares/timestamp).
    apify_item is None when scraping fails (caller falls back to yt-dlp)."""
    APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
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
    thumbnail_url = item.get("displayUrl") or item.get("display_url") or item.get("thumbnailUrl")
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
    return mp3_path, thumbnail_url, item

def download_audio(url, output_dir, platform):
    """Returns (mp3_path, thumbnail_url, apify_item|None).
    apify_item is None for tiktok or when apify scrape failed and yt-dlp ran."""
    APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
    if platform == "instagram" and APIFY_TOKEN:
        try:
            return _apify_instagram(url, output_dir)
        except Exception:
            pass
    mp3, thumb = _ytdlp(url, output_dir)
    return mp3, thumb, None


def _apify_metrics_only(url):
    """Apify call solo para métricas (no audio). Reusa apify~instagram-scraper.
    Devuelve dict normalizado o None si falla."""
    APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
    if not APIFY_TOKEN:
        return None
    actor_url = (
        f"https://api.apify.com/v2/acts/apify~instagram-scraper"
        f"/run-sync-get-dataset-items?token={APIFY_TOKEN}&memory=256"
    )
    try:
        resp = requests.post(actor_url, json={"directUrls": [url], "resultsLimit": 1}, timeout=120)
        resp.raise_for_status()
        items = resp.json()
        if not items:
            return None
        return items[0]
    except Exception as e:
        logger.warning("apify metrics-only failed for %s: %s", url, e)
        return None


def _extract_metrics(apify_item):
    """Convierte un item de apify-instagram-scraper en columnas de la tabla."""
    if not apify_item:
        return {}
    return {
        "views":    apify_item.get("videoPlayCount") or apify_item.get("videoViewCount") or 0,
        "likes":    apify_item.get("likesCount") or 0,
        "comments": apify_item.get("commentsCount") or 0,
        "shares":   apify_item.get("sharesCount") or 0,
        "published_at": apify_item.get("timestamp"),
        "metrics_updated_at": datetime.utcnow().isoformat() + "Z",
    }

@celery_app.task(bind=True)
def transcribe_task(self, url, language, user_id, ip, is_paid=False):
    """v0.14.7: is_paid=True (plan pro/creator/agency) → guarda métricas
    Apify (views/likes/comments/shares/published_at) en la fila."""
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
    GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    COST_CENTS = 8

    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    platform = detect_platform(url)

    self.update_state(state="PROGRESS", meta={"step": "Descargando audio..."})

    thumbnail_url = None
    apify_item = None
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path, thumbnail_url, apify_item = download_audio(url, tmpdir, platform)

            self.update_state(state="PROGRESS", meta={"step": "Transcribiendo con IA..."})

            headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
            with open(audio_path, "rb") as f:
                files = {"file": ("audio.mp3", f, "audio/mpeg")}
                data = {"model": "whisper-large-v3", "response_format": "json"}
                if language:
                    data["language"] = language
                resp = requests.post(GROQ_URL, headers=headers, files=files, data=data, timeout=120)
                resp.raise_for_status()
                text = resp.json()["text"]

    except Exception as e:
        return {"ok": False, "error": str(e)}

    thumb_b64 = None
    try:
        thumb_b64 = _download_thumbnail_b64(thumbnail_url)
    except Exception as e:
        logger.warning("Thumbnail capture failed for %s: %s", url, e)

    insert_data = {
        "user_id": user_id,
        "ip": ip if not user_id else None,
        "url": url,
        "platform": platform,
        "language": language,
        "text": text,
        "cost_cents": COST_CENTS if user_id else 0,
        "thumbnail_b64": thumb_b64,
    }
    # v0.14.7: métricas solo para paid plans con datos Apify reales (Instagram).
    if is_paid and apify_item and platform == "instagram":
        insert_data.update(_extract_metrics(apify_item))

    db.table("transcriptions").insert(insert_data).execute()

    return {"ok": True, "text": text, "platform": platform}


@celery_app.task(bind=True)
def refresh_metrics_bulk(self, user_id, tid_list):
    """Refresca métricas Apify para una lista de IDs de transcripciones.
    Solo Instagram. Sequential con sleep 0.5s entre llamadas para no
    saturar Apify."""
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
    if not APIFY_TOKEN:
        return {"ok": False, "reason": "no_apify_token", "updated": 0}

    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        rows_r = (db.table("transcriptions")
                    .select("id, url, platform")
                    .in_("id", tid_list)
                    .eq("user_id", user_id)
                    .execute())
        rows = [r for r in (rows_r.data or []) if r.get("platform") == "instagram"]
    except Exception as e:
        logger.warning("refresh_metrics_bulk fetch failed: %s", e)
        return {"ok": False, "updated": 0}

    updated = 0
    for r in rows:
        try:
            item = _apify_metrics_only(r["url"])
            if not item:
                continue
            metrics = _extract_metrics(item)
            (db.table("transcriptions")
               .update(metrics)
               .eq("id", r["id"])
               .eq("user_id", user_id)
               .execute())
            updated += 1
            self.update_state(state="PROGRESS", meta={"updated": updated, "total": len(rows)})
        except Exception as e:
            logger.warning("refresh_metrics_bulk row %s failed: %s", r.get("id"), e)
        time.sleep(0.5)

    return {"ok": True, "updated": updated, "total": len(rows)}


# ── v0.15.2.a: scrape tracked competitors (async) ────────────────────────────
# Movido desde app.py para no bloquear workers HTTP de Flask. Patrón cliente
# Supabase local + env vars vía os.environ (mismo que transcribe_task).
# Lógica de negocio idéntica a la versión sync previa: anti-race lock +
# Apify run-sync-get-dataset-items + UPSERT reels + UPDATE final.
# DEUDA PRIORITARIA v0.15.4: si el worker muere mid-task, scrape_status queda
# 'scraping' permanente y el anti-race bloquea re-scrape para siempre. Fix:
# guard "stale" = si last_scraped_at < now() - 10min con status='scraping',
# considerar abandonado y permitir re-encolar.
SCRAPE_TIMEOUT_SEC = 240


@celery_app.task(name="tasks.scrape_creator")
def scrape_creator_task(creator_id: str) -> dict:
    """Scrape async de reels de un creator. Encolada desde POST /admin/scrape.

    Returns dict con:
      - status: "ok" | "failed" | "private" | "not_found" | "in_progress" | "creator_not_found"
      - reels_count: int (solo si status=ok)
      - error: str (solo si status=failed)
      - creator_id, ig_username (echo).
    """
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 1. Cargar creator.
    try:
        cr = (db.table("creators_global")
                .select("id, ig_username, scrape_status")
                .eq("id", creator_id)
                .single()
                .execute())
        creator = cr.data
    except Exception:
        creator = None
    if not creator:
        logger.warning("scrape_creator: creator_not_found id=%s", creator_id)
        return {"status": "creator_not_found", "creator_id": creator_id}

    ig_username = creator["ig_username"]
    logger.info("scrape_creator started for %s (creator_id=%s)", ig_username, creator_id)

    # 2. Anti-race: UPDATE scrape_status='scraping' WHERE != 'scraping'.
    lock = (db.table("creators_global")
              .update({"scrape_status": "scraping", "last_error": None})
              .eq("id", creator_id)
              .neq("scrape_status", "scraping")
              .execute())
    if not lock.data:
        logger.info("scrape_creator skip (in_progress) for %s", ig_username)
        return {"status": "in_progress", "creator_id": creator_id, "ig_username": ig_username}

    # 3. Llamada Apify sync (timeout 240s; server-side limit Apify ~300s).
    # v0.15.2.b: memory 512→1024 (default oficial del actor apify/instagram-reel-scraper).
    actor_url = (
        f"https://api.apify.com/v2/acts/xMc5Ga1oCONPmWJIa"
        f"/run-sync-get-dataset-items?token={APIFY_TOKEN}&memory=1024"
    )
    payload = {
        "username": [ig_username],
        "resultsLimit": 10,
        "includeSharesCount": True,
    }

    final_status = "ok"
    last_error = None
    items: list = []
    try:
        # v0.15.2.b: logging Apify request/response (cierra laguna observabilidad).
        logger.info("[scrape] Apify request — url: %s, payload: %s",
                    actor_url.split("?")[0], payload)
        resp = requests.post(actor_url, json=payload, timeout=SCRAPE_TIMEOUT_SEC)
        logger.info("[scrape] Apify response — status: %d, body: %s",
                    resp.status_code, (resp.text or "")[:500])
        if resp.status_code == 404:
            final_status = "not_found"
        elif resp.status_code >= 400:
            body_lc = (resp.text or "").lower()
            if "private" in body_lc:
                final_status = "private"
            else:
                final_status = "failed"
                last_error = f"http_{resp.status_code}: {(resp.text or '')[:300]}"
        else:
            items = resp.json() or []
            if items and isinstance(items[0], dict):
                first = items[0]
                # v0.15.2.b: concatenar error + errorDescription. Caso real:
                # pedrocavadas devuelve error="no_items" pero errorDescription
                # incluye "private" — antes caía a 'failed', ahora a 'private'.
                err = first.get("error") or ""
                err_desc = first.get("errorDescription") or ""
                combined_lc = (str(err) + " " + str(err_desc)).lower()
                if first.get("error"):
                    if "private" in combined_lc:
                        final_status = "private"
                        items = []
                    elif "not found" in combined_lc or "not_found" in combined_lc:
                        final_status = "not_found"
                        items = []
                    else:
                        final_status = "failed"
                        last_error = (
                            (str(err) + " — " + str(err_desc))[:300] if err_desc else str(err)[:300]
                        )
                        items = []
                elif first.get("ownerIsPrivate") is True:
                    final_status = "private"
                    items = []
    except requests.Timeout:
        logger.warning("scrape_creator timeout for %s after %ds", ig_username, SCRAPE_TIMEOUT_SEC)
        final_status = "failed"
        last_error = "timeout"
    except Exception as e:
        logger.exception("scrape_creator apify call failed for %s: %s", ig_username, e)
        final_status = "failed"
        last_error = str(e)[:300]

    # 4. UPSERT reels si tenemos items y status ok.
    reels_count = 0
    if final_status == "ok" and items:
        rows = []
        for item in items:
            sc = item.get("shortCode") or item.get("id")
            if not sc:
                continue
            rows.append({
                "creator_id": creator_id,
                "ig_reel_id": sc,
                "caption": (item.get("caption") or "")[:2000],
                "views": item.get("videoPlayCount") or item.get("videoViewCount") or 0,
                "likes": item.get("likesCount") or 0,
                "comments": item.get("commentsCount") or 0,
                "posted_at": item.get("timestamp"),
                "thumb_url": item.get("displayUrl"),
                "video_url": item.get("videoUrl"),
                "video_duration_sec": item.get("videoDuration"),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
        if rows:
            try:
                db.table("creator_reels_global").upsert(
                    rows, on_conflict="creator_id,ig_reel_id"
                ).execute()
                reels_count = len(rows)
            except Exception as e:
                logger.exception("scrape_creator upsert failed for %s: %s", ig_username, e)
                final_status = "failed"
                last_error = f"upsert: {str(e)[:200]}"

    # 5. UPDATE final del creator.
    update_payload = {
        "scrape_status": final_status,
        "last_scraped_at": datetime.now(timezone.utc).isoformat(),
        "last_error": last_error,
    }
    try:
        db.table("creators_global").update(update_payload).eq("id", creator_id).execute()
    except Exception as e:
        logger.exception("scrape_creator final update failed for %s: %s", ig_username, e)

    # Log final con detalle según status.
    if final_status == "ok":
        logger.info("scrape_creator done for %s: status=ok reels=%d", ig_username, reels_count)
    elif final_status in ("private", "not_found"):
        logger.warning("scrape_creator %s: %s", ig_username, final_status)
    else:
        logger.warning("scrape_creator %s: %s (%s)", ig_username, final_status, last_error or "no detail")

    out = {"status": final_status, "creator_id": creator_id, "ig_username": ig_username}
    if final_status == "ok":
        out["reels_count"] = reels_count
    if last_error:
        out["error"] = last_error
    return out
