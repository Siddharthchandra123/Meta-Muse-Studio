import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAllowedAgentOrigin} from '../src/lib/agent-origin.ts';

test('same-origin and alias loopback requests are accepted on the same port',()=>{
  assert.equal(isAllowedAgentOrigin('http://127.0.0.1:3000','http://127.0.0.1:3000/api/agent/stream'), true);
  assert.equal(isAllowedAgentOrigin('http://localhost:3000','http://127.0.0.1:3000/api/agent/stream'), true);
  assert.equal(isAllowedAgentOrigin('http://127.0.0.1:3000','http://localhost:3000/api/agent/stream'), true);
  assert.equal(isAllowedAgentOrigin(null,'http://127.0.0.1:3000/api/agent/stream'), true);
});
test('foreign, protocol-mismatched and different-port origins are rejected',()=>{
  for(const [origin, target] of [
    ['http://localhost:3001','http://127.0.0.1:3000/api/agent/stream'],
    ['https://localhost:3000','http://127.0.0.1:3000/api/agent/stream'],
    ['http://attacker.example:3000','http://127.0.0.1:3000/api/agent/stream'],
    ['null','http://127.0.0.1:3000/api/agent/stream'],
    ['not a URL','http://127.0.0.1:3000/api/agent/stream'],
    ['http://127.0.0.1:3000.evil.example','http://127.0.0.1:3000/api/agent/stream'],
  ]) assert.equal(isAllowedAgentOrigin(origin,target), false, origin);
});
test('streaming and approval endpoints both use the shared guard',()=>{
  for(const file of ['app/api/agent/stream/route.ts','app/api/agent/actions/[actionId]/approve/route.ts']) {
    const source=readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
    assert.match(source,/isAllowedAgentOrigin\(origin, request\.url\)/);
  }
});
test('research page shows the safe proxy rejection detail',()=>{
  const page=readFileSync(new URL('../src/app/agents/page.tsx',import.meta.url),'utf8');
  assert.match(page,/problem:unknown = await res\.json/);
  assert.match(page,/detail \|\| `Agent service unavailable/);
});
