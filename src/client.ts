import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

declare global {
  // eslint-disable-next-line no-var
  var __noseworkDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __noseworkSql: ReturnType<typeof postgres> | undefined;
}

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getClient() {
  if (db) {
    return db;
  }

  const connectionString = process.env.ANALYTICS_DATABASE_URL;
  if (!connectionString) {
    throw new Error("ANALYTICS_DATABASE_URL environment variable is not set");
  }

  // In development, use global to preserve connection across hot reloads
  if (process.env.NODE_ENV === "development") {
    if (!global.__noseworkSql) {
      global.__noseworkSql = postgres(connectionString);
      global.__noseworkDb = drizzle(global.__noseworkSql, { schema });
    }
    sql = global.__noseworkSql;
    db = global.__noseworkDb!;
  } else {
    sql = postgres(connectionString);
    db = drizzle(sql, { schema });
  }

  return db;
}

export async function disconnect(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}

// Re-export schema for convenience
export { schema };
