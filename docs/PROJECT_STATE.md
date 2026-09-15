# nosework - Project State

**Last Updated:** 2026-09-15

---

## Current Status: Published, not yet used in anger

`@seneris/nosework` 0.3.0 is on npm. The published tarball has been verified
byte-identical to a build from the tagged commit, README included.

The package has never run against real traffic, and no application currently
imports it.

### Packages

| Package | Status | npm |
|---------|--------|-----|
| `@seneris/nosework` | 0.3.0 published 2026-08-29; **0.4.0 prepared, not yet published** | [npm](https://www.npmjs.com/package/@seneris/nosework) |
| `@seneris/nosework-llm` | ❌ **Does not exist** — never built, never published | — |

> **Correction (2026-09-15).** This table previously claimed both packages were
> published, linking to an npm page for `@seneris/nosework-llm` that returns
> 404. That package has never existed: it is absent from the registry, absent
> from the development machine, and `git log --all --diff-filter=A` finds no
> LLM source ever committed here. Its API design survives in `ROADMAP.md`
> Phase 6 and `INTEGRATION.md` section 8, both now labelled as unbuilt.

---

## Breaking change in 0.3.0: visitor hashes are site-scoped

`computeVisitorIds()` now hashes `${siteId}|${ip}|${userAgent}|${salt}`. Before
0.3.0 the `siteId` was not in the input, and because the daily salt is a single
row for the whole database, the same person on the same day produced a
byte-identical `visitorHash` on every site in a deployment —
`SELECT visitorHash, array_agg(DISTINCT "siteId") FROM page_views GROUP BY
visitorHash` reconstructed a day of that person's cross-site browsing. The
change was made deliberately, on the operator's explicit authorisation, and the
known-answer test in `test/visitor.test.ts` was updated with it.

**Migration: there is nothing to run.** No schema change — `siteId` was already
a column; only what gets hashed moved. And visitor hashes already rotate every
night at UTC midnight, so deploying this is equivalent to one extra rotation.

The only effect: on the day of the deploy, a visitor who appears both before
and after it is counted as two visitors on that site. Session continuity breaks
at the same instant for anyone mid-session. From the next UTC midnight onward
the numbers behave exactly as they always did.

Historical rows keep their old, un-scoped hashes and remain internally
consistent within each day, so queries over past days are unaffected. No
backfill is possible — the hashes are one-way and the old salts are deleted
after 7 days — and none is needed.

---

## What's Working

### Core Analytics (`@seneris/nosework`)

**Tracking:**
- ✅ `trackPageView()` - Full page view tracking with metadata
- ✅ `trackEvent()` - Custom event tracking with properties
- ✅ Visitor hashing (site-scoped, daily rotation, cookieless)
- ✅ Session inference (30-minute windows)
- ✅ Bot detection (comprehensive pattern list)
- ✅ User-Agent parsing (browser, OS, device type)
- ✅ Geo data passthrough (Vercel headers)

**Page Analytics Queries:**
- ✅ `getStats()` - Page views, visitors, sessions, bounce rate
- ✅ `getTopPages()` - Most viewed pages
- ✅ `getLocations()` - Geographic breakdown
- ✅ `getReferrers()` - Traffic sources
- ✅ `getDevices()` - Browser/OS/device breakdown
- ✅ `getTimeSeries()` - Time-based data

**Session Analytics:**
- ✅ `getSessionStats()` - Duration, pages per session, bounce rate
- ✅ `getEntryPages()` - Landing pages
- ✅ `getExitPages()` - Exit pages
- ✅ `getPageFlows()` - User journey paths
- ✅ `getSessions()` - Individual session data

**Error Tracking:**
- ✅ `trackError()` - Server-side error tracking
- ✅ `getErrorStats()` - Error counts and unique errors
- ✅ `getErrorGroups()` - Grouped by fingerprint
- ✅ `getErrorInstances()` - Individual occurrences
- ✅ `updateErrorGroupStatus()` - Resolve/ignore errors
- ✅ `deleteOldErrors()` - Cleanup old data

**Site Management:**
- ✅ `listSites()` - List tracked sites, derived from page-view data (no sites table)
- ✅ `deleteOldPageViews()` - Retention cleanup for page views (omit `siteId` to sweep all sites)

**Client-Side Error Capture (`/client/errors`):**
- ✅ `initErrorTracking()` - Auto-capture unhandled errors
- ✅ `captureError()` - Manual error tracking
- ✅ `stopErrorTracking()` - Cleanup

### Cleanup / retention
- ✅ `cleanupOldSalts()` - Delete salts older than 7 days
- ✅ `deleteOldPageViews()` - Retention cleanup (omit `siteId` to sweep all sites)
- ✅ `deleteOldErrors()` - Clean up old error data

⚠️ **Nothing in this package schedules any of them.** They are exported
functions; an operator has to arrange for them to run. `PRIVACY.md` is explicit
that its 7-day guarantee depends on this, and is the source of truth.

---

## What's Not Done

### Testing
- ✅ Unit tests exist (35 tests across 5 files, all DB-free by design)
- ❌ No integration tests
- ❌ Not tested with real traffic

### Publishing
- ✅ 0.3.0 published to npm
- ⏳ **0.4.0 is prepared in the tree but not published** — `package.json` says
  0.4.0 while the registry still serves 0.3.0. Run the checklist in
  `PUBLISHING.md` to close the gap.
- ✅ Source pushed to `github.com/SenerisBV/nosework`
- ❌ No CI/CD pipeline

### Adoptability
The package is on a public registry, so strangers can install it. Making it
genuinely adoptable is a separate matter, part-done:
- ✅ `LICENSE` file (MIT text, previously only a `package.json` field)
- ✅ `repository`, `homepage`, `bugs` and `author` metadata
- ✅ `configure()` — the database connection is no longer reachable only
  through one hardcoded environment variable
- ⚠️ **The GitHub repository is private.** Anyone evaluating a package that
  handles visitors' IP addresses has to take the privacy claims on faith,
  and the `repository` URL above 404s until this changes.
- ❌ Bot patterns are a hardcoded list of 41 regexes with no way to extend or
  override them, and they are opinionated (`/anthropic/i`, `/openai/i`,
  `/gptbot/i`, `/claudebot/i` all classify as bots)
- ❌ The 30-minute session window is hardcoded. The 7-day salt lifetime is too,
  deliberately — `PRIVACY.md` makes it load-bearing, so exposing it as config
  would mean making the privacy guarantee configurable.
- ❌ Docs assume Vercel and Neon throughout, though the code requires neither:
  geo values are ordinary parameters, so any host that can supply them works,
  and any Postgres will do.

### Migrations
- ✅ Owned by this repo — versioned SQL in `drizzle/`, generated with `bun run db:generate`, applied with `bun run db:migrate` (`drizzle-kit push` is never used)
- ⚠️ **The first `db:migrate` against a database that already has these tables will fail** — `drizzle/0000_init.sql` has no `IF NOT EXISTS`. Do not drop and recreate (it destroys analytics history); follow the catch-up procedure in `ARCHITECTURE.md`.

### Production
- ❌ No error handling for DB failures
- ❌ No retry logic
- ❌ No logging integration

### Event analytics — a real gap
- ✅ `trackEvent()` writes to the `events` table
- ❌ **Nothing reads it.** `src/query.ts` has no event query functions at all.
  Events can be recorded but not analysed, and the Events section of
  `DASHBOARD_REQUIREMENTS.md` cannot be built until this is fixed. Package
  work, targeted at 0.4.0.

### Dashboard
- ✅ A dashboard exists: `~/projects/stats.seneris.nl`, its own repo, Next.js 16
  + shadcn/ui + Recharts, consuming this package as an npm dependency
- ✅ Built: headline stats, traffic chart, top pages / locations / referrers /
  devices, site switcher, range picker, session panel with entry/exit pages and
  page flows
- ❌ Not built: events UI (blocked, above), error-tracking UI (unblocked —
  every query it needs ships in 0.3.0), LLM UI (blocked on a nonexistent package)
- 📍 **Local-only, decided 2026-09-15.** Never deployed and not intended to be:
  a dashboard that is never exposed removes the authentication problem instead
  of solving it. The password-auth and Vercel-cron scaffolding built for the
  original hosted plan is being removed in that repo.
- ⚠️ Consequence: Vercel Cron was going to run `cleanupOldSalts()` and
  `deleteOldPageViews()` nightly. With nothing deployed, scheduling them is an
  open question owned by the dashboard repo. Until it is answered, salts
  accumulate and `PRIVACY.md`'s 7-day claim is not yet true in practice.

---

## File Structure

```
nosework/                          # @seneris/nosework
├── src/
│   ├── index.ts                   # Main exports
│   ├── track.ts                   # Page view & event tracking
│   ├── query.ts                   # All query functions
│   ├── error.ts                   # Error tracking
│   ├── sites.ts                   # Site enumeration (listSites())
│   ├── retention.ts               # Retention deletion (deleteOldPageViews())
│   ├── client/errors.ts           # Browser error capture
│   ├── client.ts                  # Drizzle client
│   ├── utils.ts                   # Hashing, bot detection
│   ├── ua.ts                      # User-Agent parsing
│   ├── schema.ts                  # Drizzle table definitions
│   └── types.ts                   # TypeScript types
├── drizzle/                       # Versioned SQL migrations
├── docs/
│   ├── OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── PROJECT_STATE.md
│   ├── PRIVACY.md
│   ├── INTEGRATION.md
│   ├── PUBLISHING.md
│   └── DASHBOARD_REQUIREMENTS.md
├── test/                          # Unit tests (DB-free; setup.ts guards access)
└── package.json
```

---

## Database

nosework owns its schema and migrations directly — see `src/schema.ts` and
`drizzle/`. There is no separate host application involved; each consuming
app connects to whatever PostgreSQL database it's configured to use via
`ANALYTICS_DATABASE_URL`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANALYTICS_DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANALYTICS_SITE_ID` | Yes | Site identifier for the consuming app |

---

## Next Steps

1. ✅ ~~Choose database strategy~~ - own the schema and migrations directly
2. ✅ ~~Add schema~~
3. ✅ ~~Run migrations~~
4. ✅ ~~Publish to npm~~
5. ✅ ~~Push source to GitHub~~
6. ⏳ **Integrate into first app** — see `docs/INTEGRATION.md`. Nothing imports
   the package yet, so none of it has met real traffic.
7. ⏳ **Schedule `cleanupOldSalts()` and `deleteOldPageViews()`** — the privacy
   claims depend on it and nothing currently runs them
8. ⏳ **Make the dashboard local-only** — strip password auth and the Vercel
   cron scaffolding (work owned by `~/projects/stats.seneris.nl`)
9. ⏳ **Event analytics queries** — unblocks the dashboard's Events section
10. ⏳ *Someday:* build `@seneris/nosework-llm`, starting with a table and
    migration here (`ROADMAP.md` Phase 6)

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| `OVERVIEW.md` | What nosework is and why |
| `ARCHITECTURE.md` | Technical design and data flow |
| `ROADMAP.md` | Feature phases and status |
| `INTEGRATION.md` | Step-by-step guide for adding to your app |
| `PRIVACY.md` | What is collected, retained, and why no consent banner is required |
| `PUBLISHING.md` | How to publish to npm |
| `DASHBOARD_REQUIREMENTS.md` | Dashboard UI specifications |
