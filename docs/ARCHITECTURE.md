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

### Applying migrations to a database where the tables already exist

`bun run db:migrate` works cleanly only against an empty database.
`drizzle/0000_init.sql` is a plain `CREATE TABLE` script with no
`IF NOT EXISTS`, so against a database that already holds `page_views`,
`events`, `daily_salts`, `analytics_errors` and `error_groups` — the case
for any database carried over from before nosework owned its schema — the
first run fails with `relation "page_views" already exists`, inside the
transaction, having recorded nothing. Expect this on the first migrate
against live data; it is not a sign that anything is wrong with the
database.

**Do not drop and recreate the tables to get past it.** They hold the
analytics history the package exists to accumulate, and it is not
recoverable. Do a catch-up instead: confirm the live schema already matches
`src/schema.ts`, then tell Drizzle that migration 0000 is already applied.

1. **Compare the live schema against `src/schema.ts`**, column by column,
   including nullability and defaults. `\d page_views` in `psql` against
   each of the five tables, read against the definitions above, is enough.
2. **If they differ**, do not proceed with the catch-up — the difference is
   real schema drift and needs its own hand-written migration, generated and
   reviewed before 0000 is marked applied.
3. **If they match**, insert the bookkeeping row Drizzle would have written.
   `drizzle-kit migrate` delegates to drizzle-orm's migrator, which keeps its
   state in `drizzle.__drizzle_migrations` and decides what is pending by
   comparing the largest `created_at` in that table against the `when` value
   of each entry in `drizzle/meta/_journal.json` — not by the hash. So the
   `created_at` below must be exactly the `when` for the `0000_init` entry:

   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
     id SERIAL PRIMARY KEY,
     hash text NOT NULL,
     created_at bigint
   );
   INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
   VALUES ('<sha256 of drizzle/0000_init.sql>', 1788017672175);
   ```

   The hash is the SHA-256 of the migration file's entire contents, which is
   how drizzle-orm computes it — `shasum -a 256 drizzle/0000_init.sql`. It is
   recorded, not checked, but recording the real value keeps the row honest.
   `1788017672175` is the `when` of the `0000_init` entry in
   `drizzle/meta/_journal.json`; read it from that file rather than trusting
   this line.
4. **Re-run `bun run db:migrate`.** It should report nothing to apply. From
   that point on, later migrations apply normally.

An applied migration file must never be edited afterwards — a changed
`0000_init.sql` changes its hash and desynchronises this bookkeeping from
what the database actually contains.

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
visitorHash = SHA256(siteId + IP + UserAgent + DailySalt).slice(0, 16)
```

The exact input is `${siteId}|${ip}|${userAgent}|${salt}` — `computeVisitorIds()`
in `src/utils.ts`, pinned by a known-answer test in `test/visitor.test.ts`.

- **Site-scoped** - `siteId` is part of the input, so the same visitor gets a different hash on each site sharing the database. The daily salt is one row for the whole database, so without this a `GROUP BY visitorHash` would reconstruct a day of cross-site browsing
- **Daily rotation** - Salt changes each day, so visitors can't be tracked across days
- **No reverse lookup** - Hash cannot be reversed to get original IP
- **Collision-resistant** - 16 hex chars = 64 bits of entropy

Neither property is absolute against the operator: while a day's salt exists
(7 days, if `cleanupOldSalts()` runs) the hash can be recomputed for any
`siteId` or day from a candidate IP + UA, and the geo/browser/OS/device columns
correlate a visitor across sites with no hash at all. `docs/PRIVACY.md` states
both limits; it is the source of truth for privacy claims.

### Session Inference

```
sessionId = SHA256(siteId + IP + UserAgent + DailySalt + 30minWindow).slice(0, 16)
```

The session id is the visitor hash input plus `|<30-min bucket>`, so it inherits
the site scoping.

- **30-minute windows** - Session hash rotates every 30 minutes
- **No cookies** - Sessions inferred from request timing
- **Privacy-preserving** - Can't link sessions across time windows

#### Deploying the site-scoping change (0.3.0)

Folding `siteId` into the input altered identity derivation, so every live
visitor identity resets at the moment of deploy. There is nothing to migrate:
no schema changed, and hashes already rotate nightly at UTC midnight, so this
is equivalent to one extra rotation. The only effect is that a visitor seen
both before and after the deploy is counted twice **on the deploy day**.
Historical rows keep their old hashes and stay internally consistent within
each day; no backfill is possible or needed. See `PROJECT_STATE.md`.

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
- Visitor hashes are site-scoped, so a query that does span sites still cannot join one visitor's rows between them by identity

### Input Validation
- URL and referrer sanitized
- Event properties stored as JSON (no SQL injection)
- Bot detection filters malicious traffic

### No Sensitive Data
- No authentication tokens stored
- No user passwords or PII
- Visitor hashes are one-way
