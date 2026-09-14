"""
무장애·고캠핑·두루누비·웰니스·반려동물 API 수집 → places DB 적재.

실행:
  cd back && PYTHONPATH=. python -m app.modules.data.extra_apis
  또는 sync_extra_places.py 스크립트 사용
"""

from __future__ import annotations

import logging
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import json
from typing import Any

logger = logging.getLogger(__name__)

KTO_AREA_CODES_JN = ["5", "38"]  # 광주=5, 전남=38

BARRIER_FREE_BASE = "https://apis.data.go.kr/B551011/KorWithService2"
CAMPING_BASE = "https://apis.data.go.kr/B551011/GoCamping"
DURUNUBI_BASE = "https://apis.data.go.kr/B551011/Durunubi"
WELLNESS_BASE = "https://apis.data.go.kr/B551011/WellnessTursmService"
PET_BASE = "https://apis.data.go.kr/B551011/KorPetTourService2"

CATEGORY_MAP = {
    "12": "관광지", "14": "문화시설", "15": "축제/공연",
    "28": "레포츠", "32": "숙박", "38": "쇼핑", "39": "음식점",
}


def _service_key() -> str:
    return os.getenv("KTO_SERVICE_KEY", "").strip()


def _fetch_json(url: str, params: dict) -> dict:
    req_url = f"{url}?{urllib.parse.urlencode(params)}"
    timeout = int(os.getenv("KTO_API_TIMEOUT", "15"))
    retry = int(os.getenv("KTO_API_RETRY", "3"))
    wait = float(os.getenv("KTO_API_RETRY_WAIT", "0.5"))
    for attempt in range(1, retry + 1):
        try:
            with urllib.request.urlopen(req_url, timeout=timeout) as r:
                body = r.read().decode("utf-8", errors="ignore")
            return json.loads(body)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")[:300]
            logger.warning("[EXTRA] HTTP %s url=%s body=%s", exc.code, url, body)
            if attempt < retry:
                time.sleep(wait * attempt)
                continue
            return {}
        except Exception as exc:
            if attempt < retry:
                time.sleep(wait * attempt)
                continue
            logger.warning("[EXTRA] request failed url=%s error=%s", url, exc)
            return {}
    return {}


def _extract_items(payload: dict) -> tuple[list[dict], int]:
    try:
        body = payload["response"]["body"]
        total = int(body.get("totalCount", 0))
        items = body.get("items", {})
        item = items.get("item", []) if isinstance(items, dict) else []
        if isinstance(item, dict):
            item = [item]
        return [r for r in item if isinstance(r, dict)], total
    except Exception:
        return [], 0


def _paginate(url: str, base_params: dict, max_items: int, tag: str) -> list[dict]:
    num_rows = int(os.getenv("KTO_NUM_ROWS", "100"))
    interval = float(os.getenv("KTO_REQUEST_INTERVAL", "0.3"))
    collected: list[dict] = []
    page = 1
    while len(collected) < max_items:
        params = dict(base_params)
        params.update({"numOfRows": num_rows, "pageNo": page, "_type": "json"})
        payload = _fetch_json(url, params)
        items, total = _extract_items(payload)
        if not items:
            break
        collected.extend(items)
        logger.info("[%s] page=%d items=%d total=%d", tag, page, len(items), total)
        if len(collected) >= total or len(items) < num_rows:
            break
        pages_total = math.ceil(total / num_rows)
        if page >= pages_total:
            break
        page += 1
        if interval > 0:
            time.sleep(interval)
    return collected[:max_items]


def _addr_to_region(addr: str) -> str:
    parts = (addr or "").strip().split()
    return parts[0] if parts else "정보없음"


def _safe_float(val: Any) -> float | None:
    try:
        f = float(str(val).strip())
        return f if f != 0.0 else None
    except Exception:
        return None


# ── 무장애 여행 ──────────────────────────────────────────────────────────────

def fetch_barrier_free() -> list[dict]:
    key = _service_key()
    if not key:
        return []
    max_items = int(os.getenv("BARRIER_FREE_MAX_ITEMS", "500"))
    rows: list[dict] = []
    seen: set[str] = set()
    for area in KTO_AREA_CODES_JN:
        params = {"serviceKey": key, "areaCode": area, "MobileOS": "ETC", "MobileApp": "LocalVibe"}
        items = _paginate(f"{BARRIER_FREE_BASE}/areaBasedList2", params, max_items, "BARRIER")
        for it in items:
            cid = str(it.get("contentid", "")).strip()
            if not cid or cid in seen:
                continue
            seen.add(cid)
            name = str(it.get("title", "")).strip()
            if not name:
                continue
            addr = str(it.get("addr1", "") or "").strip()
            rows.append({
                "content_id": cid,
                "content_type_id": str(it.get("contenttypeid", "") or ""),
                "name": name,
                "category": CATEGORY_MAP.get(str(it.get("contenttypeid", "")), "관광지"),
                "region": _addr_to_region(addr),
                "province": "광주광역시" if area == "5" else "전라남도",
                "address": addr,
                "latitude": _safe_float(it.get("mapy")),
                "longitude": _safe_float(it.get("mapx")),
                "description": str(it.get("overview", "") or "").strip() or None,
                "source": "한국관광공사_무장애여행",
                "kto_image_url": str(it.get("firstimage", "") or "").strip() or None,
            })
    logger.info("[BARRIER] total=%d", len(rows))
    return rows


# ── 고캠핑 ───────────────────────────────────────────────────────────────────

_CAMPING_PROVINCE = {"전라남도", "광주광역시", "전남", "광주"}


def fetch_camping() -> list[dict]:
    key = _service_key()
    if not key:
        return []
    max_items = int(os.getenv("CAMPING_MAX_ITEMS", "500"))
    rows: list[dict] = []
    seen: set[str] = set()
    params = {"serviceKey": key, "MobileOS": "ETC", "MobileApp": "LocalVibe"}
    all_items = _paginate(f"{CAMPING_BASE}/basedList", params, 3000, "CAMPING")
    for it in all_items:
        do_nm = str(it.get("doNm", "") or "").strip()
        if not any(s in do_nm for s in _CAMPING_PROVINCE):
            continue
        cid = str(it.get("contentId", "") or it.get("contentid", "")).strip()
        name = str(it.get("facltNm", "") or "").strip()
        if not name or (cid and cid in seen):
            continue
        key_val = cid or name
        if key_val in seen:
            continue
        seen.add(key_val)
        addr = str(it.get("addr1", "") or "").strip()
        rows.append({
            "content_id": cid or None,
            "content_type_id": None,
            "name": name,
            "category": "캠핑",
            "region": str(it.get("sigunguNm", "") or _addr_to_region(addr)).strip(),
            "province": do_nm,
            "address": addr,
            "latitude": _safe_float(it.get("mapY") or it.get("mapy")),
            "longitude": _safe_float(it.get("mapX") or it.get("mapx")),
            "description": str(it.get("intro", "") or it.get("featureNm", "") or "").strip() or None,
            "source": "한국관광공사_고캠핑",
            "kto_image_url": str(it.get("firstImageUrl", "") or "").strip() or None,
        })
        if len(rows) >= max_items:
            break
    logger.info("[CAMPING] total=%d", len(rows))
    return rows


# ── 두루누비 ─────────────────────────────────────────────────────────────────

_DURUNUBI_SIGUN = {
    "광주", "목포", "여수", "순천", "나주", "광양",
    "담양", "곡성", "구례", "고흥", "보성", "화순",
    "장흥", "강진", "해남", "영암", "무안", "함평",
    "영광", "장성", "완도", "진도", "신안",
}


def fetch_durunubi() -> list[dict]:
    key = _service_key()
    if not key:
        return []
    max_items = int(os.getenv("DURUNUBI_MAX_ITEMS", "300"))
    params = {"serviceKey": key, "MobileOS": "ETC", "MobileApp": "LocalVibe"}
    all_items = _paginate(f"{DURUNUBI_BASE}/courseList", params, max_items * 5, "DURUNUBI")

    if all_items:
        sample = all_items[0]
        logger.info("[DURUNUBI] sample fields=%s", list(sample.keys()))
        logger.info("[DURUNUBI] sample sido=%s sigungu=%s", sample.get("sido"), sample.get("sigunguNm"))

    rows: list[dict] = []
    seen: set[str] = set()
    for it in all_items:
        sigun = str(it.get("sigun", "") or "").strip()
        if not any(s in sigun for s in _DURUNUBI_SIGUN):
            continue
        cid = str(it.get("crsIdx", "") or it.get("routeIdx", "")).strip()
        name = str(it.get("crsKorNm", "")).strip()
        if not name or (cid and cid in seen):
            continue
        key_val = cid or name
        if key_val in seen:
            continue
        seen.add(key_val)
        is_gwangju = "광주" in sigun
        rows.append({
            "content_id": cid or None,
            "content_type_id": None,
            "name": name,
            "category": "걷기여행",
            "region": sigun,
            "province": "광주광역시" if is_gwangju else "전라남도",
            "address": sigun,
            "latitude": None,
            "longitude": None,
            "description": str(it.get("crsSummary", "") or it.get("crsContents", "") or "").strip() or None,
            "source": "한국관광공사_두루누비",
            "kto_image_url": None,
        })
        if len(rows) >= max_items:
            break
    logger.info("[DURUNUBI] filtered=%d", len(rows))
    return rows


# ── 웰니스 ───────────────────────────────────────────────────────────────────

_WELLNESS_LDONG_CODES = {"29": "광주광역시", "46": "전라남도"}  # 법정동 시도코드


def fetch_wellness() -> list[dict]:
    key = _service_key()
    if not key:
        return []
    max_items = int(os.getenv("WELLNESS_MAX_ITEMS", "300"))
    rows: list[dict] = []
    seen: set[str] = set()
    # 전체 수집 후 주소로 필터링 (lDongRegnCd 필터 시 결과 없음)
    params = {
        "serviceKey": key,
        "MobileOS": "ETC",
        "MobileApp": "LocalVibe",
        "langDivCd": "KOR",
    }
    all_wellness = _paginate(f"{WELLNESS_BASE}/areaBasedList", params, 2000, "WELLNESS")
    logger.info("[WELLNESS] total fetched before filter=%d", len(all_wellness))
    _WELLNESS_FILTER = {"광주", "전라남도", "전남"}
    filtered = [it for it in all_wellness if any(s in str(it.get("baseAddr", "") or "") for s in _WELLNESS_FILTER)]
    logger.info("[WELLNESS] after address filter=%d", len(filtered))
    for it in filtered:
            cid = str(it.get("contentId", "") or it.get("contentid", "") or "").strip()
            name = str(it.get("title", "") or "").strip()
            if not name or (cid and cid in seen):
                continue
            key_val = cid or name
            if key_val in seen:
                continue
            seen.add(key_val)
            addr = str(it.get("baseAddr", "") or "").strip()
            province_name = "광주광역시" if "광주" in addr else "전라남도"
            rows.append({
                "content_id": cid or None,
                "content_type_id": str(it.get("contentTypeId", "") or it.get("contenttypeid", "") or ""),
                "name": name,
                "category": "웰니스",
                "region": _addr_to_region(addr),
                "province": province_name,
                "address": addr,
                "latitude": _safe_float(it.get("mapY") or it.get("mapy")),
                "longitude": _safe_float(it.get("mapX") or it.get("mapx")),
                "description": str(it.get("overview", "") or "").strip() or None,
                "source": "한국관광공사_웰니스관광",
                "kto_image_url": str(it.get("orgImage", "") or it.get("firstimage", "") or "").strip() or None,
            })
    logger.info("[WELLNESS] total=%d", len(rows))
    return rows


# ── 반려동물 ─────────────────────────────────────────────────────────────────

def fetch_pet_tour() -> list[dict]:
    key = _service_key()
    if not key:
        return []
    max_items = int(os.getenv("PET_TOUR_MAX_ITEMS", "500"))
    rows: list[dict] = []
    seen: set[str] = set()
    for area in KTO_AREA_CODES_JN:
        params = {"serviceKey": key, "areaCode": area, "MobileOS": "ETC", "MobileApp": "LocalVibe"}
        items = _paginate(f"{PET_BASE}/areaBasedList2", params, max_items, "PET")
        for it in items:
            cid = str(it.get("contentid", "") or "").strip()
            name = str(it.get("title", "") or "").strip()
            if not name or (cid and cid in seen):
                continue
            key_val = cid or name
            if key_val in seen:
                continue
            seen.add(key_val)
            addr = str(it.get("addr1", "") or "").strip()
            rows.append({
                "content_id": cid or None,
                "content_type_id": str(it.get("contenttypeid", "") or ""),
                "name": name,
                "category": CATEGORY_MAP.get(str(it.get("contenttypeid", "")), "반려동물동반"),
                "region": _addr_to_region(addr),
                "province": "광주광역시" if area == "5" else "전라남도",
                "address": addr,
                "latitude": _safe_float(it.get("mapy")),
                "longitude": _safe_float(it.get("mapx")),
                "description": str(it.get("overview", "") or "").strip() or None,
                "source": "한국관광공사_반려동물동반여행",
                "kto_image_url": str(it.get("firstimage", "") or "").strip() or None,
            })
    logger.info("[PET] total=%d", len(rows))
    return rows


# ── 통합 실행 ────────────────────────────────────────────────────────────────

def fetch_all_extra() -> list[dict]:
    all_rows: list[dict] = []
    all_rows.extend(fetch_barrier_free())
    all_rows.extend(fetch_camping())
    all_rows.extend(fetch_durunubi())
    all_rows.extend(fetch_wellness())
    all_rows.extend(fetch_pet_tour())
    logger.info("[EXTRA] total fetched=%d", len(all_rows))
    return all_rows


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    rows = fetch_all_extra()
    print(f"수집 완료: {len(rows)}건")
