import hashlib
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from typing import Optional

from .regions_cache import (
    load_course_image_cache,
    load_external_regions_cache,
    save_course_image_cache,
    save_external_regions_cache,
)
from .regions_store import get_region_by_id_from_db, init_region_db, load_regions_from_db, upsert_regions_to_db


DATA_FILE_PATH = Path(__file__).resolve().parents[2] / "data" / "regions.json"
CACHE_TTL_SECONDS = 600
DEFAULT_BASE_ENDPOINTS = [
    "https://apis.data.go.kr/6460000/jnCourseInfo",
]
KTO_DEFAULT_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
BASE_TO_LIST_METHODS = {
    "jnCourseInfo": ["getCoursePlanList", "getCourseList", "getCourseImgList"],
}

_runtime_cache: dict[str, object] = {
    "regions": None,
    "loaded_at": 0.0,
    "signature": "",
    "id_index": {},
    "cooldown_until": 0.0,
}
_external_fetch_lock = threading.Lock()
FALLBACK_IMAGE_POOL = [
    "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1463797221720-6b07e6426c24?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=80",
]
logger = logging.getLogger(__name__)


def _stable_region_id(value: str) -> int:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]
    return int(digest, 16)


def _fallback_image_for_name(name: str) -> str:
    index = _stable_region_id(name) % len(FALLBACK_IMAGE_POOL)
    return FALLBACK_IMAGE_POOL[index]


def _sanitize_image_url(raw_url: str) -> str:
    image_url = (raw_url or "").strip()
    if not image_url:
        return ""

    lowered = image_url.lower()
    if "undefined" in lowered or "null" in lowered or "noimage" in lowered:
        return ""

    if image_url.startswith("//"):
        image_url = f"https:{image_url}"
    elif image_url.startswith("http://"):
        image_url = "https://" + image_url[len("http://") :]

    if not image_url.startswith("http"):
        return ""
    return image_url


def _masked_key(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"


def _resolve_endpoint_urls() -> list[str]:
    custom_urls = os.getenv("JN_API_ENDPOINT_URLS", "").strip()
    if custom_urls:
        base_urls = [part.strip().rstrip("/") for part in custom_urls.split(",") if part.strip()]
    else:
        base_urls = DEFAULT_BASE_ENDPOINTS

    resolved: list[str] = []
    for base_url in base_urls:
        tail = base_url.split("/")[-1]
        methods = BASE_TO_LIST_METHODS.get(tail)
        if methods:
            for method in methods:
                resolved.append(f"{base_url}/{method}")
        else:
            # 상세기능 URL이 이미 완성된 경우 그대로 사용
            resolved.append(base_url)
    return resolved


def _normalize_name_key(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum() or ("\uac00" <= ch <= "\ud7a3"))


def _extract_first_http_url(item: ET.Element) -> str:
    for child in list(item):
        value = (child.text or "").strip()
        if value.startswith("http"):
            return value
    return ""


def _extract_candidate_keys(item: ET.Element) -> list[str]:
    keys: list[str] = []
    known_tags = [
        "courseKey",
        "planCourseId",
        "courseId",
        "planInfoId",
        "planInfoKey",
        "imgInfoId",
        "courseInfoIds",
        "courseName",
        "courseNm",
        "planName",
        "title",
        "name",
        "tourNm",
        "placeNm",
    ]
    for tag in known_tags:
        value = _first_text(item, [tag])
        if value:
            keys.append(value)

    for child in list(item):
        value = (child.text or "").strip()
        if not value:
            continue
        tag_lower = child.tag.lower()
        if any(token in tag_lower for token in ["name", "title", "course", "plan", "info"]):
            keys.append(value)

    seen: set[str] = set()
    unique: list[str] = []
    for key in keys:
        normalized = _normalize_name_key(key)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(key)
    return unique


def _first_text(item: ET.Element, keys: list[str]) -> str:
    for key in keys:
        node = item.find(key)
        if node is not None and node.text and node.text.strip():
            return node.text.strip()
    return ""


@lru_cache(maxsize=1)
def load_local_regions() -> list[dict]:
    with DATA_FILE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _fetch_xml_items(
    url: str,
    service_key: str,
    start_page: int,
    page_size: int,
    extra_params: Optional[dict[str, str]] = None,
) -> list[ET.Element]:
    params = {"serviceKey": service_key, "startPage": start_page, "pageSize": page_size}
    if extra_params:
        params.update(extra_params)
    request_url = f"{url}?{urllib.parse.urlencode(params)}"
    timeout_seconds = int(os.getenv("JN_API_TIMEOUT_SECONDS", "12"))
    retry_count = max(1, int(os.getenv("JN_API_RETRY_COUNT", "2")))
    base_retry_wait = float(os.getenv("JN_API_RETRY_WAIT_SECONDS", "0.4"))
    rate_limit_wait = float(os.getenv("JN_API_429_WAIT_SECONDS", "1.2"))

    for attempt in range(1, retry_count + 1):
        try:
            logger.info("[LEPORTS] request start endpoint=%s service_key=%s", request_url, _masked_key(service_key))
            request = urllib.request.Request(url=request_url, method="GET")
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                status_code = getattr(response, "status", None)
                body = response.read()
            preview = body.decode("utf-8", errors="ignore")[:280].replace("\n", " ")
            logger.info("[LEPORTS] response status=%s preview=%s", status_code, preview)

            if not preview.lstrip().startswith("<"):
                logger.warning("[LEPORTS] non-xml response endpoint=%s", url)
                return []

            root = ET.fromstring(body)
            items = root.findall(".//item")
            logger.info("[LEPORTS] parsed items=%d endpoint=%s", len(items), url)
            return items
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retry_count:
                cooldown_seconds = float(os.getenv("JN_EXTERNAL_429_COOLDOWN_SECONDS", "300"))
                _runtime_cache["cooldown_until"] = max(
                    float(_runtime_cache.get("cooldown_until", 0.0)),
                    time.time() + cooldown_seconds,
                )
                wait_seconds = rate_limit_wait * attempt
                logger.warning(
                    "[LEPORTS] 429 retry endpoint=%s attempt=%d wait=%.1fs",
                    url,
                    attempt,
                    wait_seconds,
                )
                time.sleep(wait_seconds)
                continue

            if attempt < retry_count:
                wait_seconds = base_retry_wait * attempt
                logger.warning(
                    "[LEPORTS] http retry endpoint=%s code=%s attempt=%d wait=%.1fs",
                    url,
                    exc.code,
                    attempt,
                    wait_seconds,
                )
                time.sleep(wait_seconds)
                continue

            logger.warning("[LEPORTS] http failed endpoint=%s code=%s", url, exc.code)
            if exc.code == 429:
                cooldown_seconds = float(os.getenv("JN_EXTERNAL_429_COOLDOWN_SECONDS", "300"))
                _runtime_cache["cooldown_until"] = max(
                    float(_runtime_cache.get("cooldown_until", 0.0)),
                    time.time() + cooldown_seconds,
                )
            return []
        except Exception as exc:
            if attempt < retry_count:
                wait_seconds = base_retry_wait * attempt
                logger.warning("[LEPORTS] request retry endpoint=%s attempt=%d wait=%.1fs", url, attempt, wait_seconds)
                time.sleep(wait_seconds)
                continue
            logger.warning("[LEPORTS] request failed endpoint=%s error=%s", url, exc)
            return []

    return []


def _extract_course_rows(items: list[ET.Element]) -> list[dict]:
    rows: list[dict] = []
    for item in items:
        course_key = _first_text(item, ["courseKey"])
        course_name = _first_text(item, ["courseName", "courseNm", "title", "name"])
        if not course_key or not course_name:
            continue
        rows.append(
            {
                "courseKey": course_key,
                "courseName": course_name,
                "courseInfoIds": _first_text(item, ["courseInfoIds"]),
                "courseContents": _first_text(item, ["courseContents", "contents", "description"]),
                "courseArea": _first_text(item, ["courseArea", "area"]),
                "courseCategory": _first_text(item, ["courseCategory"]),
                "coursePeriod": _first_text(item, ["coursePeriod"]),
                "coursePersonType": _first_text(item, ["coursePersonType"]),
                "coursePersonCount": _first_text(item, ["coursePersonCount"]),
            }
        )
    return rows


def _split_course_info_ids(value: str) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _fetch_course_images_for_info_ids(
    endpoint_url: str,
    service_key: str,
    start_page: int,
    page_size: int,
    course_info_ids: list[str],
) -> dict[str, str]:
    image_map: dict[str, str] = {}
    if os.getenv("JN_COURSE_DISABLE_IMAGE_FETCH", "0").strip() == "1":
        logger.warning("[COURSE] image fetch disabled by env")
        return image_map

    max_requests = int(os.getenv("JN_COURSE_IMG_MAX_REQUEST", "10"))
    request_interval = float(os.getenv("JN_COURSE_IMG_REQUEST_INTERVAL", "0.35"))
    empty_break = max(1, int(os.getenv("JN_COURSE_IMG_EMPTY_BREAK", "3")))
    request_count = 0
    empty_streak = 0

    for info_id in course_info_ids:
        if request_count >= max_requests:
            break
        request_count += 1
        items = _fetch_xml_items(
            endpoint_url,
            service_key,
            start_page,
            page_size,
            extra_params={"courseInfoId": info_id},
        )
        if not items:
            empty_streak += 1
            if empty_streak >= empty_break:
                logger.warning(
                    "[COURSE] image empty streak reached %d, stop early",
                    empty_streak,
                )
                break
        else:
            empty_streak = 0

        for item in items:
            image_url = _first_text(item, ["courseFileUrl", "imgUrl", "imageUrl", "fileUrl"])
            if not image_url or not image_url.startswith("http"):
                image_url = _extract_first_http_url(item)
            if not image_url or not image_url.startswith("http"):
                continue

            item_id = _first_text(item, ["ids", "courseInfoId", "planInfoId", "planInfoKey"])
            if item_id:
                image_map[_normalize_name_key(item_id)] = image_url
            image_map[_normalize_name_key(info_id)] = image_url

        # 공공데이터 API의 단시간 과호출(429) 방지를 위한 최소 간격
        if request_interval > 0:
            time.sleep(request_interval)

    logger.info("[COURSE] image map loaded count=%d requests=%d", len(image_map), request_count)
    return image_map


def _extract_json_items(payload: dict) -> list[dict]:
    response = payload.get("response", {})
    body = response.get("body", {})
    items = body.get("items", {})
    item = items.get("item", [])
    if isinstance(item, list):
        return [row for row in item if isinstance(row, dict)]
    if isinstance(item, dict):
        return [item]
    return []


def _fetch_json_items(
    url: str,
    params: dict[str, str],
    timeout_seconds: int,
    retry_count: int,
    base_retry_wait: float,
    rate_limit_wait: float,
) -> list[dict]:
    request_url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(1, retry_count + 1):
        try:
            request = urllib.request.Request(url=request_url, method="GET")
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                body = response.read().decode("utf-8", errors="ignore")
            payload = json.loads(body)
            header = payload.get("response", {}).get("header", {})
            result_code = str(header.get("resultCode", "")).strip()
            result_msg = str(header.get("resultMsg", "")).strip()
            if result_code and result_code not in {"0000", "00"}:
                logger.warning("[KTO] api error endpoint=%s code=%s msg=%s", url, result_code, result_msg)
                return []
            return _extract_json_items(payload)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retry_count:
                time.sleep(rate_limit_wait * attempt)
                continue
            if attempt < retry_count:
                time.sleep(base_retry_wait * attempt)
                continue
            logger.warning("[KTO] http failed endpoint=%s code=%s", url, exc.code)
            return []
        except Exception as exc:
            if attempt < retry_count:
                time.sleep(base_retry_wait * attempt)
                continue
            logger.warning("[KTO] request failed endpoint=%s error=%s", url, exc)
            return []
    return []


def _extract_region_from_address(address: str) -> str:
    if not address:
        return "정보없음"
    first = address.strip().split(" ")[0]
    if first:
        return first
    return "정보없음"


def _is_fallback_image_url(url: str) -> bool:
    return "images.unsplash.com" in (url or "")


KTO_CONTENT_TYPE_LABELS = {
    "12": "관광지",
    "14": "문화시설",
    "15": "축제/공연",
    "25": "여행코스",
    "28": "레포츠",
    "32": "숙박",
    "38": "쇼핑",
    "39": "음식점",
}


def _infer_kto_insight_fields(title: str, overview: str, content_type: str, address: str) -> tuple[list[str], list[str], list[str]]:
    text = f"{title} {overview} {address}".lower()
    type_label = KTO_CONTENT_TYPE_LABELS.get(content_type, "로컬 방문")

    recommended: list[str] = [type_label]
    if any(keyword in text for keyword in ["카페", "커피", "디저트"]):
        recommended.append("카페/디저트")
    if any(keyword in text for keyword in ["맛집", "식당", "음식", "restaurant"]):
        recommended.append("식음료")
    if any(keyword in text for keyword in ["바다", "해변", "해수욕", "오션"]):
        recommended.append("해안 관광")
    if any(keyword in text for keyword in ["산", "등산", "트레킹", "숲"]):
        recommended.append("자연/야외")

    if content_type == "39":
        busy_hours = ["12:00-14:00", "18:00-20:00"]
        target_customers = ["식도락 여행객", "커플/친구 방문객"]
    elif content_type == "15":
        busy_hours = ["19:00-22:00", "주말/행사일"]
        target_customers = ["야간 활동 선호 방문객", "축제 참여 방문객"]
    elif content_type == "32":
        busy_hours = ["체크인 15:00-19:00", "주말 16:00-20:00"]
        target_customers = ["숙박 수요 고객", "가족/단체 여행객"]
    else:
        busy_hours = ["주말 13:00-17:00"]
        target_customers = ["로컬 여행객", "당일 방문객"]

    return list(dict.fromkeys(recommended)), busy_hours, target_customers


def _normalize_kto_item(item: dict, source_name: str, detail_map: Optional[dict[str, dict]] = None) -> dict:
    content_id = str(item.get("contentid", "")).strip()
    if not content_id:
        return {}
    detail = (detail_map or {}).get(content_id, {})
    title = str(item.get("title") or detail.get("title") or "").strip()
    if not title:
        return {}

    address = str(detail.get("addr1") or item.get("addr1") or "").strip()
    overview = str(detail.get("overview") or item.get("overview") or "").strip()
    if not overview:
        overview = f"한국관광공사 공개데이터 기반 장소 정보입니다. (주소: {address})" if address else "한국관광공사 공개데이터 기반 장소 정보입니다."

    image_url = _sanitize_image_url(
        str(detail.get("firstimage") or item.get("firstimage") or item.get("firstimage2") or "").strip()
    )
    if not image_url:
        image_url = _fallback_image_for_name(title)

    region = _extract_region_from_address(address)
    content_type = str(item.get("contenttypeid") or "").strip()
    phone = str(detail.get("tel") or item.get("tel") or "").strip()

    recommended, busy_hours, target_customers = _infer_kto_insight_fields(title, overview, content_type, address)
    if phone:
        target_customers.append(f"전화문의: {phone}")

    return {
        "id": _stable_region_id(f"kto:{content_id}"),
        "sourceId": content_id,
        "name": title,
        "region": region,
        "province": region,
        "address": address,
        "imageUrl": image_url,
        "summary": f"{overview} (주소: {address})" if address and "주소:" not in overview else overview,
        "recommendedBusinesses": list(dict.fromkeys(recommended)),
        "busyHours": list(dict.fromkeys(busy_hours)),
        "targetCustomers": list(dict.fromkeys(target_customers)),
        "dataSource": source_name,
    }


def _dedupe_regions(rows: list[dict]) -> list[dict]:
    deduped: dict[str, dict] = {}
    for row in rows:
        name_key = _normalize_name_key(str(row.get("name", "")))
        region_key = _normalize_name_key(str(row.get("region") or row.get("province") or ""))
        addr_key = _normalize_name_key(str(row.get("address", "")))[:20]
        if not name_key:
            continue
        key = f"{name_key}|{region_key}|{addr_key}"
        existing = deduped.get(key)
        if not existing:
            deduped[key] = row
            continue

        existing_image = str(existing.get("imageUrl", ""))
        incoming_image = str(row.get("imageUrl", ""))
        existing_summary = str(existing.get("summary", ""))
        incoming_summary = str(row.get("summary", ""))

        should_replace = False
        if _is_fallback_image_url(existing_image) and not _is_fallback_image_url(incoming_image):
            should_replace = True
        elif len(incoming_summary) > len(existing_summary):
            should_replace = True

        if should_replace:
            deduped[key] = row

    return list(deduped.values())


def _fetch_kto_regions(kto_service_key: str, timeout_seconds: int, retry_count: int, base_retry_wait: float, rate_limit_wait: float) -> list[dict]:
    if not kto_service_key:
        return []

    base_url = os.getenv("KTO_API_BASE_URL", KTO_DEFAULT_BASE_URL).rstrip("/")
    area_endpoint = f"{base_url}/areaBasedList2"
    keyword_endpoint = f"{base_url}/searchKeyword2"
    detail_endpoint = f"{base_url}/detailCommon2"

    start_page = os.getenv("KTO_PAGE_NO", "1")
    page_size = os.getenv("KTO_NUM_ROWS", "30")
    max_items = int(os.getenv("KTO_MAX_ITEMS", "90"))
    detail_max = int(os.getenv("KTO_DETAIL_MAX", "30"))
    request_interval = float(os.getenv("KTO_REQUEST_INTERVAL", "0.15"))
    area_codes = [code.strip() for code in os.getenv("KTO_AREA_CODES", "5,38").split(",") if code.strip()]
    keywords = [kw.strip() for kw in os.getenv("KTO_KEYWORDS", "").split(",") if kw.strip()]
    mobile_os = os.getenv("KTO_MOBILE_OS", "ETC")
    mobile_app = os.getenv("KTO_MOBILE_APP", "LocalVibe")
    arrange = os.getenv("KTO_ARRANGE", "Q")

    common_params = {
        "serviceKey": kto_service_key,
        "MobileOS": mobile_os,
        "MobileApp": mobile_app,
        "_type": "json",
        "numOfRows": page_size,
        "pageNo": start_page,
        "arrange": arrange,
    }

    collected: list[dict] = []
    seen_content_ids: set[str] = set()
    source_name = "한국관광공사_국문 관광정보 서비스_GW"

    for area_code in area_codes:
        params = dict(common_params)
        params["areaCode"] = area_code
        items = _fetch_json_items(area_endpoint, params, timeout_seconds, retry_count, base_retry_wait, rate_limit_wait)
        for item in items:
            cid = str(item.get("contentid", "")).strip()
            if not cid or cid in seen_content_ids:
                continue
            seen_content_ids.add(cid)
            collected.append(item)
            if len(collected) >= max_items:
                break
        if len(collected) >= max_items:
            break
        if request_interval > 0:
            time.sleep(request_interval)

    if keywords and len(collected) < max_items:
        for keyword in keywords:
            params = dict(common_params)
            params["keyword"] = keyword
            items = _fetch_json_items(keyword_endpoint, params, timeout_seconds, retry_count, base_retry_wait, rate_limit_wait)
            for item in items:
                cid = str(item.get("contentid", "")).strip()
                if not cid or cid in seen_content_ids:
                    continue
                seen_content_ids.add(cid)
                collected.append(item)
                if len(collected) >= max_items:
                    break
            if len(collected) >= max_items:
                break
            if request_interval > 0:
                time.sleep(request_interval)

    detail_map: dict[str, dict] = {}
    for item in collected[:detail_max]:
        content_id = str(item.get("contentid", "")).strip()
        content_type_id = str(item.get("contenttypeid", "")).strip()
        if not content_id:
            continue
        params = dict(common_params)
        params.update(
            {
                "contentId": content_id,
                "contentTypeId": content_type_id,
                "defaultYN": "Y",
                "overviewYN": "Y",
                "firstImageYN": "Y",
                "addrinfoYN": "Y",
            }
        )
        detail_items = _fetch_json_items(detail_endpoint, params, timeout_seconds, retry_count, base_retry_wait, rate_limit_wait)
        if detail_items:
            detail_map[content_id] = detail_items[0]
        if request_interval > 0:
            time.sleep(request_interval)

    normalized: list[dict] = []
    for item in collected:
        row = _normalize_kto_item(item, source_name, detail_map)
        if row:
            normalized.append(row)
    logger.info("[KTO] normalized items=%d", len(normalized))
    return normalized


def _build_region_from_plan(plan_item: ET.Element, course_context: dict, image_map: dict[str, str]) -> dict:
    plan_name = _first_text(plan_item, ["planName", "name", "title"])
    if not plan_name:
        return {}

    plan_contents = _first_text(plan_item, ["planContents", "contents", "description"])
    plan_area = _first_text(plan_item, ["planArea", "area"])
    plan_addr = _first_text(plan_item, ["planAddr", "addr", "address"])
    plan_addr_detail = _first_text(plan_item, ["planAddrDetail", "addrDetail"])
    plan_phone = _first_text(plan_item, ["planPhone", "phone", "tel"])
    plan_time = _first_text(plan_item, ["planTime", "timeInfo", "useTime"])
    plan_course_id = _first_text(plan_item, ["planCourseId"])
    plan_info_id = _first_text(plan_item, ["planInfoId"])

    summary = plan_contents or course_context.get("courseContents") or "정보를 제공 받을 수 없습니다."
    address = " ".join(value for value in [plan_area, plan_addr, plan_addr_detail] if value).strip()
    if address and summary != "정보를 제공 받을 수 없습니다.":
        summary = f"{summary} (주소: {address})"

    candidate_keys = _extract_candidate_keys(plan_item)
    candidate_keys.extend(
        [
            str(course_context.get("courseKey", "")),
            str(course_context.get("courseName", "")),
            str(course_context.get("courseInfoIds", "")),
            str(plan_course_id),
            str(plan_info_id),
            str(plan_name),
        ]
    )
    for info_id in _split_course_info_ids(str(course_context.get("courseInfoIds", ""))):
        candidate_keys.append(info_id)
    image_url = ""
    for candidate in candidate_keys:
        normalized = _normalize_name_key(candidate)
        if not normalized:
            continue
        mapped = image_map.get(normalized)
        if mapped:
            image_url = mapped
            break
    image_url = _sanitize_image_url(image_url)
    if not image_url:
        image_url = _fallback_image_for_name(plan_name)

    recommended: list[str] = []
    if course_context.get("courseCategory"):
        recommended.append(course_context["courseCategory"])
    if course_context.get("coursePersonType"):
        recommended.append(course_context["coursePersonType"])
    if course_context.get("coursePeriod"):
        recommended.append(course_context["coursePeriod"])

    target_customers: list[str] = []
    if course_context.get("coursePersonCount"):
        target_customers.append(f"추천 인원: {course_context['coursePersonCount']}")
    if plan_phone:
        target_customers.append(f"전화문의: {plan_phone}")

    region_id_key = f"{plan_course_id}:{plan_info_id or plan_name}"
    return {
        "id": _stable_region_id(region_id_key),
        "sourceId": str(plan_info_id or plan_course_id or ""),
        "name": plan_name,
        "region": plan_area or _extract_region_from_address(plan_addr),
        "province": "전남",
        "address": address,
        "imageUrl": image_url,
        "summary": summary,
        "recommendedBusinesses": list(dict.fromkeys(recommended)),
        "busyHours": [plan_time] if plan_time else [],
        "targetCustomers": target_customers,
        "dataSource": "전라남도_남도여행길잡이_테마여행 정보",
    }


def fetch_external_regions(jn_service_key: str, kto_service_key: str) -> list[dict]:
    endpoint_urls = _resolve_endpoint_urls()
    start_page = int(os.getenv("JN_API_PAGE_NO", "1"))
    page_size = int(os.getenv("JN_API_NUM_ROWS", "50"))
    max_course_count = int(os.getenv("JN_COURSE_PLAN_MAX", "40"))
    empty_category_break = max(1, int(os.getenv("JN_COURSE_EMPTY_CATEGORY_BREAK", "2")))
    plan_request_interval = float(os.getenv("JN_COURSE_PLAN_REQUEST_INTERVAL", "0.6"))
    plan_empty_break = max(1, int(os.getenv("JN_COURSE_PLAN_EMPTY_BREAK", "4")))
    categories = [part.strip() for part in os.getenv("JN_COURSE_CATEGORIES", "봄,여름,가을,겨울").split(",") if part.strip()]

    timeout_seconds = int(os.getenv("JN_API_TIMEOUT_SECONDS", "12"))
    retry_count = max(1, int(os.getenv("JN_API_RETRY_COUNT", "2")))
    base_retry_wait = float(os.getenv("JN_API_RETRY_WAIT_SECONDS", "0.4"))
    rate_limit_wait = float(os.getenv("JN_API_429_WAIT_SECONDS", "1.2"))

    merged_rows: list[dict] = []

    if jn_service_key:
        endpoint_map = {url.rstrip("/").split("/")[-1]: url for url in endpoint_urls}
        list_endpoint = endpoint_map.get("getCourseList")
        plan_endpoint = endpoint_map.get("getCoursePlanList")
        img_endpoint = endpoint_map.get("getCourseImgList")

        if list_endpoint and plan_endpoint:
            course_rows: list[dict] = []
            seen_course_keys: set[str] = set()
            empty_category_streak = 0
            for category in categories:
                list_items = _fetch_xml_items(
                    list_endpoint,
                    jn_service_key,
                    start_page,
                    page_size,
                    extra_params={"courseCategory": category},
                )
                extracted = _extract_course_rows(list_items)
                logger.info("[COURSE] list loaded category=%s count=%d", category, len(extracted))
                if not extracted:
                    empty_category_streak += 1
                    if not course_rows and empty_category_streak >= empty_category_break:
                        logger.warning("[COURSE] list empty streak reached %d, stop early", empty_category_streak)
                        break
                    continue

                empty_category_streak = 0
                for row in extracted:
                    course_key = row["courseKey"]
                    if course_key in seen_course_keys:
                        continue
                    seen_course_keys.add(course_key)
                    course_rows.append(row)

            image_map: dict[str, str] = {}
            if img_endpoint and course_rows:
                all_course_info_ids: list[str] = []
                for row in course_rows[:max_course_count]:
                    all_course_info_ids.extend(_split_course_info_ids(str(row.get("courseInfoIds", ""))))
                all_course_info_ids = list(dict.fromkeys(all_course_info_ids))
                cached_image_map = load_course_image_cache()
                image_map = dict(cached_image_map)
                missing_info_ids = [
                    info_id
                    for info_id in all_course_info_ids
                    if _normalize_name_key(info_id) not in image_map
                ]
                logger.info(
                    "[COURSE] image cache hit=%d missing=%d",
                    len(all_course_info_ids) - len(missing_info_ids),
                    len(missing_info_ids),
                )
                if missing_info_ids:
                    fetched_image_map = _fetch_course_images_for_info_ids(
                        img_endpoint,
                        jn_service_key,
                        start_page,
                        page_size,
                        missing_info_ids,
                    )
                    if fetched_image_map:
                        image_map.update(fetched_image_map)
                        save_course_image_cache(image_map)

            seen_keys: set[str] = set()
            plan_empty_streak = 0
            for course_row in course_rows[:max_course_count]:
                course_key = course_row["courseKey"]
                plan_items = _fetch_xml_items(
                    plan_endpoint,
                    jn_service_key,
                    start_page,
                    page_size,
                    extra_params={"planCourseId": course_key},
                )
                logger.info("[COURSE] plan loaded courseKey=%s count=%d", course_key, len(plan_items))
                if not plan_items:
                    plan_empty_streak += 1
                    if plan_empty_streak >= plan_empty_break:
                        logger.warning("[COURSE] plan empty streak reached %d, stop early", plan_empty_streak)
                        break
                else:
                    plan_empty_streak = 0

                for plan_item in plan_items:
                    region = _build_region_from_plan(plan_item, course_row, image_map)
                    if not region:
                        continue
                    dedupe_key = f"{region.get('name','')}|{region.get('summary','')[:40]}"
                    if dedupe_key in seen_keys:
                        continue
                    seen_keys.add(dedupe_key)
                    merged_rows.append(region)

                if plan_request_interval > 0:
                    time.sleep(plan_request_interval)
        else:
            logger.warning("[COURSE] required endpoints missing list=%s plan=%s", bool(list_endpoint), bool(plan_endpoint))

    kto_rows = _fetch_kto_regions(kto_service_key, timeout_seconds, retry_count, base_retry_wait, rate_limit_wait)
    merged_rows.extend(kto_rows)

    return _dedupe_regions(merged_rows)


def _build_id_index(rows: list[dict]) -> dict[int, dict]:
    index: dict[int, dict] = {}
    for row in rows:
        try:
            region_id = int(row["id"])
        except Exception:
            continue
        index[region_id] = row
    return index


def load_regions() -> list[dict]:
    now = time.time()
    init_region_db()
    db_rows = load_regions_from_db()
    signature = "|".join(
        [
            os.getenv("JN_API_ENDPOINT_URLS", ""),
            os.getenv("JN_API_NUM_ROWS", ""),
            os.getenv("JN_API_PAGE_NO", ""),
            os.getenv("JN_API_TIMEOUT_SECONDS", ""),
            os.getenv("JN_LEPORTS_SERVICE_KEY", "")[:8],
            os.getenv("KTO_SERVICE_KEY", "")[:8],
            os.getenv("KTO_API_BASE_URL", ""),
            os.getenv("KTO_AREA_CODES", ""),
            os.getenv("KTO_KEYWORDS", ""),
        ]
    )
    cached = _runtime_cache.get("regions")
    loaded_at = float(_runtime_cache.get("loaded_at", 0.0))
    cached_signature = str(_runtime_cache.get("signature", ""))
    if cached and cached_signature == signature and (now - loaded_at) < CACHE_TTL_SECONDS:
        logger.info("[LEPORTS] use runtime cache count=%d", len(cached))  # type: ignore[arg-type]
        if not _runtime_cache.get("id_index"):
            _runtime_cache["id_index"] = _build_id_index(cached)  # type: ignore[arg-type]
        return cached  # type: ignore[return-value]

    fallback_regions = load_local_regions()
    jn_service_key = os.getenv("JN_LEPORTS_SERVICE_KEY", "").strip()
    kto_service_key = os.getenv("KTO_SERVICE_KEY", "").strip()

    if not jn_service_key and not kto_service_key:
        if db_rows:
            logger.info("[LEPORTS] external keys missing -> use db count=%d", len(db_rows))
            _runtime_cache["regions"] = db_rows
            _runtime_cache["loaded_at"] = now
            _runtime_cache["signature"] = signature
            _runtime_cache["id_index"] = _build_id_index(db_rows)
            return db_rows

        logger.info("[LEPORTS] all external keys missing -> fallback local count=%d", len(fallback_regions))
        upsert_regions_to_db(fallback_regions)
        _runtime_cache["regions"] = fallback_regions
        _runtime_cache["loaded_at"] = now
        _runtime_cache["signature"] = signature
        _runtime_cache["id_index"] = _build_id_index(fallback_regions)
        return fallback_regions

    cached_external_regions = load_external_regions_cache(signature, allow_stale=False)
    if cached_external_regions:
        logger.info("[LEPORTS] external disk cache hit count=%d", len(cached_external_regions))
        upsert_regions_to_db(cached_external_regions)
        _runtime_cache["regions"] = cached_external_regions
        _runtime_cache["loaded_at"] = now
        _runtime_cache["signature"] = signature
        _runtime_cache["id_index"] = _build_id_index(cached_external_regions)
        return cached_external_regions

    cooldown_until = float(_runtime_cache.get("cooldown_until", 0.0))
    if now < cooldown_until:
        logger.warning("[LEPORTS] in 429 cooldown for %.1fs", cooldown_until - now)
        if db_rows:
            logger.info("[LEPORTS] 429 cooldown -> use db count=%d", len(db_rows))
            _runtime_cache["regions"] = db_rows
            _runtime_cache["loaded_at"] = now
            _runtime_cache["signature"] = signature
            _runtime_cache["id_index"] = _build_id_index(db_rows)
            return db_rows
        stale_external_regions = load_external_regions_cache(signature, allow_stale=True)
        if stale_external_regions:
            logger.info("[LEPORTS] external stale cache hit count=%d", len(stale_external_regions))
            upsert_regions_to_db(stale_external_regions)
            _runtime_cache["regions"] = stale_external_regions
            _runtime_cache["loaded_at"] = now
            _runtime_cache["signature"] = signature
            _runtime_cache["id_index"] = _build_id_index(stale_external_regions)
            return stale_external_regions
        _runtime_cache["regions"] = fallback_regions
        _runtime_cache["loaded_at"] = now
        _runtime_cache["signature"] = signature
        _runtime_cache["id_index"] = _build_id_index(fallback_regions)
        return fallback_regions

    with _external_fetch_lock:
        # 다른 스레드가 먼저 채웠는지 재확인
        now = time.time()
        cached = _runtime_cache.get("regions")
        loaded_at = float(_runtime_cache.get("loaded_at", 0.0))
        cached_signature = str(_runtime_cache.get("signature", ""))
        if cached and cached_signature == signature and (now - loaded_at) < CACHE_TTL_SECONDS:
            return cached  # type: ignore[return-value]

        cached_external_regions = load_external_regions_cache(signature, allow_stale=False)
        if cached_external_regions:
            logger.info("[LEPORTS] external disk cache hit (post-lock) count=%d", len(cached_external_regions))
            upsert_regions_to_db(cached_external_regions)
            _runtime_cache["regions"] = cached_external_regions
            _runtime_cache["loaded_at"] = now
            _runtime_cache["signature"] = signature
            _runtime_cache["id_index"] = _build_id_index(cached_external_regions)
            return cached_external_regions

        cooldown_until = float(_runtime_cache.get("cooldown_until", 0.0))
        if now < cooldown_until:
            logger.warning("[LEPORTS] in 429 cooldown (post-lock) for %.1fs", cooldown_until - now)
            if db_rows:
                _runtime_cache["regions"] = db_rows
                _runtime_cache["loaded_at"] = now
                _runtime_cache["signature"] = signature
                _runtime_cache["id_index"] = _build_id_index(db_rows)
                return db_rows
            stale_external_regions = load_external_regions_cache(signature, allow_stale=True)
            if stale_external_regions:
                upsert_regions_to_db(stale_external_regions)
                _runtime_cache["regions"] = stale_external_regions
                _runtime_cache["loaded_at"] = now
                _runtime_cache["signature"] = signature
                _runtime_cache["id_index"] = _build_id_index(stale_external_regions)
                return stale_external_regions
            _runtime_cache["regions"] = fallback_regions
            _runtime_cache["loaded_at"] = now
            _runtime_cache["signature"] = signature
            _runtime_cache["id_index"] = _build_id_index(fallback_regions)
            return fallback_regions

        try:
            external_regions = fetch_external_regions(jn_service_key, kto_service_key)
            if external_regions:
                logger.info("[LEPORTS] external data loaded count=%d", len(external_regions))
                upsert_regions_to_db(external_regions)
                _runtime_cache["regions"] = external_regions
                _runtime_cache["loaded_at"] = now
                _runtime_cache["signature"] = signature
                _runtime_cache["id_index"] = _build_id_index(external_regions)
                save_external_regions_cache(signature, external_regions)
                return external_regions
        except Exception:
            # 외부 API가 실패해도 서비스가 끊기지 않도록 로컬 데이터로 폴백합니다.
            logger.exception("[LEPORTS] external fetch failed -> fallback local")

    stale_external_regions = load_external_regions_cache(signature, allow_stale=True)
    if stale_external_regions:
        logger.info("[LEPORTS] external stale cache hit count=%d", len(stale_external_regions))
        upsert_regions_to_db(stale_external_regions)
        _runtime_cache["regions"] = stale_external_regions
        _runtime_cache["loaded_at"] = now
        _runtime_cache["signature"] = signature
        _runtime_cache["id_index"] = _build_id_index(stale_external_regions)
        return stale_external_regions

    if db_rows:
        logger.info("[LEPORTS] external empty -> use db count=%d", len(db_rows))
        _runtime_cache["regions"] = db_rows
        _runtime_cache["loaded_at"] = now
        _runtime_cache["signature"] = signature
        _runtime_cache["id_index"] = _build_id_index(db_rows)
        return db_rows

    logger.info("[LEPORTS] external empty -> fallback local count=%d", len(fallback_regions))
    upsert_regions_to_db(fallback_regions)
    _runtime_cache["regions"] = fallback_regions
    _runtime_cache["loaded_at"] = now
    _runtime_cache["signature"] = signature
    _runtime_cache["id_index"] = _build_id_index(fallback_regions)
    return fallback_regions


def get_region_by_id(region_id: int) -> Optional[dict]:
    cached_index = _runtime_cache.get("id_index")
    if isinstance(cached_index, dict):
        row = cached_index.get(region_id)
        if row:
            return row

    rows = load_regions()
    for row in rows:
        try:
            if int(row["id"]) == region_id:
                return row
        except Exception:
            continue

    row = get_region_by_id_from_db(region_id)
    if row:
        return row

    fallback_rows = load_local_regions()
    for row in fallback_rows:
        try:
            if int(row["id"]) == region_id:
                return row
        except Exception:
            continue
    return None
