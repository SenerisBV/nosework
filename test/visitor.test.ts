import { describe, expect, test } from "bun:test";
import { computeVisitorIds } from "../src/utils.js";

const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const SALT_A = "a".repeat(64);
const SALT_B = "b".repeat(64);
const T = new Date("2026-08-29T12:00:00.000Z");

describe("computeVisitorIds", () => {
  test("is deterministic for identical inputs", () => {
    expect(computeVisitorIds(IP, UA, SALT_A, T)).toEqual(
      computeVisitorIds(IP, UA, SALT_A, T)
    );
  });

  test("produces a 16-character hex visitor hash", () => {
    const { visitorHash } = computeVisitorIds(IP, UA, SALT_A, T);
    expect(visitorHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("different salts produce unrelated visitor hashes (daily rotation)", () => {
    const a = computeVisitorIds(IP, UA, SALT_A, T).visitorHash;
    const b = computeVisitorIds(IP, UA, SALT_B, T).visitorHash;
    expect(a).not.toBe(b);
  });

  test("different IPs produce different visitor hashes", () => {
    const a = computeVisitorIds(IP, UA, SALT_A, T).visitorHash;
    const b = computeVisitorIds("198.51.100.4", UA, SALT_A, T).visitorHash;
    expect(a).not.toBe(b);
  });

  test("a null IP does not throw and still yields a hash", () => {
    const { visitorHash } = computeVisitorIds(null, null, SALT_A, T);
    expect(visitorHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("session id is stable within the same 30-minute window", () => {
    const early = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:00:00Z"));
    const late = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    expect(early.sessionId).toBe(late.sessionId);
  });

  test("session id changes across a 30-minute boundary", () => {
    const before = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    const after = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:30:01Z"));
    expect(before.sessionId).not.toBe(after.sessionId);
  });

  test("visitor hash is stable across a session boundary", () => {
    const before = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:29:59Z"));
    const after = computeVisitorIds(IP, UA, SALT_A, new Date("2026-08-29T12:30:01Z"));
    expect(before.visitorHash).toBe(after.visitorHash);
  });
});
