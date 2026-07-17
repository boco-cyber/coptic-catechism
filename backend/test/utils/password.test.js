const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../src/utils/password');

test('hashPassword + verifyPassword round trip succeeds for the correct password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  const ok = await verifyPassword('correct horse battery staple', hash);
  assert.equal(ok, true);
});

test('verifyPassword fails for an incorrect password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  const ok = await verifyPassword('wrong password', hash);
  assert.equal(ok, false);
});

test('hashPassword rejects passwords shorter than 8 characters', async () => {
  await assert.rejects(() => hashPassword('short'), /at least 8 characters/);
});
