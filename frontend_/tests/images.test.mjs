import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_IMAGE_BYTES, selectImages} from '../src/lib/images.ts';
const file=(type,size)=>({type,size});
test('accepts up to three JPEG PNG WebP files',()=>{
  const result=selectImages([file('image/jpeg',300),file('image/png',1000),file('image/webp',2)]);
  assert.equal(result.valid.length,3);
  assert.deepEqual(result.warnings,[]);
});
test('rejects SVG, empty files and oversize image without blocking valid image',()=>{
  const result=selectImages([file('image/svg+xml',20),file('image/png',0),file('image/png',MAX_IMAGE_BYTES+1),file('image/jpeg',123)]);
  assert.equal(result.valid.length,1);
  assert.equal(result.warnings.length,3);
});
test('respects images already queued',()=>{
  const result=selectImages([file('image/png',20),file('image/jpeg',20)],2);
  assert.equal(result.valid.length,1);
  assert.match(result.warnings.join(' '),/three images/);
});
