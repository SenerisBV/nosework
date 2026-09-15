# nosework - Roadmap

## Vision

nosework aims to be the simplest, most privacy-respecting analytics solution for developers building app suites on Vercel. The goal is not to compete with full-featured analytics platforms, but to provide exactly what's needed for understanding user behavior without compromising privacy.

---

## Phase 1: Core Package ✅ COMPLETE

**Goal:** Working npm package with basic tracking and querying.

- [x] Page view tracking with `trackPageView()`
- [x] Custom event tracking with `trackEvent()`
- [x] Cookieless visitor identification
- [x] User-Agent parsing (browser, OS, device)
- [x] Bot detection and filtering
- [x] Vercel geo headers integration
- [x] Query functions (stats, pages, locations, referrers, devices)
- [x] Time series data for charts
- [x] Multi-site support
- [x] TypeScript types
- [x] Documentation

---

## Phase 2: Production Hardening

**Goal:** Make the package production-ready with better error handling and edge cases.

### Error Handling
- [ ] Graceful degradation when DB unavailable
- [ ] Retry logic for transient failures
- [ ] Structured error types for debugging
- [ ] Logging integration (optional)

### Performance
- [ ] Connection pooling optimization for serverless
- [ ] Query performance analysis for large datasets
- [ ] Index optimization recommendations

### Testing
- [x] Unit tests for core functions (35 tests across 5 files, all DB-free)
- [ ] Integration tests with test database
- [ ] Edge case coverage (malformed URLs, missing headers)

### Developer Experience
- [ ] Better error messages
- [ ] Debug mode for development
- [ ] TypeScript strict mode compliance

---

## Phase 3: Dashboard — DECIDED, built outside this package

**Goal:** A way to actually look at the data.

**Decision (2026-09-15):** neither option below. The dashboard is a separate
Next.js application, `~/projects/stats.seneris.nl`, which consumes this
package's query functions as an ordinary npm dependency. It runs **locally
only** — never deployed, never publicly reachable, and therefore with no
authentication to build or maintain. See `DASHBOARD_REQUIREMENTS.md`.

What this settles: nosework ships query functions, not UI. Option A is not
planned — shipping React components would put a UI framework in the dependency
tree of a package that otherwise runs server-side only, and would tie dashboard
changes to package releases.

### Option A: Dashboard Components — not planned
- [ ] ~~React components for common visualizations~~
- [ ] ~~Stats cards component~~
- [ ] ~~Time series chart component~~
- [ ] ~~Top pages list component~~
- [ ] ~~Location breakdown component~~
- [ ] ~~Referrer list component~~

### Option B: API Enhancements — still open, none scheduled
- [ ] Export to CSV/JSON
- [ ] Scheduled reports
- [ ] ~~GraphQL API option~~ — dropped; the only consumer queries the database directly
- [ ] ~~Real-time subscriptions (WebSocket)~~ — dropped; a local dashboard can poll

### Gap this phase depends on
- [ ] **Event analytics queries** — `trackEvent()` writes to the `events`
      table and nothing reads it. `src/query.ts` has no event functions at all,
      so the Events section of `DASHBOARD_REQUIREMENTS.md` cannot be built
      against 0.3.0. This is package work, not dashboard work.

---

## Phase 4: Session Analytics ✅ COMPLETE

**Goal:** Add session-level analytics without compromising privacy.

### Session Metrics
- [x] `getSessionStats()` - Total sessions, avg duration, pages per session, bounce rate
- [x] `getEntryPages()` - Most common entry pages with percentages
- [x] `getExitPages()` - Most common exit pages with percentages
- [x] `getPageFlows()` - Common user paths through the site
- [x] `getSessions()` - Individual session data for debugging

All derived from existing PageView data (no schema changes required).

---

## Phase 5: Error Tracking ✅ COMPLETE

**Goal:** Capture and aggregate client-side JavaScript errors.

### Error Capture
- [x] `trackError()` - Server-side error tracking function
- [x] Client-side error capture script (~2KB) - `@seneris/nosework/client/errors`
- [x] Error fingerprinting for grouping similar errors
- [x] Stack trace storage and parsing

### Error Queries
- [x] `getErrorStats()` - Error counts and unique errors
- [x] `getErrorGroups()` - Grouped errors by fingerprint
- [x] `getErrorInstances()` - Individual error occurrences
- [x] `updateErrorGroupStatus()` - Mark errors resolved/ignored
- [x] `deleteOldErrors()` - Clean up old error data

---

## Phase 6: LLM Analytics — SPECIFIED, NEVER BUILT

**Goal:** Track LLM API usage across apps, as a companion
`@seneris/nosework-llm` package.

> **Corrected 2026-09-15.** This phase was previously marked ✅ COMPLETE with
> every item checked. That was wrong: none of it exists. `@seneris/nosework-llm`
> returns 404 from the npm registry, there is no such directory on the
> development machine, and `git log --all --diff-filter=A` shows no LLM source
> ever committed to this repository. The checkmarks appear to have recorded an
> intent to build rather than a build.
>
> The design is real, though, and predates this package standing alone: a
> `LLMCall` Prisma model still sits in `~/projects/moopysuite/prisma/schema.prisma`
> under the comment `// Analytics - LLM Usage Tracking (nosework-llm)`. That is
> from the era removed by commits `53ee8e8` and `f242382`, when nosework was
> coupled to MoopySuite's schema. nosework now owns its own Drizzle schema, and
> that schema has **no LLM table** — see `drizzle/0000_init.sql`, which creates
> five tables, none of them for LLM calls.
>
> So building this means: a table and migration here, then the package. The
> checklist below is a specification, not a status report.

### Tracking
- [ ] `trackLLMCall()` - Record model, tokens, latency, cost
- [ ] `withLLMTracking()` - Wrapper for automatic tracking
- [ ] Built-in pricing for 50+ models (OpenAI, Anthropic, Google, Mistral, etc.)
- [ ] Conversation grouping via conversationId
- [ ] Cost estimation

### Queries
- [ ] `getLLMStats()` - Total calls, tokens, cost, error rate
- [ ] `getLLMUsageByModel()` - Breakdown by model
- [ ] `getLLMTimeSeries()` - Usage over time
- [ ] `getLLMCalls()` - Individual call list
- [ ] `getConversation()` - Calls by conversation ID
- [ ] `getLLMUsageByUser()` - Per-user breakdown

### Prerequisite
- [ ] `llm_calls` table in `src/schema.ts` plus a generated migration

---

## Phase 7: Advanced Features

**Goal:** Add features for power users without compromising simplicity.

### Funnel Analysis
- [ ] Define conversion funnels
- [ ] Track funnel progression
- [ ] Funnel visualization queries

### A/B Testing Integration
- [ ] Variant tracking
- [ ] Conversion attribution
- [ ] Statistical significance helpers

### Retention
- [ ] Cohort analysis
- [ ] Return visitor tracking
- [ ] Engagement metrics

---

## Phase 8: Scale & Enterprise

**Goal:** Support larger deployments and team use cases.

### Performance at Scale
- [ ] Batch write mode
- [ ] Async queue processing
- [ ] Read replica support
- [ ] Data archival/cleanup

### Team Features
- [ ] ~~Role-based access~~ — moot; the dashboard is local-only and single-operator
- [ ] Audit logging
- [ ] API rate limiting

### Compliance
- [ ] Data retention policies
- [ ] GDPR data export
- [ ] GDPR data deletion
- [ ] Compliance documentation

---

## Non-Goals

These are explicitly **not** planned:

- **Session recordings** - Privacy concern, different product category
- **Heatmaps** - Requires significant client-side code
- **Form analytics** - Too specific, users can track via events
- **Performance monitoring** - Use Vercel Analytics for Web Vitals
- **Non-Vercel hosting** - Geo headers are Vercel-specific by design

---

## Contributing Ideas

If you have ideas for features, consider:

1. Does it align with the privacy-first philosophy?
2. Can it be done without additional dependencies?
3. Is it useful for the multi-app suite use case?
4. Does it keep the package simple?

Good candidates:
- Utility functions that help with common queries
- Performance optimizations
- Better TypeScript types
- Documentation improvements
