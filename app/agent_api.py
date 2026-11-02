"""Local-only research agent HTTP API. SSE progress with separate approval endpoint."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from app.memory_api import enabled as memory_enabled, workflows as memory_workflows
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent_tools import ToolError, resolve_note
from app.agent_runner import AgentModelError, AgentRunner
from app.provider import MissingApiKeyError

router=APIRouter(prefix='/v1/agent',tags=['Research Agent'])
logger=logging.getLogger(__name__)


class AgentRequest(BaseModel):
    prompt: str=Field(min_length=3,max_length=4000)
    research_id: UUID | None = None


class ApprovalDecision(BaseModel):
    approve: bool


def get_agent_runner() -> AgentRunner:
    try: return AgentRunner()
    except MissingApiKeyError as exc:
        raise HTTPException(status_code=503,detail='MODEL_API_KEY is not configured') from exc


def _sse(event,data):
    return f'event: {event}\ndata: {json.dumps(data,ensure_ascii=False)}\n\n'


@router.get('/status')
async def status():
    import os
    return {'status':'ok','phase':'5.0','configured_search':bool(os.getenv('SEARXNG_BASE_URL','')),
            'allowlisted_domains':[s.strip() for s in os.getenv('AGENT_ALLOWED_DOMAINS','').split(',') if s.strip()],
            'safety':'read_only_web; explicit_approval_for_notes; no_shell_or_email',
            'max_rounds':5,'max_tool_calls':10}


@router.post('/stream')
async def agent_stream(payload:AgentRequest,runner:AgentRunner=Depends(get_agent_runner)):
    wf=None
    if memory_enabled():
        wf=await memory_workflows()
        if payload.research_id and not await wf.db.thread_exists(payload.research_id,'research'):
            raise HTTPException(status_code=404,detail='Unknown research_id')
    async def events():
        try:
            if wf:
                async for kind,data in wf.stream_research(payload.prompt,payload.research_id,runner):
                    yield _sse(kind,data)
            else:
                async for item in runner.run(payload.prompt):
                    yield _sse(item.kind,item.data)
        except asyncio.CancelledError:
            raise
        except (AgentModelError,ValueError) as exc:
            # Error messages are bounded and originate from our own safe error classes.
            yield _sse('error',{'message':str(exc)[:220]})
        except Exception:
            logger.exception('Agent execution failed')
            yield _sse('error',{'message':'Agent failed; inspect local backend logs.'})
    return StreamingResponse(events(),media_type='text/event-stream',
                             headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})


@router.post('/actions/{action_id}/approve')
async def approve_action(action_id:str, payload: ApprovalDecision):
    try: return resolve_note(action_id,payload.approve)
    except ToolError as exc: raise HTTPException(status_code=404,detail=str(exc)) from exc
