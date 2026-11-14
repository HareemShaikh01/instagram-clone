import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalStore = globalThis as unknown as {
  __pgClient?: postgres.Sql;
  __db?: Db;
};

function createClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    prepare: false,
    max: 10,
    onnotice: () => {},
  });
}

function createDb() {
  return drizzle(lazyClient(), { schema });
}

type Db = ReturnType<typeof createDb>;

// Both the postgres client and the drizzle instance are created on first use,
// not at import time: Next.js imports route modules while collecting page
// data during `next build`, which must not require runtime env vars.
function lazyClient(): postgres.Sql {
  return (globalStore.__pgClient ??= createClient());
}

function lazyDb(): Db {
  return (globalStore.__db ??= createDb());
}

function forward<T extends object>(create: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = create();
      const value = Reflect.get(real, prop);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

export const pgClient: postgres.Sql = forward(lazyClient);
export const db: Db = forward(lazyDb);
export { schema };
