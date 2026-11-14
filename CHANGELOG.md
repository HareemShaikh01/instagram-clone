# Changelog

All notable user-facing changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions are not released yet, so entries are grouped by date.

## 2026-11-14

### Added
- Deploy pipeline as code: multi-stage `Dockerfile` (non-root, standalone output,
  healthcheck on `/api/healthz`), `docker-compose.yml` app + Postgres stack, and a
  GitHub Actions CI workflow (`.github/workflows/ci.yml`) running typecheck, tests
  and build on pull requests and pushes to `master`/`main`.
- `DEPLOY.md`: environment variables, Vercel deploy and rollback runbook, container
  runbook, production caveats.
- Regression tests for the comment save bug, notification video thumbnails and the
  comment query performance fix (suite now 27 tests).

### Fixed
- CI test bootstrap: the test setup now creates the `instagram_test` database when
  it is missing (fresh clones, CI service containers) and only borrows a `DATABASE_URL`
  that points at localhost, so a remote database is never used for tests.
- Comment save error after posting a comment.
- Notification thumbnails for video posts.
- Slow comment query on post detail (added index-backed fetch).
- Session-token hashing test is now hermetic: a real `SESSION_SECRET` in the
  environment no longer breaks the suite.
