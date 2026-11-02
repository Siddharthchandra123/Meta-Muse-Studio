import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const proxy=readFileSync(new URL('../src/app/api/rag/[...path]/route.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/app/knowledge/page.tsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/app/page.tsx',import.meta.url),'utf8');

test('RAG proxy restricts routes and cross-origin writes',()=>{
 assert.match(proxy,/isAllowedAgentOrigin/);
 assert.match(proxy,/Unknown RAG route/);
 assert.match(proxy,/Upload too large/);
 assert.match(proxy,/13\*1024\*1024/);
 assert.match(proxy,/backendUrl\(/);
});

test('Knowledge Hub exposes uploads, local search, user consent and citation results',()=>{
 assert.match(page,/Upload document/);
 assert.match(page,/consent_to_external_model:consent/);
 assert.match(page,/Retrieve sources \(local\)/);
 assert.match(page,/Ask Muse with citations/);
 assert.match(page,/Delete entire collection/);
 assert.match(page,/answer\.sources\.map/);
 assert.match(main,/href="\/knowledge"/);
});


test('collection deletion uses explicit in-page confirmation, never blocked browser dialogs',()=>{
 assert.doesNotMatch(page,/window\.(prompt|confirm)\s*\(/);
 assert.match(page,/confirmCollectionDelete/);
 assert.match(page,/deletePhrase!=='DELETE_COLLECTION'/);
 assert.match(page,/aria-label="Type DELETE_COLLECTION to confirm"/);
 assert.match(page,/documentToDelete/);
});

test('stale collections are cleared and route failures are distinguishable',()=>{
 assert.match(page,/isMissingCollection/);
 assert.match(page,/RAG endpoint not available/);
 assert.match(page,/RAG_SQLITE_PATH/);
 assert.match(page,/Refresh collections/);
});
