import asyncio
from pathlib import Path

import pytest

from app import agent_tools as tools


def test_denies_private_and_unapproved_urls(monkeypatch):
    monkeypatch.setenv('AGENT_ALLOWED_DOMAINS', 'wikipedia.org,arxiv.org')
    for url in ['http://wikipedia.org', 'https://127.0.0.1/admin',
                'https://wikipedia.org.evil.net/a', 'https://user@wikipedia.org/a',
                'file:///etc/passwd', 'https://wikipedia.org:8443', 'https://169.254.169.254/latest']:
        with pytest.raises(tools.ToolError):
            tools.validate_public_url(url)
    assert tools.validate_public_url('https://en.wikipedia.org/wiki/AI')[1]=='en.wikipedia.org'


def test_dns_check_refuses_private(monkeypatch):
    monkeypatch.setattr(tools.socket,'getaddrinfo',lambda *a,**k:[(2,1,6,'',('127.0.0.1',443))])
    with pytest.raises(tools.ToolError,match='private'):
        tools._public_dns('en.wikipedia.org')


def test_search_url_must_be_loopback(monkeypatch):
    for bad in ['http://8.8.8.8:8080','https://127.0.0.1:8080','http://localhost:8099']:
        monkeypatch.setenv('SEARXNG_BASE_URL',bad)
        with pytest.raises(tools.ToolError):tools._searxng_endpoint()


def test_search_results_filter_unapproved_urls(monkeypatch):
    monkeypatch.setenv('SEARXNG_BASE_URL','http://127.0.0.1:8080')
    monkeypatch.setenv('AGENT_ALLOWED_DOMAINS','wikipedia.org')
    class FakeResponse:
        def raise_for_status(self):pass
        def json(self):return {'results':[{'url':'http://127.0.0.1/private','title':'bad'},
                   {'url':'https://en.wikipedia.org/wiki/Computing','title':'good','content':'brief'}]}
    class FakeClient:
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def get(self,*args,**kwargs):return FakeResponse()
    monkeypatch.setattr(tools.httpx,'AsyncClient',lambda **kwargs:FakeClient())
    result=asyncio.run(tools.search_web('computing'))
    assert len(result['results'])==1
    assert result['results'][0]['title']=='good'


def test_calculate_rejects_code_and_large_exponent():
    assert tools.calculate('2*(3+4)')['result']==14.0
    for expr in ['__import__("os")', '2**999', '3/0', '1+unknown']:
        with pytest.raises(tools.ToolError):tools.calculate(expr)


def test_proposal_requires_explicit_approval(tmp_path):
    proposal=tools.propose_note('My finding','Content of research')
    file_path=tmp_path/(proposal['action_id']+'.md')
    assert proposal['status']=='approval_required' and not file_path.exists()
    result=tools.resolve_note(proposal['action_id'],True,tmp_path)
    assert result['status']=='saved' and file_path.read_text().startswith('# My finding')
    with pytest.raises(tools.ToolError):tools.resolve_note(proposal['action_id'],True,tmp_path)


def test_reject_never_writes_file(tmp_path):
    proposal=tools.propose_note('No save','reject me')
    assert tools.resolve_note(proposal['action_id'],False,tmp_path)['status']=='rejected'
    assert not list(tmp_path.iterdir())


async def _invalid_tool():
    return await tools.execute('execute_shell',{'command':'whoami'})


def test_tool_registry_enforces_exact_schema():
    with pytest.raises(tools.ToolError):asyncio.run(_invalid_tool())
    with pytest.raises(tools.ToolError):asyncio.run(tools.execute('calculate',{'expression':'2+2','extra':'bad'}))
