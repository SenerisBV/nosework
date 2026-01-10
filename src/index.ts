// Main exports for nosework analytics package

// Tracking functions
export { trackPageView, trackEvent } from "./track.js";

// Query functions
export {
  getStats,
  getTopPages,
  getLocations,
  getReferrers,
  getDevices,
  getTimeSeries,
  getOrCreateSite,
  listSites,
} from "./query.js";

// Client utilities
export { getClient, disconnect } from "./client.js";

// Utility functions
export { isBot, cleanupOldSalts } from "./utils.js";

// User-Agent parsing (for advanced use cases)
export { parseUserAgent } from "./ua.js";

// Types
export type {
  TrackPageViewOptions,
  TrackEventOptions,
  DateRange,
  QueryOptions,
  PaginatedQueryOptions,
  Stats,
  TopPage,
  LocationData,
  ReferrerData,
  DeviceData,
  GeoLocation,
  ParsedUserAgent,
  VisitorInfo,
} from "./types.js";

// Re-export TimeSeriesDataPoint from query
export type { TimeSeriesDataPoint } from "./query.js";
