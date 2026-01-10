import { createHash, randomBytes } from "crypto";
import { getClient } from "./client.js";
import type { VisitorInfo } from "./types.js";

// Bot patterns to detect
const BOT_PATTERNS = [
  /bot/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /mediapartners/i,
  /googlebot/i,
  /bingbot/i,
  /yandex/i,
  /baidu/i,
  /duckduckgo/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /slackbot/i,
  /pingdom/i,
  /uptimerobot/i,
  /headless/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /webdriver/i,
  /lighthouse/i,
  /pagespeed/i,
  /gtmetrix/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /bytespider/i,
  /gptbot/i,
  /claudebot/i,
  /anthropic/i,
  /openai/i,
  /chatgpt/i,
  /petalbot/i,
];

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // No user agent = likely bot

  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

async function getDailySalt(date: Date): Promise<string> {
  const db = getClient();
  const dateOnly = new Date(date.toISOString().split("T")[0] + "T00:00:00.000Z");

  // Try to get existing salt
  let dailySalt = await db.dailySalt.findUnique({
    where: { date: dateOnly },
  });

  // Create if doesn't exist
  if (!dailySalt) {
    const salt = randomBytes(32).toString("hex");
    try {
      dailySalt = await db.dailySalt.create({
        data: { date: dateOnly, salt },
      });
    } catch {
      // Race condition - another request created it
      dailySalt = await db.dailySalt.findUnique({
        where: { date: dateOnly },
      });
    }
  }

  return dailySalt?.salt ?? randomBytes(32).toString("hex");
}

export async function getVisitorInfo(
  ip: string | null,
  userAgent: string | null
): Promise<VisitorInfo> {
  const now = new Date();
  const salt = await getDailySalt(now);

  // Visitor hash: rotates daily
  // Uses IP + UA + daily salt for privacy
  const visitorInput = `${ip ?? ""}|${userAgent ?? ""}|${salt}`;
  const visitorHash = hash(visitorInput);

  // Session hash: rotates every 30 minutes
  // This provides session-like behavior without cookies
  const thirtyMinWindow = Math.floor(now.getTime() / (30 * 60 * 1000));
  const sessionInput = `${visitorInput}|${thirtyMinWindow}`;
  const sessionId = hash(sessionInput);

  return { visitorHash, sessionId };
}

export function extractPathname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    // If URL parsing fails, try to extract path manually
    const match = url.match(/^(?:https?:\/\/[^/]+)?(\/?[^?#]*)/);
    return match?.[1] ?? "/";
  }
}

// Clean up old daily salts (older than 7 days)
export async function cleanupOldSalts(): Promise<number> {
  const db = getClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await db.dailySalt.deleteMany({
    where: { date: { lt: sevenDaysAgo } },
  });

  return result.count;
}
