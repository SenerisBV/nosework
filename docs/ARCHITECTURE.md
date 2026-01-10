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
│                          │ Prisma Client                        │
│                          ▼                                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ PostgreSQL connection
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Neon Database                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Site    │  │ PageView │  │  Event   │  │DailySalt │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

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

### Site
Represents a tracked application/website.

```prisma
model Site {
  id        String   @id @default(cuid())
  name      String
  domain    String   @unique
  createdAt DateTime @default(now())

  pageViews PageView[]
  events    Event[]
}
```

### PageView
Individual page view event with all metadata.

```prisma
model PageView {
  id          String   @id @default(cuid())
  siteId      String

  // Page
  url         String
  pathname    String
  referrer    String?

  // Visitor (cookieless identification)
  visitorHash String   // Daily-rotating hash
  sessionId   String   // 30-minute window hash

  // Location (from Vercel headers)
  country     String?
  countryCode String?
  region      String?
  city        String?

  // Device (parsed from User-Agent)
  browser     String?
  browserVer  String?
  os          String?
  osVer       String?
  device      String?  // desktop, mobile, tablet

  // Optional user link
  userId      String?

  // Bot detection
  isBot       Boolean @default(false)

  timestamp   DateTime @default(now())
}
```

### Event
Custom events with flexible properties.

```prisma
model Event {
  id          String   @id @default(cuid())
  siteId      String

  name        String   // Event name (e.g., "signup", "purchase")
  properties  Json?    // Arbitrary event data

  visitorHash String
  sessionId   String
  userId      String?
  url         String?

  timestamp   DateTime @default(now())
}
```

### DailySalt
Rotating salts for privacy-preserving visitor hashing.

```prisma
model DailySalt {
  date  DateTime @id @db.Date
  salt  String
}
```

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
├── client.ts     # Prisma client singleton
├── utils.ts      # Hashing, bot detection
├── ua.ts         # User-Agent parsing
└── types.ts      # TypeScript interfaces
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@prisma/client` | Database ORM |
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
