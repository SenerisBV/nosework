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
