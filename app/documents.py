"""Phase 4.2: bounded local validation and inline PDF/document content.

PDFs are sent inline to Meta's Responses API, with no Files API upload.
DOCX/TXT/MD/CSV are parsed locally, stripped to plain UTF-8 text and
included as clearly delimited user-provided context (untrusted source).
"""
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePath
from zipfile import BadZipFile, ZipFile, is_zipfile
import xml.etree.ElementTree as ET

from fastapi import UploadFile
from pypdf import PdfReader

MAX_DOCUMENTS = 2
MAX_DOCUMENT_BYTES = 12 * 1024 * 1024
MAX_DOCX_UNCOMPRESSED = 12 * 1024 * 1024
MAX_DOCUMENT_TEXT = 55_000
MAX_PDF_PAGES = 100
ALLOWED_EXTENSIONS = frozenset({'.pdf', '.docx', '.txt', '.md', '.csv'})
WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

class DocumentInputError(ValueError):
    pass

@dataclass(frozen=True)
class DocumentData:
    filename: str
    mime: str
    data: bytes = b''
    text: str = ''
    page_count: int | None = None
    truncated: bool = False


def safe_filename(raw: str | None) -> str:
    # Treat Windows-style separators as path separators too.
    name = (raw or 'document').replace('\\', '/').split('/')[-1].strip()
    # Do not trust control chars or filename escape sequences in prompts or UI.
    return ''.join(ch for ch in name if 32 <= ord(ch) <= 126 and ch not in '<>{}').strip()[:90] or 'document'


def docx_to_text(raw: bytes) -> str:
    if not is_zipfile(BytesIO(raw)):
        raise DocumentInputError('Invalid DOCX archive.')
    try:
        with ZipFile(BytesIO(raw)) as archive:
            members = archive.infolist()
            if len(members) > 400 or sum(z.file_size for z in members) > MAX_DOCX_UNCOMPRESSED:
                raise DocumentInputError('DOCX decompressed content is too large.')
            if 'word/document.xml' not in archive.namelist():
                raise DocumentInputError('DOCX has no main document XML.')
            payload = archive.read('word/document.xml')
            root = ET.fromstring(payload)
            paragraphs = []
            for paragraph in root.iter(WORD_NS+'p'):
                text = ''.join(t.text or '' for t in paragraph.iter(WORD_NS+'t')).strip()
                if text:
                    paragraphs.append(text)
            return '\n'.join(paragraphs)
    except (BadZipFile, ET.ParseError, KeyError, RuntimeError) as exc:
        raise DocumentInputError('Invalid DOCX content.') from exc


def parse_document(filename: str, raw: bytes) -> DocumentData:
    name = safe_filename(filename)
    ext = PurePath(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise DocumentInputError('Supported documents: PDF, DOCX, TXT, MD and CSV.')
    if not raw or len(raw) > MAX_DOCUMENT_BYTES:
        raise DocumentInputError('Each document must be nonempty and at most 12 MiB.')
    if ext == '.pdf':
        if not raw.startswith(b'%PDF-'):
            raise DocumentInputError('File is not a valid PDF.')
        try:
            reader = PdfReader(BytesIO(raw), strict=False)
            if reader.is_encrypted:
                raise DocumentInputError('Password-protected PDFs are not supported.')
            pages = len(reader.pages)
            if pages < 1 or pages > MAX_PDF_PAGES:
                raise DocumentInputError('PDFs must contain 1–100 pages.')
        except DocumentInputError:
            raise
        except Exception as exc:
            raise DocumentInputError('Could not read PDF structure.') from exc
        return DocumentData(name, 'application/pdf', raw, page_count=pages)
    if ext == '.docx':
        text = docx_to_text(raw)
    else:
        if raw.startswith(b'\x00\x00') or b'\x00' in raw[:2048]:
            raise DocumentInputError('Text document appears to contain binary data.')
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise DocumentInputError('Text files must be UTF-8 encoded.') from exc
    if not text.strip():
        raise DocumentInputError('No readable text found in document.')
    return DocumentData(name, 'text/plain', text=text[:MAX_DOCUMENT_TEXT],
                        truncated=len(text) > MAX_DOCUMENT_TEXT)


async def receive_documents(files: list[UploadFile] | None) -> tuple[DocumentData, ...]:
    if not files:
        return ()
    if len(files) > MAX_DOCUMENTS:
        raise DocumentInputError('Attach at most 2 documents per message.')
    received = []
    for file in files:
        try:
            data = await file.read(MAX_DOCUMENT_BYTES + 1)
            received.append(parse_document(file.filename or 'document', data))
        finally:
            await file.close()
    return tuple(received)
