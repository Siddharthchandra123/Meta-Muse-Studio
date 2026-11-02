import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

test('PCM worklet emits properly sized 24kHz signed 16-bit buffers',()=>{
  const output=[];
  class FakeWorkletProcessor { constructor(){this.port={postMessage:(frame)=>output.push(frame)};} }
  let Worklet;
  const context={sampleRate:48000,AudioWorkletProcessor:FakeWorkletProcessor,
    registerProcessor:(name, klass)=>{assert.equal(name,'muse-pcm24');Worklet=klass;},
    Int16Array,Math};
  const src=readFileSync(new URL('../public/pcm24-worklet.js',import.meta.url),'utf8');
  vm.runInNewContext(src,context);
  const worklet=new Worklet();
  for(let i=0;i<30;i++)worklet.process([[new Float32Array(128).fill(0.5)]]);
  assert.equal(output.length,1); // 30 * 128 samples / 48kHz = 80ms
  const samples=new Int16Array(output[0]);
  assert.equal(samples.length,1920);
  assert.ok([...samples].every(v=>v>=16380 && v<=16385));
});
