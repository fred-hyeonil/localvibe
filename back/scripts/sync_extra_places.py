#!/usr/bin/env python3
"""
무장애·고캠핑·두루누비·웰니스·반려동물 API → MySQL places 적재.

  cd back && PYTHONPATH=. python scripts/sync_extra_places.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

BACK = Path(__file__).resolve().parents[1]
if str(BACK) not in sys.path:
    sys.path.insert(0, str(BACK))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("sync_extra_places")


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv(BACK / ".env")

    from app.repositories.db import mysql_url_configured
    if not mysql_url_configured():
        logger.error("MYSQL_URL 이 없습니다.")
        sys.exit(1)

    from app.modules.data.extra_apis import fetch_all_extra
    from app.modules.data.pipeline import save_places_to_db, deduplicate, clean_place

    rows = fetch_all_extra()
    cleaned = [c for r in rows if (c := clean_place(r))]
    deduped = deduplicate(cleaned)
    n = save_places_to_db(deduped)
    logger.info("sync_extra_places: MySQL upsert %d 건", n)


if __name__ == "__main__":
    main()
