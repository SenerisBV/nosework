export interface TrackPageViewOptions {
  siteId: string;
  url: string;
  referrer?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  // Geo data (from Vercel headers or other source)
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
}

export interface TrackEventOptions {
  siteId: string;
  name: string;
  properties?: Record<string, unknown>;
  url?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface QueryOptions extends DateRange {
  siteId: string;
}

export interface PaginatedQueryOptions extends QueryOptions {
  limit?: number;
  offset?: number;
}

export interface Stats {
  pageViews: number;
  visitors: number;
  sessions: number;
  bounceRate: number;
}

export interface TopPage {
  pathname: string;
  pageViews: number;
  visitors: number;
}

export interface LocationData {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  pageViews: number;
  visitors: number;
}

export interface ReferrerData {
  referrer: string | null;
  pageViews: number;
  visitors: number;
}

export interface DeviceData {
  device: string | null;
  browser: string | null;
  os: string | null;
  pageViews: number;
  visitors: number;
}

export interface GeoLocation {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
}

export interface ParsedUserAgent {
  browser: string | null;
  browserVer: string | null;
  os: string | null;
  osVer: string | null;
  device: "desktop" | "mobile" | "tablet" | null;
}

export interface VisitorInfo {
  visitorHash: string;
  sessionId: string;
}

// Session Analytics Types

export interface SessionStats {
  totalSessions: number;
  avgDuration: number; // seconds
  avgPagesPerSession: number;
  bounceRate: number; // percentage
}

export interface SessionData {
  sessionId: string;
  visitorHash: string;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds
  pageCount: number;
  entryPage: string;
  exitPage: string;
  isBounce: boolean;
  country: string | null;
  device: string | null;
  browser: string | null;
}

export interface EntryExitPage {
  pathname: string;
  count: number;
  percentage: number;
}

export interface PageFlow {
  path: string[]; // e.g., ['/', '/pricing', '/signup']
  count: number;
  percentage: number;
}

// Error Tracking Types

export interface TrackErrorOptions {
  siteId: string;
  message: string;
  stack?: string | null;
  url: string;
  // Visitor context (optional, from existing tracking)
  visitorHash?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  // Browser context (optional)
  browser?: string | null;
  browserVer?: string | null;
  os?: string | null;
  device?: string | null;
  // Custom metadata
  metadata?: Record<string, unknown> | null;
}

export interface ErrorStats {
  totalErrors: number;
  uniqueErrors: number; // by fingerprint
  errorsToday: number;
  openGroups: number;
}

export type ErrorGroupStatus = "open" | "resolved" | "ignored";

export interface ErrorGroupData {
  id: string;
  fingerprint: string;
  message: string;
  stack: string | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  status: ErrorGroupStatus;
}

export interface ErrorInstance {
  id: string;
  message: string;
  stack: string | null;
  url: string;
  pathname: string;
  visitorHash: string | null;
  sessionId: string | null;
  userId: string | null;
  browser: string | null;
  browserVer: string | null;
  os: string | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}
