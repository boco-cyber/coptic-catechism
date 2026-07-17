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
