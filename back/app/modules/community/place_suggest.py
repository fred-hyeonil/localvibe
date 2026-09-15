"""글쓰기 장소 자동완성 — DB 대신 메모리에서 찾습니다.

DB가 멀리 있어(시드니 리전) 요청 한 번에 DB 왕복이 0.3초씩 여러 번 붙어, 글자를 칠 때마다
1초 가까이 걸렸습니다. 검색 자체는 몇천 행 부분 일치라 가볍기 때문에, 장소의 이름·지역·주소만
메모리에 올려두고 여기서 찾으면 요청마다 DB 왕복이 없어집니다.

- 장소 데이터는 자주 바뀌지 않으므로 REFRESH_SECONDS마다 새로 읽습니다.
  새로 넣은 장소는 최대 그만큼 늦게 자동완성에 나타납니다.
- 갱신은 뒤에서 하고 그동안은 이전 목록으로 답합니다. 갱신 시점에 걸린 요청만 느려지지 않게.
- 갱신이 실패하면 이전 목록을 계속 씁니다. 처음 불러오기가 실패하면 빈 결과를 줍니다.
- 정렬은 places_store.search_places_by_name과 같게 맞췄습니다
  (이름이 검색어로 시작 → 이름에 포함 → 지역·주소에만 포함, 같으면 이름이 짧은 순).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from sqlalchemy import select

logger = logging.getLogger(__name__)

REFRESH_SECONDS = 300


@dataclass(frozen=True)
class _Row:
    place_id: int
    name: str
    region: str
    address: str
    # 영문 대소문자 무시 비교용 (MySQL 기본 콜레이션의 LIKE와 맞춘다)
    name_key: str
    region_key: str
    address_key: str


_rows: list[_Row] = []
_loaded_at = 0.0
_lock = threading.Lock()
_refreshing = False


def _load() -> list[_Row]:
    from app.repositories.db import session_scope
    from app.repositories.places_store import Place

    with session_scope() as session:
        result = session.execute(
            select(Place.place_id, Place.name, Place.region, Place.address)
        ).all()
    rows = []
    for pid, name, region, address in result:
        name, region, address = str(name or ""), str(region or ""), str(address or "")
        rows.append(
            _Row(
                place_id=int(pid),
                name=name,
                region=region,
                address=address,
                name_key=name.casefold(),
                region_key=region.casefold(),
                address_key=address.casefold(),
            )
        )
    return rows


def _refresh_in_background() -> None:
    global _rows, _loaded_at, _refreshing
    try:
        rows = _load()
        with _lock:
            _rows, _loaded_at = rows, time.monotonic()
        logger.info("[place-suggest] 장소 %d개 갱신", len(rows))
    except Exception as exc:  # noqa: BLE001 - 갱신 실패는 이전 목록으로 버틴다
        logger.warning("[place-suggest] 갱신 실패, 이전 목록 유지: %s", exc)
    finally:
        with _lock:
            _refreshing = False


def _snapshot() -> list[_Row]:
    """지금 쓸 목록. 처음이면 바로 불러오고, 오래됐으면 뒤에서 갱신을 건다."""
    global _rows, _loaded_at, _refreshing

    with _lock:
        rows, loaded_at = _rows, _loaded_at
        stale = time.monotonic() - loaded_at > REFRESH_SECONDS
        start_refresh = bool(rows) and stale and not _refreshing
        if start_refresh:
            _refreshing = True

    if start_refresh:
        threading.Thread(target=_refresh_in_background, daemon=True).start()
        return rows
    if rows:
        return rows

    # 서버를 켜고 첫 요청 — 기다려서라도 불러온다.
    with _lock:
        if _rows:  # 그사이 다른 요청이 불러왔다
            return _rows
        try:
            _rows, _loaded_at = _load(), time.monotonic()
            logger.info("[place-suggest] 장소 %d개 불러옴", len(_rows))
        except Exception as exc:  # noqa: BLE001
            logger.warning("[place-suggest] 불러오기 실패: %s", exc)
        return _rows


def warm_up() -> None:
    """서버 시작 직후 뒤에서 미리 불러와 첫 사용자가 기다리지 않게 한다."""
    threading.Thread(target=_snapshot, daemon=True).start()


def search(query: str, *, limit: int = 8) -> list[dict]:
    q = str(query or "").strip().casefold()
    if not q:
        return []

    matches: list[tuple[int, int, str, _Row]] = []
    for row in _snapshot():
        if row.name_key.startswith(q):
            rank = 0
        elif q in row.name_key:
            rank = 1
        elif q in row.region_key or q in row.address_key:
            rank = 2
        else:
            continue
        matches.append((rank, len(row.name), row.name, row))

    matches.sort(key=lambda m: (m[0], m[1], m[2], m[3].place_id))
    return [
        {
            "id": row.place_id,
            "name": row.name,
            "region": row.region,
            "address": row.address,
        }
        for _, _, _, row in matches[:limit]
    ]
