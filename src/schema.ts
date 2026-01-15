import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  json,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Page view events
export const pageViews = pgTable(
  "page_views",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("siteId").notNull(),

    // Page info
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    referrer: text("referrer"),

    // Visitor (cookieless identification)
    visitorHash: text("visitorHash").notNull(),
    sessionId: text("sessionId").notNull(),

    // Location (from Vercel geo headers)
    country: text("country"),
    countryCode: text("countryCode"),
    region: text("region"),
    city: text("city"),

    // Device (parsed from User-Agent)
    browser: text("browser"),
    browserVer: text("browserVer"),
    os: text("os"),
    osVer: text("osVer"),
    device: text("device"),

    // Optional user link
    userId: text("userId"),
    isBot: boolean("isBot").default(false).notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("page_views_site_timestamp_idx").on(table.siteId, table.timestamp),
    index("page_views_site_pathname_idx").on(table.siteId, table.pathname),
    index("page_views_session_idx").on(table.sessionId),
    index("page_views_user_idx").on(table.userId),
  ]
);

// Custom events
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("siteId").notNull(),

    name: text("name").notNull(),
    properties: json("properties"),

    visitorHash: text("visitorHash").notNull(),
    sessionId: text("sessionId").notNull(),
    userId: text("userId"),
    url: text("url"),

    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("events_site_name_timestamp_idx").on(table.siteId, table.name, table.timestamp),
    index("events_site_timestamp_idx").on(table.siteId, table.timestamp),
    index("events_user_idx").on(table.userId),
  ]
);

// Daily salt for visitor hashing (privacy - rotates daily)
export const dailySalts = pgTable("daily_salts", {
  date: date("date").primaryKey(),
  salt: text("salt").notNull(),
});

// Error tracking - individual occurrences
export const analyticsErrors = pgTable(
  "analytics_errors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("siteId").notNull(),

    // Error details
    message: text("message").notNull(),
    stack: text("stack"),
    fingerprint: text("fingerprint").notNull(),

    // Context
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),

    // Visitor context
    visitorHash: text("visitorHash"),
    sessionId: text("sessionId"),
    userId: text("userId"),

    // Browser context
    browser: text("browser"),
    browserVer: text("browserVer"),
    os: text("os"),
    device: text("device"),

    // Metadata
    metadata: json("metadata"),

    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("errors_site_timestamp_idx").on(table.siteId, table.timestamp),
    index("errors_site_fingerprint_idx").on(table.siteId, table.fingerprint),
    index("errors_user_idx").on(table.userId),
  ]
);

// Error groups - aggregated by fingerprint
export const errorGroups = pgTable(
  "error_groups",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    siteId: text("siteId").notNull(),
    fingerprint: text("fingerprint").notNull(),

    // Representative error
    message: text("message").notNull(),
    stack: text("stack"),

    // Counts
    count: integer("count").default(1).notNull(),
    lastSeen: timestamp("lastSeen").notNull(),
    firstSeen: timestamp("firstSeen").notNull(),

    // Status: open, resolved, ignored
    status: text("status").default("open").notNull(),
  },
  (table) => [
    unique("error_groups_site_fingerprint_unique").on(table.siteId, table.fingerprint),
    index("error_groups_site_status_lastseen_idx").on(table.siteId, table.status, table.lastSeen),
  ]
);

// Type exports for use in application code
export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type DailySalt = typeof dailySalts.$inferSelect;
export type AnalyticsError = typeof analyticsErrors.$inferSelect;
export type NewAnalyticsError = typeof analyticsErrors.$inferInsert;
export type ErrorGroup = typeof errorGroups.$inferSelect;
