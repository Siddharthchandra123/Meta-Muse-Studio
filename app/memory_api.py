"""Opt-in local memory API and persistent LangGraph runtime.

Single user on loopback only: there is NO multi-user authentication yet.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import AsyncExitStack
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.memory_db import KINDS, MemoryDatabase

logger=logging.getLogger(__name__)
router=APIRouter(prefix='/v1/memory',tags=['Memory + LangGraph'])
_stack:AsyncExitStack|None=None
_workflows=None
_init_lock=asyncio.Lock()


def enabled() -> bool:
    return os.getenv('MEMORY_ENABLED','false').strip().casefold() in ('1','true','yes','on')


async def workflows():
    global _stack,_workflows
    if not enabled():
        raise HTTPException(status_code=503,detail='Memory disabled: configure MEMORY_ENABLED=true and restart.')
    if _workflows is not None:return _workflows
    async with _init_lock:
        if _workflows is not None:return _workflows
        url=os.getenv('MEMORY_DATABASE_URL','')
        if not url:
            raise HTTPException(status_code=503,detail='MEMORY_DATABASE_URL is missing.')
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            from app.persistent_graph import PersistentWorkflows
            stack=AsyncExitStack()
            db=MemoryDatabase(url)
            await db.setup()
            saver=await stack.enter_async_context(AsyncPostgresSaver.from_conn_string(url))
            await saver.setup()
            wf=PersistentWorkflows(db,saver)
        except Exception as exc:
            if 'stack' in locals():await stack.aclose()
            logger.error('Persistence init failed: %s',type(exc).__name__)
            raise HTTPException(status_code=503,detail='Persistence unavailable. Start PostgreSQL and install Phase 6 dependencies.') from exc
        _stack=stack
        _workflows=wf
        return wf


async def close_workflows():
    global _stack,_workflows
    if _stack is not None:await _stack.aclose()
    _stack=None
    _workflows=None


class CreateMemory(BaseModel):
    content:str=Field(min_length=1,max_length=1200)
    kind:str=Field(default='fact')


class SearchMemory(BaseModel):
    query:str=Field(min_length=1,max_length=1000)
    limit:int=Field(default=5,ge=1,le=10)


class ClearConfirmation(BaseModel):
    confirmation:str


@router.get('/status')
async def status():
    if not enabled():
        return {'enabled':False,'status':'disabled','vector_mode':'local_hash_lexical',
                'checkpointing':'not_started','single_user':True}
    try:
        await workflows()
    except HTTPException:
        return {'enabled':True,'status':'database_unavailable',
                'vector_mode':'local_hash_lexical','checkpointing':'unavailable','single_user':True}
    return {'enabled':True,'status':'ready','vector_mode':'local_hash_lexical',
            'checkpointing':'langgraph_postgres','single_user':True}


@router.get('/items')
async def items():
    wf=await workflows()
    return {'items':await wf.db.list()}


@router.post('/items',status_code=201)
async def create_item(body:CreateMemory):
    if body.kind not in KINDS:
        raise HTTPException(status_code=422,detail='Invalid memory kind')
    wf=await workflows()
    try:
        return await wf.db.add(body.content,body.kind)
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@router.post('/search')
async def search(body:SearchMemory):
    wf=await workflows()
    return {'items':await wf.db.search(body.query,body.limit),
            'retrieval':'local deterministic lexical vectors; not a neural semantic model'}


@router.patch('/items/{memory_id}')
async def update_item(memory_id:UUID, body:CreateMemory):
    wf=await workflows()
    try:updated=await wf.db.update(memory_id,body.content,body.kind)
    except ValueError as exc:raise HTTPException(status_code=422,detail=str(exc)) from exc
    if updated is None:raise HTTPException(status_code=404,detail='Memory not found')
    return updated


@router.delete('/items/{memory_id}')
async def delete_item(memory_id:UUID):
    wf=await workflows()
    if not await wf.db.delete(memory_id):
        raise HTTPException(status_code=404,detail='Memory not found')
    return {'deleted':True,'id':str(memory_id)}


@router.get('/threads')
async def threads(category:str='chat'):
    if category not in ('chat','research'):
        raise HTTPException(status_code=422,detail='category must be chat or research')
    wf=await workflows()
    return {'items':await wf.db.threads(category)}


@router.get('/threads/{thread_id}')
async def thread(thread_id:UUID, category:str='chat'):
    if category not in ('chat','research'):
        raise HTTPException(status_code=422,detail='Invalid category')
    wf=await workflows()
    try:return await wf.history(thread_id,category)
    except LookupError as exc:raise HTTPException(status_code=404,detail=str(exc)) from exc


@router.delete('/threads/{thread_id}')
async def delete_thread(thread_id:UUID, category:str='chat'):
    if category not in ('chat','research'):
        raise HTTPException(status_code=422,detail='Invalid category')
    wf=await workflows()
    if not await wf.delete(thread_id,category):
        raise HTTPException(status_code=404,detail='Thread not found')
    return {'deleted':True,'id':str(thread_id)}


@router.post('/clear')
async def clear_memories(body:ClearConfirmation):
    if body.confirmation!='DELETE_ALL_SAVED_MEMORIES':
        raise HTTPException(status_code=422,detail='Confirmation phrase mismatch')
    wf=await workflows()
    count=await wf.db.clear_memories()
    return {'deleted_memories':count,'threads_unchanged':True}
