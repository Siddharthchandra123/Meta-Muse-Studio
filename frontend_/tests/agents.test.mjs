import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSseFrames} from '../src/lib/sse.ts';

test('agent SSE progress and terminal answer are distinguishable',()=>{
  const input='event: start\ndata: {"message":"Started"}\n\nevent: tool\ndata: {"name":"calculate","status":"completed"}\n\nevent: done\ndata: {"answer":"42","sources":[]}\n\n';
  const batch=parseSseFrames(input);
  assert.deepEqual(batch.events.map(e=>e.event),['start','tool','done']);
  assert.equal(batch.events[2].data.answer,'42');
});
test('agent approval and error are separate actionable events',()=>{
  const data='event: approval\ndata: {"action_id":"uuid","title":"note"}\n\nevent: error\ndata: {"message":"tool limit"}\n\n';
  const result=parseSseFrames(data);
  assert.equal(result.events[0].event,'approval');
  assert.equal(result.events[1].data.message,'tool limit');
});
