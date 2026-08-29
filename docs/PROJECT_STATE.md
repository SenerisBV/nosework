# nosework - Project State

**Last Updated:** January 2025

---

## Current Status: Published

Both packages are published to npm and ready for integration.

### Packages

| Package | Status | npm |
|---------|--------|-----|
| `@seneris/nosework` | ✅ Published | [npm](https://www.npmjs.com/package/@seneris/nosework) |
| `@seneris/nosework-llm` | ✅ Published | [npm](https://www.npmjs.com/package/@seneris/nosework-llm) |

---

## What's Working

### Core Analytics (`@seneris/nosework`)

**Tracking:**
- ✅ `trackPageView()` - Full page view tracking with metadata
- ✅ `trackEvent()` - Custom event tracking with properties
- ✅ Visitor hashing (daily rotation, cookieless)
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

### LLM Analytics (`@seneris/nosework-llm`)

**Tracking:**
- ✅ `trackLLMCall()` - Track API calls
- ✅ `withLLMTracking()` - Wrapper for auto-tracking

**Queries:**
- ✅ `getLLMStats()` - Calls, tokens, cost, latency, error rate
- ✅ `getLLMUsageByModel()` - Per-model breakdown
- ✅ `getLLMTimeSeries()` - Usage over time
- ✅ `getLLMCalls()` - Individual call list
- ✅ `getConversation()` - Calls by conversation ID
- ✅ `getLLMUsageByUser()` - Per-user breakdown

**Pricing:**
- ✅ `estimateCost()` - Calculate costs
- ✅ `setModelPricing()` - Override prices
- ✅ Built-in pricing for 50+ models

---

## What's Not Done

### Testing
- ✅ Unit tests exist (29 tests across 5 files, all DB-free by design)
- ❌ No integration tests
- ❌ Not tested with real traffic

### Publishing
- ✅ Published to npm
- ❌ No CI/CD pipeline

### Migrations
- ✅ Owned by this repo — versioned SQL in `drizzle/`, generated with `bun run db:generate`, applied with `bun run db:migrate` (`drizzle-kit push` is never used)

### Production
- ❌ No error handling for DB failures
- ❌ No retry logic
- ❌ No logging integration

### Dashboard
- ❌ No pre-built dashboard (requirements documented in `DASHBOARD_REQUIREMENTS.md`)

---

## File Structure

```
nosework/                          # @seneris/nosework
├── src/
│   ├── index.ts                   # Main exports
│   ├── track.ts                   # Page view & event tracking
│   ├── query.ts                   # All query functions
│   ├── error.ts                   # Error tracking
│   ├── client/errors.ts           # Browser error capture
│   ├── client.ts                  # Drizzle client
│   ├── utils.ts                   # Hashing, bot detection
│   ├── ua.ts                      # User-Agent parsing
│   └── types.ts                   # TypeScript types
├── drizzle/                       # Versioned SQL migrations
├── docs/
│   ├── OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── PROJECT_STATE.md
│   ├── PUBLISHING.md
│   └── DASHBOARD_REQUIREMENTS.md
└── package.json

nosework-llm/                      # @seneris/nosework-llm
├── src/
│   ├── index.ts                   # Main exports
│   ├── track.ts                   # LLM call tracking
│   ├── query.ts                   # LLM query functions
│   ├── pricing.ts                 # Model pricing data
│   ├── client.ts                  # Database client
│   └── types.ts                   # TypeScript types
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
5. ⏳ **Integrate into first app** - See `docs/INTEGRATION.md`
6. ⏳ **Build dashboard**

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| `OVERVIEW.md` | What nosework is and why |
| `ARCHITECTURE.md` | Technical design and data flow |
| `ROADMAP.md` | Feature phases and status |
| `INTEGRATION.md` | Step-by-step guide for adding to your app |
| `PUBLISHING.md` | How to publish to npm |
| `DASHBOARD_REQUIREMENTS.md` | Dashboard UI specifications |
