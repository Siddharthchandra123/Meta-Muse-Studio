import test from 'node:test';
import assert from 'node:assert/strict';
import {explainBackendError,shouldRecoverConversation} from '../src/lib/stream-errors.ts';

test('FastAPI missing form field is readable', () => {
  const message = explainBackendError([{loc:['body','message'],msg:'Field required',type:'missing'}], 422);
  assert.equal(message, 'Invalid upload: message: Field required');
});
test('multipart validation presents bounded error', () => {
  assert.match(explainBackendError('Invalid PDF.',422), /Invalid PDF/);
  assert.match(explainBackendError(undefined,422), /rejected/);
});
test('only exact stale conversation can be retried', () => {
  assert.equal(shouldRecoverConversation(404,'Unknown conversation_id',true),true);
  assert.equal(shouldRecoverConversation(404,'Not Found',true),false);
  assert.equal(shouldRecoverConversation(404,'Unknown conversation_id',false),false);
  assert.equal(shouldRecoverConversation(422,'Unknown conversation_id',true),false);
});
