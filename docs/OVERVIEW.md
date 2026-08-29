# nosework - Overview

## What is nosework?

nosework is a privacy-focused, self-hosted analytics package designed for tracking page views and events across multiple applications. It's built specifically for app suites hosted on Vercel that share a common PostgreSQL database.

## Why nosework?

### The Problem

Most analytics solutions either:
- **Require third-party services** (Google Analytics, Mixpanel) - privacy concerns, GDPR complexity
- **Need separate infrastructure** (Plausible, Umami) - another service to maintain
- **Don't support multi-site** - each app needs its own setup

### The Solution

nosework is an npm package that:
- Writes directly to your existing database infrastructure (Neon PostgreSQL)
- Tracks multiple apps/sites with a unified view
- Uses Vercel's built-in geo headers - no third-party GeoIP service
- Is completely cookieless, so no consent banner is required (see `PRIVACY.md` for what that does and does not settle)

## Core Philosophy

### Privacy First
- **No cookies** - Visitors identified by daily-rotating hash
- **No PII stored** - IPs used only for hashing, never persisted
- **User-Agent anonymized** - Parsed to categories, raw strings discarded
- **No consent banner** - Nothing is written to or read from the visitor's device, so ePrivacy Art. 5(3) is never triggered. You do still need privacy-policy text; see `PRIVACY.md`.

### Simplicity
- Single npm package, not a separate service
- ~20 lines of integration code per app
- No accounts, API keys, or external dependencies for core functionality
- Uses infrastructure you already have (Vercel, Neon)

### Developer Experience
- Full TypeScript support
- Query API for building custom dashboards
- Direct database access for advanced use cases

## Target Use Case

nosework is ideal for:
- **App suites** - Multiple apps under one organization
- **Vercel-hosted apps** - Leverages Vercel's geo headers
- **Privacy-conscious projects** - Cookieless by construction, with the privacy claims written down and checked against the source in `PRIVACY.md`
- **Developers who want control** - Own your data, query it however you want

## What nosework is NOT

- Not a full-featured analytics platform (no heatmaps, session recordings)
- Not designed for non-Vercel hosts (geo data won't work)
- Not a real-time analytics dashboard (though you could build one)
- Not suitable for extremely high traffic without optimization

## Key Features

| Feature | Description |
|---------|-------------|
| Page view tracking | Track every page visit with URL, referrer, device info |
| Event tracking | Custom events with arbitrary properties |
| Location data | Country, region, city via Vercel headers |
| Device/browser detection | Parsed from User-Agent |
| Bot filtering | Automatic exclusion of known bots |
| Multi-site support | One database, many apps |
| Query API | Programmatic access to all analytics data |
| Cookieless | No consent banners required |
