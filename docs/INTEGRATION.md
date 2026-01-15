# Integrating nosework into Your App

Step-by-step guide for adding analytics to a Next.js app using `@seneris/nosework`.

---

## Prerequisites

- Next.js app (App Router recommended)
- Access to MoopySuite database (or separate PostgreSQL)
- `MOOPY_CLIENT_ID` environment variable (if using MoopySuite OAuth)

---

## 1. Install Package

```bash
# Using bun
bun add @seneris/nosework

# Using npm
npm install @seneris/nosework

# Using yarn
yarn add @seneris/nosework
```

---

## 2. Environment Variables

Add to your `.env.local`:

```env
# Required: Database connection
ANALYTICS_DATABASE_URL="postgresql://user:pass@host/dbname"

# Required: Site identifier (use MOOPY_CLIENT_ID if using MoopySuite OAuth)
MOOPY_CLIENT_ID="your-app-name"
```

**MoopySuite users:** Use the same connection string as MoopySuite's `DATABASE_URL`.

---

## 3. Create Tracking API Endpoint

Create `app/api/analytics/track/route.ts`:

```typescript
import { trackPageView } from '@seneris/nosework';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, referrer } = await request.json();

    await trackPageView({
      siteId: process.env.MOOPY_CLIENT_ID!,
      url,
      referrer,
      // Visitor identification (for hashing - not stored)
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      // Vercel geo headers (automatically provided when deployed)
      country: request.headers.get('x-vercel-ip-country') || undefined,
      countryCode: request.headers.get('x-vercel-ip-country') || undefined,
      region: request.headers.get('x-vercel-ip-country-region') || undefined,
      city: request.headers.get('x-vercel-ip-city') || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

---

## 4. Create Client Tracking Component

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
    const track = () => {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          referrer: initialLoad.current ? document.referrer : null,
        }),
        keepalive: true,
      }).catch(() => {
        // Silently fail - analytics should never break the app
      });

      initialLoad.current = false;
    };

    track();
  }, [pathname, searchParams]);

  return null;
}
```

---

## 5. Add to Root Layout

Update `app/layout.tsx`:

```typescript
import { Analytics } from '@/components/Analytics';
import { Suspense } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

That's it for basic page view tracking!

---

## 6. Track Custom Events (Optional)

For tracking user actions like signups, purchases, etc.

### Create Event API Endpoint

Create `app/api/analytics/event/route.ts`:

```typescript
import { trackEvent } from '@seneris/nosework';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { name, properties, url } = await request.json();

    await trackEvent({
      siteId: process.env.MOOPY_CLIENT_ID!,
      name,
      properties,
      url,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Event tracking error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

### Track Events from Client

```typescript
// In your component
const trackEvent = (name: string, properties?: Record<string, unknown>) => {
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      properties,
      url: window.location.href,
    }),
    keepalive: true,
  }).catch(() => {});
};

// Usage
<button onClick={() => trackEvent('signup_click', { plan: 'pro' })}>
  Sign Up
</button>
```

---

## 7. Error Tracking (Optional)

Automatically capture JavaScript errors.

### Create Error API Endpoint

Create `app/api/analytics/error/route.ts`:

```typescript
import { trackError } from '@seneris/nosework';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, stack, url, metadata } = await request.json();

    await trackError({
      siteId: process.env.MOOPY_CLIENT_ID!,
      message,
      stack,
      url,
      metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error tracking failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

### Add Client-Side Error Capture

Update `components/Analytics.tsx`:

```typescript
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { initErrorTracking, stopErrorTracking } from '@seneris/nosework/client/errors';

export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialLoad = useRef(true);

  // Page view tracking
  useEffect(() => {
    const track = () => {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          referrer: initialLoad.current ? document.referrer : null,
        }),
        keepalive: true,
      }).catch(() => {});

      initialLoad.current = false;
    };

    track();
  }, [pathname, searchParams]);

  // Error tracking
  useEffect(() => {
    initErrorTracking({
      endpoint: '/api/analytics/error',
      siteId: process.env.NEXT_PUBLIC_MOOPY_CLIENT_ID!,
    });

    return () => stopErrorTracking();
  }, []);

  return null;
}
```

Add to `.env.local`:
```env
NEXT_PUBLIC_MOOPY_CLIENT_ID="your-app-name"
```

---

## 8. LLM Tracking (Optional)

For apps using OpenAI, Anthropic, or other LLM APIs.

### Install LLM Package

```bash
bun add @seneris/nosework-llm
```

### Track LLM Calls

```typescript
import { trackLLMCall, estimateCost } from '@seneris/nosework-llm';

// After making an LLM API call
const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
});

await trackLLMCall({
  siteId: process.env.MOOPY_CLIENT_ID!,
  provider: 'openai',
  model: 'gpt-4-turbo',
  inputTokens: response.usage?.prompt_tokens ?? 0,
  outputTokens: response.usage?.completion_tokens ?? 0,
  latencyMs: responseTime,
  success: true,
  conversationId: chatId, // Optional
  userId: user?.id, // Optional
});
```

### Using the Wrapper

```typescript
import { withLLMTracking } from '@seneris/nosework-llm';

const trackedOpenAI = withLLMTracking(openai, {
  siteId: process.env.MOOPY_CLIENT_ID!,
  provider: 'openai',
});

// Calls are automatically tracked
const response = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## 9. Link to Authenticated Users (Optional)

Pass `userId` to link analytics to your app's users:

```typescript
await trackPageView({
  siteId: process.env.MOOPY_CLIENT_ID!,
  url,
  referrer,
  userId: session?.user?.id, // From your auth system
  // ... other fields
});
```

This enables:
- Per-user analytics in dashboard
- User journey tracking
- LLM usage per user

---

## Verification

After deploying, verify tracking is working:

1. Visit your app and navigate between pages
2. Check browser Network tab for `/api/analytics/track` requests (should return `{ ok: true }`)
3. Query the database to confirm data:

```sql
SELECT * FROM page_views WHERE "siteId" = 'your-app-name' ORDER BY timestamp DESC LIMIT 10;
```

---

## Troubleshooting

### No data appearing

1. Check `ANALYTICS_DATABASE_URL` is set correctly
2. Verify `MOOPY_CLIENT_ID` matches your app's OAuth client_id
3. Check server logs for tracking errors

### Geo data is null

This is expected in local development. Vercel geo headers are only available when deployed to Vercel.

### Prisma client errors

Run `bunx prisma generate` in your app to regenerate the client after installing/updating nosework.

---

## Next Steps

- View analytics in MoopySuite dashboard
- Set up alerts for error spikes
- Monitor LLM costs

---

## API Reference

See the main [README](../README.md) for full API documentation.
