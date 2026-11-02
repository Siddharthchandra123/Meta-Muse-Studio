import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseFrames } from '../src/lib/sse.ts';

test('parses multiple frames and preserves a partial frame', () => {
  const value = 'event: session\ndata: {"conversation_id":"abc"}\n\nevent: delta\ndata: {"text":"Hel';
  const batch = parseSseFrames(value);
  assert.equal(batch.events.length, 1);
  assert.equal(batch.events[0].data.conversation_id, 'abc');
  const remainder = parseSseFrames(batch.pending + 'lo"}\n\n');
  assert.equal(remainder.events[0].data.text, 'Hello');
});

test('handles Windows line endings and multiline data', () => {
  const batch = parseSseFrames('event: delta\r\ndata: {"text":\r\ndata: "hi"}\r\n\r\n');
  assert.equal(batch.events[0].data.text, 'hi');
});

test('recognizes done and error as separate events', () => {
  const batch = parseSseFrames('event: done\ndata: {"model":"muse-spark-1.3"}\n\nevent: error\ndata: {"message":"failed"}\n\n');
  assert.deepEqual(batch.events.map(x => x.event), ['done', 'error']);
});

test('rejects malformed JSON instead of silently succeeding', () => {
  assert.throws(() => parseSseFrames('event: done\ndata: nope\n\n'), /invalid streaming event/);
});
