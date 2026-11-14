# Deploying

## Environment variables (all runtime, none baked into the build)

| Variable         | Required | Notes                                                        |
| ---------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`   | yes      | Hosted Postgres (e.g. Neon via the Vercel Storage tab). Needs `sslmode=require` for cloud providers. |
| `SESSION_SECRET` | yes      | Random 32-byte hex; hashes session tokens before storage.    |
| `MEDIA_DIR`      | yes      | `/tmp/uploads` on Vercel (only writable path; see caveats). `/data/uploads` in Docker. |
| `MAX_IMAGE_BYTES` / `MAX_VIDEO_BYTES` | no | Upload size limits, defaults in code. |

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

- Serverless filesystems are ephemeral: media written to `MEDIA_DIR` disappears on cold
  starts and is not shared between instances. Move uploads to object storage (e.g. Vercel
  Blob / S3) before relying on media in production.
- A fresh database starts empty; register users via the normal sign-up flow.
