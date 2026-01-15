import { getClient } from "./client.js";
import { analyticsErrors, errorGroups } from "./schema.js";
import { eq, and, gte, lte, lt, count, countDistinct, desc, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import type {
  TrackErrorOptions,
  ErrorStats,
  ErrorGroupData,
  ErrorInstance,
  ErrorGroupStatus,
} from "./types.js";

/**
 * Create a fingerprint for grouping similar errors
 * Normalizes variable parts to group similar errors together
 */
function createFingerprint(message: string, stack?: string | null): string {
  // Normalize message (remove variable parts)
  const normalizedMessage = message
    .replace(/\d+/g, "N") // Numbers → N
    .replace(/'[^']*'/g, "'S'") // Single-quoted strings → 'S'
    .replace(/"[^"]*"/g, '"S"') // Double-quoted strings → "S"
    .replace(/`[^`]*`/g, "`S`") // Template strings → `S`
    .replace(/0x[a-fA-F0-9]+/g, "0xHEX"); // Hex addresses → 0xHEX

  // Extract top stack frame (most relevant for grouping)
  let topFrame = "";
  if (stack) {
    const lines = stack.split("\n");
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("at ") || trimmed.match(/^\w+@/)) {
        topFrame = trimmed
          .replace(/:\d+:\d+/g, ":L:C")
          .replace(/\?.*/g, "");
        break;
      }
    }
  }

  const hash = createHash("sha256");
  hash.update(normalizedMessage + topFrame);
  return hash.digest("hex").slice(0, 16);
}

/**
 * Extract pathname from URL
 */
function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Track a JavaScript error
 */
export async function trackError(options: TrackErrorOptions): Promise<void> {
  const db = getClient();

  const fingerprint = createFingerprint(options.message, options.stack);
  const pathname = extractPathname(options.url);
  const now = new Date();

  // Create the error record
  await db.insert(analyticsErrors).values({
    siteId: options.siteId,
    message: options.message,
    stack: options.stack ?? null,
    fingerprint,
    url: options.url,
    pathname,
    visitorHash: options.visitorHash ?? null,
    sessionId: options.sessionId ?? null,
    userId: options.userId ?? null,
    browser: options.browser ?? null,
    browserVer: options.browserVer ?? null,
    os: options.os ?? null,
    device: options.device ?? null,
    metadata: options.metadata ?? null,
  });

  // Check if error group exists
  const [existingGroup] = await db
    .select()
    .from(errorGroups)
    .where(and(eq(errorGroups.siteId, options.siteId), eq(errorGroups.fingerprint, fingerprint)))
    .limit(1);

  if (existingGroup) {
    // Update existing group
    await db
      .update(errorGroups)
      .set({
        count: existingGroup.count + 1,
        lastSeen: now,
        ...(options.stack && { stack: options.stack }),
      })
      .where(eq(errorGroups.id, existingGroup.id));
  } else {
    // Create new group
    await db.insert(errorGroups).values({
      siteId: options.siteId,
      fingerprint,
      message: options.message,
      stack: options.stack ?? null,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      status: "open",
    });
  }
}

/**
 * Get error statistics
 */
export async function getErrorStats(
  siteId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<ErrorStats> {
  const db = getClient();

  // Build where conditions
  const whereConditions = [eq(analyticsErrors.siteId, siteId)];
  if (options?.startDate) {
    whereConditions.push(gte(analyticsErrors.timestamp, options.startDate));
  }
  if (options?.endDate) {
    whereConditions.push(lte(analyticsErrors.timestamp, options.endDate));
  }
  const where = and(...whereConditions);

  // Total errors
  const [totalResult] = await db
    .select({ count: count() })
    .from(analyticsErrors)
    .where(where);

  // Unique errors (by fingerprint)
  const [uniqueResult] = await db
    .select({ count: countDistinct(analyticsErrors.fingerprint) })
    .from(analyticsErrors)
    .where(where);

  // Errors in last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [todayResult] = await db
    .select({ count: count() })
    .from(analyticsErrors)
    .where(and(eq(analyticsErrors.siteId, siteId), gte(analyticsErrors.timestamp, oneDayAgo)));

  // Open error groups
  const [openResult] = await db
    .select({ count: count() })
    .from(errorGroups)
    .where(and(eq(errorGroups.siteId, siteId), eq(errorGroups.status, "open")));

  return {
    totalErrors: totalResult?.count ?? 0,
    uniqueErrors: uniqueResult?.count ?? 0,
    errorsToday: todayResult?.count ?? 0,
    openGroups: openResult?.count ?? 0,
  };
}

/**
 * Get error groups (aggregated errors by fingerprint)
 */
export async function getErrorGroups(
  siteId: string,
  options?: {
    status?: ErrorGroupStatus;
    limit?: number;
    offset?: number;
  }
): Promise<ErrorGroupData[]> {
  const db = getClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const whereConditions = [eq(errorGroups.siteId, siteId)];
  if (options?.status) {
    whereConditions.push(eq(errorGroups.status, options.status));
  }

  const groups = await db
    .select()
    .from(errorGroups)
    .where(and(...whereConditions))
    .orderBy(desc(errorGroups.lastSeen))
    .limit(limit)
    .offset(offset);

  return groups.map((g) => ({
    id: g.id,
    fingerprint: g.fingerprint,
    message: g.message,
    stack: g.stack,
    count: g.count,
    firstSeen: g.firstSeen,
    lastSeen: g.lastSeen,
    status: g.status as ErrorGroupStatus,
  }));
}

/**
 * Get individual error instances for a specific error group
 */
export async function getErrorInstances(
  siteId: string,
  fingerprint: string,
  options?: { limit?: number; offset?: number }
): Promise<ErrorInstance[]> {
  const db = getClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const errors = await db
    .select()
    .from(analyticsErrors)
    .where(and(eq(analyticsErrors.siteId, siteId), eq(analyticsErrors.fingerprint, fingerprint)))
    .orderBy(desc(analyticsErrors.timestamp))
    .limit(limit)
    .offset(offset);

  return errors.map((e) => ({
    id: e.id,
    message: e.message,
    stack: e.stack,
    url: e.url,
    pathname: e.pathname,
    visitorHash: e.visitorHash,
    sessionId: e.sessionId,
    userId: e.userId,
    browser: e.browser,
    browserVer: e.browserVer,
    os: e.os,
    device: e.device,
    metadata: e.metadata as Record<string, unknown> | null,
    timestamp: e.timestamp,
  }));
}

/**
 * Update error group status
 */
export async function updateErrorGroupStatus(
  siteId: string,
  fingerprint: string,
  status: ErrorGroupStatus
): Promise<void> {
  const db = getClient();

  await db
    .update(errorGroups)
    .set({ status })
    .where(and(eq(errorGroups.siteId, siteId), eq(errorGroups.fingerprint, fingerprint)));
}

/**
 * Delete errors older than a certain date
 * Useful for manual cleanup
 */
export async function deleteOldErrors(
  siteId: string,
  olderThan: Date
): Promise<{ deletedErrors: number; deletedGroups: number }> {
  const db = getClient();

  // Delete old error instances
  const deletedErrors = await db
    .delete(analyticsErrors)
    .where(and(eq(analyticsErrors.siteId, siteId), lt(analyticsErrors.timestamp, olderThan)))
    .returning({ id: analyticsErrors.id });

  // Get fingerprints that still have errors
  const remainingFingerprints = await db
    .select({ fingerprint: analyticsErrors.fingerprint })
    .from(analyticsErrors)
    .where(eq(analyticsErrors.siteId, siteId))
    .groupBy(analyticsErrors.fingerprint);

  const activeFingerprints = new Set(remainingFingerprints.map((r) => r.fingerprint));

  // Get all groups for this site
  const allGroups = await db
    .select({ id: errorGroups.id, fingerprint: errorGroups.fingerprint })
    .from(errorGroups)
    .where(eq(errorGroups.siteId, siteId));

  // Find groups to delete
  const groupIdsToDelete = allGroups
    .filter((g) => !activeFingerprints.has(g.fingerprint))
    .map((g) => g.id);

  let deletedGroupCount = 0;
  if (groupIdsToDelete.length > 0) {
    const deletedGroups = await db
      .delete(errorGroups)
      .where(inArray(errorGroups.id, groupIdsToDelete))
      .returning({ id: errorGroups.id });
    deletedGroupCount = deletedGroups.length;
  }

  return {
    deletedErrors: deletedErrors.length,
    deletedGroups: deletedGroupCount,
  };
}
