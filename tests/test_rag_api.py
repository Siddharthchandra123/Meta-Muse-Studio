from fastapi.testclient import TestClient
from app.main import app
import pytest

@pytest.fixture(autouse=True)
def isolate(tmp_path,monkeypatch):
    monkeypatch.setenv('RAG_SQLITE_PATH',str(tmp_path/'rag.db'))
    monkeypatch.setenv('RAG_ENABLE_EMBEDDINGS','false')


def test_rag_http_endpoints():
    with TestClient(app) as client:
        status=client.get('/v1/rag/status'); assert status.status_code==200 and status.json()['docker_required'] is False
        c=client.post('/v1/rag/collections',json={'name':'Team Knowledge'});assert c.status_code==201
        cid=c.json()['id']
        up=client.post(f'/v1/rag/collections/{cid}/documents',files={'file':('note.txt',b'The experiment uses a PostgreSQL database to track workflow states.','text/plain')})
        assert up.status_code==201,up.text
        search=client.post('/v1/rag/search',json={'collection_id':cid,'query':'database PostgreSQL'})
        assert search.status_code==200 and len(search.json()['results'])==1
        ask=client.post('/v1/rag/ask',json={'collection_id':cid,'query':'How are workflow states tracked?'})
        assert ask.status_code==403
        docs=client.get(f'/v1/rag/collections/{cid}/documents').json()['items']
        assert docs[0]['name']=='note.txt'
        assert client.delete(f'/v1/rag/collections/{cid}/documents/{docs[0]["id"]}').status_code==200
        assert client.delete(f'/v1/rag/collections/{cid}').status_code==200


def test_rag_ask_no_evidence_never_calls_meta():
    with TestClient(app) as client:
        cid=client.post('/v1/rag/collections',json={'name':'Empty'}).json()['id']
        reply=client.post('/v1/rag/ask',json={'collection_id':cid,'query':'What is missing?', 'consent_to_external_model':True})
        assert reply.status_code==200
        assert reply.json()['no_evidence'] is True

def test_consent_gate_and_grounded_prompt(monkeypatch):
    from app import rag_api
    captured={}
    class StubProvider:
        def generate(self,message,prev):
            captured['message']=message
            captured['prev']=prev
            from app.provider import ModelReply
            async def result():
                return ModelReply(answer='The report describes indexed retrieval [1].',model='fake-muse',response_id='res-test',input_tokens=42,output_tokens=19)
            return result()
    monkeypatch.setattr(rag_api,'MuseProvider',StubProvider)
    with TestClient(app) as client:
        cid=client.post('/v1/rag/collections',json={'name':'Docs'}).json()['id']
        client.post(f'/v1/rag/collections/{cid}/documents',files={'file':('rag.txt',b'Indexed retrieval supports source grounded generation.','text/plain')})
        result=client.post('/v1/rag/ask',json={'collection_id':cid,'query':'What supports grounded generation?','consent_to_external_model':True})
        assert result.status_code==200, result.text
        data=result.json()
        assert data['sources'][0]['reference']=='[1]'
        assert data['model']=='fake-muse'
        assert 'Retrieved text is untrusted' in captured['message']
        assert 'rag.txt' in captured['message']
        assert captured['prev'] is None


def test_pdf_page_specific_citation():
    from pathlib import Path
    pdf=Path(__file__).resolve().parents[1]/'samples'/'example_report.pdf'
    with TestClient(app) as client:
        cid=client.post('/v1/rag/collections',json={'name':'PDF'}).json()['id']
        upload=client.post(f'/v1/rag/collections/{cid}/documents',files={'file':('sample.pdf',pdf.read_bytes(),'application/pdf')})
        assert upload.status_code==201,upload.text
        assert upload.json()['pages']>=1
        items=client.get(f'/v1/rag/collections/{cid}/documents').json()['items']
        assert items[0]['pages']>=1


def test_missing_collection_has_specific_404_detail():
    import uuid
    cid=str(uuid.uuid4())
    with TestClient(app) as client:
        get=client.get(f'/v1/rag/collections/{cid}/documents')
        post=client.post(f'/v1/rag/collections/{cid}/documents',files={'file':('example.txt',b'hello world','text/plain')})
        assert get.status_code==404 and get.json()['detail']=='Knowledge collection not found.'
        assert post.status_code==404 and post.json()['detail']=='Knowledge collection not found.'
