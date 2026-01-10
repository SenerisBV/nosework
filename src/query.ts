import { getClient } from "./client.js";
import type {
  QueryOptions,
  PaginatedQueryOptions,
  Stats,
  TopPage,
  LocationData,
  ReferrerData,
  DeviceData,
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
