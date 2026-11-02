import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDocuments, MAX_DOCUMENT_BYTES} from '../src/lib/documents.ts';
import {captureDimensions} from '../src/lib/screen.ts';

test('supports PDF DOCX and plain text; rejects unsupported files',()=>{
  const input=[{name:'x.pdf',size:1024},{name:'y.docx',size:2048},{name:'bad.exe',size:4}];
  const {valid,warnings}=selectDocuments(input);
  assert.equal(valid.length,2);
  assert.equal(warnings.length,1);
});
test('document caps enforced',()=>{
  assert.equal(selectDocuments([{name:'x.pdf',size:MAX_DOCUMENT_BYTES+1}]).valid.length,0);
  assert.equal(selectDocuments([{name:'x.pdf',size:1}],2).valid.length,0);
});
test('screen frame dimensions remain bounded without upscaling',()=>{
  const size=captureDimensions(3840,2160);
  assert.ok(size.width<=1440 && size.height<=900);
  assert.deepEqual(captureDimensions(640,480),{width:640,height:480});
});
