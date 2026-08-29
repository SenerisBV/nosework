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
| `visitorHash` | A 16-character hash identifying the visitor *on this site*, without cookies. The `siteId` is part of the hash input, so the same visitor gets a different value on each site. See [How visitors are counted](#how-visitors-are-counted-without-cookies). |
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
- No client-side identifier, and no cross-site identifier. The
  `visitorHash` is never written to or read from the visitor's device, is
  not an advertising ID, and is not shared with any third party. It is
  scoped per site: the `siteId` is part of the hash input, so the same
  visitor on the same day produces a *different* `visitorHash` on each
  site sharing this database, and grouping page views by that value cannot
  link one person's activity across an operator's sites. That separation
  is not cryptographic against the operator, though — while the day's salt
  still exists (up to 7 days), anyone holding it can recompute the hash for
  any `siteId` from a candidate IP and User-Agent. It stops being derivable
  at all once the salt is deleted, which is a week later, not at midnight
  rotation. See
  [How visitors are counted](#how-visitors-are-counted-without-cookies).
- No device fingerprint (canvas, fonts, screen size, timezone, etc. are
  never collected).
- No advertising identifier.

## How visitors are counted without cookies

A random 32-byte salt is generated once per UTC calendar day and stored in
the `daily_salts` table (`getDailySalt()` in `src/utils.ts`). A visitor is
identified by:

```
visitorHash = sha256(siteId | ip | userAgent | dailySalt).slice(0, 16)
```

(`computeVisitorIds()` in `src/utils.ts`.) The IP address is used only as
input to this hash — it is never written to disk anywhere in the system.

The salt rotates at UTC midnight, so the same person visiting on two
different days produces two unrelated hashes: nothing in the values
themselves connects one to the other, and neither can be reversed to
recover the originating IP. What the rotation does *not* do is put that
connection out of reach immediately. While both days' salts still exist,
someone holding the database can take a candidate IP and User-Agent,
recompute both days' hashes, and match them. The link becomes
undiscoverable when the salt is **deleted**, not when it rotates — see the
7-day cleanup below. Everything this document says about hashes ceasing to
be re-derivable is a claim about that deletion.

**The hash input includes the `siteId`.** `computeVisitorIds()` takes the
site, the IP, the User-Agent, the salt and the time; `trackPageView()` and
`trackEvent()` pass the site down. So the same visitor, on the same day,
produces a *different* `visitorHash` on every site that shares this
database. Grouping page views by `visitorHash` cannot reconstruct one
person's browsing across an operator's sites — it could before the hash was
site-scoped, and no longer can. This is the same reason Plausible folds the
site's domain into its hash.

Two limits on that separation, stated plainly because a document that
overclaims is worse than none:

- **It is not cryptographic against the operator.** Site scoping puts the
  link beyond a `GROUP BY`, not beyond an operator who sets out to find it.
  While the day's salt still exists — up to 7 days — anyone holding it can
  compute the hash for *any* `siteId` from a candidate IP and User-Agent,
  and so match a suspected person's rows across sites. What ends that is
  the salt's deletion below, not the site scoping.
- **The other stored columns can correlate a visitor with no hash
  involved.** Every row still carries country/region/city, browser and
  major version, OS and major version, device class and a timestamp. That
  tuple is identical across sites for the same visitor, and on a
  low-traffic site it is often close to unique — so two sites in one
  deployment can be lined up on it directly. Site-scoping the hash removes
  the exact, trivial join; it does not remove every route to correlation.

Salts older than 7 days are deleted by `cleanupOldSalts()`. Once a day's
salt is gone, that day's `visitorHash` values can no longer be re-derived,
matched against an IP, or recomputed for a different site by anyone —
including the operator of the site.

## Sessions

A `sessionId` is derived, not stored client-side: it's the same hash input
as the visitor hash, plus a 30-minute time bucket computed arithmetically
from the current time, then hashed again. Nothing is written to the
visitor's device to make this work.

## Retention

The intended retention period is **24 months**, enforced by
`deleteOldPageViews()`, which a deployment is expected to run on a daily
schedule.

**As with `cleanupOldSalts()`, nothing inside this repository actually
invokes `deleteOldPageViews()`.** It is a function this package exports,
not a job that runs on its own. Until a deployment schedules it — daily,
alongside `cleanupOldSalts()` — page views are not deleted at all, and "24
months" describes a target the code is built to support, not something
currently happening. This document's claim that retention is "24 months"
is only true for a deployment that has actually wired up that schedule.

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
minimal impact on visitors given the hashing, the absence of any identifier
that reaches the visitor's device, leaves the operator's own database, or
spans the operator's sites, the 7-day salt lifetime after which the stored
hashes can no longer be re-derived by anyone, and the bounded retention
period.

These are not the same question, and satisfying one does not satisfy the
other: the ePrivacy analysis is why no *banner* is required; the GDPR
analysis is why the *processing* is nonetheless lawful.

## Sub-processors and data location

- **Vercel** — hosting for the applications that integrate nosework.
  Vercel resolves each request's approximate geographic location at the
  edge and passes only the result (country, region, city) to the
  application as request headers.
- **Neon** — the Postgres database.

nosework's own code makes no outbound network calls to resolve location —
it never contacts a geolocation service and never sends a visitor's IP
address anywhere. `country` / `region` / `city` are stored exactly as the
integrating application supplies them (`src/types.ts` documents these as
"Geo data (from Vercel headers or other source)" — nosework accepts
whatever it's given). In the common case that source is Vercel's built-in
geo headers, which is what the rest of this document assumes. If a
deployment instead sources this data from a third-party GeoIP service, that
service is a sub-processor nosework has no visibility into, and the
deployment operator is responsible for disclosing it themselves — the same
way [Scope](#scope) applies to `trackEvent()` and `trackError()`.

For this operator's own deployment specifically: Vercel functions are
pinned to `fra1` (Frankfurt) and the Neon project is provisioned in
`eu-central-1` (Frankfurt), so all processing and storage occurs within the
EU. That is a fact about this deployment, not a property of the nosework
library — a different deployment choosing different regions or a
non-Vercel geo source would need to state its own data location here.

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
raw IP, no raw User-Agent, no client-side storage) apply to the page-view
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
  written. Separately, `isBot()` (`src/utils.ts`) also treats a missing or
  empty User-Agent as a bot outright — a real visitor whose client
  suppresses the User-Agent header (privacy-hardened browsers, some
  proxies) is flagged `isBot = true` and excluded from statistics the same
  way a crawler would be. This is another source of undercounting, not
  overcounting.
- **This is not legal advice.** This document describes what the software
  does and does not do, verified against its source. Whether that is
  sufficient for a specific site's obligations is a judgment a site
  operator has to make for their own situation — including whether they've
  actually scheduled `cleanupOldSalts()` and `deleteOldPageViews()`, and
  what (if anything) they pass through `trackEvent()`, `trackError()`, or
  the optional `userId` field.

## What you can quote on a privacy page

**If your integration passes `userId` to `trackPageView()`, do not quote the
paragraph below unmodified.** The sentence "even we can no longer connect
that code to you" is false for those page views — the stored `userId`
links the row back to your own user account regardless of salt rotation.
Either drop that sentence, or add a clause noting that visits tied to a
logged-in user remain identifiable to you for the full retention period.

**If your deployment is not hosted and stored in the EU, drop the final
sentence or substitute your own regions.** "This processing happens within
the EU" is a fact about this operator's deployment (Vercel `fra1`, Neon
`eu-central-1`), not a property of the library — see
[Sub-processors and data location](#sub-processors-and-data-location).

**If you run more than one site against a single nosework database, the
code below is different on each of them.** The site is part of the hash
input, so the paragraph holds for each site standing on its own, and the
codes do not join up between your sites. Two things it still does not say:
until the day's salt is deleted a week later you could, with the database
in hand, recompute a suspected visitor's code for any of your sites and
match them that way; and the location, browser, OS and device columns are
the same across your sites for the same visitor, so on a low-traffic site
they can be lined up with no code involved at all. Neither is something a query hands you, but neither
is impossible.

> This site uses cookieless analytics. No cookies are set and nothing is
> stored in your browser. To count visits without cookies, we take your IP
> address and browser type, combine them with a random value that changes
> every day, and turn the result into a one-way code — we never store your
> IP address itself, and the code can't be turned back into it. Starting a
> week after your visit, even we can no longer connect that code to you.
> We keep page-visit data (which pages were viewed, roughly where from, and
> what kind of device) for up to 24 months, after which it's deleted. This
> processing happens within the EU.
