import { getClient } from "./client.js";
import { pageViews } from "./schema.js";
import { eq, and, gte, lte, count, countDistinct, desc, asc, sql } from "drizzle-orm";
import type {
  QueryOptions,
  PaginatedQueryOptions,
  Stats,
  TopPage,
  LocationData,
  ReferrerData,
  DeviceData,
  SessionStats,
  SessionData,
  EntryExitPage,
  PageFlow,
} from "./types.js";

function buildWhereConditions(options: QueryOptions) {
  return and(
    eq(pageViews.siteId, options.siteId),
    gte(pageViews.timestamp, options.startDate),
    lte(pageViews.timestamp, options.endDate),
    eq(pageViews.isBot, false)
  );
}

export async function getStats(options: QueryOptions): Promise<Stats> {
  const db = getClient();
  const where = buildWhereConditions(options);

  // Get page views count
  const [pageViewCount] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(where);

  // Get unique visitors
  const [visitorCount] = await db
    .select({ count: countDistinct(pageViews.visitorHash) })
    .from(pageViews)
    .where(where);

  // Get unique sessions
  const [sessionCount] = await db
    .select({ count: countDistinct(pageViews.sessionId) })
    .from(pageViews)
    .where(where);

  // Calculate bounce rate (sessions with only 1 page view)
  const sessionPageCounts = await db
    .select({
      sessionId: pageViews.sessionId,
      pageCount: count(),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.sessionId);

  const totalSessions = sessionPageCounts.length;
  const bouncedSessions = sessionPageCounts.filter((s) => s.pageCount === 1).length;
  const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

  return {
    pageViews: pageViewCount?.count ?? 0,
    visitors: visitorCount?.count ?? 0,
    sessions: sessionCount?.count ?? 0,
    bounceRate: Math.round(bounceRate * 100) / 100,
  };
}

export async function getTopPages(
  options: PaginatedQueryOptions
): Promise<TopPage[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;

  // Group by pathname and count page views + unique visitors
  const results = await db
    .select({
      pathname: pageViews.pathname,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.pathname)
    .orderBy(desc(count()))
    .limit(limit);

  return results.map((r) => ({
    pathname: r.pathname,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
  }));
}

export async function getLocations(
  options: PaginatedQueryOptions
): Promise<LocationData[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 20;

  const results = await db
    .select({
      country: pageViews.country,
      countryCode: pageViews.countryCode,
      city: pageViews.city,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.country, pageViews.countryCode, pageViews.city)
    .orderBy(desc(count()))
    .limit(limit);

  return results.map((r) => ({
    country: r.country,
    countryCode: r.countryCode,
    city: r.city,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
  }));
}

export async function getReferrers(
  options: PaginatedQueryOptions
): Promise<ReferrerData[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;

  const results = await db
    .select({
      referrer: pageViews.referrer,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.referrer)
    .orderBy(desc(count()))
    .limit(limit);

  return results.map((r) => ({
    referrer: r.referrer,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
  }));
}

export async function getDevices(
  options: PaginatedQueryOptions
): Promise<DeviceData[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;

  const results = await db
    .select({
      device: pageViews.device,
      browser: pageViews.browser,
      os: pageViews.os,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.device, pageViews.browser, pageViews.os)
    .orderBy(desc(count()))
    .limit(limit);

  return results.map((r) => ({
    device: r.device,
    browser: r.browser,
    os: r.os,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
  }));
}

export interface TimeSeriesDataPoint {
  date: string;
  pageViews: number;
  visitors: number;
}

export async function getTimeSeries(
  options: QueryOptions & { interval?: "hour" | "day" | "week" | "month" }
): Promise<TimeSeriesDataPoint[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const interval = options.interval ?? "day";

  // Get all page views in range
  const results = await db
    .select({
      timestamp: pageViews.timestamp,
      visitorHash: pageViews.visitorHash,
    })
    .from(pageViews)
    .where(where)
    .orderBy(asc(pageViews.timestamp));

  // Group by interval
  const groups = new Map<string, { views: number; visitors: Set<string> }>();

  for (const pv of results) {
    const key = formatDateKey(pv.timestamp, interval);
    const group = groups.get(key) ?? { views: 0, visitors: new Set() };
    group.views++;
    group.visitors.add(pv.visitorHash);
    groups.set(key, group);
  }

  // Convert to array
  return Array.from(groups.entries()).map(([date, data]) => ({
    date,
    pageViews: data.views,
    visitors: data.visitors.size,
  }));
}

function formatDateKey(
  date: Date,
  interval: "hour" | "day" | "week" | "month"
): string {
  const d = new Date(date);

  switch (interval) {
    case "hour":
      return d.toISOString().slice(0, 13) + ":00";
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      // Get start of week (Sunday)
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      return d.toISOString().slice(0, 10);
    }
    case "month":
      return d.toISOString().slice(0, 7);
  }
}

// ============================================
// Session Analytics Functions
// ============================================

/**
 * Get aggregate session statistics
 */
export async function getSessionStats(
  options: QueryOptions
): Promise<SessionStats> {
  const db = getClient();
  const where = buildWhereConditions(options);

  // Get all page views grouped by session
  const results = await db
    .select({
      sessionId: pageViews.sessionId,
      timestamp: pageViews.timestamp,
    })
    .from(pageViews)
    .where(where)
    .orderBy(asc(pageViews.timestamp));

  // Group page views by session
  const sessions = new Map<string, Date[]>();
  for (const pv of results) {
    const timestamps = sessions.get(pv.sessionId) ?? [];
    timestamps.push(pv.timestamp);
    sessions.set(pv.sessionId, timestamps);
  }

  const totalSessions = sessions.size;
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      avgDuration: 0,
      avgPagesPerSession: 0,
      bounceRate: 0,
    };
  }

  let totalDuration = 0;
  let totalPageCount = 0;
  let bounceCount = 0;

  for (const timestamps of sessions.values()) {
    const pageCount = timestamps.length;
    totalPageCount += pageCount;

    if (pageCount === 1) {
      bounceCount++;
    } else {
      const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
      const firstTimestamp = sorted[0];
      const lastTimestamp = sorted[sorted.length - 1];
      if (firstTimestamp && lastTimestamp) {
        const duration = (lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000;
        totalDuration += duration;
      }
    }
  }

  return {
    totalSessions,
    avgDuration: Math.round(totalDuration / totalSessions),
    avgPagesPerSession: Math.round((totalPageCount / totalSessions) * 100) / 100,
    bounceRate: Math.round((bounceCount / totalSessions) * 100 * 100) / 100,
  };
}

/**
 * Get entry pages (first page of each session)
 */
export async function getEntryPages(
  options: PaginatedQueryOptions
): Promise<EntryExitPage[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;

  const results = await db
    .select({
      sessionId: pageViews.sessionId,
      pathname: pageViews.pathname,
      timestamp: pageViews.timestamp,
    })
    .from(pageViews)
    .where(where)
    .orderBy(asc(pageViews.timestamp));

  // Find first page view per session
  const sessionFirstPages = new Map<string, string>();
  for (const pv of results) {
    if (!sessionFirstPages.has(pv.sessionId)) {
      sessionFirstPages.set(pv.sessionId, pv.pathname);
    }
  }

  // Count entry pages
  const entryPageCounts = new Map<string, number>();
  for (const pathname of sessionFirstPages.values()) {
    entryPageCounts.set(pathname, (entryPageCounts.get(pathname) ?? 0) + 1);
  }

  const totalSessions = sessionFirstPages.size;

  return Array.from(entryPageCounts.entries())
    .map(([pathname, count]) => ({
      pathname,
      count,
      percentage: Math.round((count / totalSessions) * 100 * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get exit pages (last page of each session)
 */
export async function getExitPages(
  options: PaginatedQueryOptions
): Promise<EntryExitPage[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;

  const results = await db
    .select({
      sessionId: pageViews.sessionId,
      pathname: pageViews.pathname,
      timestamp: pageViews.timestamp,
    })
    .from(pageViews)
    .where(where)
    .orderBy(desc(pageViews.timestamp));

  // Find last page view per session
  const sessionLastPages = new Map<string, string>();
  for (const pv of results) {
    if (!sessionLastPages.has(pv.sessionId)) {
      sessionLastPages.set(pv.sessionId, pv.pathname);
    }
  }

  // Count exit pages
  const exitPageCounts = new Map<string, number>();
  for (const pathname of sessionLastPages.values()) {
    exitPageCounts.set(pathname, (exitPageCounts.get(pathname) ?? 0) + 1);
  }

  const totalSessions = sessionLastPages.size;

  return Array.from(exitPageCounts.entries())
    .map(([pathname, count]) => ({
      pathname,
      count,
      percentage: Math.round((count / totalSessions) * 100 * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get common page flow paths (sequence of pages in sessions)
 */
export async function getPageFlows(
  options: PaginatedQueryOptions & { maxPathLength?: number }
): Promise<PageFlow[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 10;
  const maxPathLength = options.maxPathLength ?? 5;

  const results = await db
    .select({
      sessionId: pageViews.sessionId,
      pathname: pageViews.pathname,
      timestamp: pageViews.timestamp,
    })
    .from(pageViews)
    .where(where)
    .orderBy(asc(pageViews.timestamp));

  // Build paths per session
  const sessionPaths = new Map<string, string[]>();
  for (const pv of results) {
    const path = sessionPaths.get(pv.sessionId) ?? [];
    // Only add if different from last (avoid duplicates from refreshes)
    if (path.length === 0 || path[path.length - 1] !== pv.pathname) {
      path.push(pv.pathname);
    }
    sessionPaths.set(pv.sessionId, path);
  }

  // Truncate paths and count
  const pathCounts = new Map<string, number>();
  for (const path of sessionPaths.values()) {
    const truncated = path.slice(0, maxPathLength);
    const key = JSON.stringify(truncated);
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
  }

  const totalSessions = sessionPaths.size;

  return Array.from(pathCounts.entries())
    .map(([key, count]) => ({
      path: JSON.parse(key) as string[],
      count,
      percentage: Math.round((count / totalSessions) * 100 * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get individual session data (for debugging/analysis)
 */
export async function getSessions(
  options: PaginatedQueryOptions
): Promise<SessionData[]> {
  const db = getClient();
  const where = buildWhereConditions(options);
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const results = await db
    .select({
      sessionId: pageViews.sessionId,
      visitorHash: pageViews.visitorHash,
      pathname: pageViews.pathname,
      timestamp: pageViews.timestamp,
      country: pageViews.country,
      device: pageViews.device,
      browser: pageViews.browser,
    })
    .from(pageViews)
    .where(where)
    .orderBy(asc(pageViews.timestamp));

  // Group by session
  const sessionMap = new Map<
    string,
    {
      visitorHash: string;
      pages: { pathname: string; timestamp: Date }[];
      country: string | null;
      device: string | null;
      browser: string | null;
    }
  >();

  for (const pv of results) {
    const existing = sessionMap.get(pv.sessionId);
    if (existing) {
      existing.pages.push({ pathname: pv.pathname, timestamp: pv.timestamp });
    } else {
      sessionMap.set(pv.sessionId, {
        visitorHash: pv.visitorHash,
        pages: [{ pathname: pv.pathname, timestamp: pv.timestamp }],
        country: pv.country,
        device: pv.device,
        browser: pv.browser,
      });
    }
  }

  // Convert to SessionData array
  const sessions: SessionData[] = [];
  for (const [sessionId, data] of sessionMap.entries()) {
    const sortedPages = data.pages.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const firstPage = sortedPages[0];
    const lastPage = sortedPages[sortedPages.length - 1];

    if (!firstPage || !lastPage) continue;

    const startTime = firstPage.timestamp;
    const endTime = lastPage.timestamp;
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    sessions.push({
      sessionId,
      visitorHash: data.visitorHash,
      startTime,
      endTime,
      duration,
      pageCount: sortedPages.length,
      entryPage: firstPage.pathname,
      exitPage: lastPage.pathname,
      isBounce: sortedPages.length === 1,
      country: data.country,
      device: data.device,
      browser: data.browser,
    });
  }

  // Sort by startTime descending and paginate
  return sessions
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(offset, offset + limit);
}
