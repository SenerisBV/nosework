# Integrating Analytics into MoopySuite

This document describes how to add nosework analytics tables to the MoopySuite database, making it the single source of truth for users, apps, and analytics.

> **Status:** Schema added to MoopySuite. Run migrations to create tables.

## Key Decision: Site Identification

Consumer apps use their existing `MOOPY_CLIENT_ID` environment variable (OAuth client_id) as the `siteId`. This means:
- No new environment variables needed
- Human-readable and unique identifiers
- Direct linkage to OAuth system for dashboard queries

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MoopySuite (OAuth + Dashboard)                             │
│  - Owns the database schema                                 │
│  - Runs migrations                                          │
│  - Hosts analytics dashboard                                │
│  - User/App management                                      │
└─────────────────────────────────────────────────────────────┘
         │
         │ Same DATABASE_URL
         │
┌────────┴────────┬─────────────────┬─────────────────────────┐
│                 │                 │                         │
▼                 ▼                 ▼                         ▼
┌──────────┐  ┌──────────┐  ┌──────────┐              ┌──────────┐
│  App 1   │  │  App 2   │  │  App N   │              │ nosework │
│          │  │          │  │          │              │   -llm   │
│ nosework │  │ nosework │  │ nosework │              │          │
└──────────┘  └──────────┘  └──────────┘              └──────────┘
```

## Key Mapping

| MoopySuite | Analytics | Notes |
|------------|-----------|-------|
| `App.id` | `siteId` | Each app is a tracked "site" |
| `User.id` | `userId` | Optional user linking |
| `UserProfile.is_admin` | Dashboard access | Admins see all analytics |

## Schema Additions

Add the following to `moopysuite/prisma/schema.prisma`:

```prisma
// ============================================
// Analytics - Page Views & Sessions
// ============================================

model PageView {
  id          String   @id @default(cuid())
  siteId      String   // References App.id

  // Page info
  url         String
  pathname    String
  referrer    String?

  // Visitor (cookieless identification)
  visitorHash String   // Hash of IP + UA + daily salt
  sessionId   String   // Hash with 30-minute rotation

  // Location (from Vercel geo headers)
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
  isBot       Boolean  @default(false)

  timestamp   DateTime @default(now())

  // Relations
  site        App      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([siteId, timestamp])
  @@index([siteId, pathname])
  @@index([siteId, country])
  @@index([visitorHash, timestamp])
  @@index([sessionId])
  @@index([userId])
  @@map("page_views")
}

model Event {
  id          String   @id @default(cuid())
  siteId      String

  name        String   // e.g., "signup", "purchase", "button_click"
  properties  Json?    // Flexible event data

  visitorHash String
  sessionId   String
  userId      String?

  url         String?

  timestamp   DateTime @default(now())

  // Relations
  site        App      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([siteId, name, timestamp])
  @@index([siteId, timestamp])
  @@index([userId])
  @@map("events")
}

// Daily salt for visitor hashing (privacy - rotates daily)
model DailySalt {
  date  DateTime @id @db.Date
  salt  String

  @@map("daily_salts")
}

// ============================================
// Analytics - Error Tracking
// ============================================

model AnalyticsError {
  id          String   @id @default(cuid())
  siteId      String

  // Error details
  message     String
  stack       String?  @db.Text
  fingerprint String   // Hash for grouping similar errors

  // Context
  url         String
  pathname    String

  // Visitor context
  visitorHash String?
  sessionId   String?
  userId      String?

  // Browser context
  browser     String?
  browserVer  String?
  os          String?
  device      String?

  // Metadata
  metadata    Json?

  timestamp   DateTime @default(now())

  // Relations
  site        App      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([siteId, timestamp])
  @@index([siteId, fingerprint])
  @@index([userId])
  @@map("analytics_errors")
}

model ErrorGroup {
  id          String   @id @default(cuid())
  siteId      String
  fingerprint String

  // Representative error
  message     String
  stack       String?  @db.Text

  // Counts
  count       Int      @default(1)
  lastSeen    DateTime
  firstSeen   DateTime

  // Status: open, resolved, ignored
  status      String   @default("open")

  // Relations
  site        App      @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@unique([siteId, fingerprint])
  @@index([siteId, status, lastSeen])
  @@map("error_groups")
}

// ============================================
// Analytics - LLM Usage Tracking
// ============================================

model LLMCall {
  id              String   @id @default(cuid())
  siteId          String

  // Model info
  provider        String   // openai, anthropic, google
  model           String   // gpt-4-turbo, claude-3-opus, etc.

  // Tokens
  inputTokens     Int
  outputTokens    Int
  totalTokens     Int

  // Performance
  latencyMs       Int

  // Cost (estimated, in USD)
  estimatedCost   Float?

  // Status
  success         Boolean
  errorMessage    String?

  // Metadata
  conversationId  String?
  userId          String?
  tags            Json?

  timestamp       DateTime @default(now())

  // Relations
  site            App      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  user            User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([siteId, timestamp])
  @@index([siteId, model])
  @@index([siteId, provider])
  @@index([conversationId])
  @@index([userId])
  @@map("llm_calls")
}
```

## Update Existing Models

Add relations to `App` and `User`:

```prisma
// In the App model, add:
model App {
  // ... existing fields ...

  // Analytics relations
  pageViews       PageView[]
  events          Event[]
  analyticsErrors AnalyticsError[]
  errorGroups     ErrorGroup[]
  llmCalls        LLMCall[]
}

// In the User model, add:
model User {
  // ... existing fields ...

  // Analytics relations (optional - for linking known users)
  pageViews       PageView[]
  events          Event[]
  analyticsErrors AnalyticsError[]
  llmCalls        LLMCall[]
}
```

## Environment Setup

### MoopySuite (schema owner)
```bash
# .env
DATABASE_URL="postgresql://..."

# Run migration to create analytics tables
npx prisma migrate dev --name add_analytics_tables
```

### Consumer Apps (no migrations)
```bash
# .env
MOOPY_CLIENT_ID="my-app-name"  # Use as siteId for analytics (already configured for OAuth)
ANALYTICS_DATABASE_URL="postgresql://..."  # Same connection string as MoopySuite's DATABASE_URL
```

The nosework package uses `ANALYTICS_DATABASE_URL` to avoid conflicts with your app's own `DATABASE_URL`. For MoopySuite apps, set it to the same connection string as MoopySuite.

## Configuring nosework Packages

The nosework packages need to know they shouldn't run migrations. In your consumer apps, the packages will just connect and use the existing tables.

**Option 1: Remove postinstall script**

In `node_modules/@seneris/nosework/package.json`, the `postinstall` runs `prisma generate`. This is fine - it generates the client based on the package's schema, which is compatible.

**Option 2: Point to MoopySuite's generated client**

For tighter integration, you could import from MoopySuite's Prisma client directly instead of using nosework's bundled schema.

## Dashboard Integration

The MoopySuite app already has:
- User authentication
- Admin detection (`UserProfile.is_admin`)
- App management

Add dashboard routes:

```
/dashboard                    # Overview (all apps)
/dashboard/[appSlug]          # Per-app analytics
/dashboard/[appSlug]/sessions # Session analytics
/dashboard/[appSlug]/errors   # Error tracking
/dashboard/[appSlug]/llm      # LLM analytics
/dashboard/settings           # Analytics settings
```

## Site ID Strategy

Use `MOOPY_CLIENT_ID` (OAuth client_id) as the `siteId`. This is already configured in all consumer apps:

```typescript
// In your tracked apps - use existing env var!
await trackPageView({
  siteId: process.env.MOOPY_CLIENT_ID!,
  url: window.location.href,
  // ...
});
```

Benefits:
- Human-readable (e.g., "my-cool-app" not a UUID)
- Already configured in all apps for OAuth
- Unique per app
- Links directly to OAuthApplication for dashboard queries

## Migration Steps

1. ✅ **Schema added** - Analytics models added to MoopySuite's schema
2. ✅ **Relations added** - User model updated with analytics relations
3. ✅ **Helper created** - `src/lib/analytics.ts` for dashboard queries
4. ⏳ **Run migration** - `npx prisma migrate dev --name add_analytics_tables`
5. ⏳ **Build dashboard** - Create the dashboard routes/pages
6. ⏳ **Deploy** - Roll out to production

## Query Examples

With everything in one database, you can do powerful joins:

```typescript
import { getAppBySiteId, enrichWithAppInfo } from '@/lib/analytics';

// siteId is MOOPY_CLIENT_ID (e.g., "my-cool-app")
const siteId = 'my-cool-app';

// Get page views with user info
const pageViewsWithUsers = await prisma.pageView.findMany({
  where: { siteId },
  include: {
    user: {
      select: { email: true, profile: { select: { display_name: true } } }
    }
  }
});

// Get app info for a siteId
const appInfo = await getAppBySiteId(siteId);
console.log(appInfo?.app?.name); // Full app name from App model

// Get top users by LLM usage
const topLLMUsers = await prisma.lLMCall.groupBy({
  by: ['userId'],
  where: { siteId, userId: { not: null } },
  _sum: { totalTokens: true, estimatedCost: true },
  orderBy: { _sum: { estimatedCost: 'desc' } },
  take: 10,
});

// Enrich analytics results with app names
const stats = await prisma.pageView.groupBy({
  by: ['siteId'],
  _count: { id: true },
});
const enriched = await enrichWithAppInfo(stats);
// enriched[0] = { siteId: 'my-app', _count: { id: 100 }, appName: 'My App', appSlug: 'my-app' }
```

## Notes

- The `Error` model is renamed to `AnalyticsError` to avoid conflicts with JavaScript's built-in Error
- Table names use snake_case (`@@map`) to match MoopySuite conventions
- `siteId` is the OAuth `client_id` (MOOPY_CLIENT_ID), not a foreign key
- Foreign keys to User use `onDelete: SetNull` (preserve analytics if user deleted)
- Use `src/lib/analytics.ts` helpers to look up app info from siteId
