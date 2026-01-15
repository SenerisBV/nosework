import { createHash, randomBytes } from "crypto";
import { getClient } from "./client.js";
import { dailySalts } from "./schema.js";
import { eq, lt } from "drizzle-orm";
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
  // Format date as YYYY-MM-DD string for the date column
  const dateStr = date.toISOString().split("T")[0]!;

  // Try to get existing salt
  const [existingSalt] = await db
    .select()
    .from(dailySalts)
    .where(eq(dailySalts.date, dateStr))
    .limit(1);

  if (existingSalt) {
    return existingSalt.salt;
  }

  // Create if doesn't exist
  const salt = randomBytes(32).toString("hex");
  try {
    await db.insert(dailySalts).values({ date: dateStr, salt });
    return salt;
  } catch {
    // Race condition - another request created it, try to fetch again
    const [retry] = await db
      .select()
      .from(dailySalts)
      .where(eq(dailySalts.date, dateStr))
      .limit(1);
    return retry?.salt ?? salt;
  }
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
  const dateStr = sevenDaysAgo.toISOString().split("T")[0]!;

  const deleted = await db
    .delete(dailySalts)
    .where(lt(dailySalts.date, dateStr))
    .returning({ date: dailySalts.date });

  return deleted.length;
}
