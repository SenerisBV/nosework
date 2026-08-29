# nosework

Privacy-focused, self-hosted analytics for your app suite.

## Features

- **Cookieless tracking** - No consent banners needed
- **City-level geolocation** - Via Vercel's geo headers
- **No PII stored** - IPs are used for hashing only and never written; raw User-Agents are discarded
- **Multi-site support** - Track all your apps with one shared database
- **Full API** - Query your analytics data programmatically

See [Privacy and compliance](#privacy-and-compliance) below for the short
version. `docs/PRIVACY.md` in the source repository has the full accounting —
exactly what is collected, how visitors are counted without cookies, the
limits of those claims, and text you can adapt for a privacy page. That
document is not included in the npm package.

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   App 1     │  │   App 2     │  │   App N     │
│  (Next.js)  │  │  (Next.js)  │  │  (Next.js)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │  import { trackPageView }       │
       │  from '@seneris/nosework'       │
       │                │                │
       └────────────────┼────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Shared Neon DB   │
              │  (PostgreSQL)     │
              └───────────────────┘
```

Each app imports nosework and writes directly to a shared PostgreSQL database. No intermediate service needed.

### Why Each App Needs a Tracking Endpoint

The browser (client-side) cannot:
- Connect directly to PostgreSQL
- Access HTTP headers (IP address, User-Agent, geo data)

So each app needs a small API endpoint that:
1. Receives tracking requests from the browser
2. Reads IP/User-Agent/geo from HTTP headers
3. Calls `trackPageView()` to write to the shared DB

This is typically ~20 lines of code per app.

---

## Geolocation: Vercel Headers

**Important:** This package is designed for apps hosted on **Vercel**.

Vercel automatically adds geolocation headers to every request:

| Header | Example | Description |
|--------|---------|-------------|
| `x-vercel-ip-country` | `US` | Country code |
| `x-vercel-ip-country-region` | `CA` | Region/state |
| `x-vercel-ip-city` | `San Francisco` | City name |

These headers are:
- **Free** - No third-party accounts or API keys needed
- **Automatic** - Available on every request when deployed to Vercel
- **Accurate** - Powered by Vercel's edge network

### Local Development

Geo headers are **not available** in local development (`localhost`). Location data will be `null` when developing locally - this is expected and won't affect functionality.

### Non-Vercel Hosting

If you're not using Vercel, you have options:
1. Skip location data (everything else works fine)
2. Use a GeoIP service/database and pass the data to `trackPageView()`
3. Check if your hosting provider offers similar geo headers

---

## Quick Start

### 1. Install

```bash
bun add @seneris/nosework
```

### 2. Set Environment Variables

Add to your `.env`:

```env
ANALYTICS_DATABASE_URL="postgresql://user:pass@host/dbname"
ANALYTICS_SITE_ID="my-app"  # Unique identifier for this app
```

### 3. Add Tracking Endpoint

Create `app/api/analytics/track/route.ts`:

```typescript
import { trackPageView } from '@seneris/nosework';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, referrer } = await request.json();

    await trackPageView({
      siteId: process.env.ANALYTICS_SITE_ID!,
      url,
      referrer,
      // For visitor hashing
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
      // Vercel geo headers (automatically provided when deployed)
      country: request.headers.get('x-vercel-ip-country'),
      countryCode: request.headers.get('x-vercel-ip-country'),
      region: request.headers.get('x-vercel-ip-country-region'),
      city: request.headers.get('x-vercel-ip-city'),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

### 4. Add Client Component

Create `components/Analytics.tsx`:

```typescript
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialLoad = useRef(true);

  useEffect(() => {
    // Track page view
    const trackPageView = () => {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          referrer: initialLoad.current ? document.referrer : null,
        }),
        keepalive: true, // Ensures request completes even on navigation
      }).catch(() => {
        // Silently fail - analytics should never break the app
      });

      initialLoad.current = false;
    };

    trackPageView();
  }, [pathname, searchParams]);

  return null;
}
```

### 5. Add to Layout

In `app/layout.tsx`:

```typescript
import { Analytics } from '@/components/Analytics';
import { Suspense } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
```

That's it! Your app is now tracking page views with location data.

---

## Alternative: Middleware-Only Tracking

If you prefer not to use a client component, you can track in Next.js middleware. This is simpler but won't capture client-side navigations in SPAs.

Create `middleware.ts`:

```typescript
import { trackPageView } from '@seneris/nosework';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Only track page requests, not API/static files
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Fire and forget - don't block the response
  trackPageView({
    siteId: process.env.ANALYTICS_SITE_ID!,
    url: request.url,
    referrer: request.headers.get('referer'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
    country: request.headers.get('x-vercel-ip-country'),
    countryCode: request.headers.get('x-vercel-ip-country'),
    region: request.headers.get('x-vercel-ip-country-region'),
    city: request.headers.get('x-vercel-ip-city'),
  }).catch(() => {});

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Tradeoffs:**

| Approach | Pros | Cons |
|----------|------|------|
| Client + API | Catches all navigations, including SPA | More setup (~2 files) |
| Middleware only | Single file, simpler | Misses client-side navigations |

---

## Tracking Custom Events

Beyond page views, you can track custom events:

```typescript
import { trackEvent } from '@seneris/nosework';

// In an API route or server action
await trackEvent({
  siteId: process.env.ANALYTICS_SITE_ID!,
  name: 'signup',
  properties: { plan: 'pro', source: 'landing-page' },
  ip: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
  userId: user?.id, // Optional - link to your user
});
```

Common events to track:
- `signup` - User registration
- `login` - User authentication
- `purchase` - Completed transaction
- `button_click` - Important UI interactions
- `form_submit` - Form completions
- `error` - Client-side errors

---

## Querying Analytics

### Basic Stats

```typescript
import { getStats } from '@seneris/nosework';

const stats = await getStats({
  siteId: 'my-app',
  startDate: new Date('2024-01-01'),
  endDate: new Date(),
});

// Returns:
// {
//   pageViews: 12345,
//   visitors: 5678,
//   sessions: 7890,
//   bounceRate: 42.5
// }
```

### Top Pages

```typescript
import { getTopPages } from '@seneris/nosework';

const pages = await getTopPages({
  siteId: 'my-app',
  startDate,
  endDate,
  limit: 10,
});

// Returns:
// [
//   { pathname: '/', pageViews: 5000, visitors: 3000 },
//   { pathname: '/pricing', pageViews: 2000, visitors: 1500 },
//   ...
// ]
```

### Location Breakdown

```typescript
import { getLocations } from '@seneris/nosework';

const locations = await getLocations({
  siteId: 'my-app',
  startDate,
  endDate,
  limit: 20,
});

// Returns:
// [
//   { country: 'United States', countryCode: 'US', city: 'New York', pageViews: 1000, visitors: 500 },
//   { country: 'Netherlands', countryCode: 'NL', city: 'Amsterdam', pageViews: 800, visitors: 400 },
//   ...
// ]
```

### Traffic Sources

```typescript
import { getReferrers } from '@seneris/nosework';

const referrers = await getReferrers({
  siteId: 'my-app',
  startDate,
  endDate,
  limit: 10,
});
```

### Device/Browser Breakdown

```typescript
import { getDevices } from '@seneris/nosework';

const devices = await getDevices({
  siteId: 'my-app',
  startDate,
  endDate,
});
```

### Time Series (for charts)

```typescript
import { getTimeSeries } from '@seneris/nosework';

const data = await getTimeSeries({
  siteId: 'my-app',
  startDate,
  endDate,
  interval: 'day', // 'hour' | 'day' | 'week' | 'month'
});

// Returns:
// [
//   { date: '2024-01-01', pageViews: 100, visitors: 50 },
//   { date: '2024-01-02', pageViews: 120, visitors: 60 },
//   ...
// ]
```

---

## Privacy Design

nosework is designed to be privacy-friendly by default:

### No Cookies
Visitors are identified by a hash of IP + User-Agent + daily salt. This hash rotates daily, so you can't track users across days (by design). The site ID is not part of the hash, so within one UTC day the same visitor produces the same hash on every site sharing the database — useful if you run several apps, and worth disclosing if you do.

### No PII Storage
- IP addresses are **never stored** - only used for hashing
- User-Agent strings are parsed into categories (e.g., "Chrome", "Windows") - raw strings are not stored
- The visitor hash cannot be reversed to identify the original IP

### Session Inference
Sessions are inferred using a 30-minute window hash. No session cookies needed.

### Bot Filtering
Known bots (Googlebot, crawlers, etc.) are automatically flagged and excluded from statistics.

---

## Privacy and Compliance

Short version, for the GDPR/ePrivacy question this package usually gets asked:

- **No cookie consent banner.** Nothing is written to, or read from, the
  visitor's device, so ePrivacy Directive Art. 5(3) — the rule that makes
  consent banners necessary — is never triggered. This is the same basis
  cookieless analytics products rely on.
- **You do still need privacy-policy text.** The processing that does happen
  (deriving the hashes, storing page metadata) rests on GDPR Art. 6(1)(f)
  legitimate interest, which carries Art. 13 transparency duties. Not needing
  a banner is not the same as not needing a disclosure.
- **A DPA may still apply.** nosework is self-hosted, but whoever hosts your
  app and your database (Vercel and Neon, in the common setup) processes that
  data on your behalf and is a sub-processor like any other.

`docs/PRIVACY.md` in the source repository documents every stored field, the
7-day salt lifetime the anonymity argument depends on, the retention jobs your
deployment has to schedule itself, and a paragraph you can adapt for a privacy
page.

*This is a summary of how the software behaves, not legal advice. Consult a
legal professional for your specific situation.*

---

## API Reference

### Tracking Functions

#### `trackPageView(options)`
Track a page view.

```typescript
interface TrackPageViewOptions {
  siteId: string;          // Required: Your site identifier
  url: string;             // Required: Full URL of the page
  referrer?: string;       // Optional: Referring URL
  ip?: string;             // Optional: Visitor IP (for hashing)
  userAgent?: string;      // Optional: Browser user agent
  userId?: string;         // Optional: Your app's user ID
  // Geo data (from Vercel headers)
  country?: string;        // Optional: Country name
  countryCode?: string;    // Optional: Country code (e.g., "US")
  region?: string;         // Optional: Region/state
  city?: string;           // Optional: City name
}
```

#### `trackEvent(options)`
Track a custom event.

```typescript
interface TrackEventOptions {
  siteId: string;          // Required: Your site identifier
  name: string;            // Required: Event name
  properties?: object;     // Optional: Event metadata
  url?: string;            // Optional: Page URL
  ip?: string;             // Optional: Visitor IP
  userAgent?: string;      // Optional: Browser user agent
  userId?: string;         // Optional: Your app's user ID
}
```

### Query Functions

All query functions accept:
```typescript
interface QueryOptions {
  siteId: string;
  startDate: Date;
  endDate: Date;
}

interface PaginatedQueryOptions extends QueryOptions {
  limit?: number;   // Default: 10-20 depending on function
  offset?: number;
}
```

| Function | Returns |
|----------|---------|
| `getStats(options)` | `{ pageViews, visitors, sessions, bounceRate }` |
| `getTopPages(options)` | `[{ pathname, pageViews, visitors }]` |
| `getLocations(options)` | `[{ country, countryCode, city, pageViews, visitors }]` |
| `getReferrers(options)` | `[{ referrer, pageViews, visitors }]` |
| `getDevices(options)` | `[{ device, browser, os, pageViews, visitors }]` |
| `getTimeSeries(options)` | `[{ date, pageViews, visitors }]` |

### Utility Functions

| Function | Description |
|----------|-------------|
| `getClient()` | Get the Drizzle client for custom queries |
| `disconnect()` | Disconnect from the database |
| `isBot(userAgent)` | Check if a user-agent is a bot |
| `parseUserAgent(ua)` | Parse a user-agent string |
| `cleanupOldSalts()` | Remove daily salts older than 7 days |
| `listSites()` | List every site that has reported a page view, derived from page-view data (there is no sites table) |
| `deleteOldPageViews(olderThan, siteId?)` | Delete page views older than a cutoff; omit `siteId` to sweep all sites |

---

## Database Schema

The package uses these tables (created by this repo's own Drizzle migrations in `drizzle/`, generated with `bun run db:generate` and applied with `bun run db:migrate`):

- **page_views** - Individual page view events with location, device info
- **events** - Custom events with properties
- **daily_salts** - Rotating salts for visitor hashing (privacy)
- **analytics_errors** - Individual error occurrences
- **error_groups** - Aggregated errors by fingerprint

See `src/schema.ts` for the Drizzle schema definitions.

`bun run db:migrate` assumes an empty database. If these tables already exist,
migration 0000 fails with `relation "page_views" already exists` — do not drop
and recreate them; mark the migration as applied instead. The catch-up
procedure is in `docs/ARCHITECTURE.md` in the source repository.

---

## Limitations

- **Vercel hosting required for geo data** - Location headers are provided by Vercel. Other hosts won't have geo data unless you add a third-party GeoIP service.
- **No local geo data** - When running locally, geo headers are not available. Location will be `null` in development.

---

## License

MIT
