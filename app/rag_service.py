"""MUSE Nova RAGaaS, local single-user edition.

Standalone SQLite FTS5 knowledge store that does NOT depend on Docker.
Optional real neural embedding retrieval via sentence-transformers, explicitly opted in.
Document bytes are parsed and discarded; extracted snippets persist until deletion.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import sqlite3
from threading import Lock
from uuid import uuid4

from pypdf import PdfReader

from app.documents import DocumentInputError, docx_to_text, safe_filename, MAX_DOCUMENT_BYTES

_DB_LOCK = Lock()
_EMBEDDER = None
_EMBEDDER_LOCK = Lock()
MAX_DOCUMENT_CHARS = 320_000
MAX_COLLECTION_CHUNKS = 4_000
CHUNK_CHARS = 1100
OVERLAP_CHARS = 160


class RagError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def db_path() -> Path:
    # Resolve relative paths against the project, not the current shell's CWD.
    # Running Uvicorn from a different directory must never silently create a
    # second empty knowledge database and strand existing collection IDs.
    configured = Path(os.getenv('RAG_SQLITE_PATH', './data/rag.sqlite3')).expanduser()
    project_root = Path(__file__).resolve().parent.parent
    path = (configured if configured.is_absolute() else project_root / configured).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def embeddings_enabled() -> bool:
    return os.getenv('RAG_ENABLE_EMBEDDINGS', 'false').strip().lower() in ('1', 'true', 'yes')


def embedding_model_name() -> str:
    return os.getenv('RAG_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2').strip()


def embedding_model():
    global _EMBEDDER
    if not embeddings_enabled():
        raise RagError('Neural embeddings are disabled. Set RAG_ENABLE_EMBEDDINGS=true and install requirements-rag-embeddings.txt.', 503)
    with _EMBEDDER_LOCK:
        if _EMBEDDER is None:
            try:
                from sentence_transformers import SentenceTransformer
            except (ImportError, OSError) as exc:
                raise RagError('Sentence Transformers is unavailable. Install requirements-rag-embeddings.txt or use keyword search.', 503) from exc
            _EMBEDDER = SentenceTransformer(embedding_model_name(), trust_remote_code=False)
    return _EMBEDDER


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = embedding_model()
    vectors = model.encode(texts, batch_size=16, normalize_embeddings=True, show_progress_bar=False)
    return [[float(a) for a in v] for v in vectors]


def connection():
    db = sqlite3.connect(db_path(), timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS rag_collections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES rag_collections(id) ON DELETE CASCADE,
      name TEXT NOT NULL, content_hash TEXT NOT NULL, pages INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(collection_id, name)
    );
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL, idx INTEGER NOT NULL, page INTEGER,
      content TEXT NOT NULL, embedding TEXT, embedding_model TEXT
    );
    CREATE INDEX IF NOT EXISTS rag_chunks_collection_idx ON rag_chunks(collection_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(content, chunk_id UNINDEXED, collection_id UNINDEXED);
    ''')
    return db


def status():
    with _DB_LOCK:
        db = connection()
        try:
            c = db.execute('SELECT count(*) n FROM rag_collections').fetchone()['n']
            d = db.execute('SELECT count(*) n FROM rag_documents').fetchone()['n']
            n = db.execute('SELECT count(*) n FROM rag_chunks').fetchone()['n']
        finally:
            db.close()
    return {'status':'ready', 'backend':'sqlite_fts5', 'docker_required':False,
            'single_user_local_only':True, 'collections':c, 'documents':d, 'chunks':n,
            'embeddings_enabled':embeddings_enabled(), 'embedding_model':embedding_model_name() if embeddings_enabled() else None,
            'available_modes':['keyword', 'semantic', 'hybrid', 'auto'] if embeddings_enabled() else ['keyword','auto']}


def list_collections():
    with _DB_LOCK:
        db = connection()
        try:
            rows = db.execute('''SELECT c.id,c.name,c.created_at,COUNT(DISTINCT d.id) AS documents,
                   (SELECT COUNT(*) FROM rag_chunks ch WHERE ch.collection_id=c.id) AS chunks
                   FROM rag_collections c LEFT JOIN rag_documents d ON d.collection_id=c.id
                   GROUP BY c.id ORDER BY c.created_at DESC''').fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()


def create_collection(name: str):
    name = name.strip()
    if not name or len(name) > 100:
        raise RagError('Collection name must contain 1–100 characters.')
    cid = str(uuid4())
    with _DB_LOCK:
        db = connection()
        try:
            db.execute('INSERT INTO rag_collections (id,name) VALUES (?,?)', (cid,name))
        finally:
            db.close()
    return {'id':cid, 'name':name, 'documents':0, 'chunks':0}


def ensure_collection(db, cid):
    if not db.execute('SELECT 1 FROM rag_collections WHERE id=?',(cid,)).fetchone():
        raise RagError('Knowledge collection not found.', 404)


def _delete_doc(db, doc_id):
    chunk_ids = [x[0] for x in db.execute('SELECT id FROM rag_chunks WHERE document_id=?',(doc_id,)).fetchall()]
    for chunk_id in chunk_ids:
        db.execute('DELETE FROM rag_fts WHERE chunk_id=?',(str(chunk_id),))
    db.execute('DELETE FROM rag_documents WHERE id=?',(doc_id,))


def delete_collection(cid):
    with _DB_LOCK:
        db = connection()
        try:
            ensure_collection(db,cid)
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM rag_fts WHERE collection_id=?',(cid,))
            db.execute('DELETE FROM rag_collections WHERE id=?',(cid,))
            db.execute('COMMIT')
        except Exception:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally:
            db.close()
    return {'deleted':True, 'collection_id':cid}


def delete_document(cid,doc_id):
    with _DB_LOCK:
        db = connection()
        try:
            ensure_collection(db,cid)
            r=db.execute('SELECT id FROM rag_documents WHERE id=? AND collection_id=?',(doc_id,cid)).fetchone()
            if not r: raise RagError('Document not found in collection.',404)
            db.execute('BEGIN IMMEDIATE')
            _delete_doc(db,doc_id)
            db.execute('COMMIT')
        except Exception:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally: db.close()
    return {'deleted':True, 'document_id':doc_id}


def list_documents(cid):
    with _DB_LOCK:
        db=connection()
        try:
            ensure_collection(db,cid)
            rows=db.execute('''SELECT d.id, d.name,d.pages,d.version,d.created_at,
               (SELECT COUNT(*) FROM rag_chunks ch WHERE ch.document_id=d.id) AS chunks
               FROM rag_documents d WHERE d.collection_id=? ORDER BY d.created_at DESC''',(cid,)).fetchall()
            return [dict(r) for r in rows]
        finally: db.close()


def parse_pages(name:str, raw:bytes):
    name=safe_filename(name)
    ext=Path(name).suffix.lower()
    if ext not in ('.pdf','.docx','.txt','.md','.csv'):
        raise RagError('Supported formats: PDF, DOCX, TXT, MD and CSV.')
    if not raw or len(raw)>MAX_DOCUMENT_BYTES:
        raise RagError('Document must be nonempty and at most 12 MiB.',413)
    try:
        if ext=='.pdf':
            if not raw.startswith(b'%PDF-'): raise RagError('Invalid PDF header.')
            reader=PdfReader(BytesIO(raw),strict=False)
            if reader.is_encrypted: raise RagError('Encrypted PDFs are not supported.')
            if len(reader.pages)>100: raise RagError('PDFs must contain at most 100 pages.',413)
            pages=[(i+1,(p.extract_text() or '').strip()) for i,p in enumerate(reader.pages)]
        elif ext=='.docx':
            pages=[(None,docx_to_text(raw))]
        else:
            if b'\x00' in raw[:2048]: raise RagError('File appears to be binary.')
            try: text=raw.decode('utf-8-sig')
            except UnicodeDecodeError as exc: raise RagError('Text files must be UTF-8.') from exc
            pages=[(None,text)]
    except (RagError,DocumentInputError): raise
    except Exception as exc: raise RagError('Unable to parse document safely.') from exc
    text_length=sum(len(s) for _,s in pages)
    if text_length > MAX_DOCUMENT_CHARS:
        raise RagError('Extracted text exceeds 320,000 characters; split the document.',413)
    if not any(t.strip() for _,t in pages):
        raise RagError('Document contains no extractable text. Scanned PDFs need OCR, which is not enabled.',422)
    return name,pages


def chunk_pages(pages):
    out=[]
    for page,text in pages:
        text=re.sub(r'\s+',' ',text).strip()
        if not text: continue
        pos=0
        while pos<len(text):
            end=min(pos+CHUNK_CHARS,len(text))
            if end<len(text):
                candidate=text.rfind(' ',pos+700,end)
                if candidate>pos+700: end=candidate
            chunk=text[pos:end].strip()
            if chunk: out.append((page,chunk))
            if end>=len(text): break
            pos=max(pos+1,end-OVERLAP_CHARS)
    return out


def ingest(cid,filename,raw):
    filename,pages=parse_pages(filename,raw)
    chunks=chunk_pages(pages)
    if not chunks or len(chunks)>MAX_COLLECTION_CHUNKS:
        raise RagError('Document produced no searchable chunks or exceeded the chunk limit.',413)
    checksum=sha256(raw).hexdigest()
    # Embed prior to opening the database transaction. If embedding fails, don't mutate storage.
    vectors=embed_texts([t for _,t in chunks]) if embeddings_enabled() else [None]*len(chunks)
    with _DB_LOCK:
        db=connection()
        try:
            ensure_collection(db,cid)
            existing=db.execute('SELECT id,content_hash,version FROM rag_documents WHERE collection_id=? AND name=?',(cid,filename)).fetchone()
            indexed = db.execute('''SELECT COUNT(*) n FROM rag_chunks WHERE document_id=? AND embedding IS NOT NULL AND embedding_model=?''',
                                 (existing['id'], embedding_model_name())).fetchone()['n'] if existing else 0
            if existing and existing['content_hash']==checksum and (not embeddings_enabled() or indexed==len(chunks)):
                return {'id':existing['id'],'name':filename,'pages':len(pages),'chunks':len(chunks),'status':'unchanged','version':existing['version']}
            current=db.execute('SELECT COUNT(*) n FROM rag_chunks WHERE collection_id=?',(cid,)).fetchone()['n']
            old=db.execute('SELECT COUNT(*) n FROM rag_chunks WHERE document_id=?',(existing['id'],)).fetchone()['n'] if existing else 0
            if current-old+len(chunks)>MAX_COLLECTION_CHUNKS:
                raise RagError('Collection limit is 4000 chunks in this local version.',413)
            db.execute('BEGIN IMMEDIATE')
            version=(existing['version']+1) if existing else 1
            if existing: _delete_doc(db,existing['id'])
            doc_id=str(uuid4())
            db.execute('INSERT INTO rag_documents (id,collection_id,name,content_hash,pages,version) VALUES (?,?,?,?,?,?)',
                       (doc_id,cid,filename,checksum,len(pages),version))
            for i,((page,text),vector) in enumerate(zip(chunks,vectors)):
                cur=db.execute('INSERT INTO rag_chunks (document_id,collection_id,idx,page,content,embedding,embedding_model) VALUES (?,?,?,?,?,?,?)',
                    (doc_id,cid,i,page,text,json.dumps(vector) if vector is not None else None,embedding_model_name() if vector is not None else None))
                db.execute('INSERT INTO rag_fts (content,chunk_id,collection_id) VALUES (?,?,?)',(text,str(cur.lastrowid),cid))
            db.execute('COMMIT')
            return {'id':doc_id,'name':filename,'pages':len(pages),'chunks':len(chunks),'version':version,'status':'indexed'}
        except Exception:
            if db.in_transaction:db.execute('ROLLBACK')
            raise
        finally: db.close()


def _keyword(db,cid,query,limit):
    terms=re.findall(r'[^\W_]{2,}',query,flags=re.UNICODE)[:15]
    if not terms: return []
    phrase=' OR '.join('"'+s.replace('"','')+'"' for s in terms)
    try:
        return [int(r['chunk_id']) for r in db.execute('''SELECT chunk_id FROM rag_fts
        WHERE rag_fts MATCH ? AND collection_id=? ORDER BY bm25(rag_fts) LIMIT ?''',(phrase,cid,limit)).fetchall()]
    except sqlite3.OperationalError:
        return []


def _semantic(db,cid,query,limit):
    v=embed_texts([query])[0]
    rows=db.execute('SELECT id,embedding FROM rag_chunks WHERE collection_id=? AND embedding_model=? AND embedding IS NOT NULL',
                    (cid,embedding_model_name())).fetchall()
    if not rows:
        raise RagError('No neural embeddings indexed for this collection. Re-upload documents with embeddings enabled.',409)
    sims=[]
    for row in rows:
        stored=json.loads(row['embedding'])
        if len(stored)!=len(v): continue
        score=sum(x*y for x,y in zip(v,stored))
        sims.append((row['id'],score))
    sims.sort(key=lambda x:x[1],reverse=True)
    return [id for id,_ in sims[:limit]]


def search(cid,query,mode='auto',top_k=5):
    query=query.strip()
    if not query or len(query)>1000: raise RagError('Query length must be 1–1000 characters.')
    if mode not in ('auto','keyword','semantic','hybrid'): raise RagError('Unsupported RAG mode.')
    top_k=max(1,min(12,int(top_k)))
    chosen=mode
    with _DB_LOCK:
        db=connection()
        try:
            ensure_collection(db,cid)
            if mode=='auto':
                if embeddings_enabled():
                    total=db.execute('SELECT COUNT(*) n FROM rag_chunks WHERE collection_id=?',(cid,)).fetchone()['n']
                    indexed=db.execute('SELECT COUNT(*) n FROM rag_chunks WHERE collection_id=? AND embedding IS NOT NULL AND embedding_model=?',
                        (cid, embedding_model_name())).fetchone()['n']
                    chosen='hybrid' if total>0 and indexed==total else 'keyword'
                else:
                    chosen='keyword'
            hits=[]
            if chosen in ('keyword','hybrid'): hits.append(_keyword(db,cid,query,top_k*5))
            if chosen in ('semantic','hybrid'): hits.append(_semantic(db,cid,query,top_k*5))
            # Reciprocal Rank Fusion of the actual lists returned; not an invented semantic ranking.
            scores={}
            for rank_list in hits:
                for i,chunk_id in enumerate(rank_list):
                    scores[chunk_id]=scores.get(chunk_id,0.0)+1.0/(60.0+i+1)
            ranked=sorted(scores,key=scores.get,reverse=True)[:top_k]
            out=[]
            for id in ranked:
                r=db.execute('''SELECT c.id,c.idx,c.page,c.content,d.id AS document_id,d.name,d.version
                     FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id
                     WHERE c.id=? AND c.collection_id=?''',(id,cid)).fetchone()
                if r:
                    data=dict(r)
                    data['citation']=f"{data['name']} ({'page '+str(data['page'])+', ' if data['page'] else ''}chunk {data['idx']+1})"
                    data['score']=round(scores[id],6)
                    out.append(data)
            return {'collection_id':cid,'mode':chosen,'query':query,'results':out}
        finally: db.close()
