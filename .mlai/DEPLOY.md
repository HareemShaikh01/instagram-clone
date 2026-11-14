# Deploying

## Environment variables (all runtime, none baked into the build)

| Variable         | Required | Notes                                                        |
| ---------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`   | yes      | Hosted Postgres (e.g. Neon via the Vercel Storage tab). Needs `sslmode=require` for cloud providers. |
| `SESSION_SECRET` | yes      | Random 32-byte hex; hashes session tokens before storage.    |
| `MEDIA_DIR`      | no       | Legacy files only (pre-blob rows). New uploads live in the `media_blobs` Postgres table; see caveats. |
| `MAX_IMAGE_BYTES` / `MAX_VIDEO_BYTES` | no | Upload size limits, defaults in code. |

## Vercel project state (2026-11-14)

- `instagram-clone-1` (prj_qP45m5fdO5mV50fXZ6f5LDjyqm9Z) is an unrelated Firebase/Create-React-App project: a static bundle with no `/api` backend (every API path returns `index.html`). It is not this repo — delete or ignore it.
- `instagram-clone` (prj_V8Ek7AslcxnhFOyAKxlkfREHYVsu) is this repo's project, git-linked to `HareemShaikh01/instagram-clone` (branch `main`): every push to `main` triggers a production deployment automatically. Its unique deployment URLs sit behind Vercel Authentication (default); the stable `<project>.vercel.app` domain is public.
- The Vault Neon database (host `ep-blue-frog-bb4oeyqp-pooler…neon.tech`) already has the full schema applied and 0 users — no migrate step is needed on first deploy; sign-up creates the first account.

## Vercel (managed)

1. Add a Postgres store in the Vercel dashboard (Storage → Marketplace → Neon) and save `DATABASE_URL`, `SESSION_SECRET`, `MEDIA_DIR` in Vault (this workspace) or in the Vercel project's Environment Variables.
2. Deploy from the app's **Deploys** section (uploads tracked files) or by importing the GitHub repo into Vercel.
3. Apply schema once per environment, from a checkout with deps installed:
   `DATABASE_URL=<url> npm run db:migrate`

## Rollback (Vercel)

- Instant: Dashboard → Deployments → last known-good READY deployment → **… → Promote to Production** (aliases flip, no rebuild).
- Or redeploy a known-good commit: Deployments → … → Redeploy with the older commit picked.

## Container (self-host: Fly, Railway, VPS)

```sh
docker compose up -d db          # postgres 18, host port 5433
DATABASE_URL=postgres://ubuntu:ubuntu@127.0.0.1:5433/instagram npm run db:migrate
docker compose up -d --build app # app on http://127.0.0.1:3003
```

Image is multi-stage (`node:22-alpine`), runs as the non-root `node` user, ships the Next.js
standalone output, and exposes a HEALTHCHECK on `/api/healthz`. Rollback = redeploy the
previous image tag; keep the last two tags before replacing.

## Caveats

- Uploaded media bytes live in the `media_blobs` Postgres table (migration `0001_media_blob_storage`),
  so they survive serverless restarts and are shared by every instance; `MEDIA_DIR` only backs
  legacy rows from before that change (local development data).
- A fresh database starts empty; register users via the normal sign-up flow.
