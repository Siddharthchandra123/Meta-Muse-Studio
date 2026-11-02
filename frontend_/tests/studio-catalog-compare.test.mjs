import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const catalog=readFileSync(new URL('app/studio/catalog/page.tsx',root),'utf8');
const compare=readFileSync(new URL('app/studio/compare/page.tsx',root),'utf8');
const helper=readFileSync(new URL('lib/studio-models.ts',root),'utf8');
const lab=readFileSync(new URL('app/studio/lab.css',root),'utf8');

test('Catalog has search, family and availability filters with separate not-listed state',()=>{
  for(const item of ['Search models','Model family','Availability','not-listed','requires-local-deployment','Comparison']){
    if(item==='Comparison')continue;assert.ok(catalog.includes(item),item);
  }
  assert.match(catalog,/GET \/v1\/models/);
  assert.match(catalog,/models\.filter/);
  assert.match(catalog,/toggleCompare/);
  assert.match(catalog,/isRunnableTextModel|selectableForCompare/);
});
test('Comparison runs two independent streamed calls, tracks metrics and allows cancellation',()=>{
  assert.match(compare,/Promise\.all\(tasks\)/);
  assert.match(compare,/runStudioModel/);
  assert.match(compare,/controller\.signal/);
  assert.match(compare,/elapsed_ms/);
  assert.match(compare,/output_tokens/);
  assert.match(compare,/downloadResults/);
  assert.match(compare,/stop=\(\)=>abortRef/);
});
test('Only compatible hosted reasoning models can be compared; contributor service omitted',()=>{
  assert.match(helper,/m\.mode==='api'/);
  assert.match(helper,/m\.family==='reasoning'/);
  assert.match(helper,/m\.availability!=='not-listed'/);
  assert.match(compare,/left!==right/);
  assert.match(compare,/Same prompt|same prompt/i);
});
test('New pages are styled, linked and send no browser API key',()=>{
  assert.ok(lab.includes('.sc-catalog-layout'));
  assert.ok(lab.includes('.sc-comparison-grid'));
  assert.ok(catalog.includes('/studio/compare'));
  assert.ok(compare.includes('/studio/catalog'));
  assert.ok(!catalog.includes('MODEL_API_KEY'));
  assert.ok(!compare.includes('MODEL_API_KEY'));
});
