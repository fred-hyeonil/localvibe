"""
네이버 블로그 검색·본문·이미지 크롤링.

NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 은 네이버 개발자센터의
「검색 API > 블로그」 앱에서 발급받은 값입니다. (HTML 페이지를 직접 긁는 게 아니라
검색 API로 포스트 URL 목록을 받은 뒤, 각 URL 본문/이미지를 크롤합니다.)
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

IMAGE_SAVE_ROOT = Path(__file__).resolve().parents[3] / "static" / "images"

_CONTENT_TYPE_EXT = {"png": "png", "gif": "gif", "webp": "webp"}


def _s3_upload(image_bytes: bytes, place_id: int, filename: str, content_type: str) -> str | None:
    bucket = os.getenv("AWS_S3_BUCKET", "").strip()
    region = os.getenv("AWS_S3_REGION", "ap-southeast-2").strip()
    if not bucket:
        return None
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None,
        )
        key = f"images/{place_id}/{filename}"
        s3.put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType=content_type)
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    except Exception as e:
        logger.warning("[s3] 업로드 실패: %s", e)
        return None


def _get_crawler() -> Optional["NaverBlogCrawler"]:
    client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        logger.warning("[naver] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정")
        return None
    return NaverBlogCrawler(client_id, client_secret)


class NaverBlogCrawler:
    """네이버 검색 API + BeautifulSoup (iframe·스마트에디터 대응)."""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.search_api_url = "https://openapi.naver.com/v1/search/blog"
        self.headers = {
            "X-Naver-Client-Id": self.client_id,
            "X-Naver-Client-Secret": self.client_secret,
        }
        self.naver_base_url = "https://blog.naver.com"
        self._crawl_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    def _resolve_soup(self, url: str) -> Optional[BeautifulSoup]:
        try:
            resp = requests.get(url, headers=self._crawl_headers, timeout=12)
            resp.encoding = "utf-8"
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            iframe = soup.find("iframe", {"id": "mainFrame"})
            if iframe:
                src = iframe.get("src", "") or ""
                if src:
                    if not src.startswith("http"):
                        src = (
                            "https:" + src
                            if src.startswith("//")
                            else self.naver_base_url + src
                        )
                    try:
                        inner = requests.get(
                            src, headers=self._crawl_headers, timeout=12
                        )
                        inner.encoding = "utf-8"
                        soup = BeautifulSoup(inner.text, "html.parser")
                    except Exception:
                        pass

            return soup
        except requests.exceptions.RequestException as e:
            logger.debug("[naver] 페이지 로드 실패 url=%s err=%s", url, e)
            return None

    def search_blog(self, keyword: str, display: int = 5) -> List[Dict]:
        try:
            params = {"query": keyword, "display": display, "sort": "sim"}
            response = requests.get(
                self.search_api_url, headers=self.headers, params=params, timeout=10
            )
            response.raise_for_status()
            return [
                {
                    "title": item["title"],
                    "link": item["link"],
                    "description": item["description"],
                    "blogger_name": item.get("bloggername", "Unknown"),
                    "post_date": item.get("postdate", ""),
                }
                for item in response.json().get("items", [])
            ]
        except requests.exceptions.RequestException as e:
            logger.warning("[naver] 검색 API 에러 keyword=%s err=%s", keyword, e)
            return []

    def search_images(self, keyword: str, display: int = 5) -> List[str]:
        """네이버 이미지 검색 API로 이미지 URL 목록 반환."""
        try:
            params = {"query": keyword, "display": display, "sort": "sim", "filter": "large"}
            response = requests.get(
                "https://openapi.naver.com/v1/search/image",
                headers=self.headers,
                params=params,
                timeout=10,
            )
            response.raise_for_status()
            return [
                item["link"]
                for item in response.json().get("items", [])
                if item.get("link", "").startswith("http")
            ]
        except requests.exceptions.RequestException as e:
            logger.warning("[naver] 이미지 검색 API 에러 keyword=%s err=%s", keyword, e)
            return []

    def extract_blog_content(self, blog_url: str) -> Optional[str]:
        soup = self._resolve_soup(blog_url)
        if not soup:
            return None

        for selector in ("se-main-container", "post-view"):
            area = soup.find("div", {"class": selector})
            if area:
                text = area.get_text(strip=True)
                return text or None

        return None

    def extract_blog_images(self, blog_url: str, max_images: int = 5) -> List[str]:
        soup = self._resolve_soup(blog_url)
        if not soup:
            return []

        content_area = soup.find("div", {"class": "se-main-container"})
        search_scope = content_area if content_area else soup

        urls: List[str] = []
        for img in search_scope.find_all("img"):
            src = (img.get("data-lazy-src") or img.get("src") or "").strip()
            if not src.startswith("http"):
                continue
            if "pstatic.net" not in src and "naver.net" not in src:
                continue
            if src not in urls:
                urls.append(src)
            if len(urls) >= max_images:
                break

        return urls

    def download_image(self, image_url: str, place_id: int) -> Optional[Dict[str, str]]:
        try:
            resp = requests.get(image_url, headers=self._crawl_headers, timeout=15)
            resp.raise_for_status()
            content_type = (resp.headers.get("Content-Type") or "").lower()
            ext = next((e for e in _CONTENT_TYPE_EXT if e in content_type), "jpg")
            data = resp.content[:8_000_000]

            # 이미지 품질 필터링: 셀카/광고/아이콘 제거
            try:
                import io
                from PIL import Image
                img = Image.open(io.BytesIO(data))
                w, h = img.size
                if w < 400 or h < 300:
                    logger.debug("[img] 너무 작음 skip %dx%d %s", w, h, image_url)
                    return None
                if h > w * 1.3:
                    logger.debug("[img] 세로형(셀카) skip %dx%d %s", w, h, image_url)
                    return None
                if w > h * 5:
                    logger.debug("[img] 가로배너 skip %dx%d %s", w, h, image_url)
                    return None
            except Exception:
                pass

            filename = f"{uuid.uuid4().hex}.{ext}"

            # S3 업로드 우선, 실패 시 로컬 저장 폴백
            serve_url = _s3_upload(data, place_id, filename, content_type or f"image/{ext}")
            local_path = ""
            if not serve_url:
                save_dir = IMAGE_SAVE_ROOT / str(place_id)
                save_dir.mkdir(parents=True, exist_ok=True)
                path = save_dir / filename
                path.write_bytes(data)
                local_path = str(path)
                serve_url = f"/static/images/{place_id}/{filename}"

            return {"source_url": image_url, "local_path": local_path, "serve_url": serve_url}
        except Exception as e:
            logger.debug("[naver] 이미지 다운로드 실패 url=%s err=%s", image_url, e)
            return None

    def crawl_blogs(
        self, shop_names: List[str], max_results_per_shop: int = 3
    ) -> List[Dict]:
        all_data: List[Dict] = []
        for idx, shop_name in enumerate(shop_names, 1):
            logger.info("[%s/%s] '%s' 검색", idx, len(shop_names), shop_name)
            search_results = self.search_blog(shop_name, display=max_results_per_shop)
            if not search_results:
                continue
            for result in search_results:
                content = self.extract_blog_content(result["link"])
                if content:
                    all_data.append(
                        {
                            "shop_name": shop_name,
                            "blog_title": result["title"],
                            "blog_url": result["link"],
                            "blogger_name": result["blogger_name"],
                            "post_date": result["post_date"],
                            "description": result["description"],
                            "content": content,
                            "content_length": len(content),
                        }
                    )
                time.sleep(0.35)
            time.sleep(0.5)
        return all_data




def crawl_naver_blog_for_place(
    place_name: str,
    place_id: int,
    max_results: int = 3,
    region: str = "",
    category: str = "",
    address: str = "",
) -> Tuple[str, List[str]]:
    """
    한 장소: 네이버 검색 → 포스트 URL별 본문 텍스트 수집 및 DB 저장.
    (이미지 수집 코드는 유지하되 아래 루프를 주석 처리해 비활성화 — 재사용 시 주석 해제.)
    """
    crawler = _get_crawler()
    if not crawler:
        return "", []

    # 따옴표로 장소명 exact match + 주소/카테고리 보강
    parts = [f'"{place_name}"']
    if address:
        parts.append(address)
    elif region:
        parts.append(region)
    if category:
        parts.append(category)
    keyword = " ".join(parts)
    posts = crawler.search_blog(keyword, display=max_results)
    texts: List[str] = []
    serve_saved: List[str] = []

    from app.repositories import places_store
    from app.repositories.db import session_scope

    use_db = bool(os.getenv("MYSQL_URL", "").strip())

    for post in posts:
        link = post.get("link") or ""
        if not link or "blog.naver.com" not in link:
            time.sleep(0.25)
            continue

        body = crawler.extract_blog_content(link)
        if body:
            texts.append(str(body)[:4000])

        if use_db:
            blog_data = {
                "blog_url": link,
                "blog_title": post.get("title"),
                "blogger_name": post.get("blogger_name"),
                "post_date": post.get("post_date"),
                "description": post.get("description"),
                "content": body,
                "content_length": len(body) if body else 0,
            }
            with session_scope() as session:
                if not places_store.crawled_text_exists(session, place_id=place_id, blog_url=link):
                    places_store.add_crawled_text(session, place_id=place_id, blog_data=blog_data)

        time.sleep(0.35)

    return "\n\n".join(texts), serve_saved


def save_to_json(data: List[Dict], output_file: str) -> None:
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
