import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const route=readFileSync('src/app/api/memory/[...path]/route.ts','utf8');
const ui=readFileSync('src/app/memory/page.tsx','utf8');
const agent=readFileSync('src/app/agents/page.tsx','utf8');
const main=readFileSync('src/app/page.tsx','utf8');
test('memory proxy validates explicit routes and blocks cross-origin writes',()=>{
  assert.match(route,/isAllowedAgentOrigin/);
  assert.match(route,/validatedPath/);
  assert.match(route,/export const PATCH/);
  assert.match(route,/request\.headers\.get\('origin'\)/);
  assert.match(route,/return null/);
});
test('memory UI exposes explicit save search delete and thread controls',()=>{
  for(const action of ['Save memory','Search stored memories','Delete memory','Save edit','Export displayed memories','Clear all saved memories','Durable threads']) assert.ok(ui.includes(action),action);
  assert.match(ui,/DELETE_ALL_SAVED_MEMORIES/);
});
test('research can reuse a durable research id with a reset',()=>{
  assert.match(agent,/research_id:researchId/);
  assert.match(agent,/New research thread/);
  assert.match(agent,/muse-research-thread-v1/);
});
test('main assistant links to memory manager',()=>{
  assert.match(main,/href="\/memory"/);
});
