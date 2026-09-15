import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Options, Sql } from "postgres";
import * as schema from "./schema.js";

/**
 * Optional configuration, applied with configure() before the first query.
 *
 * Without it the package reads ANALYTICS_DATABASE_URL, which is the only
 * behaviour that existed before 0.4.0 and remains the default.
 */
export interface NoseworkConfig {
  /** Connection string, used instead of ANALYTICS_DATABASE_URL. */
  connectionString?: string;
  /** An existing postgres instance to use, so its pool can be shared. */
  client?: Sql;
  /** Driver options (pool size, timeouts, ssl) passed to postgres(). */
  options?: Options<Record<string, never>>;
}

export type ResolvedConnection =
  | { kind: "client"; client: Sql }
  | {
      kind: "connectionString";
      connectionString: string;
      options?: Options<Record<string, never>>;
    };

/**
 * Decide where the connection comes from, without opening one.
 *
 * Kept pure and separate from getClient() so the precedence rules can be
 * tested without a database, the same way computeVisitorIds() is.
 */
export function resolveConnection(
  config: NoseworkConfig,
  env: Record<string, string | undefined>
): ResolvedConnection {
  if (config.client && config.connectionString) {
    throw new Error(
      "configure() was given both a client and a connectionString. Provide one or the other."
    );
  }

  if (config.client) {
    return { kind: "client", client: config.client };
  }

  const connectionString =
    config.connectionString ?? env.ANALYTICS_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "ANALYTICS_DATABASE_URL environment variable is not set, and no connectionString was passed to configure()"
    );
  }

  return { kind: "connectionString", connectionString, options: config.options };
}

declare global {
  // eslint-disable-next-line no-var
  var __noseworkDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __noseworkSql: ReturnType<typeof postgres> | undefined;
}

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;
let config: NoseworkConfig = {};
/** True when sql was handed to us by the caller, so we must not end it. */
let clientIsBorrowed = false;

/**
 * Set configuration before the first query.
 *
 * Throws if a client already exists: silently ignoring a late configure()
 * would leave the caller's connection string unused with no signal, which is
 * an expensive thing to debug.
 */
export function configure(next: NoseworkConfig): void {
  if (db) {
    throw new Error(
      "configure() must be called before the first query — the database client already exists. Call disconnect() first if you need to reconfigure."
    );
  }
  config = next;
}

export function getClient() {
  if (db) {
    return db;
  }

  const resolved = resolveConnection(config, process.env);

  if (resolved.kind === "client") {
    sql = resolved.client;
    clientIsBorrowed = true;
    db = drizzle(sql, { schema });
    return db;
  }

  const { connectionString, options } = resolved;
  clientIsBorrowed = false;

  // In development, use global to preserve connection across hot reloads
  if (process.env.NODE_ENV === "development") {
    if (!global.__noseworkSql) {
      global.__noseworkSql = postgres(connectionString, options);
      global.__noseworkDb = drizzle(global.__noseworkSql, { schema });
    }
    sql = global.__noseworkSql;
    db = global.__noseworkDb!;
  } else {
    sql = postgres(connectionString, options);
    db = drizzle(sql, { schema });
  }

  return db;
}

export async function disconnect(): Promise<void> {
  if (sql) {
    // A client handed to us via configure({ client }) belongs to the caller;
    // ending it would close a pool their own code is still using.
    if (!clientIsBorrowed) {
      await sql.end();
    }
    sql = null;
    db = null;
    clientIsBorrowed = false;
  }
}

// Re-export schema for convenience
export { schema };
