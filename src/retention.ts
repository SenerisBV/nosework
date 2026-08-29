import { getClient } from "./client.js";
import { pageViews } from "./schema.js";
import { and, eq, lt } from "drizzle-orm";

/**
 * Delete page views older than the given cutoff.
 *
 * Enforces the stated retention period. Omit siteId to sweep every site, which
 * is what the scheduled retention job does — deleteOldErrors() requires a
 * siteId, but a retention cron has no list of sites to iterate.
 *
 * @returns the number of rows deleted
 */
export async function deleteOldPageViews(
  olderThan: Date,
  siteId?: string
): Promise<number> {
  const db = getClient();

  const where = siteId
    ? and(eq(pageViews.siteId, siteId), lt(pageViews.timestamp, olderThan))
    : lt(pageViews.timestamp, olderThan);

  const deleted = await db
    .delete(pageViews)
    .where(where)
    .returning({ id: pageViews.id });

  return deleted.length;
}
