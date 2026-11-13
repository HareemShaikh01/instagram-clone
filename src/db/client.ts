import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const globalStore = globalThis as unknown as { __pgClient?: postgres.Sql };

export const pgClient: postgres.Sql =
  globalStore.__pgClient ??
  postgres(url, {
    prepare: false,
    max: 10,
    onnotice: () => {},
  });
globalStore.__pgClient = pgClient;

export const db = drizzle(pgClient, { schema });
export { schema };
