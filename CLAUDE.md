# nosework

Privacy-focused, self-hosted analytics package for tracking page views and events across multiple applications.

## Project Overview

nosework is an npm package that provides:
- Cookieless, GDPR-compliant analytics tracking
- City-level geolocation via Vercel's geo headers
- Multi-site support with a shared PostgreSQL database
- Full query API for building dashboards

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
| `src/client.ts` | Prisma client singleton |
| `src/types.ts` | TypeScript interfaces |
| `prisma/schema.prisma` | Database schema |

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

### Site Management
- `getOrCreateSite()` - Create or retrieve a site
- `listSites()` - List all tracked sites

### Error Tracking
- `trackError()` - Track a JavaScript error
- `getErrorStats()` - Error counts, unique errors, open groups
- `getErrorGroups()` - Grouped errors by fingerprint
- `getErrorInstances()` - Individual error occurrences
- `updateErrorGroupStatus()` - Mark errors resolved/ignored
- `deleteOldErrors()` - Clean up old error data

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

# Generate Prisma client
bun run db:generate

# Run migrations (requires ANALYTICS_DATABASE_URL)
bun run db:migrate
```

## Geolocation

**This package uses Vercel's geo headers** for location data:
- `x-vercel-ip-country` - Country code
- `x-vercel-ip-country-region` - Region/state
- `x-vercel-ip-city` - City name

These headers are automatically available on Vercel-hosted apps. No third-party GeoIP service required.

**Limitation:** Geo data is not available in local development or on non-Vercel hosts.

## Privacy Design

- **No cookies** - Visitors identified by daily-rotating hash of IP + UA
- **No PII stored** - IPs never stored, only used for hashing
- **User-Agent anonymized** - Parsed to categories, raw string not stored
- **Sessions inferred** - 30-minute window hash, no session cookies

## Database Schema

- **Site** - Tracked sites/apps (id, name, domain)
- **PageView** - Page view events with location, device, visitor hash
- **Event** - Custom events with name, properties, visitor hash
- **DailySalt** - Rotating salts for visitor hashing (privacy)
- **Error** - Individual error occurrences with stack traces
- **ErrorGroup** - Aggregated errors by fingerprint with counts and status

## Integration Requirements

Each app that uses nosework needs:

1. **Environment variables**:
   - `ANALYTICS_DATABASE_URL` - Shared Neon DB connection string
   - `ANALYTICS_SITE_ID` - Unique identifier for this app

2. **API endpoint**: `/api/analytics/track` route that:
   - Receives `{ url, referrer }` from client
   - Reads geo headers from Vercel
   - Calls `trackPageView()` with all data

3. **Client component**: React component that fires on pathname changes

See README.md for complete code examples.

## Publishing

See `docs/PUBLISHING.md` for full guide.

```bash
# Quick publish
bun run build
npm publish --access public
```

## Integration with MoopySuite

The analytics tables can be added to MoopySuite's database instead of a separate DB.
See `docs/MOOPYSUITE_INTEGRATION.md` for:
- Schema additions
- How App.id maps to siteId
- Dashboard integration
- Query examples with user joins

## Dependencies

- `@prisma/client` - Database ORM
- `ua-parser-js` - User-Agent parsing

No GeoIP dependencies - uses Vercel headers instead.
