# nosework - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Analytics Component                                     │   │
│  │  - Detects pathname changes                              │   │
│  │  - Sends { url, referrer } to tracking endpoint          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ POST /api/analytics/track
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Your Next.js App                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Tracking API Route                                      │   │
│  │  - Receives { url, referrer } from client                │   │
│  │  - Reads headers: IP, User-Agent, Vercel geo headers     │   │
│  │  - Calls trackPageView() from nosework                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ import { trackPageView }
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      nosework Package                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  track.ts    │  │  query.ts    │  │  utils.ts    │          │
│  │  - trackPage │  │  - getStats  │  │  - hashing   │          │
│  │  - trackEvent│  │  - getPages  │  │  - bot detect│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                          │                                      │
│                          │ Drizzle ORM                          │
│                          ▼                                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ PostgreSQL connection
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Neon Database                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ PageView │  │  Event   │  │DailySalt │  │  Errors  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

There is no `Site` table — `siteId` is a bare column written by whichever app is reporting, not a foreign key into a sites table. `listSites()` derives the list of known sites from page-view data instead.

## Data Flow

### Page View Tracking

1. **Client detects navigation** - React component watches `pathname` changes
2. **Client sends request** - POST to `/api/analytics/track` with `{ url, referrer }`
3. **Server reads headers** - IP, User-Agent, Vercel geo headers extracted
4. **nosework processes** - Hashes visitor, parses UA, validates data
5. **Database write** - PageView record created with all metadata

### Why Client + API (not just middleware)?

| Approach | SPA Navigation | SSR Pages | Complexity |
|----------|----------------|-----------|------------|
| Client + API | ✅ Tracked | ✅ Tracked | Medium |
| Middleware only | ❌ Missed | ✅ Tracked | Low |

Single-page apps use client-side routing, so navigation doesn't trigger new HTTP requests. The client component catches these navigations.

## Database Schema

The schema is defined in `src/schema.ts` using Drizzle's `pgTable()`. There is
no `Site` table or model — `siteId` is a bare `text` column on each table,
not a foreign key. The schema owns its own versioned migrations in
`drizzle/`, generated with `bun run db:generate` and applied with
`bun run db:migrate`. `drizzle-kit push` is never used, since it mutates the
database without recording a migration.

### page_views
Individual page view event with all metadata.

```typescript
export const pageViews = pgTable("page_views", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("siteId").notNull(),

  // Page
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  referrer: text("referrer"),

  // Visitor (cookieless identification)
  visitorHash: text("visitorHash").notNull(), // Daily-rotating hash
  sessionId: text("sessionId").notNull(),     // 30-minute window hash

  // Location (from Vercel headers)
  country: text("country"),
  countryCode: text("countryCode"),
  region: text("region"),
  city: text("city"),

  // Device (parsed from User-Agent)
  browser: text("browser"),
  browserVer: text("browserVer"),
  os: text("os"),
  osVer: text("osVer"),
  device: text("device"), // desktop, mobile, tablet

  // Optional user link
  userId: text("userId"),

  // Bot detection
  isBot: boolean("isBot").default(false).notNull(),

  timestamp: timestamp("timestamp").defaultNow().notNull(),
});
```

### events
Custom events with flexible properties.

```typescript
export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  siteId: text("siteId").notNull(),

  name: text("name").notNull(),        // Event name (e.g., "signup", "purchase")
  properties: json("properties"),      // Arbitrary event data

  visitorHash: text("visitorHash").notNull(),
  sessionId: text("sessionId").notNull(),
  userId: text("userId"),
  url: text("url"),

  timestamp: timestamp("timestamp").defaultNow().notNull(),
});
```

### daily_salts
Rotating salts for privacy-preserving visitor hashing.

```typescript
export const dailySalts = pgTable("daily_salts", {
  date: date("date").primaryKey(),
  salt: text("salt").notNull(),
});
```

### analytics_errors / error_groups
Error tracking: individual occurrences and their fingerprint-based
aggregates. See `src/schema.ts` for the full field list — both tables
follow the same `siteId`-as-bare-column pattern as above.

## Privacy Architecture

### Visitor Identification (Cookieless)

```
visitorHash = SHA256(IP + UserAgent + DailySalt).slice(0, 16)
```

- **Daily rotation** - Salt changes each day, so visitors can't be tracked across days
- **No reverse lookup** - Hash cannot be reversed to get original IP
- **Collision-resistant** - 16 hex chars = 64 bits of entropy

### Session Inference

```
sessionId = SHA256(IP + UserAgent + DailySalt + 30minWindow).slice(0, 16)
```

- **30-minute windows** - Session hash rotates every 30 minutes
- **No cookies** - Sessions inferred from request timing
- **Privacy-preserving** - Can't link sessions across time windows

### Data Minimization

| Data | Stored? | Used For |
|------|---------|----------|
| IP Address | ❌ No | Hashing only |
| Full User-Agent | ❌ No | Parsing only |
| Browser name | ✅ Yes | Analytics |
| OS name | ✅ Yes | Analytics |
| Geo (country/city) | ✅ Yes | Analytics |
| Visitor hash | ✅ Yes | Unique visitor count |

## Module Structure

```
src/
├── index.ts      # Public exports
├── track.ts      # trackPageView(), trackEvent()
├── query.ts      # getStats(), getTopPages(), etc.
├── error.ts      # trackError(), error queries, deleteOldErrors()
├── sites.ts      # listSites()
├── retention.ts  # deleteOldPageViews()
├── client.ts     # Drizzle client singleton
├── utils.ts      # Hashing, bot detection
├── ua.ts         # User-Agent parsing
├── schema.ts     # Drizzle table definitions
└── types.ts      # TypeScript interfaces
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `drizzle-orm` | Database ORM (no codegen required) |
| `postgres` | PostgreSQL driver |
| `ua-parser-js` | User-Agent parsing |

No external services required. Geo data comes from Vercel headers.

## Scaling Considerations

### Current Design (Small-Medium Scale)
- Direct database writes
- Synchronous tracking
- Suitable for ~10K-100K daily page views

### Future Optimizations (If Needed)
- **Batch writes** - Buffer events, write in batches
- **Queue processing** - Use Redis/Upstash for async writes
- **Read replicas** - Separate read/write databases
- **Aggregation tables** - Pre-computed daily/hourly stats

## Security

### Database Access
- Each app has its own `ANALYTICS_DATABASE_URL`
- Apps can only write to their assigned `siteId`
- No cross-site data access without explicit queries

### Input Validation
- URL and referrer sanitized
- Event properties stored as JSON (no SQL injection)
- Bot detection filters malicious traffic

### No Sensitive Data
- No authentication tokens stored
- No user passwords or PII
- Visitor hashes are one-way
