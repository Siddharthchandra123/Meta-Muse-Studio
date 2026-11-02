import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavMono} from '../src/lib/wav.ts';

test('wav header is mono PCM16 24kHz', () => {
  const bytes = encodeWavMono(new Float32Array([0, 1, -1, 0.5]));
  const view = new DataView(bytes.buffer);
  assert.equal(Buffer.from(bytes.slice(0,4)).toString(), 'RIFF');
  assert.equal(Buffer.from(bytes.slice(8,12)).toString(), 'WAVE');
  assert.equal(view.getUint16(20,true), 1);
  assert.equal(view.getUint16(22,true), 1);
  assert.equal(view.getUint32(24,true), 24000);
  assert.equal(view.getInt16(46,true), 32767);
  assert.equal(view.getInt16(48,true), -32768);
  assert.equal(view.getUint32(40,true), 8);
});
