import { describe, expect, test } from "bun:test";
import { isBot, extractPathname } from "../src/utils.js";

describe("isBot", () => {
  test("treats a missing user-agent as a bot", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
  });

  test("detects common crawlers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("ClaudeBot/1.0")).toBe(true);
    expect(isBot("Mozilla/5.0 ... HeadlessChrome/120.0.0.0")).toBe(true);
  });

  test("does not flag ordinary browsers", () => {
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const safariIphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(isBot(chrome)).toBe(false);
    expect(isBot(safariIphone)).toBe(false);
  });
});

describe("extractPathname", () => {
  test("extracts the path from an absolute URL", () => {
    expect(extractPathname("https://seneris.nl/about")).toBe("/about");
  });

  test("drops the query string and hash", () => {
    expect(extractPathname("https://seneris.nl/blog?utm_source=x#top")).toBe("/blog");
  });

  test("returns / for a bare origin", () => {
    expect(extractPathname("https://seneris.nl")).toBe("/");
  });

  test("falls back gracefully on an unparseable URL", () => {
    expect(extractPathname("/just/a/path")).toBe("/just/a/path");
  });
});
