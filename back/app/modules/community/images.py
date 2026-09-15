"""커뮤니티 첨부 이미지 저장.

S3 설정(AWS_S3_BUCKET)이 있으면 버킷의 community/YYYY/MM/ 아래에 올리고 https 주소를 돌려줍니다.
설정이 없으면 back/static/community/YYYY/MM/ 에 저장하고 /static/community/... 로 서빙합니다.

DB는 여러 사람이 함께 쓰는데 로컬 폴더는 각자 컴퓨터에만 있어서, 로컬 저장은 올린 사람
서버에서만 사진이 보입니다. 공용 DB를 쓸 때는 반드시 S3에 저장되어야 합니다.
로컬 저장은 AWS 키 없이 개발할 때를 위한 대체 경로입니다.

- 원본 파일명은 쓰지 않습니다(경로 조작·중복 방지). uuid 로 새로 짓습니다.
- 긴 변을 1600px로 줄이고 썸네일(400px)을 함께 만듭니다.
- 다시 인코딩하므로 EXIF의 위치정보가 남지 않습니다.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
IMAGE_ROOT = _BACKEND_ROOT / "static" / "community"

MAX_BYTES = 8 * 1024 * 1024  # 8MB
MAX_EDGE = 1600
THUMB_EDGE = 400
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}

# 크롤러가 쓰는 images/ 와 섞이지 않게 버킷 안에서 폴더를 나눈다.
S3_PREFIX = "community"
# 파일명이 uuid라 같은 주소의 내용이 바뀌는 일이 없다 — 오래 캐시해도 된다.
S3_CACHE_CONTROL = "public, max-age=31536000, immutable"


class ImageError(Exception):
    """업로드된 파일이 이미지가 아니거나 처리할 수 없을 때. (사용자 잘못 → 400)"""


class ImageStorageError(Exception):
    """이미지는 정상인데 저장소에 올리지 못했을 때. (서버 문제 → 503)"""


# ── S3 ────────────────────────────────────────────────────────────────────────

def _s3_settings() -> tuple[str, str] | None:
    """(버킷, 리전). 버킷이 없으면 None — 로컬 저장으로 대체한다."""
    bucket = os.getenv("AWS_S3_BUCKET", "").strip()
    if not bucket:
        return None
    region = os.getenv("AWS_S3_REGION", "").strip() or "ap-southeast-2"
    return bucket, region


def _s3_client(region: str):
    import boto3

    # 키가 비어 있으면 None을 넘겨 boto3가 환경·IAM 역할에서 찾게 한다.
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None,
    )


def _s3_url(bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


# ── 저장 ──────────────────────────────────────────────────────────────────────

def _encode_jpeg(image: Image.Image, edge: int, quality: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((edge, edge), Image.LANCZOS)
    buf = BytesIO()
    copy.save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def save_upload(data: bytes) -> tuple[str, str]:
    """이미지 바이트를 저장하고 (원본 URL, 썸네일 URL)을 돌려줍니다."""
    if not data:
        raise ImageError("빈 파일입니다.")
    if len(data) > MAX_BYTES:
        raise ImageError("이미지는 8MB까지 올릴 수 있어요.")

    try:
        image = Image.open(BytesIO(data))
        image.verify()  # 실제 이미지인지 먼저 확인
        image = Image.open(BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - 손상 파일 등 모두 동일 처리
        raise ImageError("이미지 파일이 아니거나 손상되었습니다.") from exc

    if (image.format or "").upper() not in ALLOWED_FORMATS:
        raise ImageError("JPG·PNG·WEBP·GIF만 올릴 수 있어요.")

    # 세로로 찍은 사진이 눕지 않도록 EXIF 회전을 먼저 적용
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    full_bytes = _encode_jpeg(image, MAX_EDGE, 85)
    thumb_bytes = _encode_jpeg(image, THUMB_EDGE, 80)

    now = datetime.utcnow()
    name = uuid.uuid4().hex
    subdir = f"{now:%Y}/{now:%m}"

    settings = _s3_settings()
    if settings:
        return _save_to_s3(settings, subdir, name, full_bytes, thumb_bytes)
    return _save_to_disk(subdir, name, full_bytes, thumb_bytes)


def _save_to_s3(
    settings: tuple[str, str], subdir: str, name: str, full: bytes, thumb: bytes
) -> tuple[str, str]:
    bucket, region = settings
    full_key = f"{S3_PREFIX}/{subdir}/{name}.jpg"
    thumb_key = f"{S3_PREFIX}/{subdir}/{name}_thumb.jpg"
    s3 = _s3_client(region)
    uploaded: list[str] = []
    try:
        for key, body in ((full_key, full), (thumb_key, thumb)):
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=body,
                ContentType="image/jpeg",
                CacheControl=S3_CACHE_CONTROL,
            )
            uploaded.append(key)
    except Exception as exc:  # noqa: BLE001 - 네트워크·권한 오류 모두 동일 처리
        # 원본만 올라가고 썸네일이 실패하면 짝 잃은 파일이 남으므로 되돌린다.
        for key in uploaded:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:  # noqa: BLE001
                logger.warning("[community-s3] 되돌리기 실패: %s", key)
        logger.warning("[community-s3] 업로드 실패: %s", exc)
        # 로컬로 대체하지 않는다. 공용 DB에 로컬 경로가 들어가면
        # 올린 사람 서버에서만 보이는 사진이 되어 원래 문제가 조용히 재발한다.
        raise ImageStorageError("사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
    return _s3_url(bucket, region, full_key), _s3_url(bucket, region, thumb_key)


def _save_to_disk(subdir: str, name: str, full: bytes, thumb: bytes) -> tuple[str, str]:
    folder = IMAGE_ROOT / subdir
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.jpg").write_bytes(full)
    (folder / f"{name}_thumb.jpg").write_bytes(thumb)
    rel = f"/static/community/{subdir}/{name}"
    return f"{rel}.jpg", f"{rel}_thumb.jpg"


# ── 삭제 ──────────────────────────────────────────────────────────────────────

def delete_image(url: str) -> None:
    """글이 지워질 때 파일도 정리합니다. 우리가 저장한 위치가 아니면 아무것도 하지 않습니다."""
    if not url:
        return

    settings = _s3_settings()
    if settings and url.startswith("https://"):
        bucket, region = settings
        # 우리 버킷의 community/ 아래만 지운다. 크롤러 이미지나 외부 주소는 건드리지 않는다.
        prefix = _s3_url(bucket, region, f"{S3_PREFIX}/")
        if not url.startswith(prefix):
            return
        key = url[len(_s3_url(bucket, region, "")) :]
        if ".." in key.split("/"):
            return
        try:
            _s3_client(region).delete_object(Bucket=bucket, Key=key)
        except Exception as exc:  # noqa: BLE001 - 삭제 실패로 글 삭제까지 막지 않는다
            logger.warning("[community-s3] 삭제 실패 %s: %s", key, exc)
        return

    prefix = "/static/community/"
    if not url.startswith(prefix):
        return
    target = (IMAGE_ROOT / url[len(prefix) :]).resolve()
    try:
        target.relative_to(IMAGE_ROOT.resolve())
    except ValueError:
        return  # 루트 밖을 가리키면 무시
    target.unlink(missing_ok=True)
