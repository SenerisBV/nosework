import { describe, expect, test } from "bun:test";
import { formatDateKey } from "../src/query.js";

describe("formatDateKey", () => {
  const d = new Date("2026-08-29T14:37:12.000Z");

  test("hour bucket", () => {
    expect(formatDateKey(d, "hour")).toBe("2026-08-29T14:00");
  });

  test("day bucket", () => {
    expect(formatDateKey(d, "day")).toBe("2026-08-29");
  });

  test("month bucket", () => {
    expect(formatDateKey(d, "month")).toBe("2026-08");
  });

  test("week bucket snaps back to Sunday", () => {
    // 2026-08-29 is a Saturday; the week starts Sunday 2026-08-23
    expect(formatDateKey(d, "week")).toBe("2026-08-23");
  });

  test("week bucket crosses a month boundary correctly", () => {
    // 2026-09-01 is a Tuesday; its week starts Sunday 2026-08-30
    expect(formatDateKey(new Date("2026-09-01T09:00:00.000Z"), "week")).toBe("2026-08-30");
  });

  test("does not mutate the date it is given", () => {
    const original = new Date("2026-08-29T14:37:12.000Z");
    const copy = new Date(original.getTime());
    formatDateKey(original, "week");
    expect(original.getTime()).toBe(copy.getTime());
  });
});
