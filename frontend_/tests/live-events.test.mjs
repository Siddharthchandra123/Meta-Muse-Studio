import assert from 'node:assert/strict';
import test from 'node:test';
import {processLiveEvent} from '../src/lib/live-events.ts';

test('cumulative partials replace existing displayed text',()=>{
  const seen=new Set();
  assert.deepEqual(processLiveEvent({type:'transcript', transcript:'Hi'},seen),{kind:'partial',text:'Hi'});
  assert.deepEqual(processLiveEvent({type:'transcript', transcript:'Hi there'},seen),{kind:'partial',text:'Hi there'});
});
test('speechComplete is final, duplicate turn ids ignored',()=>{
  const seen=new Set();
  assert.deepEqual(processLiveEvent({type:'speechComplete',turnId:10,transcript:'  Hello!  '},seen),{kind:'final',text:'Hello!'});
  assert.deepEqual(processLiveEvent({type:'speechComplete',turnId:10,transcript:'Hello!'},seen),{kind:'ignore'});
  assert.deepEqual(processLiveEvent({type:'speechComplete',turnId:11,transcript:'Next'},seen),{kind:'final',text:'Next'});
});
test('speechEnd alone never commits a model request',()=>{
  assert.deepEqual(processLiveEvent({type:'speechEnd',turnId:2},new Set()),{kind:'ignore'});
});
test('errors remain distinct from transcript events',()=>{
  assert.deepEqual(processLiveEvent({type:'error',message:'Disconnected'},new Set()),{kind:'error',text:'Disconnected'});
});
