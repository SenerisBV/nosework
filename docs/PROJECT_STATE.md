# nosework - Project State

**Last Updated:** January 2025

---

## Current Status: Feature Complete (Pre-publish)

Both packages are feature-complete and ready for publishing to npm.

### Packages

| Package | Status | Location |
|---------|--------|----------|
| `@seneris/nosework` | ✅ Ready | `/nosework` |
| `@seneris/nosework-llm` | ✅ Ready | `/nosework-llm` |

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
- ❌ No unit tests
- ❌ No integration tests
- ❌ Not tested with real traffic

### Publishing
- ❌ Not published to npm yet
- ❌ No CI/CD pipeline

### Production
- ❌ No error handling for DB failures
- ❌ No retry logic
- ❌ No logging integration

### Dashboard
- ❌ No pre-built dashboard (requirements documented)
- ❌ Planned for MoopySuite OAuth app

---

## MoopySuite Integration

**Status:** Schema added, pending migration

The analytics tables have been added to MoopySuite's database schema. This enables:
- Single database for auth + apps + analytics
- Linking analytics to User model
- Using `MOOPY_CLIENT_ID` (OAuth client_id) as the siteId

### Site Identification

Consumer apps use their existing `MOOPY_CLIENT_ID` environment variable as the `siteId`:

```typescript
await trackPageView({
  siteId: process.env.MOOPY_CLIENT_ID!, // Already configured in all apps
  url: window.location.href,
  // ...
});
```

### Files Added to MoopySuite

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Added PageView, Event, DailySalt, AnalyticsError, ErrorGroup, LLMCall models |
| `src/lib/analytics.ts` | Dashboard helper functions (getAppBySiteId, getTrackedSites, enrichWithAppInfo) |

### Migration

Run in MoopySuite directory:
```bash
npx prisma migrate dev --name add_analytics_tables
```

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
│   ├── client.ts                  # Prisma client
│   ├── utils.ts                   # Hashing, bot detection
│   ├── ua.ts                      # User-Agent parsing
│   └── types.ts                   # TypeScript types
├── prisma/schema.prisma
├── docs/
│   ├── OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── PROJECT_STATE.md
│   ├── PUBLISHING.md
│   ├── DASHBOARD_REQUIREMENTS.md
│   └── MOOPYSUITE_INTEGRATION.md
└── package.json

nosework-llm/                      # @seneris/nosework-llm
├── src/
│   ├── index.ts                   # Main exports
│   ├── track.ts                   # LLM call tracking
│   ├── query.ts                   # LLM query functions
│   ├── pricing.ts                 # Model pricing data
│   ├── client.ts                  # Prisma client
│   └── types.ts                   # TypeScript types
├── prisma/schema.prisma
└── package.json
```

---

## Database Options

### Option A: Separate Neon Database
- Dedicated analytics database
- Both packages connect to same DB
- Independent from app data

### Option B: MoopySuite Integration (Recommended)
- Add analytics tables to MoopySuite's existing DB
- Links to User and App models directly
- Single source of truth
- Dashboard in same app
- See `docs/MOOPYSUITE_INTEGRATION.md`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANALYTICS_DATABASE_URL` | Yes | PostgreSQL connection (or `DATABASE_URL` if using MoopySuite) |
| `ANALYTICS_SITE_ID` | Yes | App.id from MoopySuite (or Site.id if separate) |

---

## Next Steps

1. **Choose database strategy** - Separate vs MoopySuite integration
2. **Add schema to MoopySuite** - If integrating
3. **Run migrations** - Create analytics tables
4. **Publish to npm** - See `docs/PUBLISHING.md`
5. **Integrate into first app** - Add tracking
6. **Build dashboard** - In MoopySuite

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| `OVERVIEW.md` | What nosework is and why |
| `ARCHITECTURE.md` | Technical design and data flow |
| `ROADMAP.md` | Feature phases and status |
| `PUBLISHING.md` | How to publish to npm |
| `DASHBOARD_REQUIREMENTS.md` | Dashboard UI specifications |
| `MOOPYSUITE_INTEGRATION.md` | Schema additions for MoopySuite |
