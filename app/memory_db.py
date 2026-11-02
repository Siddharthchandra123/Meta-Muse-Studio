"""Single-user local memory store with PostgreSQL and pgvector.

No memories are inferred or saved automatically. The default deterministic hashed
vectorizer is a *lexical* similarity baseline, not a neural semantic embedding.
"""
from __future__ import annotations

import hashlib
import math
import os
import re
from dataclasses import dataclass
from uuid import UUID, uuid4

EMBED_DIMS = 384
KINDS = frozenset({'preference', 'fact', 'project', 'instruction'})


def hash_embedding(text: str) -> list[float]:
    """Dependency-free deterministic lexical vector (word + character n-grams)."""
    terms = re.findall(r'[\w]+', text.casefold(), re.UNICODE)
    features: list[str] = [f'w:{word}' for word in terms]
    for word in terms:
        padded = f'^{word}$'
        features.extend('g:' + padded[i:i+3] for i in range(max(0, len(padded) - 2)))
    values = [0.0] * EMBED_DIMS
    for feat in features:
        digest = hashlib.blake2b(feat.encode('utf-8'), digest_size=8, person=b'musenova').digest()
        idx = int.from_bytes(digest[:4], 'big') % EMBED_DIMS
        sign = 1.0 if digest[4] & 1 else -1.0
        values[idx] += sign
    magnitude = math.sqrt(sum(n * n for n in values))
    return [round(v / magnitude, 7) for v in values] if magnitude else values


def vector_literal(values: list[float]) -> str:
    if len(values) != EMBED_DIMS or any(not math.isfinite(x) for x in values):
        raise ValueError('Invalid memory embedding')
    return '[' + ','.join(str(n) for n in values) + ']'


SCHEMA = '''
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS muse_memories (
 id UUID PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('preference','fact','project','instruction')),
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 1200),
 embedding vector(384) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS muse_memories_vector_idx
 ON muse_memories USING hnsw (embedding vector_cosine_ops);
CREATE TABLE IF NOT EXISTS muse_threads (
 id UUID PRIMARY KEY,
 category TEXT NOT NULL CHECK(category IN ('chat','research')),
 title TEXT NOT NULL,
 last_answer TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS muse_threads_updated_idx ON muse_threads(updated_at DESC);
'''


@dataclass(frozen=True)
class MemoryItem:
    id: str
    kind: str
    content: str
    created_at: str
    updated_at: str
    score: float | None = None


class MemoryDatabase:
    def __init__(self, dsn: str):
        if not dsn or not dsn.startswith(('postgresql://', 'postgres://')):
            raise ValueError('MEMORY_DATABASE_URL must be a PostgreSQL DSN')
        self.dsn = dsn

    async def _connect(self):
        from psycopg import AsyncConnection
        return await AsyncConnection.connect(self.dsn, connect_timeout=5)

    async def setup(self) -> None:
        async with await self._connect() as conn:
            for statement in SCHEMA.split(';'):
                if statement.strip():
                    await conn.execute(statement)
            await conn.commit()

    @staticmethod
    def _item(row, score=None) -> dict:
        result = {'id': str(row[0]), 'kind': row[1], 'content': row[2],
                  'created_at': row[3].isoformat(), 'updated_at': row[4].isoformat()}
        if score is not None:
            result['score'] = round(float(score), 4)
        return result

    async def add(self, content: str, kind: str) -> dict:
        content = content.strip()
        if kind not in KINDS or not 1 <= len(content) <= 1200 or not re.search(r'\w',content):
            raise ValueError('Memory must have a valid kind and 1–1200 characters')
        mid = uuid4()
        vec = vector_literal(hash_embedding(content))
        async with await self._connect() as conn:
            result = await conn.execute('''INSERT INTO muse_memories (id,kind,content,embedding)
                 VALUES (%s,%s,%s,%s::vector)
                 RETURNING id,kind,content,created_at,updated_at''', (mid,kind,content,vec))
            row = await result.fetchone()
            await conn.commit()
            return self._item(row)

    async def list(self, limit: int = 100) -> list[dict]:
        async with await self._connect() as conn:
            cursor = await conn.execute('''SELECT id,kind,content,created_at,updated_at
                FROM muse_memories ORDER BY updated_at DESC LIMIT %s''', (min(max(limit,1),200),))
            return [self._item(row) for row in await cursor.fetchall()]

    async def search(self, text: str, limit: int = 5) -> list[dict]:
        if not text.strip():
            return []
        vec = vector_literal(hash_embedding(text))
        async with await self._connect() as conn:
            cursor = await conn.execute('''SELECT id,kind,content,created_at,updated_at,
                    1 - (embedding <=> %s::vector) AS score
                FROM muse_memories
                WHERE 1 - (embedding <=> %s::vector) >= 0.13
                ORDER BY embedding <=> %s::vector LIMIT %s''',
                (vec,vec,vec,min(max(limit,1),10)))
            return [self._item(row[:5],row[5]) for row in await cursor.fetchall()]

    async def get_many(self, ids: list[str]) -> list[dict]:
        safe=[]
        for item in ids[:10]:
            try:safe.append(UUID(item))
            except (ValueError,TypeError,AttributeError):continue
        if not safe:return []
        async with await self._connect() as conn:
            cursor=await conn.execute('''SELECT id,kind,content,created_at,updated_at
                 FROM muse_memories WHERE id = ANY(%s::uuid[])''', (safe,))
            return [self._item(row) for row in await cursor.fetchall()]

    async def update(self, memory_id: UUID, content: str, kind: str) -> dict | None:
        content = content.strip()
        if kind not in KINDS or not 1 <= len(content) <= 1200 or not re.search(r'\w',content):
            raise ValueError('Memory must contain 1–1200 meaningful characters and a valid kind')
        vec=vector_literal(hash_embedding(content))
        async with await self._connect() as conn:
            cursor=await conn.execute('''UPDATE muse_memories SET content=%s, kind=%s,
                 embedding=%s::vector, updated_at=now()
                 WHERE id=%s RETURNING id,kind,content,created_at,updated_at''',
                 (content,kind,vec,memory_id))
            row=await cursor.fetchone()
            await conn.commit()
            return self._item(row) if row else None

    async def delete(self, memory_id: UUID) -> bool:
        async with await self._connect() as conn:
            cursor = await conn.execute('DELETE FROM muse_memories WHERE id=%s', (memory_id,))
            await conn.commit()
            return cursor.rowcount > 0

    async def upsert_thread(self, thread_id: UUID, category: str, title: str, answer: str) -> None:
        if category not in ('chat','research'):
            raise ValueError('Invalid thread category')
        async with await self._connect() as conn:
            await conn.execute('''INSERT INTO muse_threads(id,category,title,last_answer)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET updated_at=now(), last_answer=EXCLUDED.last_answer''',
                (thread_id, category, title[:100], answer[:2000]))
            await conn.commit()

    async def thread_exists(self, thread_id: UUID, category: str) -> bool:
        async with await self._connect() as conn:
            cursor = await conn.execute('SELECT 1 FROM muse_threads WHERE id=%s AND category=%s',
                                        (thread_id,category))
            return (await cursor.fetchone()) is not None

    async def threads(self, category: str, limit: int = 50) -> list[dict]:
        async with await self._connect() as conn:
            cursor = await conn.execute('''SELECT id, title, last_answer, created_at, updated_at
                FROM muse_threads WHERE category=%s ORDER BY updated_at DESC LIMIT %s''',
                (category,min(max(limit,1),100)))
            rows = await cursor.fetchall()
            return [{'id':str(r[0]),'title':r[1],'last_answer':r[2],
                     'created_at':r[3].isoformat(),'updated_at':r[4].isoformat()} for r in rows]

    async def delete_thread(self, thread_id: UUID, category: str) -> bool:
        async with await self._connect() as conn:
            cursor = await conn.execute('DELETE FROM muse_threads WHERE id=%s AND category=%s',
                                        (thread_id,category))
            await conn.commit()
            return cursor.rowcount > 0

    async def clear_memories(self) -> int:
        async with await self._connect() as conn:
            cursor = await conn.execute('DELETE FROM muse_memories')
            await conn.commit()
            return cursor.rowcount
