import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const page=readFileSync(new URL('app/studio/page.tsx',root),'utf8');
const proxy=readFileSync(new URL('lib/proxy.ts',root),'utf8');
const serverRun=readFileSync(new URL('app/api/studio/run/stream/route.ts',root),'utf8');

test('Studio has all model families with honest unavailable states',()=>{
  for(const id of ['muse-wonder-1.0','muse-spark-1.3','muse-image-1.0','muse-voice-transcribe-1.0','sam-3.1','muse-glimmer-30b','muse-spark-open','muse-wonder-full'])assert.ok(page.includes(id),`missing ${id}`);
  assert.match(page,/muse-spark-\$\{v\}/);
  assert.match(page,/requires-local-deployment/);
  assert.match(page,/muse-code-only/);
});

test('Studio keeps Meta auth on backend rather than the browser',()=>{
  assert.ok(proxy.includes("'/v1/studio/models'"));
  assert.ok(serverRun.includes("backendUrl('/v1/studio/run/stream')"));
  assert.ok(!page.includes('process.env.MODEL_API_KEY'));
  assert.ok(!page.includes("fetch('https://api.meta.ai/v1"));
});

test('Studio compare and media run are explicit user interactions',()=>{
  assert.match(page,/onClick=\{runCompare\}/);
  assert.match(page,/Compare \(2 requests\)/);
  assert.match(page,/onClick=\{generateImage\}/);
  assert.match(page,/onClick=\{transcribe\}/);
});
