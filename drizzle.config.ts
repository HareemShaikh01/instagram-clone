import { defineConfig } from "drizzle-kit";

function envUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  try {
    const raw = require("node:fs").readFileSync(".env.local", "utf8");
    const m = raw.match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("DATABASE_URL is not set (.env.local or environment)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: envUrl() },
  strict: true,
  verbose: true,
});
