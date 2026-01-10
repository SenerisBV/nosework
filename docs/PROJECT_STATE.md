# nosework - Project State

**Last Updated:** January 2025

---

## Current Status: MVP Complete

The core package is feature-complete and ready for initial use. It has not been published to npm yet.

---

## What's Working

### Tracking
- ✅ `trackPageView()` - Full page view tracking with all metadata
- ✅ `trackEvent()` - Custom event tracking with properties
- ✅ Visitor hashing (daily rotation, cookieless)
- ✅ Session inference (30-minute windows)
- ✅ Bot detection (comprehensive bot pattern list)
- ✅ User-Agent parsing (browser, OS, device type)
- ✅ Geo data passthrough (from Vercel headers)

### Querying
- ✅ `getStats()` - Page views, visitors, sessions, bounce rate
- ✅ `getTopPages()` - Most viewed pages with visitor counts
- ✅ `getLocations()` - Geographic breakdown
- ✅ `getReferrers()` - Traffic sources
- ✅ `getDevices()` - Browser/OS/device breakdown
- ✅ `getTimeSeries()` - Time-based data for charts
- ✅ `listSites()` - All tracked sites
- ✅ `getOrCreateSite()` - Site management

### Infrastructure
- ✅ Prisma schema defined
- ✅ TypeScript types exported
- ✅ Package builds successfully
- ✅ Documentation complete (README, CLAUDE.md, docs/)

---

## What's Not Done

### Testing
- ❌ No unit tests yet
- ❌ No integration tests
- ❌ Not tested with real traffic

### Publishing
- ❌ Not published to npm
- ❌ No CI/CD pipeline
- ❌ No versioning strategy defined

### Production Hardening
- ❌ No error handling for DB failures
- ❌ No retry logic
- ❌ No logging integration

### Dashboard
- ❌ No pre-built dashboard
- ❌ No visualization components
- ❌ Dashboard planned for OAuth app (Phase 3)

---

## Known Limitations

### Vercel Dependency
- Geo headers only available on Vercel-hosted apps
- Local development has no geo data (returns null)
- Non-Vercel hosts would need alternative GeoIP solution

### Scale
- Direct database writes (no batching)
- May need optimization for >100K daily page views
- No read replica support

### Privacy Trade-offs
- Visitor hash rotates daily - can't track users across days
- Session window is 30 minutes - longer sessions split
- No way to link same user across devices

---

## File Structure

```
nosework/
├── src/
│   ├── index.ts      # Main exports
│   ├── track.ts      # Tracking functions
│   ├── query.ts      # Query functions
│   ├── client.ts     # Prisma client
│   ├── utils.ts      # Utilities
│   ├── ua.ts         # UA parsing
│   └── types.ts      # TypeScript types
├── prisma/
│   └── schema.prisma # Database schema
├── dist/             # Built output
├── docs/
│   ├── OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   └── PROJECT_STATE.md
├── package.json
├── tsconfig.json
├── README.md
└── CLAUDE.md
```

---

## Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| `@prisma/client` | ^6.2.1 | Database ORM |
| `ua-parser-js` | ^2.0.1 | User-Agent parsing |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `prisma` | ^6.2.1 | Schema management |
| `typescript` | ^5.7.3 | Type checking |
| `@types/bun` | ^1.3.5 | Bun types |
| `@types/ua-parser-js` | ^0.7.39 | UA parser types |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANALYTICS_DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANALYTICS_SITE_ID` | Yes | Unique site identifier (per app) |

---

## Next Steps

1. **Publish to npm** - User will handle git init and npm publish
2. **Create Neon database** - Dedicated analytics DB
3. **Run migrations** - Initialize schema
4. **Integrate into first app** - DAFTConnect (Phase 2)
5. **Build dashboard** - In OAuth app (Phase 3)

---

## Open Questions

- **Package name availability** - Is "nosework" available on npm?
- **Database hosting** - Separate Neon project or database in existing project?
- **Dashboard design** - What visualizations are most important?
- **Event tracking strategy** - Which events to track across apps?

---

## Historical Notes

### Initial Design (January 2025)
- Originally planned to use MaxMind GeoLite2 for geolocation
- Switched to Vercel geo headers to eliminate third-party dependency
- Decision: Vercel-only is acceptable trade-off for simplicity

### Architecture Decisions
- Direct DB writes chosen over message queue for simplicity
- Daily visitor hash rotation chosen for stronger privacy
- 30-minute session windows balance accuracy and privacy
