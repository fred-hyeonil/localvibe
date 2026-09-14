#!/usr/bin/env python3
"""
KTO 이미지도 크롤 이미지도 없는 장소에 네이버 이미지 검색 API로 이미지 채우기.

실행:
  cd back && python scripts/fill_naver_images.py [--dry-run] [--limit N]
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path

BACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACK))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("fill_naver_images")


def _has_kto_image(insight_json: str | None) -> bool:
    if not insight_json:
        return False
    try:
        data = json.loads(insight_json)
        return bool(isinstance(data, dict) and str(data.get("ktoImageUrl") or "").strip())
    except Exception:
        return False


def _check_and_upload(data: bytes, place_id: int, source_url: str, dry_run: bool) -> dict | None:
    """이미지 품질 체크 후 S3 업로드. 반환: {source_url, local_path, serve_url} 또는 None."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w < 400 or h < 300:
            logger.debug("  스킵 너무 작음 %dx%d", w, h)
            return None
        if h > w * 1.3:
            logger.debug("  스킵 세로형 %dx%d", w, h)
            return None
        if w > h * 5:
            logger.debug("  스킵 가로배너 %dx%d", w, h)
            return None
        logger.info("  OK %dx%d %s", w, h, source_url[:80])
    except Exception as e:
        logger.debug("  PIL 실패: %s", e)
        return None

    if dry_run:
        return {"source_url": source_url, "local_path": "", "serve_url": "(dry-run)"}

    import boto3
    bucket = os.getenv("AWS_S3_BUCKET", "").strip()
    region = os.getenv("AWS_S3_REGION", "ap-southeast-2").strip()
    ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"

    serve_url = None
    if bucket:
        try:
            s3 = boto3.client(
                "s3", region_name=region,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None,
            )
            key = f"images/{place_id}/{filename}"
            s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType="image/jpeg")
            serve_url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        except Exception as e:
            logger.warning("  S3 업로드 실패: %s", e)

    if not serve_url:
        save_dir = BACK / "static" / "images" / str(place_id)
        save_dir.mkdir(parents=True, exist_ok=True)
        path = save_dir / filename
        path.write_bytes(data)
        serve_url = f"/static/images/{place_id}/{filename}"

    return {"source_url": source_url, "local_path": "", "serve_url": serve_url}


def run(dry_run: bool = False, limit: int = 0):
    from dotenv import load_dotenv
    load_dotenv(BACK / ".env")

    import requests
    from sqlalchemy import text
    from app.repositories.db import session_scope
    from app.repositories import places_store
    from app.modules.content.crawler import NaverBlogCrawler

    client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        logger.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정")
        return

    crawler = NaverBlogCrawler(client_id, client_secret)
    req_headers = {"User-Agent": "Mozilla/5.0"}

    with session_scope() as session:
        crawled_ids = set(
            row[0]
            for row in session.execute(
                text("SELECT DISTINCT place_id FROM crawled_images WHERE serve_url IS NOT NULL")
            ).fetchall()
        )
        all_places = session.execute(
            text("SELECT place_id, name, region, address, insight_json FROM places ORDER BY place_id")
        ).fetchall()

    targets = [
        row for row in all_places
        if row[0] not in crawled_ids and not _has_kto_image(row[4])
    ]

    total = len(targets)
    if limit > 0:
        targets = targets[:limit]
    logger.info("대상: %d / 전체 %d개 (limit=%s, dry_run=%s)", len(targets), total, limit or "없음", dry_run)

    ok = skip = fail = 0

    for i, (place_id, name, region, address, _) in enumerate(targets, 1):
        location = region or address or ""
        keyword = f"{name} {location}".strip()
        logger.info("[%d/%d] %s (id=%d)", i, len(targets), keyword, place_id)

        img_urls = crawler.search_images(keyword, display=5)
        if not img_urls:
            logger.info("  → 검색 결과 없음")
            skip += 1
            time.sleep(0.3)
            continue

        saved = False
        for url in img_urls:
            try:
                resp = requests.get(url, headers=req_headers, timeout=12)
                if not resp.ok:
                    continue
                data = resp.content[:8_000_000]
                meta = _check_and_upload(data, place_id, url, dry_run)
                if not meta:
                    continue

                if not dry_run:
                    with session_scope() as session:
                        if not places_store.crawled_image_exists(
                            session, place_id=place_id, source_url=meta["source_url"]
                        ):
                            places_store.add_crawled_image(
                                session,
                                place_id=place_id,
                                source_url=meta["source_url"],
                                local_path=meta["local_path"],
                                serve_url=meta["serve_url"],
                            )
                saved = True
                break
            except Exception as e:
                logger.debug("  오류 %s: %s", url, e)

        if saved:
            ok += 1
        else:
            fail += 1
            logger.info("  → 적합한 이미지 없음")

        time.sleep(0.4)

    logger.info("완료 — 저장:%d 검색결과없음:%d 적합없음:%d (dry_run=%s)", ok, skip, fail, dry_run)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="실제 저장 없이 미리보기만")
    parser.add_argument("--limit", type=int, default=0, help="처리할 최대 장소 수 (0=전체)")
    args = parser.parse_args()
    run(dry_run=args.dry_run, limit=args.limit)
