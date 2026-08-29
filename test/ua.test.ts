import { describe, expect, test } from "bun:test";
import { parseUserAgent } from "../src/ua.js";

describe("parseUserAgent", () => {
  test("returns all-null for a missing user-agent", () => {
    expect(parseUserAgent(null)).toEqual({
      browser: null,
      browserVer: null,
      os: null,
      osVer: null,
      device: null,
    });
  });

  test("classifies desktop Chrome and truncates to major version", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36"
    );
    expect(r.browser).toBe("Chrome");
    expect(r.browserVer).toBe("120");
    expect(r.device).toBe("desktop");
  });

  test("classifies an iPhone as mobile", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("iOS");
  });

  test("never returns a full version string", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );
    expect(r.browserVer).not.toContain(".");
  });
});
