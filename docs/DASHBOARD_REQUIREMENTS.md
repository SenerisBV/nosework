# Dashboard Requirements

The analytics dashboard is a standalone Next.js app in its own git repo,
`~/projects/stats.seneris.nl`, providing a unified view across all tracked
applications. It is not a route inside any tracked app's codebase: since the
dashboard reads *all* sites, coupling it to one tracked app's repo would make
no sense.

> **Local-only (decided 2026-09-15).** The dashboard is **not deployed** and is
> not intended to be. It runs on the operator's machine, against the same
> database the tracked apps write to. The repo name is a holdover from the
> original plan to host it at `stats.seneris.nl`; there is no Vercel project,
> no public URL, and nothing to reach from the internet.
>
> The reasoning: a dashboard that is never exposed cannot be accessed by anyone
> else, which removes the authentication problem rather than solving it. No
> login, no session cookie, no password to rotate or leak.
>
> **What this shifts onto the operator.** Deployment was also going to provide
> *scheduling*. Vercel Cron was to invoke `cleanupOldSalts()` and
> `deleteOldPageViews()` nightly. With nothing deployed, nothing invokes them
> unless the operator arranges it. This matters beyond tidiness: the 7-day salt
> lifetime is what makes the privacy claims in `PRIVACY.md` true, because while
> a day's salt row survives, a `visitorHash` can still be recomputed from a
> candidate IP + User-Agent. Salts accumulating indefinitely would quietly
> falsify that document. Where this scheduling lives is an open question owned
> by the dashboard repo.

## Overview

The dashboard provides a full-suite analytics view combining:
- Web/traffic analytics (page views, visitors, sessions)
- Product analytics (events, user journeys, conversions)
- Error tracking (JS errors, stack traces, resolution status)
- LLM analytics (token usage, costs, latency)

## Time Range Selection

### Available Ranges
- **Realtime** - Last 30 minutes, auto-refreshing
- **Today** - Current day
- **7 days** - Last 7 days
- **30 days** - Last 30 days
- **90 days** - Last 90 days
- **Custom** - Date picker for arbitrary ranges

### Realtime Mode
- Polls every 10-30 seconds
- Shows: current active users, recent page views, recent errors
- Sparkline showing last 30 minutes of activity

---

## Dashboard Sections

### 1. Overview / Home

**Key Metrics Cards (top row):**
| Metric | Source | Comparison |
|--------|--------|------------|
| Page Views | PageView count | vs previous period |
| Unique Visitors | Distinct visitorHash | vs previous period |
| Sessions | Distinct sessionId | vs previous period |
| Bounce Rate | Single-page sessions % | vs previous period |
| Active Errors | ErrorGroup where status='open' | count |
| LLM Cost | Sum of estimatedCost | vs previous period |

**Charts:**
- Time series: Page views + visitors over time (line chart)
- Time series: LLM tokens/cost over time (if LLM tracking enabled)

**Quick Lists:**
- Top 5 pages (by views)
- Top 5 referrers
- Recent errors (last 5, linked to error detail)

---

### 2. Traffic Analytics

**Metrics:**
- Page views, visitors, sessions, bounce rate
- Avg session duration
- Pages per session

**Visualizations:**
- Time series chart (page views, visitors, sessions)
- Top pages table (pathname, views, visitors, avg time)
- Entry pages vs Exit pages comparison
- Geographic map (by country/city)
- Device breakdown (desktop/mobile/tablet pie chart)
- Browser breakdown
- OS breakdown

**Filters:**
- By site (if multi-site)
- By device type
- By country
- By referrer source

---

### 3. Session Analytics

**Metrics:**
- Total sessions
- Avg duration
- Avg pages per session
- Bounce rate

**Visualizations:**
- Session duration distribution (histogram)
- Pages per session distribution
- Entry pages (where users land)
- Exit pages (where users leave)
- Page flows / User journeys (Sankey diagram or flow chart)

**Session Explorer:**
- List of individual sessions
- Click to see page sequence for that session
- Filter by: bounced, duration, entry page, device

---

### 4. Events

> ⚠️ **Blocked — no backing queries exist.** `trackEvent()` writes to the
> `events` table, but `src/query.ts` in nosework contains no functions that
> read it. Nothing in this section can be built against `@seneris/nosework`
> 0.3.0. The query functions have to be written and released in the package
> first; see the Phase 3 gap in `ROADMAP.md`.

**Metrics:**
- Total events
- Unique event types
- Events per session

**Visualizations:**
- Event counts by name (bar chart)
- Event trends over time
- Event breakdown table (name, count, unique users)

**Event Explorer:**
- Search/filter by event name
- View event properties
- See which users triggered events

---

### 5. Error Tracking

**Metrics:**
- Total errors (in period)
- Unique errors (by fingerprint)
- Open error groups
- Error rate (errors per 1000 page views)

**Visualizations:**
- Error trend over time
- Errors by browser/device
- Error groups table:
  - Message (truncated)
  - Count
  - First seen / Last seen
  - Status (open/resolved/ignored)
  - Affected users count

**Error Detail View:**
- Full error message
- Stack trace (formatted, with source maps if available)
- Affected URLs
- Browser/device breakdown for this error
- Individual occurrences list
- Actions: Mark resolved, Mark ignored, Delete

---

### 6. LLM Analytics

> ⚠️ **Blocked — the package it depends on does not exist.**
> `@seneris/nosework-llm` has never been built or published, and nosework's
> schema has no LLM table. See Phase 6 in `ROADMAP.md` for what building it
> would actually involve. This section is a specification for later, not
> buildable work.

**Metrics:**
- Total API calls
- Total tokens (input + output)
- Total cost (USD)
- Avg latency
- Error rate

**Visualizations:**
- Cost over time (line chart)
- Tokens over time (stacked: input vs output)
- Usage by model (bar chart or table)
- Usage by user (if userId tracked)
- Latency distribution (histogram)

**Tables:**
- Model breakdown: provider, model, calls, tokens, cost, avg latency
- User breakdown: userId, calls, tokens, cost
- Recent calls: timestamp, model, tokens, cost, latency, status

**Filters:**
- By provider (OpenAI, Anthropic, etc.)
- By model
- By user
- By success/failure

---

### 7. Settings

**Site Management:**
- List of tracked sites, from `listSites()`
- View site ID for integration

Sites are not registered: `listSites()` derives the list from page-view data,
and a site appears the moment it reports its first page view. There is no
sites table, so there is nothing to add or rename here.

**Data Management:**
- Export data (CSV/JSON)
- Data retention settings
- Delete old data

**Pricing Management (LLM):**
- View current model prices
- Override prices for specific models

---

## Multi-Site Support

- Site selector in header/sidebar
- "All sites" option for aggregate view
- Per-site filtering throughout dashboard
- Site comparison mode (side-by-side metrics)

---

## User Permissions

**There are none, by design.** The dashboard is local-only and never exposed,
so access control is handled by the fact that reaching it requires being at the
operator's machine.

This supersedes two earlier designs, both now obsolete:

1. The tiered admin/regular-user model originally sketched here. There was
   never a login identity to tier permissions by.
2. The single shared `DASHBOARD_PASSWORD` that replaced it, and which *was*
   implemented — signed session cookie, `/login` route, protected route group.
   That work exists in the dashboard repo's history and is being removed now
   that nothing is reachable.

If the dashboard is ever exposed to the network, this section has to be
rewritten before that happens, not after.

---

## Technical Requirements

### Data Freshness
- Standard views: data up to 1 minute old
- Realtime view: 10-30 second refresh
- Heavy queries (flows, funnels): cached for 5 minutes

### Performance
- Paginate large tables (50 items default)
- Lazy load charts below the fold
- Use aggregation tables for frequently accessed metrics (future optimization)

### Mobile Responsiveness
- Dashboard should work on tablet
- Key metrics viewable on phone
- Full functionality on desktop

---

## Implementation Phases

Status as of 2026-09-15, read from the dashboard repo's commit history.

### Phase 1: Core Dashboard ✅ BUILT
- [x] Overview page with key metrics (headline stat tiles)
- [x] Traffic analytics — top pages, locations, referrers, devices
- [x] Time range selection (URL-driven range picker) and site switcher
- [x] Zero-filled traffic chart

### Phase 2: Session & Events — PARTLY BUILT
- [x] Session analytics panel with entry/exit pages and page flows
- [ ] Event tracking views — **blocked**, see section 4 above

### Phase 3: Error Tracking UI — NOT STARTED
- [ ] Error groups list
- [ ] Error detail view
- [ ] Status management (resolve/ignore)

All the query functions this needs already ship in 0.3.0, so it is buildable
today.

### Phase 4: LLM Analytics UI — BLOCKED
- [ ] Cost and usage charts
- [ ] Model breakdown
- [ ] User usage tracking

Blocked on a package that does not exist; see section 6 above.

### Phase 5: Polish
- Realtime mode
- Multi-site comparison
- Export functionality
- Mobile optimization
