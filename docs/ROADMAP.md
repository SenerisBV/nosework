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
- [x] Unit tests for core functions (34 tests across 5 files, all DB-free)
- [ ] Integration tests with test database
- [ ] Edge case coverage (malformed URLs, missing headers)

### Developer Experience
- [ ] Better error messages
- [ ] Debug mode for development
- [ ] TypeScript strict mode compliance

---

## Phase 3: Dashboard Integration

**Goal:** Provide a pre-built dashboard or easy dashboard components.

### Option A: Dashboard Components
- [ ] React components for common visualizations
- [ ] Stats cards component
- [ ] Time series chart component
- [ ] Top pages list component
- [ ] Location breakdown component
- [ ] Referrer list component

### Option B: API Enhancements
- [ ] GraphQL API option
- [ ] Real-time subscriptions (WebSocket)
- [ ] Export to CSV/JSON
- [ ] Scheduled reports

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

## Phase 6: LLM Analytics ✅ COMPLETE

**Goal:** Track LLM API usage across apps (`@seneris/nosework-llm` package).

### Tracking
- [x] `trackLLMCall()` - Record model, tokens, latency, cost
- [x] `withLLMTracking()` - Wrapper for automatic tracking
- [x] Built-in pricing for 50+ models (OpenAI, Anthropic, Google, Mistral, etc.)
- [x] Conversation grouping via conversationId
- [x] Cost estimation

### Queries
- [x] `getLLMStats()` - Total calls, tokens, cost, error rate
- [x] `getLLMUsageByModel()` - Breakdown by model
- [x] `getLLMTimeSeries()` - Usage over time
- [x] `getLLMCalls()` - Individual call list
- [x] `getConversation()` - Calls by conversation ID
- [x] `getLLMUsageByUser()` - Per-user breakdown

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
- [ ] Role-based access (if dashboard built)
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
