import { getClient } from "./client.js";
import { pageViews, events } from "./schema.js";
import { parseUserAgent } from "./ua.js";
import { isBot, getVisitorInfo, extractPathname } from "./utils.js";
import type { TrackPageViewOptions, TrackEventOptions } from "./types.js";

export async function trackPageView(
  options: TrackPageViewOptions
): Promise<void> {
  const {
    siteId,
    url,
    referrer,
    ip,
    userAgent,
    userId,
    // Geo data passed directly (e.g., from Vercel headers)
    country,
    countryCode,
    region,
    city,
  } = options;

  // Normalize undefined to null
  const ipNorm = ip ?? null;
  const uaNorm = userAgent ?? null;

  // Get visitor info (hashes for privacy)
  const { visitorHash, sessionId } = await getVisitorInfo(ipNorm, uaNorm);

  // Parse user agent
  const ua = parseUserAgent(uaNorm);

  // Detect bots
  const isBotRequest = isBot(uaNorm);

  // Extract pathname from URL
  const pathname = extractPathname(url);

  // Clean referrer (remove query params for privacy)
  let cleanReferrer = referrer ?? null;
  if (cleanReferrer) {
    try {
      const refUrl = new URL(cleanReferrer);
      // Only keep the domain for external referrers
      cleanReferrer = refUrl.origin + refUrl.pathname;
    } catch {
      // Keep as-is if not a valid URL
    }
  }

  const db = getClient();

  await db.insert(pageViews).values({
    siteId,
    url,
    pathname,
    referrer: cleanReferrer,
    visitorHash,
    sessionId,
    country: country ?? null,
    countryCode: countryCode ?? null,
    region: region ?? null,
    city: city ?? null,
    browser: ua.browser,
    browserVer: ua.browserVer,
    os: ua.os,
    osVer: ua.osVer,
    device: ua.device,
    userId: userId ?? null,
    isBot: isBotRequest,
  });
}

export async function trackEvent(options: TrackEventOptions): Promise<void> {
  const { siteId, name, properties, url, ip, userAgent, userId } = options;

  // Normalize undefined to null
  const ipNorm = ip ?? null;
  const uaNorm = userAgent ?? null;

  // Get visitor info (hashes for privacy)
  const { visitorHash, sessionId } = await getVisitorInfo(ipNorm, uaNorm);

  const db = getClient();

  await db.insert(events).values({
    siteId,
    name,
    properties: properties ?? null,
    url: url ?? null,
    visitorHash,
    sessionId,
    userId: userId ?? null,
  });
}
