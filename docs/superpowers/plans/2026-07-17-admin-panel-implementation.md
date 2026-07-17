# Admin Panel for Q&A Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password-protected `/admin` panel to the existing Express backend for browsing, editing, and bulk xlsx import/export of the English and Arabic catechism Q&A text, with a review-status flag driven by the 614-entry backlog from the Arabic verification pass.

**Architecture:** Extend the existing Express monolith (`backend/`) — new session-based auth (`User` model, bcrypt, `express-session` + `connect-mongo`), new `/admin/api/*` routes reusing the existing `Question`/`QuestionAr` Mongoose models (plus three new fields on `QuestionAr`), and a plain HTML/CSS/JS admin UI under `backend/public/admin/` using native ES modules (no build step, matching the existing `public/app.js`).

**Tech Stack:** Node.js/Express/Mongoose (existing). New dependencies: `bcryptjs`, `express-session`, `connect-mongo`, `express-rate-limit`, `exceljs`, `multer`. Tests: Node's built-in `node:test` runner (no new test framework dependency).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-admin-panel-design.md` — every task below implements a section of it; read it first if anything here is ambiguous.
- No edit history/versioning: every save overwrites the previous text. Only the import dry-run/confirm split (Task 13) provides a review-before-write safety net.
- Flat permission model: any authenticated admin can edit anything. No roles, no approval queue — edits are live immediately.
- Session cookie flags: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` only when `NODE_ENV=production`.
- CSRF mitigation: every state-changing admin route (`PUT`, and `POST` other than `/login`) requires the request header `X-Requested-With: admin-ui`.
- No public signup route exists anywhere. Admins are provisioned only via `node src/seeds/createAdmin.js <username>` (interactive password prompt).
- `bcryptjs` (pure JS) is used instead of native `bcrypt` — the production Dockerfile (`node:20-alpine`) has no C compiler toolchain installed, and native `bcrypt` requires one to build; `bcryptjs` has the same API and needs no native compilation. This deviates from the spec's dependency list but is required for the existing Dockerfile to keep working unmodified.
- `multer` (memory storage) is added for multipart `.xlsx` upload handling on `POST /admin/api/import` — implied by the spec's "multipart `.xlsx` upload" requirement but not named in its dependency list.
- **No test database infrastructure exists in this repo** (no `mongodb-memory-server`, no CI). `backend/.env`'s `MONGODB_URI` points at the **live MongoDB Atlas cluster backing the production site** (`ccfm.copticfaith.org`) — there is no separate local/dev database. Given this:
  - Automated tests (`node --test`) cover **pure functions only**: password hashing, auth middleware logic (with mocked `req`/`res`), the import diff/validation logic, and the xlsx column mapping. None of these touch a database.
  - Any step that writes to MongoDB (creating the first real admin account, running the `needsReview` migration, live-editing a real question during manual verification) is a **real, deliberate production data operation** — not disposable test data. Each such step in this plan is called out explicitly and should be run one at a time with its output checked, never batched.
  - For manual edit-endpoint verification (Task 11), use one of the already-known-garbled entries from `backend/data/verification/outstanding_614_review.json` as the target — editing it doesn't risk breaking a working public answer, since it's already flagged as unusable content.
- Public `/api/*` routes and behavior are unchanged by this work.
- Follow existing code conventions: CommonJS (`require`/`module.exports`) in `backend/src/`, the `{ success, error }` / `{ success, data }` JSON response shape from `backend/src/controllers/questionController.js`, and the `connectDB()` helper (`backend/config/db.js`) for scripts, matching `backend/src/seeds/seedArabic.js`.

---

### Task 1: Dependencies + password hashing utility

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/utils/password.js`
- Test: `backend/test/utils/password.test.js`

**Interfaces:**
- Produces: `hashPassword(plain: string) => Promise<string>`, `verifyPassword(plain: string, hash: string) => Promise<boolean>` — used by Task 3 (`createAdmin.js`) and Task 8 (login controller).

- [ ] **Step 1: Install dependencies**

```bash
cd backend && npm install bcryptjs express-session connect-mongo express-rate-limit exceljs multer
```

Expected: `package.json` and `package-lock.json` updated, output ends with `added 6 packages` (approximate count; exact number depends on transitive deps).

- [ ] **Step 2: Add a test script to package.json**

Edit `backend/package.json`, inside `"scripts"`, add:

```json
    "test": "node --test test/"
```

(Comma-separate correctly with the existing scripts — full `scripts` block becomes:)

```json
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "seed": "node src/seeds/seedDatabase.js",
    "seed:questions": "node src/seeds/extractAndSeed.js",
    "seed:arabic": "node src/seeds/seedArabic.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 3: Write the failing test**

Create `backend/test/utils/password.test.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../../src/utils/password'`

- [ ] **Step 5: Write the implementation**

Create `backend/src/utils/password.js`:

```js
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Password must be a string of at least 8 characters');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword, SALT_ROUNDS };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 3 tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/utils/password.js backend/test/utils/password.test.js
git commit -m "feat(admin): add password hashing utility and test runner"
```

---

### Task 2: User model

**Files:**
- Create: `backend/src/models/User.js`
- Modify: `backend/src/models/index.js`

**Interfaces:**
- Consumes: none.
- Produces: Mongoose model `User` with fields `username` (unique, lowercase, trimmed string), `passwordHash` (string), timestamps. Exported from `backend/src/models/index.js` as `User`. Used by Task 3 (`createAdmin.js`) and Task 8 (login controller).

- [ ] **Step 1: Create the model**

Create `backend/src/models/User.js`:

```js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

userSchema.index({ username: 1 });

module.exports = mongoose.model('User', userSchema);
```

- [ ] **Step 2: Export it from the models index**

Modify `backend/src/models/index.js` — full new content:

```js
const Book = require('./Book');
const Chapter = require('./Chapter');
const Question = require('./Question');
const QuestionAr = require('./QuestionAr');
const User = require('./User');

module.exports = { Book, Chapter, Question, QuestionAr, User };
```

- [ ] **Step 3: Verify it loads without error**

Run: `cd backend && node -e "console.log(Object.keys(require('./src/models')))"`
Expected: `[ 'Book', 'Chapter', 'Question', 'QuestionAr', 'User' ]`

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/User.js backend/src/models/index.js
git commit -m "feat(admin): add User model for admin accounts"
```

---

### Task 3: `createAdmin.js` CLI provisioning script

**Files:**
- Create: `backend/src/seeds/createAdmin.js`

**Interfaces:**
- Consumes: `User` model (Task 2), `hashPassword` (Task 1), `connectDB` (`backend/config/db.js`, existing).
- Produces: a CLI script; no exports (not required by other tasks).

- [ ] **Step 1: Write the script**

Create `backend/src/seeds/createAdmin.js`:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { User } = require('../models');
const { hashPassword } = require('../utils/password');

// readline has no built-in masked-input mode; overriding the private
// _writeToOutput hook is the standard workaround for CLI password prompts.
function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function _writeToOutput(text) {
      rl.output.write(text === question ? text : '*'.repeat(text.length));
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const deleteIndex = args.indexOf('--delete');

  await connectDB();

  if (deleteIndex !== -1) {
    const username = args[deleteIndex + 1];
    if (!username) {
      console.error('Usage: node createAdmin.js --delete <username>');
      process.exitCode = 1;
      await mongoose.disconnect();
      return;
    }
    const result = await User.deleteOne({ username: username.trim().toLowerCase() });
    console.log(result.deletedCount ? `Deleted admin "${username}".` : `No admin found with username "${username}".`);
    await mongoose.disconnect();
    return;
  }

  const username = args[0];
  if (!username) {
    console.error('Usage: node createAdmin.js <username>');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const password = await promptPassword(`Password for "${username}": `);
  const passwordHash = await hashPassword(password);
  await User.findOneAndUpdate(
    { username: username.trim().toLowerCase() },
    { $set: { passwordHash } },
    { upsert: true, new: true }
  );
  console.log(`Admin "${username}" is ready to log in.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await mongoose.disconnect();
});
```

- [ ] **Step 2: Verify the usage error path (no DB write)**

Run: `cd backend && node src/seeds/createAdmin.js`
Expected: connects to MongoDB (per `connectDB()`'s own log line), then prints `Usage: node createAdmin.js <username>` and exits with code 1. **Do not run this script with a real username/password yet** — that's a deliberate step in Task 18 once the login endpoint (Task 8) exists to test against.

- [ ] **Step 3: Commit**

```bash
git add backend/src/seeds/createAdmin.js
git commit -m "feat(admin): add CLI script to provision/remove admin accounts"
```

---

### Task 4: `QuestionAr` review-status fields

**Files:**
- Modify: `backend/src/models/QuestionAr.js`

**Interfaces:**
- Produces: `QuestionAr` documents gain `needsReview: boolean` (default `false`), `reviewedBy: string|null`, `reviewedAt: Date|null`. Used by Tasks 5, 11, 12, 13.

- [ ] **Step 1: Add the fields and an index**

Modify `backend/src/models/QuestionAr.js` — insert after the `tags` field (before the closing `}, {` of the schema options) and add a new index line after the existing indexes:

```js
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  needsReview: {
    type: Boolean,
    default: false
  },
  reviewedBy: {
    type: String,
    trim: true
  },
  reviewedAt: {
    type: Date
  }
}, {
  timestamps: true
});
```

And add, alongside the existing `questionArSchema.index(...)` calls near the bottom of the file:

```js
questionArSchema.index({ needsReview: 1 });
```

- [ ] **Step 2: Verify the model still loads and the schema has the new paths**

Run: `cd backend && node -e "const {QuestionAr} = require('./src/models'); console.log(Object.keys(QuestionAr.schema.paths).filter(p => ['needsReview','reviewedBy','reviewedAt'].includes(p)))"`
Expected: `[ 'needsReview', 'reviewedBy', 'reviewedAt' ]`

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/QuestionAr.js
git commit -m "feat(admin): add needsReview tracking fields to QuestionAr"
```

---

### Task 5: `seedNeedsReview.js` migration script

**Files:**
- Create: `backend/src/seeds/verification/seedNeedsReview.js`

**Interfaces:**
- Consumes: `QuestionAr` model (Task 4), `connectDB`, and `backend/data/verification/outstanding_614_review.json` (already generated in an earlier session — an array of `{ questionNumber, ... }` objects).
- Produces: a one-time CLI script; no exports.

- [ ] **Step 1: Write the script**

Create `backend/src/seeds/verification/seedNeedsReview.js`:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../../config/db');
const { QuestionAr } = require('../../models');

const REPORT_PATH = path.join(__dirname, '../../../data/verification/outstanding_614_review.json');

async function main() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`${REPORT_PATH} not found. Run the report-compilation step first.`);
  }
  const entries = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const questionNumbers = entries.map((entry) => entry.questionNumber);
  console.log(`Flagging ${questionNumbers.length} question(s) as needsReview=true...`);

  await connectDB();
  const result = await QuestionAr.updateMany(
    { questionNumber: { $in: questionNumbers } },
    { $set: { needsReview: true } }
  );
  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await mongoose.disconnect();
});
```

- [ ] **Step 2: Do NOT run this yet**

This script writes to the live production database. It's verified as part of Task 18's end-to-end checklist, run once, deliberately, after the rest of the feature is in place and reviewed.

- [ ] **Step 3: Commit**

```bash
git add backend/src/seeds/verification/seedNeedsReview.js
git commit -m "feat(admin): add one-time migration to seed needsReview from verification report"
```

---

### Task 6: Session middleware + admin router stub

**Files:**
- Create: `backend/src/routes/admin.js`
- Modify: `backend/src/server.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `backend/src/routes/admin.js` exports an Express `Router` (empty for now — routes are added in Tasks 8, 11, 12, 13), mounted at `/admin/api` in `server.js`. Session data available on `req.session` (used by Task 7's middleware and Task 8's auth controller) via `req.session.username`.

- [ ] **Step 1: Add the empty admin router**

Create `backend/src/routes/admin.js`:

```js
const express = require('express');

const router = express.Router();

module.exports = router;
```

- [ ] **Step 2: Add `SESSION_SECRET` to the example env file**

Modify `backend/.env.example`, append at the end:

```
# Admin panel session signing secret — required in production
SESSION_SECRET=<a long random string>
```

- [ ] **Step 3: Wire session middleware and mount the admin router in server.js**

Modify `backend/src/server.js` — full new content:

```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('../config/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Connect to MongoDB ────────────────────────────────────────────
connectDB();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set when NODE_ENV=production');
}

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'admin_sessions'
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/admin/api', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get(['/ar', '/ar/'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ── Start Server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Coptic Catechism API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
```

- [ ] **Step 4: Manual verification — server still starts and the public site still works**

Run: `cd backend && PORT=5055 npm start`
In another terminal: `curl -s http://localhost:5055/health`
Expected: `{"status":"ok","timestamp":"..."}`. Also confirm no crash/stack trace in the server log on startup (a `connect-mongo` connection warning is fine as long as the server stays up — it lazily connects). Stop the server (`Ctrl+C`) when done.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.js backend/src/server.js backend/.env.example
git commit -m "feat(admin): wire session middleware and mount empty admin router"
```

---

### Task 7: Admin auth middleware + login rate limiter

**Files:**
- Create: `backend/src/middleware/adminAuth.js`
- Create: `backend/src/middleware/loginRateLimiter.js`
- Test: `backend/test/middleware/adminAuth.test.js`

**Interfaces:**
- Produces: `requireAdminSession(req, res, next)` — 401s unless `req.session.username` is set. `requireAdminHeader(req, res, next)` — 403s unless the `X-Requested-With: admin-ui` header is present. `loginRateLimiter` — a configured `express-rate-limit` middleware instance. All consumed by Task 8's route wiring and later tasks' routes.

- [ ] **Step 1: Write the failing test**

Create `backend/test/middleware/adminAuth.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../../src/middleware/adminAuth'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/middleware/adminAuth.js`:

```js
function requireAdminSession(req, res, next) {
  if (req.session && req.session.username) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Not authenticated' });
}

function requireAdminHeader(req, res, next) {
  if (req.get('X-Requested-With') === 'admin-ui') {
    return next();
  }
  res.status(403).json({ success: false, error: 'Missing required request header' });
}

module.exports = { requireAdminSession, requireAdminHeader };
```

Create `backend/src/middleware/loginRateLimiter.js`:

```js
const rateLimit = require('express-rate-limit');

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again later.' }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 7 tests passing (3 from Task 1, 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/adminAuth.js backend/src/middleware/loginRateLimiter.js backend/test/middleware/adminAuth.test.js
git commit -m "feat(admin): add session auth middleware, CSRF header check, and login rate limiter"
```

---

### Task 8: Admin auth controller + login/logout/me routes

**Files:**
- Create: `backend/src/controllers/adminAuthController.js`
- Modify: `backend/src/routes/admin.js`

**Interfaces:**
- Consumes: `User` model (Task 2), `verifyPassword` (Task 1), `requireAdminSession` (Task 7), `loginRateLimiter` (Task 7).
- Produces: `POST /admin/api/login`, `POST /admin/api/logout`, `GET /admin/api/me`.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/adminAuthController.js`:

```js
const { User } = require('../models');
const { verifyPassword } = require('../utils/password');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, error: 'username and password are required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() }).lean();
    const valid = user && await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    req.session.username = user.username;
    res.json({ success: true, data: { username: user.username } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
};

exports.me = (req, res) => {
  res.json({ success: true, data: { username: req.session.username } });
};
```

- [ ] **Step 2: Wire the routes**

Modify `backend/src/routes/admin.js` — full new content:

```js
const express = require('express');
const router = express.Router();

const { requireAdminSession } = require('../middleware/adminAuth');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const authController = require('../controllers/adminAuthController');

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', requireAdminSession, authController.logout);
router.get('/me', requireAdminSession, authController.me);

module.exports = router;
```

- [ ] **Step 3: Manual verification — unauthenticated and bad-credential paths**

Run: `cd backend && PORT=5055 npm start`

```bash
curl -s http://localhost:5055/admin/api/me
curl -s -X POST http://localhost:5055/admin/api/login -H 'Content-Type: application/json' -d '{"username":"nobody","password":"whatever1"}'
```

Expected: first call → `{"success":false,"error":"Not authenticated"}` (401). Second call → `{"success":false,"error":"Invalid credentials"}` (401), since no `User` documents exist yet. Stop the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/adminAuthController.js backend/src/routes/admin.js
git commit -m "feat(admin): add login/logout/me endpoints"
```

---

### Task 9: `questionDiff` service (validation + diffing for import)

**Files:**
- Create: `backend/src/services/questionDiff.js`
- Test: `backend/test/services/questionDiff.test.js`

**Interfaces:**
- Produces: `validateRow(row) => string[]` (validation error messages), `normalizeRow(row) => object` (trims strings, coerces `needsReview` to boolean, drops blank optional fields), `diffRow(existing, incoming) => Array<{field, oldValue, newValue}>`, `REQUIRED_TEXT_FIELDS` (array of the four text field names). Consumed by Task 13's import controller.

- [ ] **Step 1: Write the failing test**

Create `backend/test/services/questionDiff.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRow, normalizeRow, diffRow } = require('../../src/services/questionDiff');

test('validateRow accepts a well-formed row', () => {
  const errors = validateRow({ questionNumber: '5', question_ar: 'سؤال', answer_ar: 'جواب', needsReview: 'FALSE' });
  assert.deepEqual(errors, []);
});

test('validateRow rejects an out-of-range questionNumber', () => {
  const errors = validateRow({ questionNumber: '9999' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /between 1 and 1452/);
});

test('validateRow rejects a present-but-empty text field', () => {
  const errors = validateRow({ questionNumber: '5', answer_ar: '   ' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /answer_ar/);
});

test('validateRow rejects a non-boolean needsReview value', () => {
  const errors = validateRow({ questionNumber: '5', needsReview: 'maybe' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /needsReview/);
});

test('normalizeRow trims text and coerces needsReview to boolean', () => {
  const normalized = normalizeRow({ questionNumber: '5', question_ar: '  سؤال  ', needsReview: 'TRUE' });
  assert.deepEqual(normalized, { questionNumber: 5, question_ar: 'سؤال', needsReview: true });
});

test('diffRow reports only fields that actually changed', () => {
  const existing = { question_en: 'a', answer_en: 'b', question_ar: 'c', answer_ar: 'd', needsReview: true };
  const incoming = { question_ar: 'c', answer_ar: 'new answer', needsReview: false };
  const changes = diffRow(existing, incoming);
  assert.deepEqual(changes, [
    { field: 'answer_ar', oldValue: 'd', newValue: 'new answer' },
    { field: 'needsReview', oldValue: true, newValue: false }
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../../src/services/questionDiff'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/questionDiff.js`:

```js
const REQUIRED_TEXT_FIELDS = ['question_en', 'answer_en', 'question_ar', 'answer_ar'];

function validateRow(row) {
  const errors = [];
  const questionNumber = Number(row.questionNumber);
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 1452) {
    errors.push(`questionNumber "${row.questionNumber}" is not an integer between 1 and 1452`);
  }
  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim() === '') {
      errors.push(`${field} is present but empty`);
    }
  }
  if (row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    const normalized = String(row.needsReview).trim().toLowerCase();
    if (!['true', 'false'].includes(normalized)) {
      errors.push(`needsReview "${row.needsReview}" must be TRUE or FALSE`);
    }
  }
  return errors;
}

function normalizeRow(row) {
  const normalized = { questionNumber: Number(row.questionNumber) };
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      normalized[field] = String(row[field]).trim();
    }
  }
  if (row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    normalized.needsReview = String(row.needsReview).trim().toLowerCase() === 'true';
  }
  return normalized;
}

function diffRow(existing, incoming) {
  const changes = [];
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (field in incoming && incoming[field] !== existing[field]) {
      changes.push({ field, oldValue: existing[field] ?? '', newValue: incoming[field] });
    }
  }
  if ('needsReview' in incoming && incoming.needsReview !== Boolean(existing.needsReview)) {
    changes.push({ field: 'needsReview', oldValue: Boolean(existing.needsReview), newValue: incoming.needsReview });
  }
  return changes;
}

module.exports = { validateRow, normalizeRow, diffRow, REQUIRED_TEXT_FIELDS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 13 tests passing (7 previous + 6 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/questionDiff.js backend/test/services/questionDiff.test.js
git commit -m "feat(admin): add row validation and diffing service for xlsx import"
```

---

### Task 10: `xlsxTemplate` service (export/import column mapping)

**Files:**
- Create: `backend/src/services/xlsxTemplate.js`
- Test: `backend/test/services/xlsxTemplate.test.js`

**Interfaces:**
- Produces: `COLUMNS` (array of `{header, key, width}`), `rowsToWorkbook(rows) => Promise<Buffer>`, `workbookToRows(buffer) => Promise<Array<{rowNumber, questionNumber, question_en, answer_en, question_ar, answer_ar, needsReview}>>` (all string values, raw from the sheet — not yet validated/normalized). Consumed by Task 12 (export controller) and Task 13 (import controller).

- [ ] **Step 1: Write the failing test**

Create `backend/test/services/xlsxTemplate.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { rowsToWorkbook, workbookToRows } = require('../../src/services/xlsxTemplate');

test('rowsToWorkbook + workbookToRows round-trips question data', async () => {
  const rows = [
    {
      questionNumber: 1,
      bookNumber: 1,
      chapterTitle: 'مقدمة',
      question_en: 'What is a catechism?',
      answer_en: 'A summary of the faith.',
      question_ar: 'ما هو الكاتيكيزم؟',
      answer_ar: 'ملخص للإيمان.',
      needsReview: true
    }
  ];
  const buffer = await rowsToWorkbook(rows);
  const parsed = await workbookToRows(buffer);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].questionNumber, '1');
  assert.equal(parsed[0].question_ar, 'ما هو الكاتيكيزم؟');
  assert.equal(parsed[0].needsReview, 'TRUE');
});

test('workbookToRows throws when a required column is missing', async () => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = [{ header: 'questionNumber', key: 'questionNumber' }];
  sheet.addRow({ questionNumber: 1 });
  const badBuffer = await workbook.xlsx.writeBuffer();
  const { workbookToRows: parse } = require('../../src/services/xlsxTemplate');
  await assert.rejects(() => parse(badBuffer), /Missing required column/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../../src/services/xlsxTemplate'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/xlsxTemplate.js`:

```js
const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'questionNumber', key: 'questionNumber', width: 14 },
  { header: 'book', key: 'book', width: 8 },
  { header: 'chapter', key: 'chapter', width: 30 },
  { header: 'question_en', key: 'question_en', width: 50 },
  { header: 'answer_en', key: 'answer_en', width: 60 },
  { header: 'question_ar', key: 'question_ar', width: 50 },
  { header: 'answer_ar', key: 'answer_ar', width: 60 },
  { header: 'needsReview', key: 'needsReview', width: 12 }
];

async function rowsToWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = COLUMNS;
  for (const row of rows) {
    sheet.addRow({
      questionNumber: row.questionNumber,
      book: row.bookNumber,
      chapter: row.chapterTitle || '',
      question_en: row.question_en || '',
      answer_en: row.answer_en || '',
      question_ar: row.question_ar || '',
      answer_ar: row.answer_ar || '',
      needsReview: row.needsReview ? 'TRUE' : 'FALSE'
    });
  }
  sheet.getColumn('question_ar').alignment = { horizontal: 'right', wrapText: true };
  sheet.getColumn('answer_ar').alignment = { horizontal: 'right', wrapText: true };
  return workbook.xlsx.writeBuffer();
}

async function workbookToRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');

  const headerIndex = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headerIndex[String(cell.value).trim()] = colNumber;
  });

  const requiredHeaders = COLUMNS.map((c) => c.key);
  const missing = requiredHeaders.filter((h) => !(h in headerIndex));
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  }

  const get = (row, key) => {
    const cell = row.getCell(headerIndex[key]);
    return cell.value === null || cell.value === undefined ? '' : String(cell.value);
  };

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    if (get(row, 'questionNumber') === '') continue;
    rows.push({
      rowNumber,
      questionNumber: get(row, 'questionNumber'),
      question_en: get(row, 'question_en'),
      answer_en: get(row, 'answer_en'),
      question_ar: get(row, 'question_ar'),
      answer_ar: get(row, 'answer_ar'),
      needsReview: get(row, 'needsReview')
    });
  }
  return rows;
}

module.exports = { COLUMNS, rowsToWorkbook, workbookToRows };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 15 tests passing (13 previous + 2 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/xlsxTemplate.js backend/test/services/xlsxTemplate.test.js
git commit -m "feat(admin): add xlsx export/import column mapping service"
```

---

### Task 11: Admin question controller (browse, get, update, stats) + routes

**Files:**
- Create: `backend/src/controllers/adminQuestionController.js`
- Modify: `backend/src/routes/admin.js`

**Interfaces:**
- Consumes: `Question`, `QuestionAr` models; `requireAdminSession`, `requireAdminHeader` (Task 7).
- Produces: `GET /admin/api/questions`, `GET /admin/api/questions/:questionNumber`, `PUT /admin/api/questions/:questionNumber`, `GET /admin/api/stats`.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/adminQuestionController.js`:

```js
const { Question, QuestionAr } = require('../models');

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TEXT_FIELD_MAP = {
  question_en: { model: 'en', field: 'question' },
  answer_en: { model: 'en', field: 'answer' },
  question_ar: { model: 'ar', field: 'question' },
  answer_ar: { model: 'ar', field: 'answer' }
};

function toAdminRow(ar, en) {
  return {
    questionNumber: ar.questionNumber,
    bookNumber: ar.bookNumber,
    chapterTitle: ar.chapterTitle || '',
    question_en: en?.question || '',
    answer_en: en?.answer || '',
    question_ar: ar.question,
    answer_ar: ar.answer,
    needsReview: Boolean(ar.needsReview),
    reviewedBy: ar.reviewedBy || null,
    reviewedAt: ar.reviewedAt || null
  };
}

exports.listQuestions = async (req, res) => {
  try {
    const { book, chapter, needsReview, q, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    let matchingNumbers = null;
    if (q && q.trim().length >= 2) {
      const pattern = escapedRegex(q.trim());
      const textFilter = {
        $or: [
          { question: { $regex: pattern, $options: 'i' } },
          { answer: { $regex: pattern, $options: 'i' } }
        ]
      };
      const [enMatches, arMatches] = await Promise.all([
        Question.find(textFilter).select('questionNumber').lean(),
        QuestionAr.find(textFilter).select('questionNumber').lean()
      ]);
      matchingNumbers = [...new Set([...enMatches, ...arMatches].map((r) => r.questionNumber))];
    }

    const arFilter = {};
    if (book) arFilter.bookNumber = parseInt(book, 10);
    if (chapter) arFilter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (needsReview === 'true') arFilter.needsReview = true;
    if (needsReview === 'false') arFilter.needsReview = false;
    if (matchingNumbers) arFilter.questionNumber = { $in: matchingNumbers };

    const skip = (pageNum - 1) * limitNum;
    const [arRows, total] = await Promise.all([
      QuestionAr.find(arFilter).sort({ questionNumber: 1 }).skip(skip).limit(limitNum).lean(),
      QuestionAr.countDocuments(arFilter)
    ]);

    const numbers = arRows.map((r) => r.questionNumber);
    const enRows = await Question.find({ questionNumber: { $in: numbers } }).lean();
    const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));

    const data = arRows.map((ar) => toAdminRow(ar, enByNumber.get(ar.questionNumber)));

    res.json({
      success: true,
      count: data.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getQuestion = async (req, res) => {
  try {
    const questionNumber = parseInt(req.params.questionNumber, 10);
    const [en, ar] = await Promise.all([
      Question.findOne({ questionNumber }).lean(),
      QuestionAr.findOne({ questionNumber }).lean()
    ]);
    if (!en && !ar) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    res.json({ success: true, data: toAdminRow(ar || { questionNumber, question: '', answer: '' }, en) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const questionNumber = parseInt(req.params.questionNumber, 10);
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 1452) {
      return res.status(400).json({ success: false, error: 'questionNumber must be an integer between 1 and 1452' });
    }

    const enUpdate = {};
    const arUpdate = {};
    for (const [key, target] of Object.entries(TEXT_FIELD_MAP)) {
      if (!(key in req.body)) continue;
      const value = req.body[key];
      if (typeof value !== 'string' || value.trim() === '') {
        return res.status(400).json({ success: false, error: `${key} must be a non-empty string` });
      }
      (target.model === 'en' ? enUpdate : arUpdate)[target.field] = value.trim();
    }

    let needsReviewProvided = false;
    if ('needsReview' in req.body) {
      if (typeof req.body.needsReview !== 'boolean') {
        return res.status(400).json({ success: false, error: 'needsReview must be a boolean' });
      }
      arUpdate.needsReview = req.body.needsReview;
      needsReviewProvided = true;
    }

    if (Object.keys(enUpdate).length === 0 && Object.keys(arUpdate).length === 0) {
      return res.status(400).json({ success: false, error: 'No editable fields supplied' });
    }

    if (Object.keys(arUpdate).length > 0 && !needsReviewProvided) {
      arUpdate.needsReview = false;
    }
    if (Object.keys(arUpdate).length > 0) {
      arUpdate.reviewedBy = req.session.username;
      arUpdate.reviewedAt = new Date();
    }

    const [enDoc, arDoc] = await Promise.all([
      Object.keys(enUpdate).length
        ? Question.findOneAndUpdate({ questionNumber }, { $set: enUpdate }, { new: true }).lean()
        : Question.findOne({ questionNumber }).lean(),
      Object.keys(arUpdate).length
        ? QuestionAr.findOneAndUpdate({ questionNumber }, { $set: arUpdate }, { new: true }).lean()
        : QuestionAr.findOne({ questionNumber }).lean()
    ]);

    if (!enDoc && !arDoc) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    res.json({ success: true, data: toAdminRow(arDoc || { questionNumber, question: '', answer: '' }, enDoc) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [total, needsReview, byBook] = await Promise.all([
      QuestionAr.countDocuments(),
      QuestionAr.countDocuments({ needsReview: true }),
      QuestionAr.aggregate([
        { $group: { _id: '$bookNumber', total: { $sum: 1 }, needsReview: { $sum: { $cond: ['$needsReview', 1, 0] } } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, bookNumber: '$_id', total: 1, needsReview: 1 } }
      ])
    ]);
    res.json({ success: true, data: { total, needsReview, byBook } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

- [ ] **Step 2: Wire the routes**

Modify `backend/src/routes/admin.js` — full new content:

```js
const express = require('express');
const router = express.Router();

const { requireAdminSession, requireAdminHeader } = require('../middleware/adminAuth');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const authController = require('../controllers/adminAuthController');
const questionController = require('../controllers/adminQuestionController');

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', requireAdminSession, authController.logout);
router.get('/me', requireAdminSession, authController.me);

router.get('/questions', requireAdminSession, questionController.listQuestions);
router.get('/questions/:questionNumber', requireAdminSession, questionController.getQuestion);
router.put('/questions/:questionNumber', requireAdminSession, requireAdminHeader, questionController.updateQuestion);
router.get('/stats', requireAdminSession, questionController.getStats);

module.exports = router;
```

- [ ] **Step 3: Manual verification — provision a real admin and exercise the endpoints**

This is the first step in the plan that writes to the live database. Run it deliberately and check each output.

```bash
cd backend && node src/seeds/createAdmin.js <your-username>
```

Enter a real password at the prompt (8+ characters). Expected: `Admin "<your-username>" is ready to log in.`

Start the server: `PORT=5055 npm start`

```bash
curl -s -c /tmp/admin-cookie.txt -X POST http://localhost:5055/admin/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<your-username>","password":"<your-password>"}'

curl -s -b /tmp/admin-cookie.txt http://localhost:5055/admin/api/me

curl -s -b /tmp/admin-cookie.txt 'http://localhost:5055/admin/api/questions?limit=3'

curl -s -b /tmp/admin-cookie.txt http://localhost:5055/admin/api/stats
```

Expected: login returns `{"success":true,"data":{"username":"<your-username>"}}` with a `Set-Cookie` captured in the cookie jar; `/me` returns the same username; `/questions` returns 3 rows with both `question_en` and `question_ar` populated; `/stats` returns `{"total":1452,"needsReview":0,"byBook":[...]}` (0 because Task 5's migration hasn't run yet — that happens in Task 18).

Now verify the update endpoint against one of the already-known-garbled entries (per the Global Constraints note — this doesn't touch working content):

```bash
python3 -c "import json; print(json.load(open('backend/data/verification/outstanding_614_review.json'))[0]['questionNumber'])"
```

Take the printed number (call it `N`) and:

```bash
curl -s -b /tmp/admin-cookie.txt -X PUT "http://localhost:5055/admin/api/questions/$N" \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: admin-ui' \
  -d '{"needsReview": true}'
```

Expected: `{"success":true,"data":{...,"needsReview":true,"reviewedBy":"<your-username>","reviewedAt":"..."}}`. This confirms the write path, the CSRF header check (retry without the header to confirm you get a 403), and the reviewer stamp — all without altering any question/answer text. Stop the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/adminQuestionController.js backend/src/routes/admin.js
git commit -m "feat(admin): add browse/get/update/stats endpoints for questions"
```

---

### Task 12: Admin export controller + route

**Files:**
- Create: `backend/src/controllers/adminExportController.js`
- Modify: `backend/src/routes/admin.js`

**Interfaces:**
- Consumes: `Question`, `QuestionAr` models; `rowsToWorkbook` (Task 10); `requireAdminSession` (Task 7).
- Produces: `GET /admin/api/export`.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/adminExportController.js`:

```js
const { Question, QuestionAr } = require('../models');
const { rowsToWorkbook } = require('../services/xlsxTemplate');

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.exportQuestions = async (req, res) => {
  try {
    const { book, chapter, needsReview } = req.query;
    const arFilter = {};
    if (book) arFilter.bookNumber = parseInt(book, 10);
    if (chapter) arFilter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (needsReview === 'true') arFilter.needsReview = true;
    if (needsReview === 'false') arFilter.needsReview = false;

    const arRows = await QuestionAr.find(arFilter).sort({ questionNumber: 1 }).lean();
    const numbers = arRows.map((r) => r.questionNumber);
    const enRows = await Question.find({ questionNumber: { $in: numbers } }).lean();
    const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));

    const rows = arRows.map((ar) => ({
      questionNumber: ar.questionNumber,
      bookNumber: ar.bookNumber,
      chapterTitle: ar.chapterTitle,
      question_en: enByNumber.get(ar.questionNumber)?.question || '',
      answer_en: enByNumber.get(ar.questionNumber)?.answer || '',
      question_ar: ar.question,
      answer_ar: ar.answer,
      needsReview: Boolean(ar.needsReview)
    }));

    const buffer = await rowsToWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="catechism-qa-export.xlsx"');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

- [ ] **Step 2: Wire the route**

Modify `backend/src/routes/admin.js` — add the import and route (insert after the `questionController` require/routes):

```js
const exportController = require('../controllers/adminExportController');
```

```js
router.get('/export', requireAdminSession, exportController.exportQuestions);
```

- [ ] **Step 3: Manual verification**

```bash
cd backend && PORT=5055 npm start
```

```bash
curl -s -b /tmp/admin-cookie.txt 'http://localhost:5055/admin/api/export?book=1' -o /tmp/export-book1.xlsx
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('/tmp/export-book1.xlsx')
ws = wb.active
print('rows:', ws.max_row - 1)
print('header:', [c.value for c in ws[1]])
print('first data row:', [c.value for c in ws[2]])
"
```

(If `openpyxl` isn't installed, run `pip install --user openpyxl` first, or inspect the file by opening it in a spreadsheet application instead.)

Expected: 92 rows (Book 1's question range), header matches `questionNumber, book, chapter, question_en, answer_en, question_ar, answer_ar, needsReview`, first data row has real English and Arabic text. Stop the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/adminExportController.js backend/src/routes/admin.js
git commit -m "feat(admin): add xlsx export endpoint"
```

---

### Task 13: Admin import controller (dry-run + commit) + route

**Files:**
- Create: `backend/src/controllers/adminImportController.js`
- Modify: `backend/src/routes/admin.js`

**Interfaces:**
- Consumes: `Question`, `QuestionAr` models; `workbookToRows` (Task 10); `validateRow`, `normalizeRow`, `diffRow` (Task 9); `requireAdminSession`, `requireAdminHeader` (Task 7); `multer`.
- Produces: `POST /admin/api/import?dryRun=true|false`.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/adminImportController.js`:

```js
const { Question, QuestionAr } = require('../models');
const { workbookToRows } = require('../services/xlsxTemplate');
const { validateRow, normalizeRow, diffRow } = require('../services/questionDiff');

async function buildDiffPlan(buffer) {
  const rawRows = await workbookToRows(buffer);
  const errors = [];
  const plan = [];

  const candidateNumbers = rawRows
    .map((r) => Number(r.questionNumber))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 1452);
  const [enRows, arRows] = await Promise.all([
    Question.find({ questionNumber: { $in: candidateNumbers } }).lean(),
    QuestionAr.find({ questionNumber: { $in: candidateNumbers } }).lean()
  ]);
  const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));
  const arByNumber = new Map(arRows.map((r) => [r.questionNumber, r]));

  let unchanged = 0;
  for (const raw of rawRows) {
    const rowErrors = validateRow(raw);
    if (rowErrors.length) {
      errors.push({ row: raw.rowNumber, message: rowErrors.join('; ') });
      continue;
    }
    const incoming = normalizeRow(raw);
    const en = enByNumber.get(incoming.questionNumber);
    const ar = arByNumber.get(incoming.questionNumber);
    if (!en || !ar) {
      errors.push({ row: raw.rowNumber, message: `questionNumber ${incoming.questionNumber} not found` });
      continue;
    }
    const existing = {
      question_en: en.question,
      answer_en: en.answer,
      question_ar: ar.question,
      answer_ar: ar.answer,
      needsReview: Boolean(ar.needsReview)
    };
    const changes = diffRow(existing, incoming);
    if (changes.length) {
      plan.push({ questionNumber: incoming.questionNumber, changes, incoming });
    } else {
      unchanged += 1;
    }
  }

  return { plan, errors, unchanged };
}

exports.importQuestions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded (field name must be "file")' });
    }
    const dryRun = req.query.dryRun !== 'false';
    const { plan, errors, unchanged } = await buildDiffPlan(req.file.buffer);

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        changed: plan.map((p) => ({ questionNumber: p.questionNumber, changes: p.changes })),
        unchanged,
        errors
      });
    }

    if (errors.length) {
      return res.status(400).json({ success: false, error: 'Import has validation errors; fix them before committing', errors });
    }

    for (const item of plan) {
      const enUpdate = {};
      const arUpdate = {};
      if ('question_en' in item.incoming) enUpdate.question = item.incoming.question_en;
      if ('answer_en' in item.incoming) enUpdate.answer = item.incoming.answer_en;
      if ('question_ar' in item.incoming) arUpdate.question = item.incoming.question_ar;
      if ('answer_ar' in item.incoming) arUpdate.answer = item.incoming.answer_ar;
      if ('needsReview' in item.incoming) arUpdate.needsReview = item.incoming.needsReview;

      if (Object.keys(arUpdate).length) {
        arUpdate.reviewedBy = req.session.username;
        arUpdate.reviewedAt = new Date();
      }

      await Promise.all([
        Object.keys(enUpdate).length ? Question.updateOne({ questionNumber: item.questionNumber }, { $set: enUpdate }) : Promise.resolve(),
        Object.keys(arUpdate).length ? QuestionAr.updateOne({ questionNumber: item.questionNumber }, { $set: arUpdate }) : Promise.resolve()
      ]);
    }

    res.json({ success: true, dryRun: false, updated: plan.length, unchanged, errors: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

- [ ] **Step 2: Wire the route**

Modify `backend/src/routes/admin.js` — full new content:

```js
const express = require('express');
const multer = require('multer');
const router = express.Router();

const { requireAdminSession, requireAdminHeader } = require('../middleware/adminAuth');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const authController = require('../controllers/adminAuthController');
const questionController = require('../controllers/adminQuestionController');
const exportController = require('../controllers/adminExportController');
const importController = require('../controllers/adminImportController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', requireAdminSession, authController.logout);
router.get('/me', requireAdminSession, authController.me);

router.get('/questions', requireAdminSession, questionController.listQuestions);
router.get('/questions/:questionNumber', requireAdminSession, questionController.getQuestion);
router.put('/questions/:questionNumber', requireAdminSession, requireAdminHeader, questionController.updateQuestion);
router.get('/stats', requireAdminSession, questionController.getStats);
router.get('/export', requireAdminSession, exportController.exportQuestions);
router.post('/import', requireAdminSession, requireAdminHeader, upload.single('file'), importController.importQuestions);

module.exports = router;
```

- [ ] **Step 3: Manual verification — round-trip an export through dry-run import with zero changes**

```bash
cd backend && PORT=5055 npm start
```

```bash
curl -s -b /tmp/admin-cookie.txt 'http://localhost:5055/admin/api/export?book=1' -o /tmp/roundtrip.xlsx

curl -s -b /tmp/admin-cookie.txt -X POST 'http://localhost:5055/admin/api/import?dryRun=true' \
  -H 'X-Requested-With: admin-ui' \
  -F 'file=@/tmp/roundtrip.xlsx'
```

Expected: `{"success":true,"dryRun":true,"changed":[],"unchanged":92,"errors":[]}` — proves the export and import column mappings agree exactly (except for the one row flagged `needsReview:true` in Task 11's manual check, which will show as 1 changed row if Book 1 contains that question number; either outcome — 0 or 1 changed — is consistent, just confirm the numbers add up to 92 total). Stop the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/adminImportController.js backend/src/routes/admin.js
git commit -m "feat(admin): add xlsx import endpoint with dry-run/commit split"
```

---

### Task 14: Admin frontend shell — login page, API client, tab shell, styles

**Files:**
- Create: `backend/public/admin/login.html`
- Create: `backend/public/admin/index.html`
- Create: `backend/public/admin/admin.css`
- Create: `backend/public/admin/js/api.js`
- Create: `backend/public/admin/js/login.js`
- Create: `backend/public/admin/js/main.js`

**Interfaces:**
- Produces: `api` object (`backend/public/admin/js/api.js`, ES module default export style via named export `api`) with methods `me()`, `login()`, `logout()`, `listQuestions()`, `getQuestion()`, `updateQuestion()`, `stats()`, `exportUrl()`, `importDryRun()`, `importCommit()`. Consumed by Tasks 15, 16, 17's frontend modules and by this task's `login.js`/`main.js`.
- `main.js` exposes tab-switching (`data-tab`/`data-panel` attributes) and calls `initBrowse`, `initEdit`, `initImportExport` (added in Tasks 15–17) — this task creates `main.js` with stubs for those calls that Tasks 15–17 will fill in by creating the modules it imports.

- [ ] **Step 1: Create the API client**

Create `backend/public/admin/js/api.js`:

```js
const BASE = '/admin/api';

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (method !== 'GET') headers['X-Requested-With'] = 'admin-ui';
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });

  if (response.status === 401) {
    window.location.href = '/admin/login.html';
    throw new Error('Not authenticated');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response;
  }

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  me: () => request('/me'),
  login: (username, password) => request('/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/logout', { method: 'POST' }),
  listQuestions: (params) => request(`/questions?${new URLSearchParams(params)}`),
  getQuestion: (questionNumber) => request(`/questions/${questionNumber}`),
  updateQuestion: (questionNumber, fields) => request(`/questions/${questionNumber}`, { method: 'PUT', body: fields }),
  stats: () => request('/stats'),
  exportUrl: (params) => `${BASE}/export?${new URLSearchParams(params)}`,
  importDryRun: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/import?dryRun=true', { method: 'POST', body: form, isForm: true });
  },
  importCommit: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/import?dryRun=false', { method: 'POST', body: form, isForm: true });
  }
};
```

- [ ] **Step 2: Create the stylesheet**

Create `backend/public/admin/admin.css`:

```css
:root {
  --bg: #f7f7f5;
  --surface: #ffffff;
  --border: #d9d9d4;
  --text: #1f1f1f;
  --muted: #6b6b63;
  --accent: #7a3b2e;
  --warn-bg: #fbe9d7;
  --warn-text: #8a4b12;
  --ok-bg: #e4f0e1;
  --ok-text: #2f6b28;
  --error: #b3261e;
  font-family: -apple-system, "Segoe UI", Tahoma, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17181a;
    --surface: #212226;
    --border: #35363b;
    --text: #ececec;
    --muted: #9a9a9a;
    --accent: #d68a6f;
    --warn-bg: #3a2c17;
    --warn-text: #e2b073;
    --ok-bg: #1d2f1c;
    --ok-text: #8fd188;
    --error: #ff6b63;
  }
}

* { box-sizing: border-box; }

body { margin: 0; background: var(--bg); color: var(--text); }

.login-body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }

.login-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem;
  width: min(360px, 90vw);
}

.login-card form { display: flex; flex-direction: column; gap: 0.5rem; }

.login-card input, .filters input, .filters select, textarea {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem;
  font: inherit;
}

button {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font: inherit;
}

button[disabled] { opacity: 0.5; cursor: not-allowed; }

.admin-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.admin-header h1 { font-size: 1.1rem; margin: 0; flex: 1; }
.stats { color: var(--muted); font-size: 0.9rem; }

.tabs { display: flex; gap: 0.5rem; padding: 0.75rem 1.5rem; }

.tabs button { background: transparent; color: var(--muted); border: 1px solid transparent; }
.tabs button.active { background: var(--surface); color: var(--text); border-color: var(--border); }

main { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }

.filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; margin-bottom: 1rem; }
.filters label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: var(--muted); }

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }

tbody tr { cursor: pointer; }
tbody tr:hover { background: var(--warn-bg); }

.snippet { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.badge { padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; }
.badge-warn { background: var(--warn-bg); color: var(--warn-text); }
.badge-ok { background: var(--ok-bg); color: var(--ok-text); }

.pager { display: flex; gap: 0.5rem; margin-top: 1rem; }

.status { color: var(--muted); font-size: 0.9rem; }
.error { color: var(--error); font-size: 0.9rem; }

.edit-panel {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.edit-panel-inner {
  background: var(--surface);
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 1.5rem;
  width: min(900px, 100%);
  max-height: 90vh;
  overflow-y: auto;
}

.edit-panel-header { display: flex; justify-content: space-between; align-items: center; }
.edit-panel-header button { background: transparent; color: var(--muted); font-size: 1.5rem; line-height: 1; padding: 0 0.25rem; }

.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
.edit-grid label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.edit-grid textarea { resize: vertical; }
.rtl textarea { text-align: right; }

.checkbox-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.9rem; }

#importDiff table { margin-top: 1rem; }
.old-value { color: var(--error); }
.new-value { color: var(--ok-text); }
.error-row { color: var(--error); }

@media (max-width: 720px) {
  .edit-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Create the login page**

Create `backend/public/admin/login.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin Login · Coptic Catechism</title>
<link rel="stylesheet" href="admin.css">
</head>
<body class="login-body">
<main class="login-card">
  <h1>Admin Login</h1>
  <form id="loginForm">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <div id="loginError" class="error" hidden></div>
    <button type="submit">Log in</button>
  </form>
</main>
<script type="module" src="js/login.js"></script>
</body>
</html>
```

Create `backend/public/admin/js/login.js`:

```js
import { api } from './api.js';

const form = document.querySelector('#loginForm');
const errorBox = document.querySelector('#loginError');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const username = form.username.value.trim();
  const password = form.password.value;
  try {
    await api.login(username, password);
    window.location.href = '/admin/index.html';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});
```

- [ ] **Step 4: Create the admin shell page and its tab-switching entry point**

Create `backend/public/admin/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin · Coptic Catechism</title>
<link rel="stylesheet" href="admin.css">
</head>
<body>
<header class="admin-header">
  <h1>Coptic Catechism Admin</h1>
  <div id="stats" class="stats"></div>
  <button id="logout" type="button">Log out</button>
</header>

<nav class="tabs">
  <button data-tab="browse" class="active" type="button">Browse &amp; Edit</button>
  <button data-tab="import" type="button">Import / Export</button>
</nav>

<main>
  <section data-panel="browse">
    <form id="browseFilters" class="filters">
      <label>Book <input type="number" name="book" min="1" max="7"></label>
      <label>Chapter <input type="text" name="chapter"></label>
      <label>Needs review
        <select name="needsReview">
          <option value="">Any</option>
          <option value="true">Needs review</option>
          <option value="false">Reviewed</option>
        </select>
      </label>
      <label>Search <input type="text" name="q" placeholder="keyword…"></label>
      <button type="submit">Filter</button>
    </form>
    <p id="browseStatus" class="status"></p>
    <table id="browseTable">
      <thead>
        <tr><th>#</th><th>Book</th><th>English</th><th>Arabic</th><th>Status</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <div class="pager">
      <button id="browsePrev" type="button">Previous</button>
      <button id="browseNext" type="button">Next</button>
    </div>
  </section>

  <section data-panel="import" hidden>
    <h2>Export</h2>
    <form id="exportFilters" class="filters">
      <label>Book <input type="number" name="book" min="1" max="7"></label>
      <label>Chapter <input type="text" name="chapter"></label>
      <label>Needs review
        <select name="needsReview">
          <option value="">Any</option>
          <option value="true">Needs review</option>
          <option value="false">Reviewed</option>
        </select>
      </label>
    </form>
    <button id="downloadTemplate" type="button">Download template (.xlsx)</button>

    <h2>Import</h2>
    <input id="importFile" type="file" accept=".xlsx">
    <div class="import-actions">
      <button id="previewImport" type="button">Preview changes</button>
      <button id="confirmImport" type="button" disabled>Confirm import</button>
    </div>
    <p id="importStatus" class="status"></p>
    <div id="importDiff"></div>
  </section>
</main>

<div id="editPanel" class="edit-panel" hidden>
  <div class="edit-panel-inner">
    <div class="edit-panel-header">
      <h2 id="editTitle">Question</h2>
      <button id="editClose" type="button">&times;</button>
    </div>
    <form id="editForm">
      <div class="edit-grid">
        <label>English question
          <textarea name="question_en" rows="3"></textarea>
        </label>
        <label class="rtl">Arabic question
          <textarea name="question_ar" rows="3" dir="rtl"></textarea>
        </label>
        <label>English answer
          <textarea name="answer_en" rows="10"></textarea>
        </label>
        <label class="rtl">Arabic answer
          <textarea name="answer_ar" rows="10" dir="rtl"></textarea>
        </label>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" name="needsReview"> Still needs review
      </label>
      <div id="editError" class="error" hidden></div>
      <button type="submit">Save</button>
    </form>
  </div>
</div>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

Create `backend/public/admin/js/main.js`:

```js
import { api } from './api.js';
import { initBrowse } from './browse.js';
import { initEdit } from './edit.js';
import { initImportExport } from './importExport.js';

const tabs = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('[data-panel]');
const statsBox = document.querySelector('#stats');
const logoutButton = document.querySelector('#logout');

function showTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
}

tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

logoutButton.addEventListener('click', async () => {
  await api.logout();
  window.location.href = '/admin/login.html';
});

async function refreshStats() {
  const { data } = await api.stats();
  statsBox.textContent = `${data.needsReview} of ${data.total} need review`;
}

async function init() {
  try {
    await api.me();
  } catch {
    return;
  }
  await refreshStats();
  const edit = initEdit({ onSaved: async () => { await refreshStats(); browse.reload(); } });
  const browse = initBrowse({ onRowSelected: edit.open });
  initImportExport({ onImported: async () => { await refreshStats(); browse.reload(); } });
  showTab('browse');
}

init();
```

Note: `main.js` imports `./browse.js`, `./edit.js`, and `./importExport.js`, which don't exist yet — this is expected and resolved by Tasks 15–17. This task's manual verification (next step) only checks the login page and API client in isolation.

- [ ] **Step 5: Manual verification — login page works end to end**

```bash
cd backend && PORT=5055 npm start
```

Open `http://localhost:5055/admin/login.html` in a browser. Log in with the admin account created in Task 11. Expected: redirect to `http://localhost:5055/admin/index.html`, which will show a browser console error about the missing `browse.js`/`edit.js`/`importExport.js` modules (expected at this point — a blank page under the header/tabs is fine). Confirm the header shows "0 of 1452 need review" and the "Log out" button, when clicked, redirects back to the login page. Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add backend/public/admin/login.html backend/public/admin/index.html backend/public/admin/admin.css backend/public/admin/js/api.js backend/public/admin/js/login.js backend/public/admin/js/main.js
git commit -m "feat(admin): add admin UI shell, login page, and API client"
```

---

### Task 15: Admin frontend — Browse tab

**Files:**
- Create: `backend/public/admin/js/browse.js`

**Interfaces:**
- Consumes: `api` (Task 14).
- Produces: `initBrowse({ onRowSelected: (questionNumber) => void }) => { reload: () => Promise<void> }`. Consumed by `main.js` (Task 14, already wired) and Task 16's edit panel indirectly (via `onRowSelected`).

- [ ] **Step 1: Write the module**

Create `backend/public/admin/js/browse.js`:

```js
import { api } from './api.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initBrowse({ onRowSelected }) {
  const tableBody = document.querySelector('#browseTable tbody');
  const status = document.querySelector('#browseStatus');
  const form = document.querySelector('#browseFilters');
  const prevButton = document.querySelector('#browsePrev');
  const nextButton = document.querySelector('#browseNext');

  let page = 1;
  let totalPages = 1;

  function currentFilters() {
    const data = new FormData(form);
    const params = {};
    for (const [key, value] of data.entries()) {
      if (value) params[key] = value;
    }
    params.page = page;
    params.limit = 20;
    return params;
  }

  function renderRows(rows) {
    tableBody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(row.questionNumber)}</td>
        <td>${esc(row.bookNumber)}</td>
        <td class="snippet">${esc(row.question_en).slice(0, 60)}</td>
        <td class="snippet" dir="rtl">${esc(row.question_ar).slice(0, 60)}</td>
        <td>${row.needsReview ? '<span class="badge badge-warn">needs review</span>' : '<span class="badge badge-ok">reviewed</span>'}</td>
      `;
      tr.addEventListener('click', () => onRowSelected(row.questionNumber));
      tableBody.appendChild(tr);
    }
  }

  async function load() {
    status.textContent = 'Loading…';
    try {
      const result = await api.listQuestions(currentFilters());
      totalPages = result.totalPages || 1;
      renderRows(result.data);
      status.textContent = `${result.total} result(s) · page ${result.page} of ${totalPages}`;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    page = 1;
    load();
  });
  prevButton.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  nextButton.addEventListener('click', () => { if (page < totalPages) { page += 1; load(); } });

  load();

  return { reload: load };
}
```

- [ ] **Step 2: Manual verification**

```bash
cd backend && PORT=5055 npm start
```

Open `http://localhost:5055/admin/index.html`, log in if needed. Expected: the Browse tab now shows a paginated table of 20 questions with number/book/English snippet/Arabic snippet/status columns, no console errors about `browse.js`. Type a book number (e.g. `1`) into the Book filter and click Filter — table narrows to that book's questions. Click Next/Previous — page changes and the status line updates. Stop the server when done.

- [ ] **Step 3: Commit**

```bash
git add backend/public/admin/js/browse.js
git commit -m "feat(admin): add browse tab with filters, search, and pagination"
```

---

### Task 16: Admin frontend — Edit panel

**Files:**
- Create: `backend/public/admin/js/edit.js`

**Interfaces:**
- Consumes: `api` (Task 14).
- Produces: `initEdit({ onSaved: () => Promise<void> }) => { open: (questionNumber) => Promise<void>, close: () => void }`. `open` is passed to `initBrowse` as `onRowSelected` (already wired in `main.js`, Task 14).

- [ ] **Step 1: Write the module**

Create `backend/public/admin/js/edit.js`:

```js
import { api } from './api.js';

export function initEdit({ onSaved }) {
  const panel = document.querySelector('#editPanel');
  const form = document.querySelector('#editForm');
  const title = document.querySelector('#editTitle');
  const errorBox = document.querySelector('#editError');
  const closeButton = document.querySelector('#editClose');

  let currentNumber = null;

  async function open(questionNumber) {
    errorBox.hidden = true;
    try {
      const { data } = await api.getQuestion(questionNumber);
      currentNumber = questionNumber;
      title.textContent = `Question ${questionNumber}`;
      form.question_en.value = data.question_en;
      form.answer_en.value = data.answer_en;
      form.question_ar.value = data.question_ar;
      form.answer_ar.value = data.answer_ar;
      form.needsReview.checked = Boolean(data.needsReview);
      panel.hidden = false;
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  function close() {
    panel.hidden = true;
    currentNumber = null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentNumber === null) return;
    errorBox.hidden = true;
    try {
      await api.updateQuestion(currentNumber, {
        question_en: form.question_en.value,
        answer_en: form.answer_en.value,
        question_ar: form.question_ar.value,
        answer_ar: form.answer_ar.value,
        needsReview: form.needsReview.checked
      });
      close();
      await onSaved();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });

  closeButton.addEventListener('click', close);

  return { open, close };
}
```

- [ ] **Step 2: Manual verification — edit one of the already-flagged entries**

```bash
cd backend && PORT=5055 npm start
```

Open `http://localhost:5055/admin/index.html`, filter Browse to "Needs review" (there won't be any yet unless you left the Task 11 test flag on — filter by book `1` instead if the list is empty, or search for a keyword). Click any row. Expected: the edit panel opens with English fields on the left, Arabic (right-aligned, RTL) fields on the right, all populated with the real stored text — not garbled by HTML rendering, since it's set via `.value`. Edit the "Still needs review" checkbox only (leave text unchanged) and click Save. Expected: the panel closes, the header's review count updates, and re-opening the same row shows the checkbox in its new state. Stop the server when done.

- [ ] **Step 3: Commit**

```bash
git add backend/public/admin/js/edit.js
git commit -m "feat(admin): add edit panel for question/answer text and review status"
```

---

### Task 17: Admin frontend — Import/Export tab

**Files:**
- Create: `backend/public/admin/js/importExport.js`

**Interfaces:**
- Consumes: `api` (Task 14).
- Produces: `initImportExport({ onImported: () => Promise<void> }) => void`. Called from `main.js` (Task 14, already wired).

- [ ] **Step 1: Write the module**

Create `backend/public/admin/js/importExport.js`:

```js
import { api } from './api.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initImportExport({ onImported }) {
  const filterForm = document.querySelector('#exportFilters');
  const downloadButton = document.querySelector('#downloadTemplate');
  const fileInput = document.querySelector('#importFile');
  const previewButton = document.querySelector('#previewImport');
  const confirmButton = document.querySelector('#confirmImport');
  const diffBox = document.querySelector('#importDiff');
  const statusBox = document.querySelector('#importStatus');

  function currentFilters() {
    const data = new FormData(filterForm);
    const params = {};
    for (const [key, value] of data.entries()) {
      if (value) params[key] = value;
    }
    return params;
  }

  function renderDiff(result) {
    if (!result.changed.length && !result.errors.length) {
      diffBox.textContent = 'No changes detected.';
      return;
    }
    const changeRows = result.changed.flatMap((item) =>
      item.changes.map((c) => `
        <tr>
          <td>${esc(item.questionNumber)}</td>
          <td>${esc(c.field)}</td>
          <td class="old-value">${esc(c.oldValue).slice(0, 200)}</td>
          <td class="new-value">${esc(c.newValue).slice(0, 200)}</td>
        </tr>
      `)
    ).join('');
    const errorRows = result.errors.map((e) => `<tr class="error-row"><td colspan="4">row ${esc(e.row)}: ${esc(e.message)}</td></tr>`).join('');
    diffBox.innerHTML = `<table><thead><tr><th>Q#</th><th>Field</th><th>Old</th><th>New</th></tr></thead><tbody>${changeRows}${errorRows}</tbody></table>`;
  }

  downloadButton.addEventListener('click', () => {
    window.location.href = api.exportUrl(currentFilters());
  });

  previewButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      statusBox.textContent = 'Choose a file first.';
      return;
    }
    statusBox.textContent = 'Checking file…';
    confirmButton.disabled = true;
    try {
      const result = await api.importDryRun(file);
      renderDiff(result);
      confirmButton.disabled = result.errors.length > 0 || result.changed.length === 0;
      statusBox.textContent = `${result.changed.length} row(s) changed, ${result.unchanged} unchanged, ${result.errors.length} error(s).`;
    } catch (error) {
      statusBox.textContent = error.message;
    }
  });

  confirmButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusBox.textContent = 'Importing…';
    try {
      const result = await api.importCommit(file);
      statusBox.textContent = `Imported ${result.updated} row(s).`;
      diffBox.innerHTML = '';
      confirmButton.disabled = true;
      await onImported();
    } catch (error) {
      statusBox.textContent = error.message;
    }
  });
}
```

- [ ] **Step 2: Manual verification — export, edit one cell, re-import**

```bash
cd backend && PORT=5055 npm start
```

Open `http://localhost:5055/admin/index.html`, go to the Import/Export tab, filter to Book `1`, click "Download template (.xlsx)". Open the downloaded file in a spreadsheet application, change the `needsReview` cell of one row from `FALSE` to `TRUE`, save it. Back in the admin UI, choose that file and click "Preview changes". Expected: the diff table shows exactly one changed row with field `needsReview`, old `false`, new `true`; "Confirm import" becomes enabled. Click it. Expected: status shows "Imported 1 row(s)", the header's review count increases by 1, and re-filtering Browse to "Needs review" shows that question. Stop the server when done.

- [ ] **Step 3: Commit**

```bash
git add backend/public/admin/js/importExport.js
git commit -m "feat(admin): add import/export tab with dry-run diff preview"
```

---

### Task 18: Run the review-status migration, full checklist, and docs

**Files:**
- Modify: `docs/AGENT_HANDOFF_2026-07-13.md` (or create a short new handoff note — see Step 4)

**Interfaces:**
- Consumes: everything from Tasks 1–17.
- Produces: the `needsReview` flags populated in production from `outstanding_614_review.json` (Task 5's script, run for real here), and a written record of the admin panel's existence for future sessions.

- [ ] **Step 1: Run the full automated test suite**

```bash
cd backend && npm test
```

Expected: PASS — all 15 tests (from Tasks 1, 7, 9, 10) green, 0 failures.

- [ ] **Step 2: Run the needsReview migration against production**

This sets `needsReview: true` on the 614 entries identified by the verification pass. It's additive/idempotent (safe to re-run — it only sets a flag, never touches question/answer text), but it's still a real write to the live database. Run it once, deliberately:

```bash
cd backend && node src/seeds/verification/seedNeedsReview.js
```

Expected: `Flagging 614 question(s) as needsReview=true...` then `Matched 614, modified 614` (or `modified 0` if Task 11's manual check already flagged one of them — either is correct as long as `matched` is 614).

- [ ] **Step 3: Full manual checklist**

Start the server (`PORT=5055 npm start`) and confirm, in order:

1. `curl -s http://localhost:5055/admin/api/stats` without a cookie → 401.
2. Log in via `http://localhost:5055/admin/login.html` with the real admin account.
3. Header shows "614 of 1452 need review".
4. Browse tab, filter "Needs review" → 614 total across all pages (check the status line's total count).
5. Open one flagged entry, fill in a real Arabic question/answer (or leave as-is and just uncheck "Still needs review" if you don't have a correction ready yet), save. Header count drops to 613.
6. Confirm the public site reflects it immediately: `curl -s "http://localhost:5055/api/questions/<that number>?lang=ar"` shows the new text and no `langFallback`/garbled content.
7. Log out, confirm `http://localhost:5055/admin/index.html` redirects to the login page (no data flashes before the redirect).
8. Stop the server.

- [ ] **Step 4: Add a short handoff note**

Append to `docs/AGENT_HANDOFF_2026-07-13.md` (or, if that file is considered closed/historical, create `docs/AGENT_HANDOFF_2026-07-17.md` with just this section — use your judgment based on how the existing file is organized):

```markdown
## Admin panel (added 2026-07-17)

- `/admin/login.html` and `/admin/index.html` — password-protected panel for editing
  English/Arabic question/answer text and bulk xlsx import/export.
- Design: `docs/superpowers/specs/2026-07-17-admin-panel-design.md`
- Plan: `docs/superpowers/plans/2026-07-17-admin-panel-implementation.md`
- Provision an admin: `node backend/src/seeds/createAdmin.js <username>` (interactive
  password prompt). Remove one: `node backend/src/seeds/createAdmin.js --delete <username>`.
- `SESSION_SECRET` must be set in `backend/.env` for production (see `.env.example`).
- `QuestionAr` documents now carry `needsReview`/`reviewedBy`/`reviewedAt`; the
  614-entry backlog from the verification pass was seeded via
  `node backend/src/seeds/verification/seedNeedsReview.js` (already run — don't
  re-run unless re-seeding the whole Arabic collection from scratch).
```

- [ ] **Step 5: Commit**

```bash
git add docs/AGENT_HANDOFF_2026-07-13.md
git commit -m "docs: record admin panel in agent handoff notes"
```

(Adjust the `git add` path if you created a new dated file instead of appending to the existing one.)

---

## Self-Review Notes

- **Spec coverage:** §2 (accounts/auth) → Tasks 2, 3, 6, 7, 8. §3 (data model) → Tasks 4, 5. §4 (API) → Tasks 6, 8, 9, 10, 11, 12, 13. §5 (UI) → Tasks 14, 15, 16, 17. §6 (error handling) → baked into each controller task (401/403/400/404/500 paths and the all-or-nothing import commit). §7 (testing) → Tasks 1, 7, 9, 10 (automated) plus manual steps embedded in every DB-touching task and consolidated in Task 18. §8 (out of scope) → nothing in this plan touches roles, approval workflows, edit history, public signup, or metadata fields beyond question/answer text, consistent with the spec.
- **Placeholder scan:** no TBD/TODO; every step has literal code or literal commands with expected output.
- **Type/name consistency check:** `needsReview`/`reviewedBy`/`reviewedAt` (Task 4) match the fields set in Task 11's `updateQuestion` and Task 13's import commit. `TEXT_FIELD_MAP` keys (`question_en`, `answer_en`, `question_ar`, `answer_ar`) match `REQUIRED_TEXT_FIELDS` in Task 9's `questionDiff.js`, the xlsx column `key`s in Task 10, and the form field `name`s in Task 14/16's HTML. `api.js`'s method names (Task 14) match what `browse.js` (Task 15), `edit.js` (Task 16), and `importExport.js` (Task 17) call. `requireAdminSession`/`requireAdminHeader` (Task 7) are the exact names imported in Task 8's and Task 11's route wiring.
