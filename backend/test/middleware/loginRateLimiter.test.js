const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

test('login limiter counts failures but not successful logins', async (t) => {
  // Load a fresh limiter instance so this test has an isolated in-memory store.
  delete require.cache[require.resolve('../../src/middleware/loginRateLimiter')];
  const loginRateLimiter = require('../../src/middleware/loginRateLimiter');
  const app = express();

  app.get('/login', loginRateLimiter, (req, res) => {
    res.sendStatus(req.query.valid === 'true' ? 200 : 401);
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/login`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${baseUrl}?valid=true`);
    assert.equal(response.status, 200);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 401);
  }

  const blocked = await fetch(baseUrl);
  assert.equal(blocked.status, 429);
});
