# Privacy

This document describes exactly what `@seneris/nosework` collects, stores,
and retains when used for page-view tracking (`trackPageView()`), and why no
cookie consent banner is required for that tracking. Every claim below is
checked against the source in this repository — `src/schema.ts`,
`src/utils.ts`, `src/track.ts`, and `src/retention.ts` — as of this writing.
It does not cover custom event tracking (`trackEvent()`) or error tracking
(`trackError()`); see [Scope](#scope) below.

nosework is a library. It does not run as a hosted service and does not
schedule anything itself — the functions described below (`trackPageView()`,
`cleanupOldSalts()`, `deleteOldPageViews()`) are called by whichever
application integrates the package. Where this document describes retention
or cleanup as "enforced," that enforcement depends on the integrating
deployment actually invoking those functions on a schedule. See
[Retention](#retention) for why this matters.

## What is stored, per page view

Every field written by `trackPageView()`, matched against the `pageViews`
table in `src/schema.ts`:

| Field | Description |
|---|---|
| `siteId` | Identifier for the site/app that recorded the view, supplied by the integrating application. |
| `url` | The full URL of the page viewed, as passed to `trackPageView()`. |
| `pathname` | The path portion of that URL, extracted server-side. |
| `referrer` | The referring URL, cleaned before storage: `trackPageView()` parses it and keeps only the origin and path (`refUrl.origin + refUrl.pathname`) — the query string is discarded. If the referrer isn't a parseable URL, it's stored as given. |
| `visitorHash` | A 16-character hash identifying the visitor without cookies. See [How visitors are counted](#how-visitors-are-counted-without-cookies). |
| `sessionId` | A hash identifying the visiting session. See [Sessions](#sessions). |
| `country`, `countryCode`, `region`, `city` | Geographic location, passed through from whatever the integrating application supplies (in practice, Vercel's geo headers — see [Sub-processors and data location](#sub-processors-and-data-location)). |
| `browser`, `browserVer` | Browser name and *major version only* (e.g. `Chrome`, `128`), parsed from the User-Agent string. |
| `os`, `osVer` | Operating system name and *major version only*, parsed the same way. |
| `device` | Device class: `desktop`, `mobile`, or `tablet`. |
| `userId` | **Optional, and not populated unless the integrating application passes one.** `trackPageView()` accepts an optional `userId` to link a page view to the site's own user accounts. If a site passes it, whatever value it passes is stored as-is. This document makes no claim about what that value is — a site that populates `userId` is introducing its own identifier and is responsible for accounting for it in its own privacy notice. |
| `isBot` | `true` if the User-Agent matched the bot pattern list at write time (see [Limits](#limits)); `false` otherwise. Statistics queries filter on `isBot = false`. |
| `timestamp` | When the row was written. |
| `id` | An internally generated UUID used only as the row's primary key. It is not derived from, and does not encode, anything about the visitor. |

Every column in the `pageViews` table is accounted for above; nothing in
this list is stored beyond what's in `src/schema.ts`.

## What is never stored

- No cookies are set.
- No `localStorage`, `sessionStorage`, or any other client-side storage is
  used or written to.
- No raw IP address. The IP is used only as hashing input (see below) and is
  never written to any column or log.
- No raw User-Agent string. It's parsed into `browser` / `browserVer` /
  `os` / `osVer` / `device` and discarded.
- No cross-site identifier — `visitorHash` is derived per site view and
  rotates daily (see below); it is not a persistent ID shared across sites
  or sessions.
- No device fingerprint (canvas, fonts, screen size, timezone, etc. are
  never collected).
- No advertising identifier.

## How visitors are counted without cookies

A random 32-byte salt is generated once per UTC calendar day and stored in
the `daily_salts` table (`getDailySalt()` in `src/utils.ts`). A visitor is
identified by:

```
visitorHash = sha256(ip | userAgent | dailySalt).slice(0, 16)
```

(`computeVisitorIds()` in `src/utils.ts`.) The IP address is used only as
input to this hash — it is never written to disk anywhere in the system.

Because the salt rotates at UTC midnight, the same person visiting on two
different days produces two unrelated hashes with no way to link them back
to each other, even by someone with full database access. The hash itself
cannot be reversed to recover the originating IP.

Salts older than 7 days are deleted by `cleanupOldSalts()`. Once a day's
salt is gone, that day's `visitorHash` values can no longer be re-derived or
matched against an IP by anyone — including the operator of the site.

## Sessions

A `sessionId` is derived, not stored client-side: it's the same hash input
as the visitor hash, plus a 30-minute time bucket computed arithmetically
from the current time, then hashed again. Nothing is written to the
visitor's device to make this work.

## Retention

Page views are retained for **24 months**, enforced by `deleteOldPageViews()`
run on a daily schedule by the integrating deployment.

This retention period rests on a specific fact: because the daily salt is
destroyed after 7 days, a `visitorHash` older than a week cannot be traced
back to an IP address by anyone, including the operator — doing so would
require brute-forcing against a salt that no longer exists. Past that
one-week point, what's retained is anonymous aggregate statistics rather
than data about an identifiable person, so the GDPR storage-limitation
principle (Art. 5(1)(e)) applies far more weakly to it than it would to
identifiable data.

**This justification depends on the salt-cleanup job actually running.**
`cleanupOldSalts()` is a function this package exports; it is not invoked by
anything inside this repository. If a deployment enables page-view tracking
without also scheduling `cleanupOldSalts()` (e.g., daily, alongside
`deleteOldPageViews()`), salts accumulate indefinitely and the anonymity
argument above does not hold — the deployment would then be storing
data that remains re-identifiable for the full 24-month retention window,
not just the first 7 days.

## Legal basis

These two questions are separate, and answered separately:

**Is consent required to run this tracking at all?** No. ePrivacy Directive
Article 5(3) requires consent for *storing information on, or gaining
access to information stored on, a user's terminal equipment* — the classic
case being a cookie or similar client-side storage. nosework does neither:
nothing is written to the visitor's device, and nothing is read from it.
Because the article's trigger condition doesn't occur, no consent gate
applies to this tracking. This is the same basis Plausible and Fathom rely
on for their cookieless tracking.

**Under what basis is the resulting data processed?** GDPR still applies to
the processing that does happen (deriving and storing the hashes and page
metadata above), independent of the ePrivacy question. The basis is
legitimate interest, GDPR Article 6(1)(f) — a site operator's interest in
understanding aggregate traffic to a site they operate, balanced against the
minimal impact on visitors given the hashing, the lack of any persistent
identifier, and the bounded retention period.

These are not the same question, and satisfying one does not satisfy the
other: the ePrivacy analysis is why no *banner* is required; the GDPR
analysis is why the *processing* is nonetheless lawful.

## Sub-processors and data location

- **Vercel** — hosting for the applications that integrate nosework.
  Vercel resolves each request's approximate geographic location at the
  edge and passes only the result (country, region, city) to the
  application as request headers; nosework and the integrating application
  never contact a separate geolocation service or send the visitor's IP
  address to one. Functions are pinned to the `fra1` (Frankfurt) region.
- **Neon** — the Postgres database. The project is provisioned in
  `eu-central-1` (Frankfurt).

All processing and storage described in this document occurs within the EU.

## Scope

This document covers `trackPageView()` — the page-view tracking that the
no-consent-banner position rests on. It does not cover:

- **`trackEvent()`**, which accepts an arbitrary `properties` object
  supplied by the integrating application. Whatever a site puts in
  `properties` is stored as given; this document makes no claim about it.
- **`trackError()`**, which stores error `message`, `stack`, and an
  arbitrary `metadata` object, again supplied by the integrating
  application.

A site that uses either of these must review what it passes to them and
account for it in its own privacy notice — the guarantees above (no PII, no
raw IP, no raw User-Agent, no cross-site identifier) apply to the page-view
path described in this document, not to arbitrary data a site chooses to
attach to a custom event or error report.

## Limits

This section exists because a document that overclaims is worse than none.

- **Geolocation is approximate.** `country` / `countryCode` / `region` /
  `city` come from Vercel's IP-to-location lookup, which is city-level and
  not always exact. A visitor using a VPN or corporate proxy will resolve
  to that service's location, not their own.
- **Bot filtering is a pattern list, not a guarantee.** `isBot()` in
  `src/utils.ts` matches the User-Agent string against a fixed list of known
  bot signatures (major search crawlers, headless browsers, social-media
  link previewers, etc.). It can miss automated traffic that doesn't match
  any pattern — that traffic is stored with `isBot = false`, the same as a
  real visitor. It can also occasionally flag a genuine visitor whose
  User-Agent happens to match a pattern, storing `isBot = true` for them.
  What happens next only cuts one way, though: statistics queries filter on
  `isBot = false`, and a filter can only remove rows, never add them — so
  whatever error the query-time filtering step itself introduces can only
  **undercount** a site's real traffic (by dropping a misclassified human),
  never inflate it. Any inflation instead comes from bots the pattern list
  missed upstream, which are indistinguishable from real visitors once
  written.
- **This is not legal advice.** This document describes what the software
  does and does not do, verified against its source. Whether that is
  sufficient for a specific site's obligations is a judgment a site
  operator has to make for their own situation — including whether they've
  actually scheduled `cleanupOldSalts()` and `deleteOldPageViews()`, and
  what (if anything) they pass through `trackEvent()`, `trackError()`, or
  the optional `userId` field.

## What you can quote on a privacy page

> This site uses cookieless analytics. No cookies are set and nothing is
> stored in your browser. To count visits without cookies, we take your IP
> address and browser type, combine them with a random value that changes
> every day, and turn the result into a one-way code — we never store your
> IP address itself, and the code can't be turned back into it. Starting a
> week after your visit, even we can no longer connect that code to you.
> We keep page-visit data (which pages were viewed, roughly where from, and
> what kind of device) for up to 24 months, after which it's deleted. This
> processing happens within the EU.
