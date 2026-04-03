import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional


_db_lock = threading.Lock()


def _db_path() -> Path:
    custom = os.getenv("REGION_DB_PATH", "").strip()
    if custom:
        return Path(custom).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "data" / "localvibe.db"


def init_region_db() -> None:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS regions (
                    id INTEGER PRIMARY KEY,
                    source_id TEXT,
                    name TEXT NOT NULL,
                    region TEXT,
                    province TEXT,
                    address TEXT,
                    latitude REAL,
                    longitude REAL,
                    image_url TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    summary_short TEXT,
                    recommended_businesses_json TEXT NOT NULL,
                    busy_hours_json TEXT NOT NULL,
                    target_customers_json TEXT NOT NULL,
                    data_source TEXT,
                    updated_at REAL NOT NULL
                )
                """
            )
            try:
                conn.execute("ALTER TABLE regions ADD COLUMN summary_short TEXT")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE regions ADD COLUMN latitude REAL")
            except sqlite3.OperationalError:
                pass
            try:
                conn.execute("ALTER TABLE regions ADD COLUMN longitude REAL")
            except sqlite3.OperationalError:
                pass
            conn.commit()


def _serialize_list(value: object) -> str:
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return "[]"


def _deserialize_list(value: object) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(str(value))
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        pass
    return []


def _normalize_image_url(value: object) -> str:
    image_url = str(value or "").strip()
    if not image_url:
        return ""
    if image_url.startswith("//"):
        return f"https:{image_url}"
    if image_url.startswith("http://"):
        return "https://" + image_url[len("http://") :]
    return image_url


def _to_float_or_none(value: object) -> Optional[float]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except Exception:
        return None


def upsert_regions_to_db(rows: list[dict]) -> None:
    if not rows:
        return

    now = time.time()
    payload = []
    for row in rows:
        try:
            row_id = int(row["id"])
        except Exception:
            continue
        payload.append(
            (
                row_id,
                str(row.get("sourceId", "")),
                str(row.get("name", "")),
                str(row.get("region", "")),
                str(row.get("province", "")),
                str(row.get("address", "")),
                _to_float_or_none(row.get("latitude")),
                _to_float_or_none(row.get("longitude")),
                _normalize_image_url(row.get("imageUrl", "")),
                str(row.get("summary", "")),
                str(row.get("summaryShort", "")),
                _serialize_list(row.get("recommendedBusinesses", [])),
                _serialize_list(row.get("busyHours", [])),
                _serialize_list(row.get("targetCustomers", [])),
                str(row.get("dataSource", "")),
                now,
            )
        )

    if not payload:
        return

    path = _db_path()
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.executemany(
                """
                INSERT INTO regions (
                    id, source_id, name, region, province, address, latitude, longitude, image_url, summary,
                    summary_short, recommended_businesses_json, busy_hours_json, target_customers_json, data_source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    source_id = excluded.source_id,
                    name = excluded.name,
                    region = excluded.region,
                    province = excluded.province,
                    address = excluded.address,
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    image_url = excluded.image_url,
                    summary = excluded.summary,
                    summary_short = excluded.summary_short,
                    recommended_businesses_json = excluded.recommended_businesses_json,
                    busy_hours_json = excluded.busy_hours_json,
                    target_customers_json = excluded.target_customers_json,
                    data_source = excluded.data_source,
                    updated_at = excluded.updated_at
                """,
                payload,
            )
            conn.commit()


def _row_to_region(row: sqlite3.Row) -> dict:
    return {
        "id": int(row["id"]),
        "sourceId": row["source_id"] or "",
        "name": row["name"] or "",
        "region": row["region"] or "",
        "province": row["province"] or "",
        "address": row["address"] or "",
        "latitude": _to_float_or_none(row["latitude"]),
        "longitude": _to_float_or_none(row["longitude"]),
        "imageUrl": _normalize_image_url(row["image_url"]),
        "summary": row["summary"] or "",
        "summaryShort": row["summary_short"] or "",
        "recommendedBusinesses": _deserialize_list(row["recommended_businesses_json"]),
        "busyHours": _deserialize_list(row["busy_hours_json"]),
        "targetCustomers": _deserialize_list(row["target_customers_json"]),
        "dataSource": row["data_source"] or None,
    }


def load_regions_from_db() -> list[dict]:
    path = _db_path()
    if not path.exists():
        return []
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM regions ORDER BY updated_at DESC, id DESC").fetchall()
    return [_row_to_region(row) for row in rows]


def get_region_by_id_from_db(region_id: int) -> Optional[dict]:
    path = _db_path()
    if not path.exists():
        return None
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM regions WHERE id = ?", (region_id,)).fetchone()
    if not row:
        return None
    return _row_to_region(row)


def update_region_summary_short_in_db(region_id: int, summary_short: str) -> None:
    path = _db_path()
    if not path.exists():
        return
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.execute(
                "UPDATE regions SET summary_short = ?, updated_at = ? WHERE id = ?",
                (summary_short, time.time(), region_id),
            )
            conn.commit()


def update_region_coordinates_in_db(region_id: int, latitude: float, longitude: float) -> None:
    path = _db_path()
    if not path.exists():
        return
    with _db_lock:
        with sqlite3.connect(path) as conn:
            conn.execute(
                "UPDATE regions SET latitude = ?, longitude = ?, updated_at = ? WHERE id = ?",
                (float(latitude), float(longitude), time.time(), region_id),
            )
            conn.commit()
