import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const testDbName = "instagram_test";
const fallbackTestUrl = `postgresql://ubuntu:ubuntu@localhost:5432/${testDbName}`;

// Tests must never touch the dev database, so force the test DB unless a
// TEST_DATABASE_URL override is provided. db/client.ts reads this at import
// time, which happens after this setup file runs.
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  if (devUrl) {
    try {
      const parsed = new URL(devUrl);
      const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
      // Only borrow the server when the dev database is local; a remote
      // DATABASE_URL (staging/production) must never receive test traffic.
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        parsed.pathname = `/${testDbName}`;
        return parsed.toString();
      }
    } catch {
      // Malformed DATABASE_URL — fall through to the local default.
    }
  }
  return fallbackTestUrl;
}

process.env.DATABASE_URL = resolveTestDatabaseUrl();
// Force a known secret so hashing assertions stay deterministic even when a
// real SESSION_SECRET is present in the environment (e.g. injected by Vault).
process.env.SESSION_SECRET = "test-session-secret";
const databaseUrl = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __instagramTestSchemaReady: boolean | undefined;
}

// The test database may not exist yet (fresh clone, CI service container);
// create it best-effort via the server's maintenance database.
async function ensureTestDatabaseExists(): Promise<void> {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(name)) return;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { prepare: false, max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${name}"`);
  } catch {
    // Already exists, or creation is not permitted — the schema step below
    // surfaces any real connectivity problem.
  } finally {
    await admin.end({ timeout: 5 }).catch(() => {});
  }
}

async function setup(): Promise<void> {
  if (globalThis.__instagramTestSchemaReady) return;

  await ensureTestDatabaseExists();
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    // Serialize parallel vitest workers so only one applies the migration.
    await sql`select pg_advisory_lock(hashtext('instagram_test_schema'))`;
    const [{ exists }] = await sql`select to_regclass('public.users') is not null as exists`;
    if (!exists) {
      const migrationDir = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "src",
        "db",
        "migrations",
      );
      const migration = readFileSync(path.join(migrationDir, "0000_init.sql"), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        const trimmed = statement.trim();
        if (trimmed) await sql.unsafe(trimmed);
      }
    }
    globalThis.__instagramTestSchemaReady = true;
  } finally {
    await sql`select pg_advisory_unlock(hashtext('instagram_test_schema'))`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

// Vitest setup files are imported, not invoked, so run the bootstrap directly.
await setup();
