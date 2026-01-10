import { getClient } from "./client.js";
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

interface WhereClause {
  siteId: string;
  timestamp: { gte: Date; lte: Date };
  isBot: boolean;
}

function buildWhere(options: QueryOptions): WhereClause {
  return {
    siteId: options.siteId,
    timestamp: {
      gte: options.startDate,
      lte: options.endDate,
    },
    isBot: false, // Exclude bots by default
  };
}

export async function getStats(options: QueryOptions): Promise<Stats> {
  const db = getClient();
  const where = buildWhere(options);

  // Get page views count
  const pageViews = await db.pageView.count({ where });

  // Get unique visitors
  const visitorsResult = await db.pageView.groupBy({
    by: ["visitorHash"],
    where,
  });
  const visitors = visitorsResult.length;

  // Get unique sessions
  const sessionsResult = await db.pageView.groupBy({
    by: ["sessionId"],
    where,
  });
  const sessions = sessionsResult.length;

  // Calculate bounce rate (sessions with only 1 page view)
  const sessionPageCounts = await db.pageView.groupBy({
    by: ["sessionId"],
    where,
    _count: { id: true },
  });

  const bouncedSessions = sessionPageCounts.filter(
    (s) => s._count.id === 1
  ).length;
  const bounceRate = sessions > 0 ? (bouncedSessions / sessions) * 100 : 0;

  return {
    pageViews,
    visitors,
    sessions,
    bounceRate: Math.round(bounceRate * 100) / 100,
  };
}

export async function getTopPages(
  options: PaginatedQueryOptions
): Promise<TopPage[]> {
  const db = getClient();
  const where = buildWhere(options);
  const limit = options.limit ?? 10;

  // Group by pathname and count
  const results = await db.pageView.groupBy({
    by: ["pathname"],
    where,
    _count: { id: true },
  });

  // Get unique visitors per page (need separate query)
  const pageVisitors = await Promise.all(
    results.map(async (r) => {
      const uniqueVisitors = await db.pageView.groupBy({
        by: ["visitorHash"],
        where: { ...where, pathname: r.pathname },
      });
      return {
        pathname: r.pathname,
        pageViews: r._count.id,
        visitors: uniqueVisitors.length,
      };
    })
  );

  // Sort by page views and limit
  return pageVisitors
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, limit);
}

export async function getLocations(
  options: PaginatedQueryOptions
): Promise<LocationData[]> {
  const db = getClient();
  const where = buildWhere(options);
  const limit = options.limit ?? 20;

  // Group by country and city
  const results = await db.pageView.groupBy({
    by: ["country", "countryCode", "city"],
    where,
    _count: { id: true },
  });

  // Get unique visitors per location
  const locationData = await Promise.all(
    results.map(async (r) => {
      const uniqueVisitors = await db.pageView.groupBy({
        by: ["visitorHash"],
        where: {
          ...where,
          country: r.country,
          city: r.city,
        },
      });
      return {
        country: r.country,
        countryCode: r.countryCode,
        city: r.city,
        pageViews: r._count.id,
        visitors: uniqueVisitors.length,
      };
    })
  );

  // Sort by page views and limit
  return locationData
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, limit);
}

export async function getReferrers(
  options: PaginatedQueryOptions
): Promise<ReferrerData[]> {
  const db = getClient();
  const where = buildWhere(options);
  const limit = options.limit ?? 10;

  // Group by referrer
  const results = await db.pageView.groupBy({
    by: ["referrer"],
    where,
    _count: { id: true },
  });

  // Get unique visitors per referrer
  const referrerData = await Promise.all(
    results.map(async (r) => {
      const uniqueVisitors = await db.pageView.groupBy({
        by: ["visitorHash"],
        where: { ...where, referrer: r.referrer },
      });
      return {
        referrer: r.referrer,
        pageViews: r._count.id,
        visitors: uniqueVisitors.length,
      };
    })
  );

  // Sort by page views and limit
  return referrerData
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, limit);
}

export async function getDevices(
  options: PaginatedQueryOptions
): Promise<DeviceData[]> {
  const db = getClient();
  const where = buildWhere(options);
  const limit = options.limit ?? 10;

  // Group by device, browser, os
  const results = await db.pageView.groupBy({
    by: ["device", "browser", "os"],
    where,
    _count: { id: true },
  });

  // Get unique visitors per device combo
  const deviceData = await Promise.all(
    results.map(async (r) => {
      const uniqueVisitors = await db.pageView.groupBy({
        by: ["visitorHash"],
        where: {
          ...where,
          device: r.device,
          browser: r.browser,
          os: r.os,
        },
      });
      return {
        device: r.device,
        browser: r.browser,
        os: r.os,
        pageViews: r._count.id,
        visitors: uniqueVisitors.length,
      };
    })
  );

  // Sort by page views and limit
  return deviceData
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, limit);
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
  const where = buildWhere(options);
  const interval = options.interval ?? "day";

  // Get all page views in range
  const pageViews = await db.pageView.findMany({
    where,
    select: { timestamp: true, visitorHash: true },
    orderBy: { timestamp: "asc" },
  });

  // Group by interval
  const groups = new Map<string, { views: number; visitors: Set<string> }>();

  for (const pv of pageViews) {
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
  const where = buildWhere(options);

  // Get all page views grouped by session
  const pageViews = await db.pageView.findMany({
    where,
    select: { sessionId: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Group page views by session
  const sessions = new Map<string, Date[]>();
  for (const pv of pageViews) {
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
      // Single page view = 0 duration
    } else {
      // Duration = last timestamp - first timestamp
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
  const where = buildWhere(options);
  const limit = options.limit ?? 10;

  // Get all page views with session info
  const pageViews = await db.pageView.findMany({
    where,
    select: { sessionId: true, pathname: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Find first page view per session
  const sessionFirstPages = new Map<string, string>();
  for (const pv of pageViews) {
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

  // Convert to array and sort
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
  const where = buildWhere(options);
  const limit = options.limit ?? 10;

  // Get all page views with session info
  const pageViews = await db.pageView.findMany({
    where,
    select: { sessionId: true, pathname: true, timestamp: true },
    orderBy: { timestamp: "desc" }, // Descending to get last pages first
  });

  // Find last page view per session
  const sessionLastPages = new Map<string, string>();
  for (const pv of pageViews) {
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

  // Convert to array and sort
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
  const where = buildWhere(options);
  const limit = options.limit ?? 10;
  const maxPathLength = options.maxPathLength ?? 5;

  // Get all page views with session info
  const pageViews = await db.pageView.findMany({
    where,
    select: { sessionId: true, pathname: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Build paths per session
  const sessionPaths = new Map<string, string[]>();
  for (const pv of pageViews) {
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

  // Convert to array and sort
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
  const where = buildWhere(options);
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Get all page views
  const pageViews = await db.pageView.findMany({
    where,
    select: {
      sessionId: true,
      visitorHash: true,
      pathname: true,
      timestamp: true,
      country: true,
      device: true,
      browser: true,
    },
    orderBy: { timestamp: "asc" },
  });

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

  for (const pv of pageViews) {
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

    // Skip if somehow we have no pages (shouldn't happen)
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

  // Sort by startTime descending (most recent first) and paginate
  return sessions
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(offset, offset + limit);
}

// Get or create a site
export async function getOrCreateSite(
  domain: string,
  name?: string
): Promise<{ id: string; name: string; domain: string }> {
  const db = getClient();

  let site = await db.site.findUnique({ where: { domain } });

  if (!site) {
    site = await db.site.create({
      data: {
        domain,
        name: name ?? domain,
      },
    });
  }

  return site;
}

// List all sites
export async function listSites(): Promise<
  { id: string; name: string; domain: string; createdAt: Date }[]
> {
  const db = getClient();
  return db.site.findMany({ orderBy: { name: "asc" } });
}
