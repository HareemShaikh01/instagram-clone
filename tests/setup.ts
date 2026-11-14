import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

// Tests must never touch the dev database, so force the test DB unless a
// TEST_DATABASE_URL override is provided. db/client.ts reads this at import
// time, which happens after this setup file runs.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://ubuntu:ubuntu@localhost:5432/instagram_test";
process.env.SESSION_SECRET ??= "test-session-secret";
const databaseUrl = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __instagramTestSchemaReady: boolean | undefined;
}

async function setup(): Promise<void> {
  if (globalThis.__instagramTestSchemaReady) return;

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
