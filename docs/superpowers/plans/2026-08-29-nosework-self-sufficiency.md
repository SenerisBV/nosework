# nosework Self-Sufficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nosework able to create and migrate its own database, add the two missing query functions the dashboard needs, and document the privacy model precisely enough to quote on a legal page.

**Architecture:** nosework is a published npm library (`@seneris/nosework`) that consuming Next.js apps import to write page views into a shared Postgres database. It was built assuming a now-deprecated host app (MoopySuite) owned the schema, so it has no migration tooling of its own. This plan adds `drizzle-kit`, removes the dead Prisma artifact, adds `listSites()` and `deleteOldPageViews()`, and writes `docs/PRIVACY.md`.

**Tech Stack:** TypeScript (ESM, strict), Drizzle ORM 0.38, `postgres` driver, Bun (runtime + test runner + package manager), Neon Postgres (`eu-central-1`).

**Spec:** `docs/superpowers/specs/2026-08-29-nosework-dashboard-design.md`

## Global Constraints

- **$0.** Free tiers only — Vercel Hobby, Neon free. No design decision may introduce a paid dependency.
- **No cookie banner, ever.** Nothing may write to or read from a visitor's device. No cookies, no localStorage, no fingerprinting.
- **Never `drizzle-kit push`.** Use `generate` + `migrate` so versioned SQL lives in git. Same rule as the standing ban on `prisma db push`: pushing mutates the DB without recording history, and the drift is only discovered when it blocks a real migration later.
- **Tests must never touch the dev database.** v1 is unit tests only, all DB-free. Task 1 installs a hard guard.
- **Retention is 24 months.** Salts are destroyed after 7 days.
- **Package manager is `bun`.** Not npm, not pnpm.
- **All existing behaviour is preserved.** This plan adds and documents; the only refactor is a behaviour-preserving extraction in Task 2.

---

### Task 1: Test harness with a database-access guard

nosework has no tests and no test script. Before writing a single test, install a guard that makes it *impossible* for a test run to reach the real database — `bun test` automatically loads `.env`, so `ANALYTICS_DATABASE_URL` would otherwise be populated and a stray call would silently write to live data.

**Files:**
- Create: `bunfig.toml`
- Create: `test/setup.ts`
- Create: `test/utils.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing
- Produces: `bun test` runs; any test that reaches `getClient()` throws instead of connecting.

- [ ] **Step 1: Write the guard**

Create `test/setup.ts`:

```ts
// Hard guard: tests must never reach a real database.
// getClient() throws when ANALYTICS_DATABASE_URL is unset, so removing it here
// turns any accidental DB access in a unit test into a loud failure rather
// than a silent write to the developer's live analytics data.
delete process.env.ANALYTICS_DATABASE_URL;
delete process.env.DATABASE_URL;
```

Create `bunfig.toml`:

```toml
[test]
preload = ["./test/setup.ts"]
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `scripts`:

```json
"test": "bun test"
```

- [ ] **Step 3: Write the failing tests**

Create `test/utils.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isBot, extractPathname } from "../src/utils.js";

describe("isBot", () => {
  test("treats a missing user-agent as a bot", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
  });

  test("detects common crawlers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("ClaudeBot/1.0")).toBe(true);
    expect(isBot("Mozilla/5.0 ... HeadlessChrome/120.0.0.0")).toBe(true);
  });

  test("does not flag ordinary browsers", () => {
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const safariIphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(isBot(chrome)).toBe(false);
    expect(isBot(safariIphone)).toBe(false);
  });
});

describe("extractPathname", () => {
  test("extracts the path from an absolute URL", () => {
    expect(extractPathname("https://seneris.nl/about")).toBe("/about");
  });

  test("drops the query string and hash", () => {
    expect(extractPathname("https://seneris.nl/blog?utm_source=x#top")).toBe("/blog");
  });

  test("returns / for a bare origin", () => {
    expect(extractPathname("https://seneris.nl")).toBe("/");
  });

  test("falls back gracefully on an unparseable URL", () => {
    expect(extractPathname("/just/a/path")).toBe("/just/a/path");
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bun test`
Expected: PASS. These functions already exist and are pure — this task proves the harness works and locks in current behaviour.

- [ ] **Step 5: Verify the guard actually guards**

Run: `bun test 2>&1 | grep -c "ANALYTICS_DATABASE_URL"`
Expected: `0` — no test reached the database.

Then confirm the guard bites. Temporarily append to `test/utils.test.ts`:

```ts
test("TEMP: guard check", async () => {
  const { getClient } = await import("../src/client.js");
  expect(() => getClient()).toThrow("ANALYTICS_DATABASE_URL");
});
```

Run: `bun test`
Expected: PASS — proving `getClient()` throws rather than connecting. **Delete this temporary test before committing.**

- [ ] **Step 6: Commit**

```bash
git add bunfig.toml test/setup.ts test/utils.test.ts package.json
git commit -m "test: add bun test harness with hard database-access guard"
```

---

### Task 2: Make visitor hashing unit-testable

The no-banner position rests entirely on how visitor identity is derived, and that logic currently can't be tested because `getVisitorInfo()` fetches the daily salt from the database before hashing. Extract the pure part.

This is a behaviour-preserving extraction — the hash inputs and their order do not change. Changing them would silently reset every visitor's identity.

**Files:**
- Modify: `src/utils.ts:92-111`
- Modify: `src/index.ts` (export the new function)
- Create: `test/visitor.test.ts`

**Interfaces:**
- Consumes: `VisitorInfo` from `src/types.ts` — `{ visitorHash: string; sessionId: string }`
- Produces: `computeVisitorIds(ip: string | null, userAgent: string | null, salt: string, now: Date): VisitorInfo`

- [ ] **Step 1: Write the failing test**

Create `test/visitor.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { computeVisitorIds } from "../src/utils.js";

const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const SALT_A = "a".repeat(64);
const SALT_B = "b".repeat(64);
const T = new Date("2026-08-29T12:00:00.000Z");

describe("computeVisitorIds", () => {
  test("is deterministic for identical inputs", () => {
    expect(computeVisitorIds(IP, UA, SALT_A, T)).toEqual(
      computeVisitorIds(IP, UA, SALT_A, T)
    );
  });

  test("produces a 16-character hex visitor hash", () => {
    const { visitorHash } = computeVisitorIds(IP, UA, SALT_A, T);
    expect(visitorHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("different salts produce unrelated visitor hashes (daily rotation)", () => {
    const a = computeVisitorIds(IP, UA, SALT_A, T).visitorHash;
    const b = computeVisitorIds(IP, UA, SALT_B, T).visitorHash;
    expect(a).not.toBe(b);
  });

  test("different IPs produce different visitor hashes", () => {
    const a = computeVisitorIds(IP, UA, SALT_A, T).visitorHash;
    const b = computeVisitorIds("198.51.100.4", UA, SALT_A, T).visitorHash;
    expect(a).not.toBe(b);
  });

  test("a null IP does not throw and still yields a hash", () => {
    const { visitorHash } = computeVisitorIds(null, null, SALT_A, T);
    expect(visitorHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("session id is stable within the same 30-minute window", () => {
    const early = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:00:00Z"));
    const late = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    expect(early.sessionId).toBe(late.sessionId);
  });

  test("session id changes across a 30-minute boundary", () => {
    const before = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    const after = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:30:01Z"));
    expect(before.sessionId).not.toBe(after.sessionId);
  });

  test("visitor hash is stable across a session boundary", () => {
    const before = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    const after = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:30:01Z"));
    expect(before.visitorHash).toBe(after.visitorHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/visitor.test.ts`
Expected: FAIL — `computeVisitorIds` is not exported from `src/utils.ts`.

- [ ] **Step 3: Extract the pure function**

In `src/utils.ts`, replace the body of `getVisitorInfo` (lines 92-111) with:

```ts
/**
 * Pure derivation of visitor and session identifiers.
 *
 * Separated from getVisitorInfo() so the privacy-critical logic can be tested
 * without a database. The inputs and their order are load-bearing: changing
 * them resets every visitor's identity.
 */
export function computeVisitorIds(
  ip: string | null,
  userAgent: string | null,
  salt: string,
  now: Date
): VisitorInfo {
  // Visitor hash: rotates daily, because the salt does
  const visitorInput = `${ip ?? ""}|${userAgent ?? ""}|${salt}`;
  const visitorHash = hash(visitorInput);

  // Session hash: rotates every 30 minutes
  // This provides session-like behavior without cookies
  const thirtyMinWindow = Math.floor(now.getTime() / (30 * 60 * 1000));
  const sessionId = hash(`${visitorInput}|${thirtyMinWindow}`);

  return { visitorHash, sessionId };
}

export async function getVisitorInfo(
  ip: string | null,
  userAgent: string | null
): Promise<VisitorInfo> {
  const now = new Date();
  const salt = await getDailySalt(now);
  return computeVisitorIds(ip, userAgent, salt, now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test`
Expected: PASS, all suites.

- [ ] **Step 5: Export it and typecheck**

In `src/index.ts`, change the utility export line to:

```ts
export { isBot, cleanupOldSalts, computeVisitorIds } from "./utils.js";
```

Run: `bun run build`
Expected: clean compile, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils.ts src/index.ts test/visitor.test.ts
git commit -m "refactor: extract pure computeVisitorIds so hashing is testable without a DB"
```

---

### Task 3: Test the remaining pure functions

`formatDateKey` is module-private in `query.ts` and drives every chart bucket. Export it and pin its behaviour, especially at month boundaries.

**Files:**
- Modify: `src/query.ts:226` (add `export`)
- Create: `test/query-buckets.test.ts`
- Create: `test/ua.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `formatDateKey(date: Date, interval: "hour" | "day" | "week" | "month"): string` becomes exported from `src/query.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/query-buckets.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { formatDateKey } from "../src/query.js";

describe("formatDateKey", () => {
  const d = new Date("2026-08-29T14:37:12.000Z");

  test("hour bucket", () => {
    expect(formatDateKey(d, "hour")).toBe("2026-08-29T14:00");
  });

  test("day bucket", () => {
    expect(formatDateKey(d, "day")).toBe("2026-08-29");
  });

  test("month bucket", () => {
    expect(formatDateKey(d, "month")).toBe("2026-08");
  });

  test("week bucket snaps back to Sunday", () => {
    // 2026-08-29 is a Saturday; the week starts Sunday 2026-08-23
    expect(formatDateKey(d, "week")).toBe("2026-08-23");
  });

  test("week bucket crosses a month boundary correctly", () => {
    // 2026-09-01 is a Tuesday; its week starts Sunday 2026-08-30
    expect(formatDateKey(new Date("2026-09-01T09:00:00.000Z"), "week")).toBe("2026-08-30");
  });

  test("does not mutate the date it is given", () => {
    const original = new Date("2026-08-29T14:37:12.000Z");
    const copy = new Date(original.getTime());
    formatDateKey(original, "week");
    expect(original.getTime()).toBe(copy.getTime());
  });
});
```

Create `test/ua.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseUserAgent } from "../src/ua.js";

describe("parseUserAgent", () => {
  test("returns all-null for a missing user-agent", () => {
    expect(parseUserAgent(null)).toEqual({
      browser: null,
      browserVer: null,
      os: null,
      osVer: null,
      device: null,
    });
  });

  test("classifies desktop Chrome and truncates to major version", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36"
    );
    expect(r.browser).toBe("Chrome");
    expect(r.browserVer).toBe("120");
    expect(r.device).toBe("desktop");
  });

  test("classifies an iPhone as mobile", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("iOS");
  });

  test("never returns a full version string", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );
    expect(r.browserVer).not.toContain(".");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/query-buckets.test.ts`
Expected: FAIL — `formatDateKey` is not exported.

- [ ] **Step 3: Export `formatDateKey`**

In `src/query.ts`, change line 226 from `function formatDateKey(` to:

```ts
export function formatDateKey(
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS.

If the "does not mutate" test fails, that is a real bug: the `week` branch calls `d.setDate()` on a `new Date(date)` copy, so it should pass — but if `formatDateKey` is ever changed to operate on the argument directly, this test is what catches it.

- [ ] **Step 5: Commit**

```bash
git add src/query.ts test/query-buckets.test.ts test/ua.test.ts
git commit -m "test: pin date bucketing and user-agent parsing behaviour"
```

---

### Task 4: Own the migrations, delete the Prisma artifact

The blocking change. `CLAUDE.md` says migrations are managed by MoopySuite; MoopySuite is gone, and nothing in this repo can create its own tables. Meanwhile `prisma/schema.prisma` is a dead artifact from an earlier design that *contradicts* the live Drizzle schema — it declares a `Site` model with foreign keys that does not exist.

**Files:**
- Create: `drizzle.config.ts`
- Create: `drizzle/` (generated SQL — commit it)
- Delete: `prisma/schema.prisma`
- Modify: `package.json` (devDependency + scripts)
- Modify: `.gitignore` (ensure `drizzle/` is NOT ignored)

**Interfaces:**
- Consumes: `src/schema.ts` table definitions
- Produces: `bun run db:generate` and `bun run db:migrate`; versioned SQL in `drizzle/`

- [ ] **Step 1: Install drizzle-kit**

```bash
cd ~/projects/nosework && bun add -d drizzle-kit
```

Verify the installed version is compatible with `drizzle-orm@^0.38.3`:

```bash
bun pm ls | grep drizzle
```

Expected: both `drizzle-orm` and `drizzle-kit` listed. If `drizzle-kit generate` fails in Step 3 with a schema-parsing error, pin `drizzle-kit@^0.30.0`, which is the release line paired with drizzle-orm 0.38.

- [ ] **Step 2: Write the config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.ANALYTICS_DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Generate the initial migration**

```bash
cd ~/projects/nosework && bunx drizzle-kit generate --name init
```

Expected: a new `drizzle/0000_*.sql` plus `drizzle/meta/`. Read the SQL and confirm it creates all five tables — `page_views`, `events`, `daily_salts`, `analytics_errors`, `error_groups` — and the indexes declared in `src/schema.ts`.

**Do not run `drizzle-kit push`.** It mutates the database without recording a migration, drifting the schema from its history exactly the way `prisma db push` does.

- [ ] **Step 4: Add the scripts**

In `package.json` `scripts`, add:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 5: Confirm the generated SQL is tracked**

```bash
cd ~/projects/nosework && cat .gitignore && git status --short drizzle/
```

Expected: `drizzle/` files show as untracked-and-addable, not ignored. If `.gitignore` excludes them, remove that rule — the versioned SQL is the entire point.

- [ ] **Step 6: Delete the contradicting Prisma schema**

```bash
cd ~/projects/nosework && git rm -r prisma/
```

- [ ] **Step 7: Verify the build and tests still pass**

Run: `bun run build && bun test`
Expected: clean compile, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add drizzle.config.ts drizzle/ package.json .gitignore
git commit -m "feat: own database migrations with drizzle-kit; remove dead Prisma schema"
```

---

### Task 5: Add `listSites()`

The dashboard's site switcher needs to enumerate tracked sites. `CLAUDE.md` documents `listSites()` and `getOrCreateSite()`, but neither exists. There is no sites table, so the honest implementation derives the list from the page-view data itself.

`getOrCreateSite()` is deliberately **not** implemented — it describes a table that does not exist, and inventing one to justify a docstring is the wrong direction. It gets removed from the docs in Task 7.

**Files:**
- Create: `src/sites.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `pageViews` from `src/schema.ts`, `getClient` from `src/client.ts`
- Produces: `listSites(): Promise<SiteSummary[]>` where `SiteSummary` is `{ siteId: string; pageViews: number; visitors: number; lastSeen: Date | null }`

- [ ] **Step 1: Write the module**

Create `src/sites.ts`:

```ts
import { getClient } from "./client.js";
import { pageViews } from "./schema.js";
import { count, countDistinct, desc, eq, max } from "drizzle-orm";

export interface SiteSummary {
  siteId: string;
  pageViews: number;
  visitors: number;
  lastSeen: Date | null;
}

/**
 * List every site that has ever reported a page view, busiest first.
 *
 * There is no sites table — siteId is a bare column written by whichever app
 * is reporting — so the list is derived from the data. A site appears here as
 * soon as it sends its first non-bot page view, with no registration step.
 */
export async function listSites(): Promise<SiteSummary[]> {
  const db = getClient();

  const rows = await db
    .select({
      siteId: pageViews.siteId,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
      lastSeen: max(pageViews.timestamp),
    })
    .from(pageViews)
    .where(eq(pageViews.isBot, false))
    .groupBy(pageViews.siteId)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    siteId: r.siteId,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
    lastSeen: r.lastSeen ?? null,
  }));
}
```

- [ ] **Step 2: Export it**

In `src/index.ts`, add after the query exports:

```ts
// Site enumeration
export { listSites } from "./sites.js";
export type { SiteSummary } from "./sites.js";
```

- [ ] **Step 3: Typecheck**

Run: `bun run build`
Expected: clean compile.

If `max(pageViews.timestamp)` produces a type error, it is because Drizzle types aggregate results as nullable — the `?? null` in the mapper already handles the runtime case; adjust the `lastSeen` field type rather than removing the aggregate.

- [ ] **Step 4: Run the test suite**

Run: `bun test`
Expected: PASS — no new tests here. `listSites()` is a single database query with no branching logic; testing it would require a database, which v1 explicitly excludes. Its correctness is verified in the dashboard plan when the switcher renders real sites.

- [ ] **Step 5: Commit**

```bash
git add src/sites.ts src/index.ts
git commit -m "feat: add listSites() for multi-site enumeration"
```

---

### Task 6: Add `deleteOldPageViews()`

Retention is 24 months, and that claim is only true if something enforces it. `deleteOldErrors()` exists; there is no page-view equivalent, so page views currently accumulate forever.

**Divergence from the spec's "mirror the existing shape":** `deleteOldErrors(siteId, olderThan)` *requires* a siteId. The retention cron must sweep every site at once, so `siteId` is optional here and omitting it sweeps all sites.

**Files:**
- Create: `src/retention.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `pageViews` from `src/schema.ts`, `getClient` from `src/client.ts`
- Produces: `deleteOldPageViews(olderThan: Date, siteId?: string): Promise<number>` returning the number of rows deleted

- [ ] **Step 1: Write the module**

Create `src/retention.ts`:

```ts
import { getClient } from "./client.js";
import { pageViews } from "./schema.js";
import { and, eq, lt } from "drizzle-orm";

/**
 * Delete page views older than the given cutoff.
 *
 * Enforces the stated retention period. Omit siteId to sweep every site, which
 * is what the scheduled retention job does — deleteOldErrors() requires a
 * siteId, but a retention cron has no list of sites to iterate.
 *
 * @returns the number of rows deleted
 */
export async function deleteOldPageViews(
  olderThan: Date,
  siteId?: string
): Promise<number> {
  const db = getClient();

  const where = siteId
    ? and(eq(pageViews.siteId, siteId), lt(pageViews.timestamp, olderThan))
    : lt(pageViews.timestamp, olderThan);

  const deleted = await db
    .delete(pageViews)
    .where(where)
    .returning({ id: pageViews.id });

  return deleted.length;
}
```

- [ ] **Step 2: Export it**

In `src/index.ts`, add:

```ts
// Retention
export { deleteOldPageViews } from "./retention.js";
```

- [ ] **Step 3: Typecheck and test**

Run: `bun run build && bun test`
Expected: clean compile, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/retention.ts src/index.ts
git commit -m "feat: add deleteOldPageViews() to enforce the retention period"
```

---

### Task 7: Documentation truth pass

The docs currently describe a Prisma schema that was deleted, a host application that no longer exists, and two functions that were never written. Anyone reading them — including us in six months — would be misled on every one of those points.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/PROJECT_STATE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/INTEGRATION.md`
- Delete: `docs/MOOPYSUITE_INTEGRATION.md`

**Interfaces:**
- Consumes: the real state of the code after Tasks 4-6
- Produces: documentation that matches the code

- [ ] **Step 1: Find every stale reference**

```bash
cd ~/projects/nosework && grep -rn "MoopySuite\|MOOPY_CLIENT_ID\|[Pp]risma\|getOrCreateSite" --include="*.md" .
```

Record the full list. Every hit must be resolved by the end of this task.

- [ ] **Step 2: Delete the MoopySuite integration doc**

```bash
cd ~/projects/nosework && git rm docs/MOOPYSUITE_INTEGRATION.md
```

- [ ] **Step 3: Correct each remaining file**

Apply these edits everywhere the grep found hits:

- **Migrations.** Replace every claim that "migrations are managed by MoopySuite" with: migrations live in `drizzle/`, are generated with `bun run db:generate`, and applied with `bun run db:migrate`. State plainly that `drizzle-kit push` is never used, because it drifts the schema from its recorded history.
- **Site identification.** Remove the `MOOPY_CLIENT_ID`-as-siteId convention entirely. `ANALYTICS_SITE_ID` is the sole convention. Note that the coupling was documentation-only — `trackPageView()` has always taken a plain `siteId: string` — so nothing in consuming apps changes beyond the variable name.
- **Prisma.** Remove every reference. The ORM is Drizzle; the schema is `src/schema.ts`; there is no `prisma/` directory.
- **`getOrCreateSite()`.** Delete it from every function list. Replace the "Site Management" section with the single real function: `listSites()`.
- **Add the two new functions** to the function lists in `CLAUDE.md` and `README.md`: `listSites()` under site management, `deleteOldPageViews()` alongside `deleteOldErrors()`.
- **`docs/PROJECT_STATE.md`.** Update "What's Not Done": tests now exist (unit, DB-free); migrations are now owned. Leave the honest remaining gaps in place — no integration tests, no CI, no retry logic on DB failure.

- [ ] **Step 4: Verify nothing stale survives**

```bash
cd ~/projects/nosework && grep -rn "MoopySuite\|MOOPY_CLIENT_ID\|[Pp]risma\|getOrCreateSite" --include="*.md" .
```

Expected: no output, with one permitted exception — the spec at `docs/superpowers/specs/2026-08-29-nosework-dashboard-design.md` legitimately discusses removing these things and should not be edited. If it is the only file listed, that is correct.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: remove MoopySuite and Prisma references, document real function surface"
```

---

### Task 8: Write `docs/PRIVACY.md`

A deliverable in its own right, not documentation of code. It has to be precise enough that a site's privacy page can quote it and be *correct*, because the entire no-banner position rests on these specifics being true.

Write it last, once the code it describes is final.

**Files:**
- Create: `docs/PRIVACY.md`
- Modify: `README.md` (link to it)

**Interfaces:**
- Consumes: the finished behaviour of `computeVisitorIds`, `cleanupOldSalts`, `deleteOldPageViews`, and `src/schema.ts`
- Produces: a quotable privacy statement

- [ ] **Step 1: Re-read the code before describing it**

```bash
cd ~/projects/nosework && cat src/schema.ts && sed -n '90,140p' src/utils.ts && sed -n '1,75p' src/track.ts
```

Every field claim in the document must be checked against `pageViews` in `src/schema.ts`. Do not write this section from memory.

- [ ] **Step 2: Write the document**

Create `docs/PRIVACY.md` with these sections:

**What is stored, per page view.** Field by field from `src/schema.ts`: site id, full URL, pathname, cleaned referrer (origin + path — the query string is stripped in `track.ts`), visitor hash, session id, country / country code / region / city, browser and major version, OS and major version, device class, bot flag, timestamp.

**What is never stored.** No cookies. No localStorage, sessionStorage, or any client-side storage. No raw IP address. No raw user-agent string. No cross-site identifier. No device fingerprint. No advertising identifier.

**How visitors are counted without cookies.** A random 32-byte salt is generated once per UTC day and held in `daily_salts`. A visitor is identified as `sha256(ip | user-agent | daily_salt)` truncated to 16 hex characters. The IP is used only as hash input and is never written to disk. The hash cannot be reversed to an IP, and because the salt changes at UTC midnight, the same person visiting on two days produces two unrelated identifiers with no way to link them. Salts older than 7 days are deleted by `cleanupOldSalts()`, after which even someone holding a full copy of the database cannot re-derive an earlier day's hashes.

**Sessions.** A session id is the visitor hash plus a 30-minute time bucket, derived arithmetically. Nothing is stored on the device.

**Retention.** 24 months, enforced by `deleteOldPageViews()` on a daily schedule. Explain the reasoning: because salts are destroyed after 7 days, anything older than a week is anonymous aggregate statistics rather than personal data, so the storage-limitation principle applies weakly. Note explicitly that this justification depends on the salt-cleanup job actually running.

**Legal basis.** Legitimate interest, GDPR Art. 6(1)(f) — understanding aggregate traffic to a site one operates. No consent gate is required under ePrivacy Art. 5(3), because that article governs *storing information on, or gaining access to information stored on,* a user's terminal equipment, and nosework does neither. This is the same basis Plausible and Fathom rely on.

**Sub-processors and data location.** Vercel — hosting; performs the IP-to-city lookup at the edge and passes only the result as request headers; functions pinned to `fra1` (Frankfurt). Neon — database; project in `eu-central-1` (Frankfurt). All processing and storage occurs within the EU.

**A quotable paragraph.** Plain English, no jargon, ready to paste onto a site's privacy page. Write this section last, once everything above it is accurate.

- [ ] **Step 3: Add a caveat section**

Close with an honest limits section. A document that overclaims is worse than none:

- Geo resolution is Vercel's and is approximate; city-level accuracy varies and VPN users resolve to the VPN's location.
- The bot filter is a pattern list, not a guarantee; some automated traffic is counted and some real traffic is excluded.
- This document describes what the software does. It is not legal advice, and a site operator remains responsible for their own privacy notice.

- [ ] **Step 4: Link it**

Add to `README.md` under Features:

```markdown
See [docs/PRIVACY.md](./docs/PRIVACY.md) for exactly what is collected, how
visitors are counted without cookies, and text you can quote on a privacy page.
```

- [ ] **Step 5: Verify every factual claim**

Re-read `docs/PRIVACY.md` against `src/schema.ts` field by field. Any field listed in the document that is not in the schema, or any schema column not accounted for, is a defect — this is the document someone will rely on legally.

- [ ] **Step 6: Commit**

```bash
git add docs/PRIVACY.md README.md
git commit -m "docs: add PRIVACY.md as the source of truth for privacy pages"
```

---

### Task 9: Publish 0.3.0

**Files:**
- Modify: `package.json` (version)

**Interfaces:**
- Consumes: everything above
- Produces: `@seneris/nosework@0.3.0` on npm, consumable by the dashboard plan

- [ ] **Step 1: Full verification before publishing**

```bash
cd ~/projects/nosework && bun run build && bun test
```

Expected: clean compile, all tests pass. Do not proceed past a failure.

- [ ] **Step 2: Confirm the built output exports the new functions**

```bash
cd ~/projects/nosework && grep -c "listSites\|deleteOldPageViews\|computeVisitorIds" dist/index.d.ts
```

Expected: `3` or higher. If `0`, the exports in `src/index.ts` were missed.

- [ ] **Step 3: Bump the version**

In `package.json`, change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 4: Check what will actually ship**

```bash
cd ~/projects/nosework && npm pack --dry-run
```

Expected: `dist/` contents only, per the `files` field. Confirm no `.env`, no `drizzle.config.ts`, and no test files are included.

- [ ] **Step 5: Publish**

```bash
cd ~/projects/nosework && npm publish --access public
```

- [ ] **Step 6: Commit and tag**

```bash
git add package.json
git commit -m "chore: release 0.3.0"
git tag v0.3.0
```

---

## Applying the migration to Neon

Not a code task, but the dashboard plan depends on it. Once Task 4 is merged:

```bash
cd ~/projects/nosework
ANALYTICS_DATABASE_URL="<neon eu-central-1 pooled connection string>" bun run db:migrate
```

The tables may already exist from the MoopySuite era. If `db:migrate` reports that objects already exist, **do not drop and recreate** — that destroys existing analytics history. Instead confirm the live schema matches `src/schema.ts`, then mark the initial migration as applied by inserting its hash into Drizzle's `__drizzle_migrations` table, the same catch-up pattern used for Prisma drift.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1.1 Own the migrations | Task 4 |
| 1.2 Delete `prisma/schema.prisma` | Task 4 |
| 1.3 Add `listSites()` | Task 5 |
| 1.4 Add `deleteOldPageViews()` | Task 6 |
| 1.5 Documentation truth pass | Task 7 |
| 1.6 `docs/PRIVACY.md` | Task 8 |
| Publish 0.3.0 | Task 9 |
| Testing (unit only, DB-free, guarded) | Tasks 1-3 |

Part 2 of the spec (the dashboard) is covered by a separate plan.

**Deliberate divergences from the spec, both flagged in-task:**
1. `deleteOldPageViews(olderThan, siteId?)` takes an optional siteId rather than mirroring `deleteOldErrors(siteId, olderThan)`, because the retention cron sweeps all sites.
2. Task 2 adds a small behaviour-preserving refactor the spec did not name, extracting `computeVisitorIds`, because the privacy-critical logic was otherwise untestable without a database — which the testing constraint forbids.

**Type consistency:** `SiteSummary` is defined in Task 5 and consumed by the dashboard plan's site switcher. `VisitorInfo` in Task 2 is the existing type from `src/types.ts`, unchanged. `deleteOldPageViews` returns `number` in both its definition and its cron caller.
