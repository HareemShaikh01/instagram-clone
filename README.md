# Instagram Clone

A full-stack Instagram-style social app built with Next.js (App Router), React 19,
Tailwind CSS 4, Drizzle ORM and PostgreSQL. It exists as a deployable reference: every
feature is wired end to end — no mocks, no placeholder screens.

Who this is for: developers who want a realistic, self-hostable social-app codebase to
read, extend, or deploy as-is (Vercel or any container host).

## Features

- Accounts: sign-up, sign-in, sign-out, session cookies, avatar and profile editing
- Feed: home feed, explore grid, hashtag and search pages
- Posts: photo/video uploads (10 MB image / 60 MB video limits), captions with
  `#hashtags` and `@mentions`, location, save/bookmark, delete
- Social graph: follow / unfollow, private accounts with follow requests, blocks, reports
- Engagement: likes, threaded comments, comment likes, notifications
- Messaging: direct conversations with media attachments
- Stories: 24-hour story rings with view tracking

## Requirements

- Node.js 20+ (developed on Node 22)
- PostgreSQL 14+ (developed on Postgres 18)

## Quick start (about 5 minutes)

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#    then edit .env.local: set SESSION_SECRET to a long random string, e.g.
#    openssl rand -hex 32

# 3. Create the database (local Postgres, user "ubuntu")
createdb instagram

# 4. Apply the schema
DATABASE_URL=postgresql://ubuntu:ubuntu@localhost:5432/instagram npm run db:migrate

# 5. Run the app
npm run dev
```

Open http://localhost:3000, tap **Sign up** and create an account (password rule:
minimum 8 characters with at least one letter and one number). Registration is
rate-limited to 5 attempts per hour per IP.

## Configuration

All variables are runtime configuration — nothing is baked into the build.

| Variable           | Required | Default        | Notes                                              |
| ------------------ | -------- | -------------- | -------------------------------------------------- |
| `DATABASE_URL`     | yes      | —              | Postgres connection string. Cloud providers need `sslmode=require`. |
| `SESSION_SECRET`   | yes      | —              | Random string; session tokens are HMAC-hashed with it before storage. |
| `MEDIA_DIR`       | yes      | `./uploads`    | Where uploaded media files are written.            |
| `MAX_IMAGE_BYTES`  | no       | `10485760`     | Image upload limit (10 MB).                        |
| `MAX_VIDEO_BYTES`  | no       | `62914560`     | Video upload limit (60 MB).                        |

## Scripts

| Command                 | What it does                                    |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Dev server with hot reload on port 3000          |
| `npm run build`         | Production build (standalone output)             |
| `npm start`             | Serve the production build                       |
| `npm test`              | Unit/integration tests (Vitest)                  |
| `npm run test:watch`    | Tests in watch mode                              |
| `npm run db:generate`   | Generate SQL migrations from `src/db/schema.ts`  |
| `npm run db:migrate`    | Apply migrations (`DATABASE_URL` from env)       |

## Testing

```sh
npm test
```

The suite (27 tests) is hermetic: `tests/setup.ts` forces a test database
(`instagram_test`) and a known session secret, so runs never touch your dev data or
depend on ambient environment variables.

## Troubleshooting

- **`npm run build` fails or the dev server starts serving broken chunks** — the build
  and the dev server fight over `.next/`. Stop the dev server, build, then restart it.
- **Bursts of 401s on `/api/auth/session` in the browser console** — expected: signed-out
  visitors trigger one guest session probe before the redirect. Harmless noise.
- **`/favicon.ico` 404** — no favicon asset exists yet.
- **Register returns 429** — the 5-per-hour rate limit; use an existing account or wait.
- **Uploaded media vanishes on serverless** — serverless filesystems are ephemeral; move
  `MEDIA_DIR` to object storage for production (see DEPLOY.md caveats).

## Deploying

See [DEPLOY.md](DEPLOY.md) for environment variables, the Vercel flow (including
instant rollback via **Promote to Production**), the Docker/compose runbook, and
production caveats.

## Project layout

```
src/app/            App Router pages and API route handlers
src/components/     Client components (feed, post card, messages, …)
src/db/             Drizzle schema, client, migrations
src/lib/            Auth, validation, queries, text processing
tests/              Vitest suites (hermetic setup in tests/setup.ts)
uploads/            Local media store (gitignored)
```
