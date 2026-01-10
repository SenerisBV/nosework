import { getClient } from "./client.js";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
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
    // Find first line that looks like a stack frame (starts with "at " or similar)
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("at ") || trimmed.match(/^\w+@/)) {
        // Normalize file paths and line numbers
        topFrame = trimmed
          .replace(/:\d+:\d+/g, ":L:C") // Line:column → L:C
          .replace(/\?.*/g, ""); // Remove query strings
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
  await db.error.create({
    data: {
      siteId: options.siteId,
      message: options.message,
      stack: options.stack,
      fingerprint,
      url: options.url,
      pathname,
      visitorHash: options.visitorHash,
      sessionId: options.sessionId,
      userId: options.userId,
      browser: options.browser,
      browserVer: options.browserVer,
      os: options.os,
      device: options.device,
      metadata: (options.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  // Upsert the error group
  await db.errorGroup.upsert({
    where: {
      siteId_fingerprint: {
        siteId: options.siteId,
        fingerprint,
      },
    },
    create: {
      siteId: options.siteId,
      fingerprint,
      message: options.message,
      stack: options.stack,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      status: "open",
    },
    update: {
      count: { increment: 1 },
      lastSeen: now,
      // Update message/stack if this is a clearer example
      ...(options.stack && { stack: options.stack }),
    },
  });
}

/**
 * Get error statistics
 */
export async function getErrorStats(
  siteId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<ErrorStats> {
  const db = getClient();

  const where = {
    siteId,
    ...(options?.startDate || options?.endDate
      ? {
          timestamp: {
            ...(options?.startDate && { gte: options.startDate }),
            ...(options?.endDate && { lte: options.endDate }),
          },
        }
      : {}),
  };

  const totalErrors = await db.error.count({ where });

  const uniqueResult = await db.error.groupBy({
    by: ["fingerprint"],
    where,
  });
  const uniqueErrors = uniqueResult.length;

  // Errors in last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const errorsToday = await db.error.count({
    where: {
      siteId,
      timestamp: { gte: oneDayAgo },
    },
  });

  // Open error groups
  const openGroups = await db.errorGroup.count({
    where: { siteId, status: "open" },
  });

  return {
    totalErrors,
    uniqueErrors,
    errorsToday,
    openGroups,
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

  const groups = await db.errorGroup.findMany({
    where: {
      siteId,
      ...(options?.status && { status: options.status }),
    },
    orderBy: { lastSeen: "desc" },
    take: limit,
    skip: offset,
  });

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

  const errors = await db.error.findMany({
    where: { siteId, fingerprint },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

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

  await db.errorGroup.update({
    where: {
      siteId_fingerprint: { siteId, fingerprint },
    },
    data: { status },
  });
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
  const deletedErrors = await db.error.deleteMany({
    where: {
      siteId,
      timestamp: { lt: olderThan },
    },
  });

  // Delete error groups with no remaining errors
  // First, get fingerprints that still have errors
  const remainingFingerprints = await db.error.groupBy({
    by: ["fingerprint"],
    where: { siteId },
  });
  const activeFingerprints = new Set(remainingFingerprints.map((r) => r.fingerprint));

  // Delete groups not in active fingerprints
  const allGroups = await db.errorGroup.findMany({
    where: { siteId },
    select: { fingerprint: true },
  });

  const groupsToDelete = allGroups
    .filter((g) => !activeFingerprints.has(g.fingerprint))
    .map((g) => g.fingerprint);

  const deletedGroups = await db.errorGroup.deleteMany({
    where: {
      siteId,
      fingerprint: { in: groupsToDelete },
    },
  });

  return {
    deletedErrors: deletedErrors.count,
    deletedGroups: deletedGroups.count,
  };
}
