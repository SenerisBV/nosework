# nosework: self-sufficiency + stats.seneris.nl dashboard

**Date:** 2026-08-29
**Status:** Approved design, not yet implemented
**Repos affected:** `nosework` (existing), `stats.seneris.nl` (new)

---

## Why this exists

The trigger was frustration with Plausible. Plausible is the analytics tool
whose values line up with ours — EU-hosted, cookieless, no banner, city-level
geography — but its Growth plan caps you at **3 sites**, and the jump to 50
sites means moving to Business. Paying a subscription to be told how many of
my own domains I'm allowed to measure is the wrong shape of deal for a person
running a suite of small projects, most of which will never see meaningful
traffic.

The realisation that opened this up: **nosework already does everything
Plausible does that we care about.** It was written earlier and then
half-forgotten. It has cookieless daily-salt visitor hashing, city-level geo
via Vercel's free request headers, and a complete query API. What it does not
have is a dashboard — and, less obviously, it does not have the ability to
create its own database tables, because it was built assuming a now-deprecated
host application (MoopySuite) owned the schema.

So this is not a rewrite. It is finishing something that was 80% done and then
orphaned when its host went away.

### The constraints that actually matter

These are hard requirements, not preferences:

1. **$0.** Everything runs on free tiers — Vercel Hobby, Neon free. Traffic
   across these sites will not plausibly generate cost. If a design decision
   introduces a paid dependency, it is the wrong decision.
2. **No cookie banner, ever.** This is the whole point. Any feature that would
   require a consent gate on a tracked site is out of scope by definition, not
   subject to trade-off. This is why error tracking was cut from v1 scope.
3. **Unlimited sites.** The thing Plausible wouldn't give us. Multi-site is not
   a "later" feature; it is the reason for the project.
4. **EU data residency.** Part of why Plausible was preferred over Fathom in
   the first place. Confirmed satisfied: the Neon project is in
   `eu-central-1` (Frankfurt).

---

## Goals

- nosework can create and migrate its own database, with no host application.
- A password-protected dashboard at `stats.seneris.nl` showing page and session
  analytics across all tracked sites.
- Documentation precise enough that a site's privacy page can quote it directly
  and be accurate.

## Non-goals (explicitly deferred)

- **Error tracking in the dashboard.** The code exists in nosework and stays
  there, unused by v1.
- **LLM analytics** (`@seneris/nosework-llm`). Out of scope entirely.
- **Pushing in-memory aggregations into SQL.** Several query functions pull all
  matching rows into JS. At our traffic this is irrelevant. Noted, not fixed.
- **Integration tests.** See Testing.
- **Any user-facing multi-tenancy.** One operator, one password.

---

## Part 1: nosework changes

### 1.1 Own the migrations (the actual blocker)

`CLAUDE.md` currently says *"Database migrations are managed by MoopySuite."*
There is no `drizzle-kit` dependency, no `drizzle.config.ts`, and no SQL
anywhere in the repo. Nothing here can create its own tables. This is the one
change without which nothing else is possible.

- Add `drizzle-kit` as a devDependency.
- Add `drizzle.config.ts` pointing at `src/schema.ts`, output `./drizzle`.
- Generate the initial migration from the existing schema and commit the SQL.
- Add scripts: `db:generate` (drizzle-kit generate) and `db:migrate`
  (drizzle-kit migrate).

**Use `generate` + `migrate`. Never `drizzle-kit push`.** This is the direct
analogue of the standing rule against `prisma db push`: pushing mutates the
database without recording a versioned migration, so the schema and its history
drift apart, and the drift is only discovered later when it blocks a real
migration. Versioned SQL files in git, always.

### 1.2 Delete `prisma/schema.prisma`

It is a dead artifact from an earlier design and it **contradicts the live
schema**. It declares a `Site` model with foreign-key relations; the real
Drizzle schema in `src/schema.ts` has no sites table at all and treats `siteId`
as a bare text column. Several docs still describe Prisma as if it were live.

Leaving two disagreeing schema definitions in one repo is how someone — most
likely us, months from now — migrates the wrong one.

### 1.3 Add `listSites()`

`CLAUDE.md` and the README both document `getOrCreateSite()` and `listSites()`
under "Site Management". Neither exists in the source. Since there is no sites
table, the honest implementation derives the list from the data:

```
SELECT "siteId", COUNT(*) AS views, MAX("timestamp") AS lastSeen
FROM page_views GROUP BY "siteId" ORDER BY views DESC
```

This is what the dashboard's site switcher reads. `getOrCreateSite()` is *not*
implemented — it describes a table that does not exist. Remove it from the docs
rather than building a table to justify a docstring.

### 1.4 Add `deleteOldPageViews()`

`deleteOldErrors()` already exists; there is no equivalent for page views, so
data currently accumulates forever. A stated retention period in a privacy
document is only true if something enforces it. Mirror the existing function's
shape, taking a cutoff date.

### 1.5 Documentation truth pass

Remove from `CLAUDE.md`, `README.md`, `PROJECT_STATE.md`, and delete
`MOOPYSUITE_INTEGRATION.md`:

- All references to MoopySuite owning the database or migrations.
- The `MOOPY_CLIENT_ID`-as-siteId convention. **The coupling is documentation
  only** — `trackPageView()` takes a plain `siteId: string`, so nothing in the
  code needs to change. `ANALYTICS_SITE_ID` becomes the sole convention.
- All references to Prisma.
- `getOrCreateSite()`.

Bump to `0.3.0` and republish to npm.

### 1.6 `docs/PRIVACY.md` — the legal-page source of truth

This is a deliverable in its own right, not documentation of the code. It has
to be precise enough that a privacy page can quote it and be *correct*, because
the whole no-banner position rests on these specifics being true.

Contents:

**What is stored, per page view.** Field by field, from `src/schema.ts`: site
id, full URL, pathname, cleaned referrer (origin + path, query string
stripped), visitor hash, session id, country / country code / region / city,
browser + major version, OS + major version, device class, bot flag, timestamp.

**What is never stored.** No cookies. No localStorage or any client-side
storage. No raw IP address. No raw user-agent string. No cross-site identifier.
No device fingerprint. No advertising identifier.

**How visitors are counted without cookies.** A random 32-byte salt is
generated once per UTC day and held in `daily_salts`. A visitor is identified
as `sha256(ip | user-agent | daily_salt)`, truncated to 16 hex characters. The
IP is used only as hash input and is never written to disk. The hash cannot be
reversed to an IP, and because the salt changes at UTC midnight, the same
person visiting on two days produces two unrelated identifiers — there is no
way to link them. Salts older than 7 days are deleted, after which even a
compromised database cannot re-derive an old day's hashes.

**Sessions.** A session id is the visitor hash plus a 30-minute time bucket. It
is inferred arithmetically, not stored on the device.

**Retention.** 24 months, enforced by `deleteOldPageViews()` on a daily cron.
Explain the reasoning: salts are destroyed after 7 days, so beyond a week the
retained rows are anonymous statistics rather than personal data.

**Legal basis.** Processing rests on legitimate interest, GDPR Art. 6(1)(f):
understanding aggregate traffic to a site one operates. No consent gate is
required under ePrivacy Art. 5(3) because that article governs *storing
information on, or gaining access to information stored on,* a user's terminal
equipment — and nosework does neither. Nothing is written to the device and
nothing is read from it. This is the same basis Plausible and Fathom rely on.

**Sub-processors.** Vercel (hosting; performs the IP-to-city lookup at the edge
and passes the result as request headers), functions pinned to `fra1`
(Frankfurt). Neon (database), project in `eu-central-1` (Frankfurt). All
processing and storage occurs within the EU.

**A quotable paragraph.** Plain English, no jargon, ready to paste onto a site's
privacy page. This is the part that gets used most and should be written last,
once the rest is accurate.

---

## Part 2: `stats.seneris.nl`

A new Next.js 16 App Router project in `~/projects/stats.seneris.nl`, its own
git repo, its own Vercel project, deployed to `stats.seneris.nl`.

Standalone rather than a route inside `seneris.nl` because the dashboard reads
*all* sites — burying it inside one tracked site's codebase would couple it to
an app it has no relationship with, and require a subdomain rewrite to reach
its own URL.

**The dashboard does not track itself.** No nosework client component, no
tracking endpoint. It would pollute the data it exists to display.

### 2.1 Data flow

Server Components call nosework's query functions directly. No API routes: RSC
runs on the server, can reach Postgres, and there is exactly one reader. An HTTP
layer here would be ceremony with no beneficiary.

All state lives in the URL — `?site=<siteId>&range=7d` — so views are
bookmarkable, shareable, and server-rendered with no client state machine. The
site switcher and range picker are plain links.

One page. All queries fire in a single `Promise.all`:

| Section | Functions |
|---|---|
| Headline stats | `getStats` |
| Traffic over time | `getTimeSeries` |
| Top pages | `getTopPages` |
| Locations (country → region → city) | `getLocations` |
| Referrers | `getReferrers` |
| Devices / browsers / OS | `getDevices` |
| Session summary | `getSessionStats` |
| Entry & exit pages | `getEntryPages`, `getExitPages` |
| Page flows | `getPageFlows` |

Ranges: today, 7d, 30d, 90d. Note that `getTimeSeries` **only returns buckets
that contain data** — the chart must zero-fill gaps itself or it will silently
compress quiet days.

### 2.2 Auth

`DASHBOARD_PASSWORD` in env, as requested, with one upgrade over holding it
raw in a cookie:

- `/login` renders a single password field posting to a Server Action.
- Compare with `crypto.timingSafeEqual` against the env value.
- On success set an httpOnly, secure, sameSite=lax cookie containing an
  **HMAC-signed expiry token** (signed with `DASHBOARD_SECRET`), not the
  password.
- Middleware guards every route except `/login`.

Roughly forty lines. Preferred over HTTP Basic, which has no logout and
retransmits the password on every request. Vercel's built-in deployment
password protection would be simpler still but is a paid feature, and $0 is a
hard constraint.

**This cookie does not create a banner obligation.** ePrivacy Art. 5(3)
exempts storage strictly necessary to provide a service the user explicitly
requested; a login session is the canonical example. It is also set on a
different domain from any tracked site, for a single user.

### 2.3 UI

shadcn/ui on Tailwind v4, per standing preference. Load the `dataviz` skill
before writing the time-series chart rather than improvising one.

Design intent: this is an instrument panel for one person, not a product
surface. Dense, quiet, legible at a glance. Numbers first.

### 2.4 Cron

`cleanupOldSalts()` already exists in nosework but **nothing has ever called
it**, so salts would accumulate indefinitely — which quietly weakens the
"identity resets daily and cannot be re-derived" claim the privacy document
depends on.

Two Vercel cron routes on the dashboard project, both password-independent and
guarded by `CRON_SECRET`:

- daily — `cleanupOldSalts()`
- daily — `deleteOldPageViews()` at the retention cutoff

Hobby permits up to 100 cron jobs per project, but each may run **at most once
per day**, with ±59 minutes of scheduling imprecision. Both jobs are idempotent
cleanup sweeps against a cutoff date, so neither the daily cap nor the loose
timing matters here.

---

## Testing

nosework has no tests today. The standing rule on test/database isolation is
absolute and this is exactly the scenario it warns about: a shared
`ANALYTICS_DATABASE_URL` inherited from `.env` by a test runner.

**v1 adds unit tests only, all DB-free:**

- `isBot()` — known bots, known browsers, empty UA
- `extractPathname()` — absolute, relative, malformed
- `formatDateKey()` — hour/day/week/month bucketing, month boundaries
- `parseUserAgent()` — device classification, major-version truncation
- Visitor hashing — determinism for identical input, divergence across salts

There is no path by which these touch a database, so there is no risk to live
data.

**If integration tests are ever wanted**, the first step is a dedicated
`nosework_test` Postgres database, `.env.test`, and a test script pinned to it
— created *before* the first integration test is written, not retrofitted.

---

## Operational notes

- **Connection pooling.** `postgres(connectionString)` defaults to a pool of 10
  per instance. Behind Vercel functions on Neon's free tier, use the `-pooler`
  connection string, and set `max: 1` on the dashboard's client.
- **Function region.** Pin the dashboard's Vercel functions to `fra1`, matching
  the Neon project's `eu-central-1` for both residency and latency.
- **Timestamps are `timestamp without time zone`**, so all day-bucketing is
  implicitly UTC. Acceptable, but the dashboard should not label a UTC bucket
  "today" without acknowledging it may not match Amsterdam local time.
- **Bot filtering happens at query time, not insert time** — `isBot = false` is
  a WHERE clause, so bot rows still accumulate. Fine, and it means
  reclassification is retroactive if the pattern list is updated.
- **The bot list is a hardcoded January 2025 snapshot.** `isBot()` returns
  `true` for a missing user-agent, and queries exclude bots, so misclassification
  *drops* real traffic rather than inflating counts. Safe direction, but expect
  to undercount slightly.

---

## Resolved decisions

1. **Neon region: `eu-central-1` (Frankfurt).** Confirmed. EU residency holds,
   and `PRIVACY.md` can state it plainly rather than hedging. Pin the
   dashboard's Vercel functions to `fra1` to match.

2. **Retention: 24 months.**

   The only genuine use for aged analytics data is year-over-year comparison,
   and that requires more than twelve months — a 12-month window deletes last
   August precisely as this August becomes worth comparing against.

   The storage-limitation principle (GDPR Art. 5(1)(e)) is satisfied for a
   reason specific to this design: **daily salts are destroyed after 7 days.**
   Once a day's salt is gone, its visitor hashes cannot be linked back to an IP
   by anyone, operator included — reversal would require brute-forcing against
   a salt that no longer exists. Beyond one week, what is retained is anonymous
   aggregate statistics, not personal data, and the retention principle applies
   far more weakly.

   That argument is only true if `cleanupOldSalts()` actually runs on a
   schedule. It never has. This is why the cron in §2.4 is load-bearing for the
   privacy position rather than mere housekeeping — if it silently fails, the
   justification for 24-month retention fails with it.

---

## Sequencing

1. nosework: drizzle-kit, migrations, delete Prisma artifact
2. nosework: `listSites()`, `deleteOldPageViews()`, unit tests
3. nosework: documentation pass + `PRIVACY.md`
4. nosework: publish 0.3.0
5. Dashboard: scaffold, auth, migrations applied against Neon
6. Dashboard: query wiring and UI
7. Dashboard: crons, domain, deploy
