import { describe, expect, test, afterEach } from "bun:test";
import postgres from "postgres";
import { resolveConnection } from "../src/client.js";
import { configure, getClient, disconnect } from "../src/client.js";

// resolveConnection is pure: it decides WHERE the connection comes from without
// opening one, so the whole precedence chain is testable with no database.
describe("resolveConnection", () => {
  test("throws when nothing is configured and the env var is unset", () => {
    expect(() => resolveConnection({}, {})).toThrow(
      /ANALYTICS_DATABASE_URL/
    );
  });

  test("falls back to ANALYTICS_DATABASE_URL when no config is given", () => {
    const resolved = resolveConnection(
      {},
      { ANALYTICS_DATABASE_URL: "postgres://env/db" }
    );
    expect(resolved).toEqual({
      kind: "connectionString",
      connectionString: "postgres://env/db",
      options: undefined,
    });
  });

  test("an explicit connectionString takes precedence over the env var", () => {
    const resolved = resolveConnection(
      { connectionString: "postgres://explicit/db" },
      { ANALYTICS_DATABASE_URL: "postgres://env/db" }
    );
    expect(resolved).toEqual({
      kind: "connectionString",
      connectionString: "postgres://explicit/db",
      options: undefined,
    });
  });

  test("passes driver options through alongside the env var", () => {
    const resolved = resolveConnection(
      { options: { max: 1 } },
      { ANALYTICS_DATABASE_URL: "postgres://env/db" }
    );
    expect(resolved).toEqual({
      kind: "connectionString",
      connectionString: "postgres://env/db",
      options: { max: 1 },
    });
  });

  test("a caller-supplied client wins over everything", () => {
    const fake = { __brand: "sql" } as never;
    const resolved = resolveConnection(
      { client: fake },
      { ANALYTICS_DATABASE_URL: "postgres://env/db" }
    );
    expect(resolved).toEqual({ kind: "client", client: fake });
  });

  test("rejects being given both a client and a connectionString", () => {
    const fake = { __brand: "sql" } as never;
    expect(() =>
      resolveConnection(
        { client: fake, connectionString: "postgres://explicit/db" },
        {}
      )
    ).toThrow(/both/i);
  });
});

describe("configure", () => {
  afterEach(async () => {
    await disconnect();
  });

  test("throws when called after the client has already been created", () => {
    configure({ connectionString: "postgres://first/db" });
    getClient();

    expect(() =>
      configure({ connectionString: "postgres://second/db" })
    ).toThrow(/before/i);
  });
});

describe("disconnect", () => {
  afterEach(async () => {
    await disconnect();
  });

  // postgres() does not dial the server until a query runs, so this stays
  // database-free: we only care whether our code calls end() on a pool it
  // does not own. Ending a caller's shared pool would break their app.
  test("does not end a client the caller supplied", async () => {
    const borrowed = postgres("postgres://user:pass@localhost/db");
    let ended = false;
    const realEnd = borrowed.end.bind(borrowed);
    borrowed.end = (async (...args: Parameters<typeof realEnd>) => {
      ended = true;
      return realEnd(...args);
    }) as typeof borrowed.end;

    configure({ client: borrowed });
    getClient();
    await disconnect();

    expect(ended).toBe(false);

    await realEnd();
  });
});
