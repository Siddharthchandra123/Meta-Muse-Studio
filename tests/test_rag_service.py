import os
from pathlib import Path
import pytest
from app import rag_service as r

@pytest.fixture(autouse=True)
def rag_tmp(tmp_path,monkeypatch):
    monkeypatch.setenv('RAG_SQLITE_PATH',str(tmp_path/'rag.db'))
    monkeypatch.setenv('RAG_ENABLE_EMBEDDINGS','false')

def test_full_keyword_lifecycle_and_reindex():
    c=r.create_collection('My Research')
    d=r.ingest(c['id'],'paper.md',b'Meta Muse Nova supports speech transcription and multimodal RAG.')
    assert d['status']=='indexed' and d['chunks']==1 and d['version']==1
    assert r.ingest(c['id'],'paper.md',b'Meta Muse Nova supports speech transcription and multimodal RAG.')['status']=='unchanged'
    out=r.search(c['id'],'multimodal RAG','keyword')
    assert out['mode']=='keyword' and len(out['results'])==1 and out['results'][0]['name']=='paper.md'
    assert out['results'][0]['page'] is None
    d2=r.ingest(c['id'],'paper.md',b'Meta Muse Nova now supports a revised document and index.')
    assert d2['version']==2 and d2['id']!=d['id']
    assert r.search(c['id'],'transcription','keyword')['results']==[]
    assert len(r.list_documents(c['id']))==1
    assert r.delete_document(c['id'],d2['id'])['deleted']
    assert r.delete_collection(c['id'])['deleted']
    assert r.status()['documents']==0

def test_collection_scoped_and_errors():
    a=r.create_collection('Alpha');b=r.create_collection('Beta')
    r.ingest(a['id'],'a.txt',b'private alpha knowledge about a research paper')
    r.ingest(b['id'],'b.txt',b'public beta knowledge about architecture')
    assert len(r.search(a['id'],'knowledge','keyword')['results'])==1
    assert all(x['name']=='b.txt' for x in r.search(b['id'],'knowledge','keyword')['results'])
    with pytest.raises(r.RagError) as exc:r.search('other','test')
    assert exc.value.status==404
    with pytest.raises(r.RagError):r.ingest(a['id'],'oops.exe',b'malware')
    with pytest.raises(r.RagError):r.search(a['id'],'test','graph')
    with pytest.raises(r.RagError):r.search(a['id'],'a'*1001)
    with pytest.raises(r.RagError):r.search(a['id'],'')
    assert r.search(a['id'],'unmatched nonsense','auto')['mode']=='keyword'

def test_fts_injection_is_data_not_sql():
    a=r.create_collection('Test')
    r.ingest(a['id'],'notes.txt',b'SQL injection should not drop a table.')
    result=r.search(a['id'],'\" OR rag_fts DROP TABLE; --','keyword')
    assert isinstance(result['results'],list)
    assert r.status()['collections']==1

def test_text_and_doc_limits():
    with pytest.raises(r.RagError):r.parse_pages('bad.txt',b'\x00binary')
    with pytest.raises(r.RagError):r.parse_pages('bad.pdf',b'not a pdf')
    with pytest.raises(r.RagError):r.parse_pages('bad.txt',b'x'*(12*1024*1024+1))
    with pytest.raises(r.RagError) as exc:r.parse_pages('scanned.pdf',b'%PDF-')
    assert 'parse' in str(exc.value).lower() or 'extract' in str(exc.value).lower()

def test_optional_neural_mode_must_not_be_faked():
    c=r.create_collection('C')
    r.ingest(c['id'],'file.txt',b'MUSE retrieves an answer from user data')
    with pytest.raises(r.RagError) as exc:r.search(c['id'],'answer','semantic')
    assert exc.value.status==503
    assert r.search(c['id'],'answer','auto')['mode']=='keyword'


def test_relative_sqlite_path_is_stable_across_working_directories(tmp_path,monkeypatch):
    from pathlib import Path
    expected = Path(r.__file__).resolve().parent.parent/'data'/'rag.sqlite3'
    monkeypatch.setenv('RAG_SQLITE_PATH','./data/rag.sqlite3')
    monkeypatch.chdir(tmp_path)
    assert r.db_path()==expected.resolve()
    monkeypatch.chdir(tmp_path.parent)
    assert r.db_path()==expected.resolve()


def test_absolute_sqlite_path_is_preserved(tmp_path,monkeypatch):
    file=tmp_path/'custom-rag.sqlite3'
    monkeypatch.setenv('RAG_SQLITE_PATH',str(file))
    monkeypatch.chdir(tmp_path.parent)
    assert r.db_path()==file
