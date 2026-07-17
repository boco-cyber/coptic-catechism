const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdminSession, requireAdminHeader } = require('../../src/middleware/adminAuth');

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('requireAdminSession calls next() when a session username is present', () => {
  const req = { session: { username: 'gerges' } };
  const res = mockRes();
  let nextCalled = false;
  requireAdminSession(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireAdminSession returns 401 when there is no session username', () => {
  const req = { session: {} };
  const res = mockRes();
  let nextCalled = false;
  requireAdminSession(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('requireAdminHeader calls next() when the admin-ui header is present', () => {
  const req = { get: (name) => (name === 'X-Requested-With' ? 'admin-ui' : undefined) };
  const res = mockRes();
  let nextCalled = false;
  requireAdminHeader(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireAdminHeader returns 403 when the admin-ui header is missing', () => {
  const req = { get: () => undefined };
  const res = mockRes();
  let nextCalled = false;
  requireAdminHeader(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
