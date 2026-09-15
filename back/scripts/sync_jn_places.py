#!/usr/bin/env python3
"""
전라남도 공공데이터 API (JN) → MySQL places 적재.

  cd back && PYTHONPATH=. python scripts/sync_jn_places.py
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

BACK = Path(__file__).resolve().parents[1]
if str(BACK) not in sys.path:
    sys.path.insert(0, str(BACK))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("sync_jn_places")


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv(BACK / ".env")

    from app.repositories.db import mysql_url_configured
    if not mysql_url_configured():
        logger.error("MYSQL_URL 이 없습니다.")
        sys.exit(1)

    jn_key = os.getenv("JN_LEPORTS_SERVICE_KEY", "").strip()
    if not jn_key:
        logger.error("JN_LEPORTS_SERVICE_KEY 가 없습니다.")
        sys.exit(1)

    # KTO 재수집 없이 JN 데이터만 수집
    from app.repositories.regions_repository import fetch_external_regions
    from app.repositories.regions_store import upsert_regions_to_db

    logger.info("JN 데이터 수집 시작...")
    rows = fetch_external_regions(jn_key, kto_service_key="")
    logger.info("수집 완료: %d건", len(rows))

    upsert_regions_to_db(rows)
    logger.info("sync_jn_places: DB upsert 완료 (%d건)", len(rows))


if __name__ == "__main__":
    main()
