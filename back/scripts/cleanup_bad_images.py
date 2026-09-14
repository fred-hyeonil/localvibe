#!/usr/bin/env python3
"""
S3/DB에 저장된 크롤링 이미지 중 셀카·광고·아이콘을 찾아 삭제.

기준:
  - 가로 < 400px 또는 세로 < 300px  → 광고/아이콘
  - 세로 > 가로 × 1.3               → 셀카 (세로형)
  - 가로 > 세로 × 5                  → 배너 광고

실행:
  cd back && python scripts/cleanup_bad_images.py [--dry-run]
"""
from __future__ import annotations

import argparse
import io
import logging
import os
import sys
from pathlib import Path

BACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACK))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("cleanup_images")


def is_bad_image(data: bytes) -> tuple[bool, str]:
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w < 400 or h < 300:
            return True, f"너무 작음 {w}x{h}"
        if h > w * 1.3:
            return True, f"세로형(셀카) {w}x{h}"
        if w > h * 5:
            return True, f"가로배너 {w}x{h}"
        return False, f"OK {w}x{h}"
    except Exception as e:
        return False, f"PIL 실패: {e}"


def delete_from_s3(serve_url: str) -> bool:
    try:
        import boto3
        bucket = os.getenv("AWS_S3_BUCKET", "").strip()
        region = os.getenv("AWS_S3_REGION", "ap-southeast-2").strip()
        if not bucket or "s3" not in serve_url:
            return False
        key = serve_url.split(".amazonaws.com/")[-1]
        s3 = boto3.client("s3", region_name=region,
                          aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
                          aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None)
        s3.delete_object(Bucket=bucket, Key=key)
        return True
    except Exception as e:
        logger.warning("S3 삭제 실패: %s", e)
        return False


def run(dry_run: bool = False):
    import requests
    from dotenv import load_dotenv
    load_dotenv(BACK / ".env")

    from app.repositories.db import session_scope
    from app.repositories import places_store
    from sqlalchemy import text

    with session_scope() as session:
        rows = session.execute(
            text("SELECT image_id, place_id, serve_url FROM crawled_images WHERE serve_url IS NOT NULL ORDER BY image_id")
        ).fetchall()

    total = len(rows)
    logger.info("총 이미지: %d개", total)

    deleted = skipped = errors = 0
    headers = {"User-Agent": "Mozilla/5.0"}

    for i, (image_id, place_id, serve_url) in enumerate(rows, 1):
        url = str(serve_url).strip()
        if not url:
            continue

        if i % 100 == 0:
            logger.info("[%d/%d] 처리 중 (삭제:%d 스킵:%d 오류:%d)", i, total, deleted, skipped, errors)

        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if not resp.ok:
                errors += 1
                continue
            bad, reason = is_bad_image(resp.content)
            if not bad:
                skipped += 1
                continue

            logger.info("삭제 [%s] image_id=%d place_id=%d — %s", "DRY" if dry_run else "실제", image_id, place_id, reason)
            if not dry_run:
                delete_from_s3(url)
                with session_scope() as session:
                    session.execute(text("DELETE FROM crawled_images WHERE image_id = :id"), {"id": image_id})
            deleted += 1

        except Exception as e:
            logger.debug("오류 image_id=%d: %s", image_id, e)
            errors += 1

    logger.info("완료 — 삭제:%d 유지:%d 오류:%d (dry_run=%s)", deleted, skipped, errors, dry_run)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="실제 삭제 없이 미리보기만")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
