# nosework

Privacy-focused, self-hosted analytics package for tracking page views and events across multiple applications.

## Project Overview

nosework is an npm package that provides:
- Cookieless analytics tracking — no consent banner required (see `docs/PRIVACY.md` for what that does and does not cover)
- City-level geolocation via Vercel's geo headers
- Multi-site support with a shared PostgreSQL database
- Full query API for building dashboards (page views, sessions, errors — but see the Events gap below)

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   App 1     │  │   App 2     │  │   App N     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │  import { trackPageView }       │
       │  from 'nosework'                │
       └────────────────┼────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Shared Neon DB   │
              └───────────────────┘
```

Each consuming app:
1. Imports nosework
2. Creates a small tracking API endpoint (~20 lines)
3. Adds a client component to track navigations
4. Writes directly to the shared analytics database

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main exports |
| `src/track.ts` | `trackPageView()`, `trackEvent()` |
| `src/query.ts` | Page analytics + session analytics queries |
| `src/error.ts` | Error tracking + queries |
| `src/client/errors.ts` | Client-side error capture (~2KB) |
| `src/ua.ts` | User-Agent parsing |
| `src/utils.ts` | Visitor hashing, bot detection |
| `src/schema.ts` | Drizzle schema definitions |
| `src/client.ts` | Database client singleton |
| `src/types.ts` | TypeScript interfaces |

## Query Functions

### Page Analytics
- `getStats()` - Page views, visitors, sessions, bounce rate
- `getTopPages()` - Most viewed pages
- `getLocations()` - Geographic breakdown
- `getReferrers()` - Traffic sources
- `getDevices()` - Browser/OS/device breakdown
- `getTimeSeries()` - Time-based data for charts

### Session Analytics
- `getSessionStats()` - Total sessions, avg duration, pages per session, bounce rate
- `getEntryPages()` - First page of each session (landing pages)
- `getExitPages()` - Last page of each session
- `getPageFlows()` - Common user paths through the site
- `getSessions()` - Individual session data for debugging

### Events — no query functions exist
`trackEvent()` writes to the `events` table and **nothing reads it**. There are
no event analytics queries in `src/query.ts`. Recording events works; analysing
them is not implemented. Tracked as a gap in `docs/ROADMAP.md` (Phase 3).

### Site Management
- `listSites()` - List all tracked sites, derived from page-view data (there is no sites table)

### Error Tracking
- `trackError()` - Track a JavaScript error
- `getErrorStats()` - Error counts, unique errors, open groups
- `getErrorGroups()` - Grouped errors by fingerprint
- `getErrorInstances()` - Individual error occurrences
- `updateErrorGroupStatus()` - Mark errors resolved/ignored
- `deleteOldErrors()` - Clean up old error data
- `deleteOldPageViews()` - Clean up old page-view data (retention enforcement; omit `siteId` to sweep all sites)

### Client-Side Error Capture
Import from `@seneris/nosework/client/errors`:
- `initErrorTracking()` - Auto-capture unhandled errors
- `captureError()` - Manually track caught errors
- `stopErrorTracking()` - Remove event listeners

## Development

```bash
# Install dependencies
bun install

# Build package
bun run build

# Watch mode
bun run dev
```

Note: nosework owns its own migrations. Versioned SQL lives in `drizzle/`, generated with `bun run db:generate` and applied with `bun run db:migrate`. `drizzle-kit push` is never used — it mutates the database without recording a migration, drifting the schema from its history.

`bun run db:migrate` succeeds as-is only against an empty database. `drizzle/0000_init.sql` has no `IF NOT EXISTS`, so against a database that already holds these tables it fails with `relation "page_views" already exists`. Do not drop and recreate — that destroys analytics history. Follow the catch-up procedure in `docs/ARCHITECTURE.md` ("Applying migrations to a database where the tables already exist").

## The dashboard lives elsewhere

This package ships query functions, not UI. The dashboard that consumes them is
a separate repo, `~/projects/stats.seneris.nl` — Next.js, depends on
`@seneris/nosework` as an ordinary npm package.

It is **local-only and never deployed** (decided 2026-09-15): a dashboard that
is never exposed removes the authentication problem rather than solving it.

One consequence lands on this package's guarantees. `cleanupOldSalts()` and
`deleteOldPageViews()` were going to be invoked nightly by Vercel Cron on the
deployed dashboard. Nothing is deployed, so nothing invokes them. Until the
operator schedules them some other way, salts accumulate past 7 days and the
retention window is not enforced — which makes parts of `docs/PRIVACY.md`
aspirational rather than descriptive. `PRIVACY.md` is honest about this
dependency; keep it that way.

## Geolocation

**This package uses Vercel's geo headers** for location data:
- `x-vercel-ip-country` - Country code
- `x-vercel-ip-country-region` - Region/state
- `x-vercel-ip-city` - City name

These headers are automatically available on Vercel-hosted apps. No third-party GeoIP service required.

**Limitation:** Geo data is not available in local development or on non-Vercel hosts.

## Privacy Design

- **No cookies** - Visitors identified by a daily-rotating hash of siteId + IP + UA
- **Site-scoped identity** - `siteId` is part of the hash input, so the same visitor gets a different `visitorHash` on each site sharing the database; page views cannot be grouped to follow one person across sites
- **No PII stored** - IPs never stored, only used for hashing
- **User-Agent anonymized** - Parsed to categories, raw string not stored
- **Sessions inferred** - 30-minute window hash, no session cookies

The site scoping stops a `GROUP BY`, not a determined operator: while a day's salt exists (7 days, if `cleanupOldSalts()` is scheduled) the hash can be recomputed for any `siteId` from a candidate IP + UA, and the geo/browser/OS/device columns are identical for one visitor across sites regardless. `docs/PRIVACY.md` states both limits and is the source of truth for any privacy-page text.

## Database Schema

Tables (defined in `src/schema.ts`, created by this repo's own Drizzle migrations in `drizzle/`):

- **page_views** - Page view events with location, device, visitor hash
- **events** - Custom events with name, properties, visitor hash
- **daily_salts** - Rotating salts for visitor hashing (privacy)
- **analytics_errors** - Individual error occurrences with stack traces
- **error_groups** - Aggregated errors by fingerprint with counts and status

## Integration Requirements

Each app that uses nosework needs:

1. **Environment variables**:
   - `ANALYTICS_DATABASE_URL` - Database connection string
   - `ANALYTICS_SITE_ID` - Site identifier for this app

2. **API endpoint**: `/api/analytics/track` route that:
   - Receives `{ url, referrer }` from client
   - Reads geo headers from Vercel
   - Calls `trackPageView()` with all data

3. **Client component**: React component that fires on pathname changes

See `docs/INTEGRATION.md` for complete step-by-step guide.

## Publishing

See `docs/PUBLISHING.md` for full guide.

```bash
# Quick publish
bun run build
npm publish --access public
```

## Dependencies

- `drizzle-orm` - Lightweight TypeScript ORM (no codegen required)
- `postgres` - PostgreSQL driver
- `ua-parser-js` - User-Agent parsing

No GeoIP dependencies - uses Vercel headers instead.
No postinstall scripts - works immediately after install.
