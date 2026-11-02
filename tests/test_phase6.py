"""Isolated Phase 6 regressions. The Docker/Postgres integration test is separate.
No Meta API credits and no database are required for this suite.
"""
import asyncio
import math
import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.memory_db import EMBED_DIMS, KINDS, MemoryDatabase, hash_embedding, vector_literal
from app.memory_api import enabled
from app.main import app
from app.persistent_graph import PersistentWorkflows


def test_hash_embedding_is_deterministic_bounded_and_normalized():
    first=hash_embedding('I like open source machine learning')
    assert len(first)==EMBED_DIMS
    assert first==hash_embedding('I like open source machine learning')
    assert first!=hash_embedding('Gardening and tomatoes')
    assert math.isclose(sum(v*v for v in first),1.0,abs_tol=.0001)


def test_vector_sql_literal_and_kinds():
    vec=vector_literal(hash_embedding('Python AI tools'))
    assert vec.startswith('[') and vec.endswith(']') and vec.count(',')==EMBED_DIMS-1
    assert 'fact' in KINDS and 'project' in KINDS
    with pytest.raises(ValueError):vector_literal([float('nan')]*EMBED_DIMS)
    with pytest.raises(ValueError):vector_literal([0.2])


def test_no_implicit_memory_write_when_disabled(monkeypatch):
    monkeypatch.delenv('MEMORY_ENABLED',raising=False)
    assert not enabled()
    with TestClient(app) as client:
        r=client.get('/v1/memory/status')
        assert r.status_code==200 and r.json()['status']=='disabled'
        assert client.post('/v1/memory/items',json={'kind':'fact','content':'hello'}).status_code==503


def test_memory_enable_flag(monkeypatch):
    monkeypatch.setenv('MEMORY_ENABLED','true')
    assert enabled()
    monkeypatch.setenv('MEMORY_ENABLED','false')
    assert not enabled()


class FakeDB:
    def __init__(self):self.records=[];self.threads={}
    async def search(self,text,limit):return []
    async def thread_exists(self,tid,category):return (tid,category) in self.threads
    async def upsert_thread(self,tid,cat,title,answer):self.records.append((str(tid),cat,answer));self.threads[(tid,cat)]=True
    async def delete_thread(self,tid,cat):self.threads.pop((tid,cat),None);return True

class FakeGraph:
    def __init__(self):self.captured=[]
    async def astream(self, data, config, context, stream_mode, durability):
        self.captured.append((data,config,context,stream_mode,durability))
        yield 'custom',{'kind':'delta','text':'Hello'}
        yield 'updates',{'generate_with_muse':{'answer':'Hello world','provider_response_id':'resp_test',
              'model':'muse-spark-1.3','usage':{'input_tokens':3,'output_tokens':5}}}


class FakeSaver:
    def __init__(self):self.removed=[]
    async def adelete_thread(self,thread):self.removed.append(thread)


def test_graph_streams_and_commits_after_completed_node():
    async def run():
        db=FakeDB()
        saver=FakeSaver()
        wf=PersistentWorkflows.__new__(PersistentWorkflows)
        wf.db=db;wf.checkpointer=saver;wf.chat=FakeGraph();wf._locks={}
        result=[pair async for pair in wf.stream_chat('Hi',None,provider=object())]
        assert [event for event,_ in result]==['session','delta','done']
        tid=result[0][1]['conversation_id']
        assert result[-1][1]['conversation_id']==tid
        assert len(db.records)==1 and db.records[0][1]=='chat'
        assert wf.chat.captured[0][4]=='sync'
        assert wf.chat.captured[0][1]['configurable']['thread_id'].startswith('chat:')
        assert 'images' in wf.chat.captured[0][2]
        assert await wf.delete(__import__('uuid').UUID(tid),'chat')
        assert saver.removed==[f'chat:{tid}']
    asyncio.run(run())


def test_unknown_persisted_id_fails_closed_without_provider_call():
    async def run():
        wf=PersistentWorkflows.__new__(PersistentWorkflows)
        wf.db=FakeDB();wf.chat=FakeGraph();wf._locks={}
        with pytest.raises(LookupError):
            _=[x async for x in wf.stream_chat('Hi',uuid4(),object())]
        assert not wf.chat.captured
    asyncio.run(run())


def test_invalid_memory_rejected_before_db_access():
    async def run():
        db=MemoryDatabase('postgresql://test:pass@127.0.0.1:55432/db')
        with pytest.raises(ValueError):await db.add('x','unknown-kind')
        with pytest.raises(ValueError):await db.add('  ','fact')
        with pytest.raises(ValueError):await db.update(uuid4(),'  ','fact')
    asyncio.run(run())
