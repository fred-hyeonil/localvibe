"""
여행플래너 일정 구성 유틸리티.

기능:
1) 시간대 슬롯 배분
2) 경로 최적화 (python-tsp 있으면 사용, 없으면 greedy 폴백)
3) 지역 필터 강화
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Optional

from app.modules.regions.geocode import geocode_address_with_kakao

logger = logging.getLogger(__name__)

_TRAVEL_SPEED_KMH_BY_MODE: dict[str, float] = {
    "walk": 4.5,
    "public": 22.0,
    "car": 32.0,
}
# 광주·전남은 대중교통망이 약해 실제로는 대부분 차로 이동한다. 이동수단을 안 밝히면
# 자차로 간주하고, 사용자가 대중교통·도보라고 말하면 그때 계산을 바꾼다.
_DEFAULT_TRANSPORT_MODE = "car"

# DB에 좌표(latitude/longitude)가 비어있는 장소가 대부분이라, 주소로 즉석 지오코딩해서
# 디스크 캐시에 재사용한다. 매 요청마다 같은 인기 장소를 다시 지오코딩하지 않기 위함.
_GEOCODE_CACHE_PATH = Path(__file__).resolve().parents[3] / "data" / "geocode_cache.json"
_geocode_cache: Optional[dict[str, Optional[list[float]]]] = None


def _load_geocode_cache() -> dict[str, Optional[list[float]]]:
    global _geocode_cache
    if _geocode_cache is not None:
        return _geocode_cache
    try:
        if _GEOCODE_CACHE_PATH.exists():
            _geocode_cache = json.loads(_GEOCODE_CACHE_PATH.read_text(encoding="utf-8"))
        else:
            _geocode_cache = {}
    except Exception:
        _geocode_cache = {}
    return _geocode_cache


def _save_geocode_cache() -> None:
    if _geocode_cache is None:
        return
    try:
        _GEOCODE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _GEOCODE_CACHE_PATH.write_text(
            json.dumps(_geocode_cache, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:
        logger.exception("[TRIP] 지오코딩 캐시 저장 실패")


def _resolve_coord(row: dict) -> Optional[tuple[float, float]]:
    """장소의 좌표를 구한다. DB 값이 있으면 그대로, 없으면 주소를 지오코딩해서 캐시."""
    lat, lng = row.get("latitude"), row.get("longitude")
    if lat is not None and lng is not None:
        try:
            return (float(lat), float(lng))
        except (TypeError, ValueError):
            pass

    address = str(row.get("address") or "").strip()
    if not address:
        return None

    cache = _load_geocode_cache()
    cache_key = str(row.get("id") or address)
    if cache_key in cache:
        cached = cache[cache_key]
        return (cached[0], cached[1]) if cached else None

    coord = geocode_address_with_kakao(address)
    cache[cache_key] = [coord[0], coord[1]] if coord else None
    _save_geocode_cache()
    return coord


_LODGING_KEYWORDS = ("숙박", "호텔", "모텔", "게스트하우스", "펜션", "리조트", "스테이", "hotel")
_FOOD_KEYWORDS = ("음식점", "맛집", "레스토랑", "식당", "restaurant")
_FOOD_MAX_PER_DAY = 2


def _is_lodging(row: dict) -> bool:
    category = str(row.get("category") or "")
    rec = " ".join(str(x) for x in (row.get("recommendedBusinesses") or []))
    name = str(row.get("name") or "")
    blob = f"{category} {rec} {name}".lower()
    return any(kw in blob for kw in _LODGING_KEYWORDS)


def _is_food(row: dict) -> bool:
    category = str(row.get("category") or "")
    rec = " ".join(str(x) for x in (row.get("recommendedBusinesses") or []))
    blob = f"{category} {rec}".lower()
    return any(kw in blob for kw in _FOOD_KEYWORDS)


def _rebalance_category_cap(
    day_buckets: list[list[int]],
    row_by_id: dict[int, dict],
    is_match,
    max_per_day: int,
    excluded_day_indices: Optional[set[int]] = None,
) -> None:
    """특정 카테고리가 하루에 max_per_day개를 넘지 않도록 재배치.

    초과분은 다른 날(excluded_day_indices 제외) 중 여유 있는 곳으로 옮기고,
    옮길 곳이 없으면 일정에서 제외한다. day_buckets를 제자리에서 수정한다.
    """
    excluded = excluded_day_indices or set()
    days = len(day_buckets)
    overflow: list[int] = []
    for day_idx, bucket in enumerate(day_buckets):
        limit = 0 if day_idx in excluded else max_per_day
        kept: list[int] = []
        count = 0
        for pid in bucket:
            row = row_by_id.get(pid, {})
            if is_match(row):
                if count >= limit:
                    overflow.append(pid)
                    continue
                count += 1
            kept.append(pid)
        bucket[:] = kept

    for pid in overflow:
        for day_idx in range(days):
            if day_idx in excluded:
                continue
            bucket = day_buckets[day_idx]
            count = sum(1 for p in bucket if is_match(row_by_id.get(p, {})))
            if count < max_per_day:
                bucket.append(pid)
                break
        # 넣을 자리가 없으면 그 항목은 일정에서 제외한다.


def _rebalance_lodging(day_buckets: list[list[int]], row_by_id: dict[int, dict]) -> None:
    """숙박시설은 하루 최대 1곳, 마지막 날에는 넣지 않는다 (체크아웃 후 이동하는 게 자연스러워서)."""
    days = len(day_buckets)
    _rebalance_category_cap(
        day_buckets, row_by_id, _is_lodging, max_per_day=1, excluded_day_indices={days - 1}
    )


def _rebalance_food(day_buckets: list[list[int]], row_by_id: dict[int, dict]) -> None:
    """음식점은 하루 최대 _FOOD_MAX_PER_DAY곳으로 제한해 한 카테고리로 몰리지 않게 한다."""
    _rebalance_category_cap(day_buckets, row_by_id, _is_food, max_per_day=_FOOD_MAX_PER_DAY)


def assign_time_slots(
    place_ids: list[int],
    rows: list[dict],
    days: int,
    transport_mode: Optional[str] = None,
) -> list[dict]:
    """장소를 일차별로 나누고, 각 날은 위치 기반으로 가까운 순서로 묶어 오전/오후 두 그룹으로 배분.

    같은 날 안에서 오전/오후가 서로 동떨어진 곳끼리 섞이지 않도록, 좌표가 있는 장소는
    최근접 이웃 경로(optimize_route_for_day)로 먼저 정렬한 다음 앞/뒤 절반을 오전/오후로 나눈다.
    이동시간은 이동수단(도보/대중교통/자차)에 따라 다른 평균 속도로 추정한다.
    """
    if not place_ids:
        return []
    days = max(1, int(days))
    row_by_id = {int(row["id"]): row for row in rows}
    effective_mode = str(transport_mode or _DEFAULT_TRANSPORT_MODE)
    speed_kmh = _TRAVEL_SPEED_KMH_BY_MODE.get(effective_mode, _TRAVEL_SPEED_KMH_BY_MODE[_DEFAULT_TRANSPORT_MODE])

    day_buckets: list[list[int]] = [[] for _ in range(days)]
    for idx, pid in enumerate(place_ids):
        day_buckets[idx % days].append(pid)
    _rebalance_lodging(day_buckets, row_by_id)
    _rebalance_food(day_buckets, row_by_id)

    schedule: list[dict] = []
    for day_num, pids in enumerate(day_buckets, start=1):
        if not pids:
            continue
        ordered_ids = optimize_route_for_day(pids, rows)
        # 숙박은 체크인 개념이므로 동선상 위치와 무관하게 하루의 맨 마지막 순서로 고정한다.
        lodging_ids = [pid for pid in ordered_ids if _is_lodging(row_by_id.get(pid, {}))]
        if lodging_ids:
            ordered_ids = [pid for pid in ordered_ids if pid not in lodging_ids] + lodging_ids
        half = math.ceil(len(ordered_ids) / 2)
        prev_coord: Optional[tuple[float, float]] = None
        for idx_in_day, pid in enumerate(ordered_ids):
            row = row_by_id.get(pid, {})
            period = "오전" if idx_in_day < half else "오후"
            slot_name = "morning" if idx_in_day < half else "afternoon"
            coord = _resolve_coord(row)
            lat, lng = (coord[0], coord[1]) if coord else (row.get("latitude"), row.get("longitude"))
            travel_minutes = None
            if prev_coord and coord:
                dist_km = _haversine_distance(*prev_coord, *coord)
                travel_minutes = max(1, round(dist_km / speed_kmh * 60))
            prev_coord = coord or prev_coord
            meal = None
            if _is_food(row):
                meal = "점심" if slot_name == "morning" else "저녁"
            schedule.append(
                {
                    "day": day_num,
                    "slot": slot_name,
                    "time": period,
                    "place_id": pid,
                    "place_name": row.get("name", ""),
                    "category": str((row.get("recommendedBusinesses") or [""])[0]),
                    "latitude": lat,
                    "longitude": lng,
                    "travel_minutes": travel_minutes,
                    "travel_mode": effective_mode if travel_minutes is not None else None,
                    "meal": meal,
                }
            )
    return schedule


def recompute_schedule_travel_only(
    schedule_entries: list[dict],
    rows: list[dict],
    transport_mode: Optional[str] = None,
) -> list[dict]:
    """일차·순서·장소는 기존 일정 그대로 두고 이동수단만 바꿔 이동시간을 다시 계산한다.

    '대중교통으로 바꿔줘'처럼 이동수단만 바꿔달라는 요청에 assign_time_slots를 다시
    돌리면 day_buckets 재배치·TSP 재정렬로 일정 자체가 딴 걸로 바뀌어버리므로, 여기서는
    기존 schedule_entries의 day/순서를 그대로 보존한 채 구간별 이동시간만 다시 잰다.
    """
    if not schedule_entries:
        return []
    row_by_id = {int(row["id"]): row for row in rows}
    effective_mode = str(transport_mode or _DEFAULT_TRANSPORT_MODE)
    speed_kmh = _TRAVEL_SPEED_KMH_BY_MODE.get(effective_mode, _TRAVEL_SPEED_KMH_BY_MODE[_DEFAULT_TRANSPORT_MODE])

    by_day: dict[int, list[dict]] = {}
    for entry in schedule_entries:
        day = int(entry.get("day") or 1)
        by_day.setdefault(day, []).append(entry)

    result: list[dict] = []
    for day in sorted(by_day):
        prev_coord: Optional[tuple[float, float]] = None
        for entry in by_day[day]:
            raw_pid = entry.get("placeId")
            if raw_pid is None:
                raw_pid = entry.get("place_id")
            pid = int(raw_pid or 0)
            row = row_by_id.get(pid, {})
            lat, lng = entry.get("latitude"), entry.get("longitude")
            if lat is not None and lng is not None:
                coord: Optional[tuple[float, float]] = (float(lat), float(lng))
            else:
                coord = _resolve_coord(row)
                if coord:
                    lat, lng = coord
            travel_minutes = None
            if prev_coord and coord:
                dist_km = _haversine_distance(*prev_coord, *coord)
                travel_minutes = max(1, round(dist_km / speed_kmh * 60))
            prev_coord = coord or prev_coord
            result.append(
                {
                    "day": day,
                    "slot": entry.get("slot", ""),
                    "time": entry.get("time", ""),
                    "place_id": pid,
                    "place_name": entry.get("placeName") or entry.get("place_name") or row.get("name", ""),
                    "category": entry.get("category")
                    or str((row.get("recommendedBusinesses") or [""])[0]),
                    "latitude": lat,
                    "longitude": lng,
                    "travel_minutes": travel_minutes,
                    "travel_mode": effective_mode if travel_minutes is not None else None,
                    "meal": entry.get("meal"),
                }
            )
    return result


def schedule_to_ordered_ids(schedule: list[dict]) -> list[int]:
    return [entry["place_id"] for entry in schedule]


def schedule_to_prompt_context(schedule: list[dict]) -> str:
    lines: list[str] = []
    current_day = 0
    for entry in schedule:
        if entry["day"] != current_day:
            current_day = entry["day"]
            lines.append(f"\n[{current_day}일차]")
        lines.append(
            f"  {entry['time']} | {entry['place_name']} ({entry['category']})"
            f" | id={entry['place_id']}"
        )
    return "\n".join(lines)


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_distance_matrix(coords: list[tuple[float, float]]) -> list[list[float]]:
    n = len(coords)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = _haversine_distance(coords[i][0], coords[i][1], coords[j][0], coords[j][1])
    return matrix


def _greedy_tsp(distance_matrix: list[list[float]]) -> list[int]:
    n = len(distance_matrix)
    if n == 0:
        return []
    visited = [False] * n
    path = [0]
    visited[0] = True
    for _ in range(n - 1):
        current = path[-1]
        nearest = -1
        nearest_dist = float("inf")
        for j in range(n):
            if not visited[j] and distance_matrix[current][j] < nearest_dist:
                nearest_dist = distance_matrix[current][j]
                nearest = j
        if nearest == -1:
            break
        path.append(nearest)
        visited[nearest] = True
    return path


def optimize_route_for_day(place_ids: list[int], rows: list[dict]) -> list[int]:
    if len(place_ids) <= 2:
        return place_ids

    row_by_id = {int(row["id"]): row for row in rows}
    coords_map: dict[int, tuple[float, float]] = {}
    for pid in place_ids:
        coord = _resolve_coord(row_by_id.get(pid, {}))
        if coord:
            coords_map[pid] = coord
    if len(coords_map) < 2:
        return place_ids

    tsp_ids = [pid for pid in place_ids if pid in coords_map]
    no_coord_ids = [pid for pid in place_ids if pid not in coords_map]
    coords = [coords_map[pid] for pid in tsp_ids]
    distance_matrix = _build_distance_matrix(coords)

    try:
        from python_tsp.distances import great_circle_distance_matrix
        from python_tsp.heuristics import solve_tsp_simulated_annealing
        import numpy as np

        np_coords = np.array(coords)
        dm = great_circle_distance_matrix(np_coords)
        permutation, _ = solve_tsp_simulated_annealing(dm)
        optimized_ids = [tsp_ids[i] for i in permutation]
        logger.info("[TRIP] python-tsp 경로 최적화 완료: %d개 장소", len(optimized_ids))
    except ImportError:
        logger.info("[TRIP] python-tsp 미설치 -> greedy TSP 사용")
        permutation = _greedy_tsp(distance_matrix)
        optimized_ids = [tsp_ids[i] for i in permutation]
    except Exception:
        logger.warning("[TRIP] TSP 최적화 실패 -> 원래 순서 유지")
        optimized_ids = tsp_ids

    return optimized_ids + no_coord_ids


def _matches_geo_filter(row: dict, reg_f: Optional[str], prov_f: Optional[str]) -> bool:
    if not reg_f and not prov_f:
        return True

    from app.modules.chat.service import (
        _ADDRESS_NOISE_PREFIXES,
        _CITY_TOKEN_TO_PROVINCE,
        _strip_address_noise,
    )

    raw_province = str(row.get("province") or "").strip()
    # "전남광주통합특별시"처럼 province 컬럼 자체가 전남+광주 병합 라벨로 오염된 행은
    # prov_f("광주광역시" 등)와 절대 문자열이 같을 수 없다. 이 경우 province 컬럼으로
    # 바로 탈락시키지 않고, 아래 주소·이름 텍스트 기반 판별로 넘긴다.
    province_is_noisy = any(noise in raw_province for noise in _ADDRESS_NOISE_PREFIXES)
    if prov_f and not province_is_noisy and raw_province != prov_f:
        return False

    rr = _strip_address_noise(row.get("region") or "").strip()
    blob = _strip_address_noise(
        " ".join(
            [
                rr,
                str(row.get("address") or ""),
                str(row.get("name") or ""),
                str(row.get("summary") or "")[:120],
            ]
        )
    )

    if reg_f:
        city = reg_f.strip()
        if not city:
            return True
        if rr == city or rr.startswith(city):
            return True
        if city in blob:
            return True

        for other in _CITY_TOKEN_TO_PROVINCE:
            if other == city or len(other) < 2:
                continue
            if other in blob and city not in blob:
                return False
        return False

    if prov_f and province_is_noisy:
        # 시·군(reg_f) 없이 도(道) 단위(prov_f)만 있을 때, 오염된 province 대신 주소·이름
        # 텍스트에서 그 도에 속한 도시 토큰을 찾아 대신 판별한다.
        for city, province in _CITY_TOKEN_TO_PROVINCE.items():
            if province == prov_f and city in blob:
                return True
        return False

    return True


def filter_by_geo_strict(
    place_ids: list[int],
    row_by_id: dict[int, dict],
    reg_f: Optional[str],
    prov_f: Optional[str],
    rows: list[dict],
) -> list[int]:
    if not reg_f and not prov_f:
        return place_ids
    filtered = [pid for pid in place_ids if pid in row_by_id and _matches_geo_filter(row_by_id[pid], reg_f, prov_f)]
    removed = len(place_ids) - len(filtered)
    if removed > 0:
        logger.info("[TRIP] 지역 필터 강화: %d개 제거 (reg=%s, prov=%s)", removed, reg_f, prov_f)

    # 시·군 단위(reg_f)일 때는 다른 도시로 후보를 채우지 않음 (여수 요청에 순천·목포 섞임 방지)
    if len(filtered) < 3 and not reg_f:
        filtered_set = set(filtered)
        geo_rows = [r for r in rows if _matches_geo_filter(r, reg_f, prov_f) and int(r["id"]) not in filtered_set]
        extra = [int(r["id"]) for r in geo_rows[: 10 - len(filtered)]]
        filtered = filtered + extra
        logger.info("[TRIP] 지역 필터 후 부족 -> %d개 보충", len(extra))
    return filtered


def build_trip_schedule(
    place_ids: list[int],
    rows: list[dict],
    days: int,
    reg_f: Optional[str] = None,
    prov_f: Optional[str] = None,
    row_by_id: Optional[dict[int, dict]] = None,
    transport_mode: Optional[str] = None,
) -> tuple[list[int], str, list[dict]]:
    if row_by_id is None:
        row_by_id = {int(r["id"]): r for r in rows}

    if reg_f or prov_f:
        place_ids = filter_by_geo_strict(place_ids, row_by_id, reg_f, prov_f, rows)
    if not place_ids:
        return [], "", []

    schedule = assign_time_slots(place_ids, rows, days, transport_mode=transport_mode)
    ordered_ids = schedule_to_ordered_ids(schedule)
    schedule_ctx = schedule_to_prompt_context(schedule)
    return ordered_ids, schedule_ctx, schedule
