"""Bounded, transient image validation for locally hosted Phase 4.1 vision turns.

No image files are written to disk by our application. UploadFile itself may
spool to temporary files for sufficiently large multipart requests.
"""
from dataclasses import dataclass
from fastapi import UploadFile

MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGES = 3
ALLOWED_TYPES = {'image/png', 'image/jpeg', 'image/webp'}


@dataclass(frozen=True)
class ImageData:
    mime: str
    data: bytes


class VisionInputError(ValueError):
    pass


def _matches_signature(mime: str, content: bytes) -> bool:
    # Signature checks are a first-line type check, not a complete decoder.
    return {
        'image/png': lambda: content.startswith(b'\x89PNG\r\n\x1a\n') and b'IEND' in content[-24:],
        'image/jpeg': lambda: content.startswith(b'\xff\xd8\xff') and content.endswith(b'\xff\xd9'),
        'image/webp': lambda: content.startswith(b'RIFF') and content[8:12] == b'WEBP',
    }[mime]()


async def receive_images(uploads: list[UploadFile]) -> tuple[ImageData, ...]:
    if not 1 <= len(uploads) <= MAX_IMAGES:
        raise VisionInputError('Attach between 1 and 3 images.')
    received = []
    try:
        for upload in uploads:
            mime = (upload.content_type or '').lower().strip()
            if mime not in ALLOWED_TYPES:
                raise VisionInputError('Only JPEG, PNG and WebP images are supported.')
            raw = await upload.read(MAX_IMAGE_BYTES + 1)
            if not raw or len(raw) > MAX_IMAGE_BYTES:
                raise VisionInputError('Each image must be between 1 byte and 4 MiB.')
            if not _matches_signature(mime, raw):
                raise VisionInputError('Image content does not match its file type.')
            received.append(ImageData(mime=mime, data=raw))
    finally:
        for upload in uploads:
            await upload.close()
    return tuple(received)
