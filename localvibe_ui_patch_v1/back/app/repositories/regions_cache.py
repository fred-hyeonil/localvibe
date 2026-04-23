import json
import os
import time
from pathlib import Path


IMAGE_CACHE_FILE_PATH = Path(__file__).resolve().parents[2] / "data" / "course_image_cache.json"
EXTERNAL_CACHE_FILE_PATH = Path(__file__).resolve().parents[2] / "data" / "external_regions_cache.json"


def load_course_image_cache() -> dict[str, str]:
    ttl_seconds = int(os.getenv("JN_COURSE_IMG_CACHE_TTL_SECONDS", "86400"))
    if ttl_seconds <= 0 or not IMAGE_CACHE_FILE_PATH.exists():
        return {}

    try:
        with IMAGE_CACHE_FILE_PATH.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        saved_at = float(payload.get("saved_at", 0))
        if (time.time() - saved_at) > ttl_seconds:
            return {}
        items = payload.get("items", {})
        if not isinstance(items, dict):
            return {}
        return {str(key): str(value) for key, value in items.items() if str(value).startswith("http")}
    except Exception:
        return {}


def save_course_image_cache(image_map: dict[str, str]) -> None:
    if not image_map:
        return
    try:
        IMAGE_CACHE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {"saved_at": time.time(), "items": image_map}
        with IMAGE_CACHE_FILE_PATH.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)
    except Exception:
        return


def load_external_regions_cache(signature: str, allow_stale: bool = False) -> list[dict]:
    if not EXTERNAL_CACHE_FILE_PATH.exists():
        return []

    ttl_seconds = int(os.getenv("JN_EXTERNAL_CACHE_TTL_SECONDS", "21600"))
    stale_seconds = int(os.getenv("JN_EXTERNAL_CACHE_STALE_SECONDS", "259200"))
    max_age = stale_seconds if allow_stale else ttl_seconds
    if max_age <= 0:
        return []

    try:
        with EXTERNAL_CACHE_FILE_PATH.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        saved_at = float(payload.get("saved_at", 0))
        cached_signature = str(payload.get("signature", ""))
        if cached_signature and cached_signature != signature:
            return []
        if (time.time() - saved_at) > max_age:
            return []
        rows = payload.get("rows", [])
        if isinstance(rows, list):
            return rows
    except Exception:
        return []

    return []


def save_external_regions_cache(signature: str, rows: list[dict]) -> None:
    if not rows:
        return
    try:
        EXTERNAL_CACHE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {"saved_at": time.time(), "signature": signature, "rows": rows}
        with EXTERNAL_CACHE_FILE_PATH.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)
    except Exception:
        return
