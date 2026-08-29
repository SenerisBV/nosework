import { getClient } from "./client.js";
import { pageViews } from "./schema.js";
import { count, countDistinct, desc, eq, max } from "drizzle-orm";

export interface SiteSummary {
  siteId: string;
  pageViews: number;
  visitors: number;
  lastSeen: Date | null;
}

/**
 * List every site that has ever reported a page view, busiest first.
 *
 * There is no sites table — siteId is a bare column written by whichever app
 * is reporting — so the list is derived from the data. A site appears here as
 * soon as it sends its first non-bot page view, with no registration step.
 */
export async function listSites(): Promise<SiteSummary[]> {
  const db = getClient();

  const rows = await db
    .select({
      siteId: pageViews.siteId,
      pageViewCount: count(),
      visitorCount: countDistinct(pageViews.visitorHash),
      lastSeen: max(pageViews.timestamp),
    })
    .from(pageViews)
    .where(eq(pageViews.isBot, false))
    .groupBy(pageViews.siteId)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    siteId: r.siteId,
    pageViews: r.pageViewCount,
    visitors: r.visitorCount,
    lastSeen: r.lastSeen ?? null,
  }));
}
