# stats.seneris.nl Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password-protected, multi-site analytics dashboard at `stats.seneris.nl` showing page and session analytics from the shared nosework database.

**Architecture:** A standalone Next.js 16 App Router project with its own git repo and Vercel project. Server Components call `@seneris/nosework`'s query functions directly against Neon — no API layer, because RSC already runs on the server and there is exactly one reader. All view state lives in URL search params, so every view is bookmarkable and server-rendered with no client state machine. Auth is a single password in env exchanged for an HMAC-signed cookie; protected pages sit in a route group whose layout verifies it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, `@seneris/nosework@^0.3.0`, Bun, Vercel Hobby (`fra1`), Neon Postgres (`eu-central-1`).

**Spec:** `docs/superpowers/specs/2026-08-29-nosework-dashboard-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-29-nosework-self-sufficiency.md` must be complete and `@seneris/nosework@0.3.0` published before Task 1.

## Global Constraints

- **$0.** Vercel Hobby and Neon free tier only. No paid feature may become load-bearing — this rules out Vercel's built-in deployment password protection, which is why auth is hand-rolled.
- **No cookie banner, ever.** The dashboard does **not** track itself: no nosework client component, no tracking endpoint. The auth cookie is exempt under ePrivacy Art. 5(3) as strictly necessary for a service the user explicitly requested.
- **Region is `fra1`**, matching Neon's `eu-central-1`, for both EU residency and latency.
- **Database connection uses Neon's pooled (`-pooler`) connection string** with `max: 1`, because `postgres()` otherwise opens a pool of 10 per function instance.
- **Retention is 24 months.** Salts are cleaned after 7 days.
- **Package manager is `bun`.**
- **Timestamps are UTC.** `timestamp without time zone` columns mean every bucket is a UTC day. Never label a bucket "today" without acknowledging it may not match Amsterdam local time.
- **`getTimeSeries()` returns only buckets that contain data.** Gaps must be zero-filled client-side or quiet days silently vanish from charts.

---

### Task 1: Scaffold the project

**Files:**
- Create: `~/projects/stats.seneris.nl/` (whole project via scaffolding)
- Create: `.env.local`
- Modify: `next.config.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `@seneris/nosework@^0.3.0`
- Produces: a running dev server at `localhost:3000`

- [ ] **Step 1: Scaffold with the official tool**

```bash
cd ~/projects && bunx create-next-app@latest stats.seneris.nl \
  --typescript --tailwind --app --no-src-dir --use-bun --eslint
```

- [ ] **Step 2: Initialise shadcn/ui and add the components used later**

```bash
cd ~/projects/stats.seneris.nl && bunx shadcn@latest init
bunx shadcn@latest add card table button input select chart badge
```

- [ ] **Step 3: Install nosework**

```bash
cd ~/projects/stats.seneris.nl && bun add @seneris/nosework@^0.3.0
```

Verify it resolves to 0.3.0 and exports what this plan needs:

```bash
grep -c "listSites\|deleteOldPageViews" node_modules/@seneris/nosework/dist/index.d.ts
```

Expected: `2` or higher. If `0`, the nosework plan's Task 9 did not publish correctly — stop and fix that first.

- [ ] **Step 4: Write `.env.local`**

```bash
ANALYTICS_DATABASE_URL="<neon eu-central-1 POOLED connection string, host contains -pooler>"
DASHBOARD_PASSWORD="<choose one>"
DASHBOARD_SECRET="<output of: openssl rand -hex 32>"
CRON_SECRET="<output of: openssl rand -hex 32>"
```

Confirm `.env.local` is in `.gitignore` — `create-next-app` adds it, but verify:

```bash
grep -n ".env" .gitignore
```

- [ ] **Step 5: Pin the region**

Create `vercel.json`:

```json
{
  "regions": ["fra1"]
}
```

- [ ] **Step 6: Strip the boilerplate homepage**

Replace `app/page.tsx` with a placeholder that proves the DB connection works:

```tsx
import { listSites } from "@seneris/nosework";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sites = await listSites();
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">nosework</h1>
      <pre className="mt-4 text-sm">{JSON.stringify(sites, null, 2)}</pre>
    </main>
  );
}
```

- [ ] **Step 7: Verify end to end**

```bash
cd ~/projects/stats.seneris.nl && bun dev
```

Open `localhost:3000`. Expected: a JSON array of tracked sites. An empty array `[]` is a valid pass — it means the connection works and no site has reported yet.

If it throws `ANALYTICS_DATABASE_URL environment variable is not set`, the env file was not picked up. If it throws a connection error, check the connection string is the **pooled** one.

- [ ] **Step 8: Commit**

```bash
cd ~/projects/stats.seneris.nl && git init && git add -A
git commit -m "feat: scaffold dashboard with nosework wired to Neon"
```

---

### Task 2: Auth primitives

Pure, testable functions first. No UI yet.

**Files:**
- Create: `lib/auth.ts`
- Create: `test/auth.test.ts`
- Modify: `package.json` (test script)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `signToken(expiresAt: number, secret: string): string`
  - `verifyToken(token: string | undefined, secret: string, now?: number): boolean`
  - `passwordMatches(input: string, expected: string): boolean`
  - `SESSION_COOKIE: string` (constant, `"nosework_session"`)

- [ ] **Step 1: Write the failing tests**

Create `test/auth.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { signToken, verifyToken, passwordMatches } from "../lib/auth";

const SECRET = "s".repeat(64);
const OTHER = "x".repeat(64);
const NOW = 1_800_000_000_000;

describe("signToken / verifyToken", () => {
  test("a freshly signed token verifies", () => {
    const t = signToken(NOW + 60_000, SECRET);
    expect(verifyToken(t, SECRET, NOW)).toBe(true);
  });

  test("an expired token does not verify", () => {
    const t = signToken(NOW - 1, SECRET);
    expect(verifyToken(t, SECRET, NOW)).toBe(false);
  });

  test("a token signed with a different secret does not verify", () => {
    const t = signToken(NOW + 60_000, OTHER);
    expect(verifyToken(t, SECRET, NOW)).toBe(false);
  });

  test("a tampered expiry does not verify", () => {
    const t = signToken(NOW + 60_000, SECRET);
    const sig = t.slice(t.lastIndexOf(".") + 1);
    const forged = `${NOW + 999_999_999}.${sig}`;
    expect(verifyToken(forged, SECRET, NOW)).toBe(false);
  });

  test("undefined, empty and malformed tokens do not verify", () => {
    expect(verifyToken(undefined, SECRET, NOW)).toBe(false);
    expect(verifyToken("", SECRET, NOW)).toBe(false);
    expect(verifyToken("garbage", SECRET, NOW)).toBe(false);
    expect(verifyToken("123.zz", SECRET, NOW)).toBe(false);
  });
});

describe("passwordMatches", () => {
  test("accepts the correct password", () => {
    expect(passwordMatches("hunter2", "hunter2")).toBe(true);
  });

  test("rejects a wrong password", () => {
    expect(passwordMatches("hunter3", "hunter2")).toBe(false);
  });

  test("rejects a wrong password of a different length", () => {
    expect(passwordMatches("short", "a-much-longer-password")).toBe(false);
  });

  test("rejects an empty attempt", () => {
    expect(passwordMatches("", "hunter2")).toBe(false);
  });
});
```

- [ ] **Step 2: Add the test script and run to verify failure**

In `package.json` scripts, add `"test": "bun test"`.

Run: `bun test`
Expected: FAIL — `lib/auth` does not exist.

- [ ] **Step 3: Implement**

Create `lib/auth.ts`:

```ts
import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "nosework_session";

/** Session lifetime: 30 days. One operator, one browser — no need to be short. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Token is `<expiresAtMs>.<hmac>`. The cookie carries an expiry the server
 * signed, never the password itself — so a stolen cookie cannot be turned
 * back into the password, and its expiry cannot be extended by editing it.
 */
export function signToken(expiresAt: number, secret: string): string {
  const payload = String(expiresAt);
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now()
): boolean {
  if (!token) return false;

  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;

  const payload = token.slice(0, idx);
  const provided = token.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // Hex-decode both before comparing so timingSafeEqual gets equal-length
  // buffers; a malformed hex string yields a short buffer and fails the
  // length check rather than throwing.
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  if (!timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * Constant-time password comparison. Both sides are hashed first so the
 * comparison length is fixed and the attempt's length is not leaked by timing.
 */
export function passwordMatches(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts test/auth.test.ts package.json
git commit -m "feat: add signed-cookie auth primitives with unit tests"
```

---

### Task 3: Login page and route protection

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/(dashboard)/layout.tsx`
- Move: `app/page.tsx` → `app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `signToken`, `verifyToken`, `passwordMatches`, `SESSION_COOKIE`, `SESSION_TTL_MS` from Task 2
- Produces: every route under `app/(dashboard)/` requires a valid session cookie

Route protection lives in the route group's layout, a Server Component, rather than in middleware. Middleware's runtime story around Node's `crypto` is an unnecessary risk when a layout gives full Node semantics for free.

- [ ] **Step 1: Write the Server Action**

Create `app/login/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_MS, passwordMatches, signToken } from "@/lib/auth";

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SECRET;

  if (!expected || !secret) {
    return "Server is missing DASHBOARD_PASSWORD or DASHBOARD_SECRET.";
  }

  if (!passwordMatches(password, expected)) {
    return "Incorrect password.";
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const store = await cookies();
  store.set(SESSION_COOKIE, signToken(expiresAt, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  redirect("/");
}
```

- [ ] **Step 2: Write the login page**

Create `app/login/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, null);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form action={formAction} className="w-full max-w-xs space-y-3">
        <h1 className="text-sm font-medium text-muted-foreground">nosework</h1>
        <Input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          required
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write the protected layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const secret = process.env.DASHBOARD_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!secret || !verifyToken(token, secret)) {
    redirect("/login");
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Move the page into the protected group**

```bash
cd ~/projects/stats.seneris.nl && mkdir -p "app/(dashboard)" && git mv app/page.tsx "app/(dashboard)/page.tsx"
```

- [ ] **Step 5: Verify protection manually**

```bash
bun dev
```

Check each of these:
1. Visit `localhost:3000` in a fresh private window → redirected to `/login`.
2. Submit a wrong password → "Incorrect password.", still on `/login`.
3. Submit the correct password → redirected to `/`, site JSON renders.
4. Reload `/` → still authenticated.
5. Delete the `nosework_session` cookie in devtools and reload → redirected to `/login`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: password login with signed session cookie and protected route group"
```

---

### Task 4: URL state — site switcher and date range

**Files:**
- Create: `lib/range.ts`
- Create: `test/range.test.ts`
- Create: `components/site-switcher.tsx`
- Create: `components/range-picker.tsx`
- Modify: `app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `listSites`, `SiteSummary` from `@seneris/nosework`
- Produces:
  - `RANGES: readonly ["today", "7d", "30d", "90d"]`
  - `type RangeKey = (typeof RANGES)[number]`
  - `parseRange(value: string | undefined): RangeKey`
  - `rangeToDates(range: RangeKey, now: Date): { startDate: Date; endDate: Date }`
  - `rangeLabel(range: RangeKey): string`

- [ ] **Step 1: Write the failing tests**

Create `test/range.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseRange, rangeToDates, rangeLabel } from "../lib/range";

const NOW = new Date("2026-08-29T14:30:00.000Z");

describe("parseRange", () => {
  test("accepts every known range", () => {
    expect(parseRange("today")).toBe("today");
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("90d")).toBe("90d");
  });

  test("falls back to 7d for unknown or missing values", () => {
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("")).toBe("7d");
    expect(parseRange("all-time")).toBe("7d");
    expect(parseRange("../../etc/passwd")).toBe("7d");
  });
});

describe("rangeToDates", () => {
  test("today starts at UTC midnight", () => {
    const { startDate, endDate } = rangeToDates("today", NOW);
    expect(startDate.toISOString()).toBe("2026-08-29T00:00:00.000Z");
    expect(endDate).toEqual(NOW);
  });

  test("7d spans seven UTC days including today", () => {
    const { startDate } = rangeToDates("7d", NOW);
    expect(startDate.toISOString()).toBe("2026-08-23T00:00:00.000Z");
  });

  test("30d and 90d go back the right number of days", () => {
    expect(rangeToDates("30d", NOW).startDate.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(rangeToDates("90d", NOW).startDate.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  test("endDate is always now", () => {
    for (const r of ["today", "7d", "30d", "90d"] as const) {
      expect(rangeToDates(r, NOW).endDate).toEqual(NOW);
    }
  });
});

describe("rangeLabel", () => {
  test("labels acknowledge UTC", () => {
    expect(rangeLabel("today")).toContain("UTC");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/range.test.ts`
Expected: FAIL — `lib/range` does not exist.

- [ ] **Step 3: Implement**

Create `lib/range.ts`:

```ts
export const RANGES = ["today", "7d", "30d", "90d"] as const;
export type RangeKey = (typeof RANGES)[number];

const DAYS: Record<RangeKey, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export function parseRange(value: string | undefined): RangeKey {
  return RANGES.includes(value as RangeKey) ? (value as RangeKey) : "7d";
}

/**
 * All buckets are UTC days, because page_views.timestamp is
 * `timestamp without time zone`. "Today" therefore means the current UTC day,
 * which is not the Amsterdam day — the labels say so explicitly.
 */
export function rangeToDates(
  range: RangeKey,
  now: Date = new Date()
): { startDate: Date; endDate: Date } {
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  startDate.setUTCDate(startDate.getUTCDate() - (DAYS[range] - 1));
  return { startDate, endDate: now };
}

export function rangeLabel(range: RangeKey): string {
  switch (range) {
    case "today":
      return "Today (UTC)";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Build the pickers as links**

Create `components/range-picker.tsx`:

```tsx
import Link from "next/link";
import { RANGES, rangeLabel, type RangeKey } from "@/lib/range";

export function RangePicker({ site, active }: { site: string; active: RangeKey }) {
  return (
    <nav className="flex gap-1">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/?site=${encodeURIComponent(site)}&range=${r}`}
          className={
            r === active
              ? "rounded bg-foreground px-2 py-1 text-xs text-background"
              : "rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          }
        >
          {rangeLabel(r)}
        </Link>
      ))}
    </nav>
  );
}
```

Create `components/site-switcher.tsx`:

```tsx
import Link from "next/link";
import type { SiteSummary } from "@seneris/nosework";
import type { RangeKey } from "@/lib/range";

export function SiteSwitcher({
  sites,
  active,
  range,
}: {
  sites: SiteSummary[];
  active: string;
  range: RangeKey;
}) {
  return (
    <nav className="flex flex-wrap gap-1">
      {sites.map((s) => (
        <Link
          key={s.siteId}
          href={`/?site=${encodeURIComponent(s.siteId)}&range=${range}`}
          className={
            s.siteId === active
              ? "rounded bg-foreground px-2 py-1 text-xs text-background"
              : "rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          }
        >
          {s.siteId}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 6: Wire the page shell**

Replace `app/(dashboard)/page.tsx`:

```tsx
import { listSites } from "@seneris/nosework";
import { SiteSwitcher } from "@/components/site-switcher";
import { RangePicker } from "@/components/range-picker";
import { parseRange, rangeToDates } from "@/lib/range";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const params = await searchParams;
  const sites = await listSites();

  if (sites.length === 0) {
    return (
      <main className="p-8">
        <p className="text-sm text-muted-foreground">
          No sites have reported yet. Once an app sends its first page view it
          will appear here automatically.
        </p>
      </main>
    );
  }

  const range = parseRange(params.range);
  const site = sites.find((s) => s.siteId === params.site)?.siteId ?? sites[0]!.siteId;
  const { startDate, endDate } = rangeToDates(range);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <SiteSwitcher sites={sites} active={site} range={range} />
        <RangePicker site={site} active={range} />
      </header>
      <pre className="text-xs text-muted-foreground">
        {JSON.stringify({ site, range, startDate, endDate }, null, 2)}
      </pre>
    </main>
  );
}
```

Note the `?? sites[0]!.siteId` fallback: an unknown or absent `?site=` resolves to the busiest site rather than erroring, so hand-edited URLs degrade gracefully.

- [ ] **Step 7: Verify**

Run `bun dev`, sign in, and confirm: switching sites and ranges updates the URL and the echoed JSON; an invalid `?range=nonsense` falls back to 7d; an invalid `?site=nonsense` falls back to the first site.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: URL-driven site switcher and date range picker"
```

---

### Task 5: Headline stats and the traffic chart

**Files:**
- Create: `lib/timeseries.ts`
- Create: `test/timeseries.test.ts`
- Create: `components/stat-tiles.tsx`
- Create: `components/traffic-chart.tsx`
- Modify: `app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `getStats`, `getTimeSeries`, `TimeSeriesDataPoint` from `@seneris/nosework`; `rangeToDates` from Task 4
- Produces: `zeroFillDays(points: TimeSeriesDataPoint[], startDate: Date, endDate: Date): TimeSeriesDataPoint[]`

**Before writing the chart, load the `dataviz` skill.** It sets the palette, axis, and mark conventions — do not improvise chart styling.

- [ ] **Step 1: Write the failing zero-fill tests**

`getTimeSeries()` only returns buckets that contain data. Without zero-filling, a quiet Tuesday is not drawn as zero — it vanishes, and the chart silently compresses the timeline.

Create `test/timeseries.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { zeroFillDays } from "../lib/timeseries";

const start = new Date("2026-08-24T00:00:00.000Z");
const end = new Date("2026-08-28T12:00:00.000Z");

describe("zeroFillDays", () => {
  test("inserts zero rows for days with no data", () => {
    const filled = zeroFillDays(
      [
        { date: "2026-08-24", pageViews: 5, visitors: 3 },
        { date: "2026-08-27", pageViews: 2, visitors: 2 },
      ],
      start,
      end
    );
    expect(filled.map((p) => p.date)).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
    expect(filled[1]).toEqual({ date: "2026-08-25", pageViews: 0, visitors: 0 });
  });

  test("returns all zeros when there is no data at all", () => {
    const filled = zeroFillDays([], start, end);
    expect(filled).toHaveLength(5);
    expect(filled.every((p) => p.pageViews === 0 && p.visitors === 0)).toBe(true);
  });

  test("preserves existing values exactly", () => {
    const filled = zeroFillDays(
      [{ date: "2026-08-26", pageViews: 41, visitors: 12 }],
      start,
      end
    );
    expect(filled.find((p) => p.date === "2026-08-26")).toEqual({
      date: "2026-08-26",
      pageViews: 41,
      visitors: 12,
    });
  });

  test("output is chronologically ordered", () => {
    const filled = zeroFillDays(
      [
        { date: "2026-08-27", pageViews: 1, visitors: 1 },
        { date: "2026-08-25", pageViews: 1, visitors: 1 },
      ],
      start,
      end
    );
    const dates = filled.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  test("a single-day range yields exactly one bucket", () => {
    const d = new Date("2026-08-29T00:00:00.000Z");
    expect(zeroFillDays([], d, new Date("2026-08-29T23:00:00.000Z"))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/timeseries.test.ts`
Expected: FAIL — `lib/timeseries` does not exist.

- [ ] **Step 3: Implement**

Create `lib/timeseries.ts`:

```ts
import type { TimeSeriesDataPoint } from "@seneris/nosework";

/**
 * getTimeSeries() returns only buckets that contain data, so a day with no
 * traffic is absent rather than zero. Plotted directly, the chart would skip
 * quiet days and misrepresent the timeline. Fill the gaps.
 */
export function zeroFillDays(
  points: TimeSeriesDataPoint[],
  startDate: Date,
  endDate: Date
): TimeSeriesDataPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const out: TimeSeriesDataPoint[] = [];

  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  );
  const last = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  );

  while (cursor.getTime() <= last) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, pageViews: 0, visitors: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Build the stat tiles**

Create `components/stat-tiles.tsx` rendering four figures from `getStats()`: visitors, page views, sessions, bounce rate. Follow the `dataviz` skill's stat-tile guidance — large figure, small label beneath, no decorative chrome. Bounce rate renders as a percentage to one decimal; the others as locale-formatted integers.

- [ ] **Step 6: Build the chart**

Create `components/traffic-chart.tsx` as a client component using shadcn's `chart` wrapper over Recharts. Two series — page views and visitors — over the zero-filled daily buckets. Follow the `dataviz` skill for palette and axis treatment.

- [ ] **Step 7: Wire into the page**

In `app/(dashboard)/page.tsx`, replace the echoed JSON with a `Promise.all` over `getStats` and `getTimeSeries`, pass the result through `zeroFillDays`, and render the tiles above the chart:

```tsx
const [stats, series] = await Promise.all([
  getStats({ siteId: site, startDate, endDate }),
  getTimeSeries({ siteId: site, startDate, endDate, interval: "day" }),
]);
const filled = zeroFillDays(series, startDate, endDate);
```

- [ ] **Step 8: Verify**

Run `bun dev`. Confirm the tiles show plausible numbers and the chart draws one point per day across the whole range, including days with zero traffic. Switch to a 90d range and confirm 90 buckets.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: headline stats and zero-filled traffic chart"
```

---

### Task 6: Breakdown tables

**Files:**
- Create: `components/breakdown-table.tsx`
- Modify: `app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `getTopPages`, `getLocations`, `getReferrers`, `getDevices` from `@seneris/nosework`
- Produces: `BreakdownTable`, a presentational component taking `{ title: string; rows: { label: string; views: number; visitors: number }[] }`

- [ ] **Step 1: Write the shared component**

Create `components/breakdown-table.tsx`. One reusable table rather than four bespoke ones — every breakdown has the same shape (a label, a view count, a visitor count). Render a `Card` with the title, then rows sorted by views descending, each with a subtle proportional bar behind the label so relative weight reads at a glance. Show "None" for a null label (direct traffic in referrers, unknown geography in locations).

- [ ] **Step 2: Map each query's rows to the shared shape**

In `app/(dashboard)/page.tsx`, extend the `Promise.all` and map each result:

- **Top pages** → `label: pathname`
- **Locations** → `label: [city, country].filter(Boolean).join(", ")`, falling back to `"Unknown"` when both are null
- **Referrers** → `label: referrer ?? "Direct"`
- **Devices** → `label: [browser, os, device].filter(Boolean).join(" · ")`

- [ ] **Step 3: Lay out the grid**

Two columns on desktop, one on mobile. Wide content scrolls inside its own container — the page body must never scroll horizontally.

- [ ] **Step 4: Verify**

Run `bun dev`. Confirm all four tables populate, that a site with no referrers shows "Direct" rather than a blank row, and that the layout does not overflow on a narrow viewport.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: top pages, locations, referrers and devices breakdowns"
```

---

### Task 7: Session analytics

**Files:**
- Create: `components/session-panel.tsx`
- Modify: `app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `getSessionStats`, `getEntryPages`, `getExitPages`, `getPageFlows` from `@seneris/nosework`; `BreakdownTable` from Task 6

- [ ] **Step 1: Render the session summary**

Create `components/session-panel.tsx` showing the four figures from `getSessionStats()`: total sessions, average duration, average pages per session, bounce rate. Format duration as `Xm Ys` rather than raw seconds.

Note that nosework computes `avgDuration` by dividing total duration by *all* sessions while contributing zero duration for single-page sessions — so bounces drag the average down. Label it "Avg. session duration" and leave the behaviour alone; changing the calculation is out of scope.

- [ ] **Step 2: Reuse `BreakdownTable` for entry and exit pages**

`getEntryPages()` and `getExitPages()` return `{ pathname, count, percentage }`. Map to the shared shape with `label: pathname` and `views: count`. Pass the percentage through for display.

- [ ] **Step 3: Render page flows**

`getPageFlows()` returns `{ path: string[], count, percentage }`. Render each as its path joined with `→`, count alongside. Truncate to the top 10.

- [ ] **Step 4: Extend the page's `Promise.all`**

All four session queries join the existing parallel fetch. Do not add a second sequential await — the whole page is one round of parallel queries.

- [ ] **Step 5: Verify**

Run `bun dev`. On a site with little traffic most of these will be thin or empty; confirm they render empty states rather than crashing on zero rows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: session analytics panel with entry/exit pages and flows"
```

---

### Task 8: Retention and salt-cleanup crons

`cleanupOldSalts()` has existed in nosework since the beginning and has **never been called**. The 24-month retention justification depends on it: salts must be destroyed after 7 days for aged rows to count as anonymous. If this job silently fails, the privacy position weakens with it.

**Files:**
- Create: `app/api/cron/cleanup-salts/route.ts`
- Create: `app/api/cron/retention/route.ts`
- Create: `lib/cron.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `cleanupOldSalts`, `deleteOldPageViews` from `@seneris/nosework`
- Produces: two authenticated GET endpoints

- [ ] **Step 1: Write the shared guard**

Create `lib/cron.ts`:

```ts
import { timingSafeEqual, createHash } from "crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. These routes sit
 * outside the (dashboard) route group, so they are not covered by the session
 * layout and must guard themselves.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 2: Write the salt cleanup route**

Create `app/api/cron/cleanup-salts/route.ts`:

```ts
import { cleanupOldSalts } from "@seneris/nosework";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deleted = await cleanupOldSalts();
  return Response.json({ ok: true, deletedSalts: deleted });
}
```

- [ ] **Step 3: Write the retention route**

Create `app/api/cron/retention/route.ts`:

```ts
import { deleteOldPageViews } from "@seneris/nosework";
import { isAuthorizedCron } from "@/lib/cron";

/** Stated retention period. Documented in nosework's docs/PRIVACY.md. */
const RETENTION_MONTHS = 24;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  // No siteId: sweep every tracked site.
  const deleted = await deleteOldPageViews(cutoff);
  return Response.json({ ok: true, cutoff: cutoff.toISOString(), deletedPageViews: deleted });
}
```

- [ ] **Step 4: Schedule them**

Update `vercel.json`:

```json
{
  "regions": ["fra1"],
  "crons": [
    { "path": "/api/cron/cleanup-salts", "schedule": "0 3 * * *" },
    { "path": "/api/cron/retention", "schedule": "0 4 * * *" }
  ]
}
```

Hobby allows up to 100 cron jobs but each may run **at most once per day**, with ±59 minutes of imprecision. A more frequent expression fails at deploy time. Both jobs are idempotent sweeps against a cutoff, so loose timing is harmless.

- [ ] **Step 5: Verify the guard locally**

```bash
bun dev
# Expect 401:
curl -i localhost:3000/api/cron/cleanup-salts
# Expect 401:
curl -i -H "Authorization: Bearer wrong" localhost:3000/api/cron/cleanup-salts
# Expect 200 with JSON:
curl -i -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2- | tr -d '\"')" \
  localhost:3000/api/cron/cleanup-salts
```

Expected: 401, 401, then `{"ok":true,"deletedSalts":N}`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: authenticated salt-cleanup and retention cron routes"
```

---

### Task 9: Deploy to stats.seneris.nl

**Files:**
- Modify: none (configuration only)

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd ~/projects/stats.seneris.nl && gh repo create stats.seneris.nl --private --source=. --push
```

- [ ] **Step 2: Link and configure the Vercel project**

```bash
cd ~/projects/stats.seneris.nl && vercel link
```

Then add each secret to Production:

```bash
vercel env add ANALYTICS_DATABASE_URL production
vercel env add DASHBOARD_PASSWORD production
vercel env add DASHBOARD_SECRET production
vercel env add CRON_SECRET production
```

Use the **pooled** Neon connection string. `CRON_SECRET` is read by Vercel Cron automatically — the name is not arbitrary.

- [ ] **Step 3: Deploy**

```bash
vercel --prod
```

- [ ] **Step 4: Attach the domain**

Add `stats.seneris.nl` to the project in the Vercel dashboard, then create the DNS record it specifies at the registrar for `seneris.nl`. Wait for the certificate to issue.

- [ ] **Step 5: Verify production**

1. `https://stats.seneris.nl` in a private window → redirects to `/login`.
2. Wrong password → rejected.
3. Correct password → dashboard renders with real data.
4. Cookie is `Secure` and `HttpOnly` in devtools.
5. `curl -i https://stats.seneris.nl/api/cron/retention` → 401.
6. Vercel dashboard → Settings → Cron Jobs lists both jobs.
7. Vercel dashboard → the deployment's function region reads `fra1`.

- [ ] **Step 6: Confirm the dashboard is not tracking itself**

```bash
cd ~/projects/stats.seneris.nl && grep -rn "trackPageView\|nosework/client" app/ components/ lib/
```

Expected: no output. The dashboard must never appear in its own data.

- [ ] **Step 7: Commit any config drift**

```bash
git add -A && git commit -m "chore: production configuration" || echo "nothing to commit"
git push
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 2. Standalone app, own repo and Vercel project | Tasks 1, 9 |
| 2.1 Data flow, RSC direct queries, URL state | Tasks 4-7 |
| 2.1 Core page analytics | Tasks 5, 6 |
| 2.1 Session analytics | Task 7 |
| 2.1 Zero-fill for `getTimeSeries` gaps | Task 5 |
| 2.2 Auth — signed cookie, timing-safe compare | Tasks 2, 3 |
| 2.3 shadcn/ui, dataviz skill for charts | Tasks 1, 5 |
| 2.4 Crons for salts and retention | Task 8 |
| Dashboard does not track itself | Task 9, Step 6 |
| `fra1` region, pooled connection | Tasks 1, 9 |

**Deliberate divergence from the spec:** the spec says middleware guards every route except `/login`. This plan uses a route-group layout instead. Middleware's runtime semantics around Node's `crypto` are an avoidable risk, and a Server Component layout gives full Node semantics with no configuration. The security property is identical — every protected route verifies the signed cookie before rendering.

**Type consistency:** `RangeKey` is defined in Task 4 and consumed in Tasks 4-7. `TimeSeriesDataPoint` is nosework's exported type, used unchanged in Task 5. `SiteSummary` comes from the nosework plan's Task 5. `BreakdownTable`'s row shape (`{ label, views, visitors }`) is defined in Task 6 and reused in Task 7. `deleteOldPageViews(cutoff)` in Task 8 matches the optional-siteId signature from the nosework plan's Task 6.

**Untested by design:** the query functions themselves (they need a database, which v1 excludes), and React rendering (verified by hand in each task's verification step). Every piece of non-trivial pure logic — auth tokens, range parsing, zero-filling — has unit tests.
