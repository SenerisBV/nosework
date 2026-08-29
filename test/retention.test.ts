import { describe, expect, test } from "bun:test";
import { buildRetentionWhere } from "../src/retention.js";

/**
 * Helper to recursively search for a specific table column in the SQL queryChunks.
 * Returns true if the column is found in the predicate structure.
 */
function containsColumn(
  queryChunks: any[] | undefined,
  columnName: string
): boolean {
  if (!queryChunks || !Array.isArray(queryChunks)) {
    return false;
  }

  for (const chunk of queryChunks) {
    // Check if this chunk is the siteId column directly
    if (chunk && chunk.name === columnName) {
      return true;
    }

    // Recursively check nested SQL objects
    if (chunk && chunk.queryChunks) {
      if (containsColumn(chunk.queryChunks, columnName)) {
        return true;
      }
    }
  }

  return false;
}

describe("buildRetentionWhere", () => {
  const testDate = new Date("2024-01-01");

  test("without siteId sweeps all sites (no siteId column reference)", () => {
    const where = buildRetentionWhere(testDate);
    const chunks = (where as any).queryChunks;

    // Should NOT contain the siteId column anywhere in the predicate
    expect(containsColumn(chunks, "siteId")).toBe(false);
  });

  test("with siteId scopes to that site (includes siteId column reference)", () => {
    const where = buildRetentionWhere(testDate, "example.com");
    const chunks = (where as any).queryChunks;

    // Should contain the siteId column in the predicate
    expect(containsColumn(chunks, "siteId")).toBe(true);
  });

  test("with empty string siteId scopes to that site, not all sites", () => {
    const whereEmpty = buildRetentionWhere(testDate, "");
    const whereUndefined = buildRetentionWhere(testDate);

    const emptyChunks = (whereEmpty as any).queryChunks;
    const undefinedChunks = (whereUndefined as any).queryChunks;

    // whereEmpty should include siteId condition
    expect(containsColumn(emptyChunks, "siteId")).toBe(true);

    // whereUndefined should NOT include siteId condition
    expect(containsColumn(undefinedChunks, "siteId")).toBe(false);
  });

  test("without siteId still filters by timestamp", () => {
    const where = buildRetentionWhere(testDate);
    const chunks = (where as any).queryChunks;

    // The cutoff is the whole point of the sweep: without it, an unscoped
    // call deletes every page view ever recorded.
    expect(containsColumn(chunks, "timestamp")).toBe(true);
  });

  test("with siteId still filters by timestamp", () => {
    const where = buildRetentionWhere(testDate, "example.com");
    const chunks = (where as any).queryChunks;

    // Regression guard: a predicate that drops the timestamp clause when a
    // siteId is given would delete every row that site ever recorded, which
    // is exactly what the nightly cron calls.
    expect(containsColumn(chunks, "timestamp")).toBe(true);
    expect(containsColumn(chunks, "siteId")).toBe(true);
  });

  test("with empty string siteId still filters by timestamp", () => {
    const where = buildRetentionWhere(testDate, "");
    const chunks = (where as any).queryChunks;

    expect(containsColumn(chunks, "timestamp")).toBe(true);
    expect(containsColumn(chunks, "siteId")).toBe(true);
  });

  test("two predicates (with and without siteId) are not equal", () => {
    const withSiteId = buildRetentionWhere(testDate, "example.com");
    const withoutSiteId = buildRetentionWhere(testDate);

    // They must be different objects
    expect(withSiteId === withoutSiteId).toBe(false);

    // One should have siteId column, the other should not
    const withChunks = (withSiteId as any).queryChunks;
    const withoutChunks = (withoutSiteId as any).queryChunks;

    const withHasSiteId = containsColumn(withChunks, "siteId");
    const withoutHasSiteId = containsColumn(withoutChunks, "siteId");

    expect(withHasSiteId).toBe(true);
    expect(withoutHasSiteId).toBe(false);
    expect(withHasSiteId).not.toBe(withoutHasSiteId);
  });
});
