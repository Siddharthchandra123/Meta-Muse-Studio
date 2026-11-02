import asyncio
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.agent_runner import AgentRunner,AgentEvent,AgentModelError
from app import agent_api
from app.main import app


class FakeAgentModel:
    def __init__(self):self.inputs=[]
    async def complete(self,input_value,previous_id):
        self.inputs.append((input_value,previous_id))
        if len(self.inputs)==1:
            return {'id':'resp_1','status':'completed','output':[
                {'type':'function_call','call_id':'call_1','name':'calculate',
                 'arguments':json.dumps({'expression':'7 * 6'})}]}
        return {'id':'resp_2','status':'completed','output':[
            {'type':'message','content':[{'type':'output_text','text':'The result is 42.'}]}]}


async def get_events(model):
    return [e async for e in AgentRunner(model).run('Calculate seven times six')]


def test_agent_model_tool_loop_with_response_id():
    fake=FakeAgentModel()
    events=asyncio.run(get_events(fake))
    assert any(e.kind=='tool' and e.data['name']=='calculate' for e in events)
    assert events[-1].kind=='done'
    assert events[-1].data['answer']=='The result is 42.'
    assert fake.inputs[1][1]=='resp_1'
    assert fake.inputs[1][0][0]['type']=='function_call_output'
    assert '42.0' in fake.inputs[1][0][0]['output']


def test_agent_rejects_missing_answer():
    class Empty:
        async def complete(self,i,p):return {'id':'a','status':'completed','output':[]}
    with pytest.raises(AgentModelError):asyncio.run(get_events(Empty()))


def test_agent_refuses_unknown_calls_safely():
    class Fake:
        def __init__(self):self.n=0
        async def complete(self,i,p):
            self.n+=1
            if self.n==1:return {'id':'one','status':'completed','output':[{'type':'function_call','call_id':'c1','name':'write_secret','arguments':'{}'}]}
            assert 'not permitted' in i[0]['output']
            return {'id':'two','status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'Cannot perform that action.'}]}]}
    e=asyncio.run(get_events(Fake()))
    assert e[-1].kind=='done'


def test_stream_route_mocked():
    class FakeRunner:
        async def run(self,prompt):
            yield AgentEvent('start',{'message':'Started'})
            yield AgentEvent('done',{'answer':'Research done','sources':[],'approvals':[],'tool_calls':0})
    app.dependency_overrides[agent_api.get_agent_runner]=lambda:FakeRunner()
    try:
        with TestClient(app) as client:
            assert client.get('/v1/agent/status').status_code==200
            res=client.post('/v1/agent/stream',json={'prompt':'Research something'})
            assert res.status_code==200
            assert 'event: start' in res.text and 'event: done' in res.text
            assert client.post('/v1/agent/stream',json={'prompt':'x'}).status_code==422
    finally:app.dependency_overrides.clear()


def test_approval_route_no_file_for_reject():
    from app.agent_tools import propose_note
    proposal=propose_note('Demo','Demo content')
    with TestClient(app) as client:
        res=client.post('/v1/agent/actions/'+proposal['action_id']+'/approve',json={'approve':False})
        assert res.status_code==200 and res.json()['status']=='rejected'
        res=client.post('/v1/agent/actions/'+proposal['action_id']+'/approve',json={'approve':True})
        assert res.status_code==404
