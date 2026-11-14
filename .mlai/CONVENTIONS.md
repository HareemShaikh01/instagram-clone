# Conventions

## Preview / dev server
- `next.config.ts` sets `allowedDevOrigins: ["*.vercel.run"]` so the public preview host can load client JS. Any change to `next.config.ts` requires restarting the preview (the running dev server does not hot-reload config); a stale server blocks cross-origin asset requests and the app never hydrates — symptoms: buttons/forms do nothing, tool reports the page as non-interactive.
- `npm run build` and the dev preview fight over `.next/`: stop the dev server before building, restart the preview afterwards.
- If the preview serves `MODULE_NOT_FOUND './NNNN.js'` or ENOENT manifest errors after a build, the managed server survived the `.next/` deletion and is serving from memory: `pgrep -af next`, `kill <pids>`, then preview start. Kill by PID — a `pkill -f` pattern that appears in your own command line kills your own shell.

## Database client
- `src/db/client.ts` creates the postgres client and the drizzle instance lazily (on first query) so `next build` does not require `DATABASE_URL`. Keep it lazy: eager init makes any build without runtime env vars fail during page-data collection (e.g. Vercel builds).

## Verifying auth/UI end to end
- Backend auth can be checked with curl cookie jars against `http://127.0.0.1:3000` (`POST /api/auth/register|login|logout`, `GET /api/auth/session`). Seed users (`alice`, `bob`) have hashed passwords — always register a fresh user (password rule: min 8 chars with a letter and a number) instead of guessing seeds.
- For UI-level proof, prefer a direct Playwright run over the built-in browser tool when fills race hydration: wait for a `__reactFiber*` key on an input, then fill/click. See project memory `direct-playwright-ui-check`.

## Expected noise
- Signed-out visits log one 401 on `/api/auth/session` (guest session probe) — benign.
- `/favicon.ico` returns 404 — no favicon asset exists yet.
