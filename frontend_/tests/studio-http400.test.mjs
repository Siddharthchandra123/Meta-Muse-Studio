import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const helper=readFileSync(new URL('lib/studio-models.ts',root),'utf8');
const compare=readFileSync(new URL('app/studio/compare/page.tsx',root),'utf8');
const studio=readFileSync(new URL('app/studio/page.tsx',root),'utf8');
test('Studio model reasoning limits are model-aware',()=>{
  assert.match(helper,/supportsMaxReasoning/);
  assert.match(compare,/maxSupported/);
  assert.match(compare,/setEffort\('xhigh'\)/);
  assert.match(studio,/supportsMaxReasoning\(selected\)/);
});
test('Studio still displays actual backend errors rather than hiding them',()=>{
  assert.match(helper,/event\.event==='error'/);
  assert.match(studio,/f\.event==='error'/);
});
